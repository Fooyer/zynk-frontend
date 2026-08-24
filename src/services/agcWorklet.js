// AudioWorkletProcessor que aplica ganho automático (AGC) medindo o nível
// RMS do próprio sinal e ajustando o ganho pra manter a voz numa faixa de
// volume alvo. Sem isso, quem tem microfone baixo (sem AGC de hardware)
// fica bem mais baixo que o resto do canal, e quem tem mic alto estoura o
// compressor antes dele. Roda depois do RNNoise + compressor na cadeia
// (ver audioProcessing.ts), então o ganho aqui nivela voz já limpa — não
// amplifica ruído cru.
class AgcProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._envelopeDb = -60;
    this._gain = 1;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;
    const inCh = input[0];
    const outCh = output[0];
    const n = inCh.length;
    const blockMs = (n / sampleRate) * 1000; // ~2.7ms a 48kHz (128 amostras/bloco)

    // RMS do bloco atual — curto demais (poucos ms) pra medir volume
    // sozinho, por isso só alimenta o envelope suavizado abaixo.
    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += inCh[i] * inCh[i];
    const rms = Math.sqrt(sumSq / n);
    const rmsDb = rms > 1e-7 ? 20 * Math.log10(rms) : -140;

    // Envelope de nível: suaviza o RMS do bloco num tempo de ~150ms — rápido
    // o bastante pra acompanhar a fala, lento o bastante pra não reagir a
    // cada pico/vale de amostra isolado.
    const envCoeff = 1 - Math.exp(-blockMs / 150);
    this._envelopeDb += (rmsDb - this._envelopeDb) * envCoeff;

    // Só adapta o ganho quando dá pra confiar que existe voz no sinal —
    // abaixo do piso de ruído, mantém o ganho parado onde está. Sem essa
    // trava, em silêncio (só ruído residual bem baixo) o AGC ia subir o
    // ganho ao máximo tentando achar um sinal de -20dB que não existe ali, e
    // estourar o volume assim que a pessoa voltasse a falar.
    const NOISE_FLOOR_DB = -45;
    if (this._envelopeDb > NOISE_FLOOR_DB) {
      const TARGET_DB = -20;
      const MIN_GAIN = 0.5; // nunca reduz mais que -6dB (picos já são cuidados pelo compressor antes)
      const MAX_GAIN = 5.6; // nunca amplifica mais que ~+15dB, pra não realçar ruído residual demais
      const desiredGainDb = TARGET_DB - this._envelopeDb;
      const desiredGain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, Math.pow(10, desiredGainDb / 20)));

      // Ataque rápido quando precisa BAIXAR o ganho (sinal ficou alto
      // demais — evita estourar), soltura bem mais lenta quando precisa
      // SUBIR (evita "bombear" o volume a cada pausa curta na fala).
      const ATTACK_MS = 100;
      const RELEASE_MS = 2000;
      const timeMs = desiredGain < this._gain ? ATTACK_MS : RELEASE_MS;
      const coeff = 1 - Math.exp(-blockMs / timeMs);
      this._gain += (desiredGain - this._gain) * coeff;
    }

    // Limitador suave (soft-clip) — o AGC mira num RMS alvo, não no pico, e
    // um pico de fala pode passar de 0dBFS depois do ganho aplicado. Em vez
    // de cortar seco (clipping duro, distorce), comprime suavemente perto
    // do teto.
    const CEILING = 0.98;
    for (let i = 0; i < n; i++) {
      const s = inCh[i] * this._gain;
      const abs = Math.abs(s);
      outCh[i] =
        abs <= CEILING
          ? s
          : Math.sign(s) * (CEILING + (1 - CEILING) * Math.tanh((abs - CEILING) / (1 - CEILING)));
    }

    return true;
  }
}

registerProcessor('agc-processor', AgcProcessor);
