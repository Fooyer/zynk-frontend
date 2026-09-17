// AudioWorkletProcessor: cancelamento de eco adaptativo (NLMS) usando o
// loopback do sistema como referência — ver systemLoopback.ts e
// settings.systemEchoCancellation (ProcessingSection em SettingsPage.tsx).
//
// EXPERIMENTAL: calibrado pela matemática padrão de NLMS, não por teste de
// áudio ao vivo (sem como ouvir o resultado neste ambiente de dev). Se soar
// mal (distorção, robotização), desligue o switch "Cancelamento de eco do
// sistema" em Configurações > Áudio — o resto do pipeline (AEC nativo do
// navegador + RNNoise) continua funcionando normalmente sem isso.
//
// Duas entradas:
//   input 0 = microfone (near-end: voz do usuário + eco do que as caixas tocam)
//   input 1 = referência (loopback do sistema: o que as caixas ESTÃO tocando —
//             inclusive áudio de fora do Zynk, tipo um jogo separado)
// Uma saída = microfone com a cópia estimada do eco subtraída.
//
// Arquitetura (a mesma ideia de qualquer AEC prático, simplificada pra caber
// num AudioWorkletProcessor em tempo real):
//  1. Busca de atraso grosseiro por correlação cruzada normalizada, refeita a
//     cada ~1s numa versão decimada dos sinais (bem mais barata) — encontra o
//     deslocamento entre a referência e sua cópia no microfone. Cobre o
//     atraso de PIPELINE entre as duas capturas (getUserMedia vs.
//     getDisplayMedia loopback — normalmente dezenas de ms, bem maior que o
//     atraso acústico caixa→microfone em si).
//  2. Um filtro NLMS mais curto refina a cancelação em cima desse atraso já
//     alinhado — cobre reverberação/variação residual.
//
// Limitações conhecidas:
//  - Não compensa DRIFT de clock entre os dois streams numa call longa (a
//    busca de atraso se repete periodicamente, o que ajuda a acompanhar, mas
//    não é reamostragem de drift de verdade).
//  - Atraso fora da janela de busca (MAX_DELAY_MS) não é encontrado.
//  - Leva alguns segundos pra convergir no início da call.
//  - "Double-talk" (falando ao mesmo tempo que o eco) reduz a taxa de
//    adaptação (heurística abaixo), mas não elimina de vez o risco de o
//    filtro confundir a voz do usuário com eco por um instante.
//  - Se o filtro divergir numericamente (NaN/Infinity), desliga sozinho pro
//    resto da call e só repassa o microfone cru — nunca manda ruído/
//    distorção pra call por causa disso.

const SAMPLE_RATE = sampleRate; // global do AudioWorkletGlobalScope

// --- Filtro NLMS (fino, após alinhamento) ---
const FILTER_TAPS = 512; // ~10.7ms a 48kHz — cobre reverberação residual pós-alinhamento
const MU = 0.35; // passo de adaptação NLMS (0–1); maior converge mais rápido, mas mais instável
const EPS = 1e-6; // evita divisão por energia ~0 (silêncio na referência)
const LEAK = 0.00005; // vazamento por amostra — puxa os coeficientes de volta a 0 lentamente, evita deriva numérica

// --- Busca de atraso grosseiro ---
const REF_HISTORY_SEC = 0.6; // histórico de referência mantido (precisa cobrir MAX_DELAY_MS + janela de correlação)
const MAX_DELAY_MS = 400; // maior atraso de pipeline que tentamos encontrar
const CORR_WINDOW_MS = 80; // janela de mic usada em cada tentativa de correlação
const DELAY_SEARCH_INTERVAL_SEC = 1; // refaz a busca a cada N segundos
const DECIMATION = 6; // decima pra ~8kHz só pra busca de atraso (bem mais barato que rodar na taxa cheia)
const MIN_DELAY_CONFIDENCE = 0.15; // correlação normalizada mínima pra aceitar uma nova estimativa de atraso

class SystemAecProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._refBufLen = Math.max(1, Math.round(SAMPLE_RATE * REF_HISTORY_SEC));
    this._refBuf = new Float32Array(this._refBufLen);
    this._refWriteIdx = 0;
    this._refFilled = 0;

    this._weights = new Float32Array(FILTER_TAPS);
    this._tapBuf = new Float32Array(FILTER_TAPS);
    this._delaySamples = 0; // atraso grosseiro estimado (amostras), aplicado antes do filtro NLMS

    this._samplesSinceSearch = 0;
    this._searchIntervalSamples = Math.round(SAMPLE_RATE * DELAY_SEARCH_INTERVAL_SEC);

    this._corrWindowLen = Math.max(1, Math.round(SAMPLE_RATE * (CORR_WINDOW_MS / 1000)));
    this._micCorrBuf = new Float32Array(this._corrWindowLen);
    this._micCorrIdx = 0;
    this._micCorrFilled = 0;

    this._diverged = false;
  }

  _pushRef(sample) {
    this._refBuf[this._refWriteIdx] = sample;
    this._refWriteIdx++;
    if (this._refWriteIdx >= this._refBufLen) this._refWriteIdx = 0;
    if (this._refFilled < this._refBufLen) this._refFilled++;
  }

  // Lê a referência `samplesAgo` amostras atrás do ponteiro de escrita atual.
  // samplesAgo é sempre < this._refBufLen neste worklet (ver limites de
  // MAX_DELAY_MS/FILTER_TAPS/REF_HISTORY_SEC acima), então uma única
  // correção de wraparound basta — bem mais barato que `%` no caminho quente.
  _readRef(samplesAgo) {
    if (samplesAgo < 0 || samplesAgo >= this._refFilled) return 0;
    let idx = this._refWriteIdx - 1 - samplesAgo;
    if (idx < 0) idx += this._refBufLen;
    return this._refBuf[idx];
  }

  _pushMicCorr(sample) {
    this._micCorrBuf[this._micCorrIdx] = sample;
    this._micCorrIdx++;
    if (this._micCorrIdx >= this._corrWindowLen) this._micCorrIdx = 0;
    if (this._micCorrFilled < this._corrWindowLen) this._micCorrFilled++;
  }

  // Correlação cruzada decimada pra achar o atraso grosseiro (em amostras, na
  // taxa original) entre a referência e o microfone. Só roda quando já temos
  // histórico suficiente dos dois lados e o mic não está em silêncio total.
  _searchDelay() {
    const maxDelaySamples = Math.round(SAMPLE_RATE * (MAX_DELAY_MS / 1000));
    if (this._refFilled < maxDelaySamples + this._corrWindowLen) return;
    if (this._micCorrFilled < this._corrWindowLen) return;

    const decLen = Math.floor(this._corrWindowLen / DECIMATION);
    if (decLen < 4) return;

    const micDec = new Float32Array(decLen);
    for (let i = 0; i < decLen; i++) {
      let srcIdx = this._micCorrIdx - 1 - i * DECIMATION;
      if (srcIdx < 0) srcIdx += this._corrWindowLen;
      micDec[i] = this._micCorrBuf[srcIdx];
    }

    let micEnergy = 0;
    for (let i = 0; i < decLen; i++) micEnergy += micDec[i] * micDec[i];
    if (micEnergy < 1e-8) return; // mic essencialmente em silêncio — correlação não seria confiável agora

    const maxLagDec = Math.floor(maxDelaySamples / DECIMATION);
    let bestLagDec = 0;
    let bestScore = -Infinity;

    for (let lagDec = 0; lagDec <= maxLagDec; lagDec++) {
      let dot = 0;
      let refEnergy = 0;
      for (let i = 0; i < decLen; i++) {
        const refVal = this._readRef((lagDec + i) * DECIMATION);
        dot += refVal * micDec[i];
        refEnergy += refVal * refVal;
      }
      const score = dot / Math.sqrt(refEnergy * micEnergy + EPS);
      if (score > bestScore) {
        bestScore = score;
        bestLagDec = lagDec;
      }
    }

    // Só aceita a nova estimativa com correlação razoavelmente forte — com
    // ela fraca, mudar de atraso só pioraria o alinhamento (mantém o anterior).
    if (bestScore >= MIN_DELAY_CONFIDENCE) {
      this._delaySamples = bestLagDec * DECIMATION;
    }
  }

  process(inputs, outputs) {
    const mic = inputs[0] && inputs[0][0];
    const ref = inputs[1] && inputs[1][0];
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;

    // Sem referência disponível ainda (loopback falhou/ainda conectando) —
    // passa o mic direto, sem tentar cancelar nada.
    if (!ref || !mic) {
      if (mic) out.set(mic);
      return true;
    }

    const n = mic.length;

    if (this._diverged) {
      // Já divergiu antes nesta call — modo seguro permanente: só repassa o
      // mic cru, sem tentar filtrar de novo (evita risco de mandar ruído/
      // distorção pro resto da call).
      out.set(mic);
      for (let i = 0; i < n; i++) this._pushRef(ref[i]);
      return true;
    }

    const w = this._weights;
    const tapBuf = this._tapBuf;
    const taps = FILTER_TAPS;

    for (let i = 0; i < n; i++) {
      this._pushRef(ref[i]);
      this._pushMicCorr(mic[i]);

      let energy = EPS;
      for (let k = 0; k < taps; k++) {
        const v = this._readRef(this._delaySamples + k);
        tapBuf[k] = v;
        energy += v * v;
      }

      let predicted = 0;
      for (let k = 0; k < taps; k++) predicted += w[k] * tapBuf[k];

      const micSample = mic[i];
      const error = micSample - predicted;

      if (!Number.isFinite(error) || !Number.isFinite(predicted) || !Number.isFinite(energy)) {
        this._diverged = true;
        w.fill(0);
        out.set(mic);
        return true;
      }

      // Heurística de "double-talk": se o mic está bem mais forte que o eco
      // previsto, é provável que seja voz de verdade (não eco) — reduz bem a
      // taxa de adaptação nesse instante, pra não deixar o filtro "aprender"
      // a voz do usuário como se fosse parte do caminho de eco.
      const doubleTalk = Math.abs(micSample) > Math.abs(predicted) * 3 + 0.02;
      const muEffective = doubleTalk ? MU * 0.05 : MU;
      const step = (muEffective * error) / energy;

      for (let k = 0; k < taps; k++) {
        w[k] += step * tapBuf[k] - LEAK * w[k];
      }

      // Clipa suave — a saída nunca deveria passar muito de [-1,1], mas como
      // última defesa contra um pico do filtro ainda convergindo.
      out[i] = error < -1 ? -1 : error > 1 ? 1 : error;
    }

    this._samplesSinceSearch += n;
    if (this._samplesSinceSearch >= this._searchIntervalSamples) {
      this._samplesSinceSearch = 0;
      this._searchDelay();
    }

    return true;
  }
}

registerProcessor('system-aec-processor', SystemAecProcessor);
