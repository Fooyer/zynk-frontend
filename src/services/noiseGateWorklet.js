// AudioWorkletProcessor que atenua (não corta) o que sobra de ruído de fundo
// depois do RNNoise — de propósito um expansor suave, não um gate binário: um
// gate on/off cortava sílabas quando a voz caía de volume por um instante
// (mesmo motivo que audioProcessing.ts evita gate na mixagem RNNoise). Aqui,
// abaixo do limiar o sinal só é reduzido até um teto (nunca silenciado de
// verdade), com ataque rápido pra cortar ruído assim que você para de falar e
// soltura lenta pra não "engolir" o começo da próxima frase.
//
// Dois modos, escolhidos em audioProcessing.ts e enviados por postMessage:
// - auto: acompanha um piso de ruído (mínimo suavizado do envelope ao longo
//   de alguns segundos) e abre o gate um pouco acima dele — se adapta sozinho
//   a quarto silencioso ou barulhento, sem o usuário precisar ajustar nada.
// - manual: usa um limiar fixo em dB (thresholdDb), pra quem quer controlar
//   na mão — útil quando o ruído de fundo não é estável o bastante pro modo
//   automático confiar (ex.: gente conversando ao fundo, não só ventilador).
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._envelopeDb = -60;
    this._noiseFloorDb = -60;
    this._gainDb = 0;
    this._auto = true;
    this._thresholdDb = -40;

    this.port.onmessage = (e) => {
      const { auto, thresholdDb } = e.data ?? {};
      if (typeof auto === 'boolean') this._auto = auto;
      if (typeof thresholdDb === 'number') this._thresholdDb = thresholdDb;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;
    const inCh = input[0];
    const outCh = output[0];
    const n = inCh.length;
    const blockMs = (n / sampleRate) * 1000;

    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += inCh[i] * inCh[i];
    const rms = Math.sqrt(sumSq / n);
    const rmsDb = rms > 1e-7 ? 20 * Math.log10(rms) : -140;

    // Envelope de nível — mesmo raciocínio do AGC (agcWorklet.js): rápido o
    // bastante pra acompanhar a fala, lento o bastante pra não reagir a cada
    // amostra isolada.
    const envCoeff = 1 - Math.exp(-blockMs / 150);
    this._envelopeDb += (rmsDb - this._envelopeDb) * envCoeff;

    // Piso de ruído: segue o envelope só quando ele está MAIS BAIXO (soltura
    // bem lenta pra cima), nunca quando está mais alto — assim ele rastreia o
    // ruído ambiente entre falas, sem subir quando você fala. Sobe bem devagar
    // (~20s) pra se recuperar caso o ambiente fique mais barulhento depois.
    if (this._envelopeDb < this._noiseFloorDb) {
      this._noiseFloorDb += (this._envelopeDb - this._noiseFloorDb) * (1 - Math.exp(-blockMs / 400));
    } else {
      this._noiseFloorDb += (this._envelopeDb - this._noiseFloorDb) * (1 - Math.exp(-blockMs / 20000));
    }

    // Margem acima do piso de ruído estimado, no modo automático — abre o
    // gate só quando o sinal está claramente acima do ambiente, não bem em
    // cima dele (senão qualquer flutuação do próprio ruído abriria o gate).
    const AUTO_MARGIN_DB = 9;
    const threshold = this._auto ? this._noiseFloorDb + AUTO_MARGIN_DB : this._thresholdDb;

    // Expansor suave: acima do limiar, ganho 0dB (nada muda); abaixo, reduz
    // proporcionalmente até um teto de atenuação — nunca silêncio total, pra
    // sobrar sempre um resquício natural de ambiente em vez de um "buraco"
    // audível quando ninguém fala.
    const KNEE_DB = 6;     // transição suave em vez de degrau
    const MAX_ATTEN_DB = 22;
    const diff = threshold - this._envelopeDb; // > 0 quando abaixo do limiar
    const targetGainDb = diff <= 0 ? 0 : -Math.min(MAX_ATTEN_DB, (diff / (diff + KNEE_DB)) * MAX_ATTEN_DB);

    // Ataque rápido fechando (corta ruído assim que a fala para), soltura
    // bem mais lenta abrindo (não corta a respiração/início da próxima frase).
    const ATTACK_MS = 60;
    const RELEASE_MS = 250;
    const timeMs = targetGainDb < this._gainDb ? ATTACK_MS : RELEASE_MS;
    const coeff = 1 - Math.exp(-blockMs / timeMs);
    this._gainDb += (targetGainDb - this._gainDb) * coeff;

    const gain = Math.pow(10, this._gainDb / 20);
    for (let i = 0; i < n; i++) outCh[i] = inCh[i] * gain;

    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
