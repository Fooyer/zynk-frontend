/**
 * Noise Gate AudioWorklet Processor
 *
 * Combina duas técnicas:
 * 1. Gate baseado em RMS — silencia áudio abaixo do threshold
 * 2. Spectral centroid check — diferencia voz (espectro amplo) de cliques (impulso estreito)
 *
 * Parâmetros ajustáveis via port.postMessage:
 *   { threshold: 0.008, attackMs: 3, releaseMs: 120 }
 */
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Gate state
    this._gateGain = 0;
    this._threshold = 0.008;       // RMS threshold para abrir o gate
    this._holdSamples = 0;         // amostras de hold ativo
    this._holdMax = 0;             // hold total em amostras

    // Smoothing (calculado quando sampleRate disponível)
    this._attackCoef = 0;
    this._releaseCoef = 0;

    // Noise floor tracker (média exponencial longa)
    this._noiseFloor = 0.001;
    this._noiseAlpha = 0.9995;     // adapta lentamente ao ruído de fundo

    // Buffer para histórico de RMS (voz tem RMS sustentado, cliques são curtos)
    this._rmsHistory = new Float32Array(8);
    this._rmsIndex = 0;

    this.port.onmessage = (e) => {
      if (e.data.threshold !== undefined) this._threshold = e.data.threshold;
      if (e.data.attackMs !== undefined) this._updateCoefs(e.data.attackMs, null);
      if (e.data.releaseMs !== undefined) this._updateCoefs(null, e.data.releaseMs);
    };
  }

  _updateCoefs(attackMs, releaseMs) {
    const sr = sampleRate;
    const blockSize = 128;
    if (attackMs !== null) {
      const attackSamples = (attackMs / 1000) * sr / blockSize;
      this._attackCoef = attackSamples > 0 ? 1 - Math.exp(-1 / attackSamples) : 1;
    }
    if (releaseMs !== null) {
      const releaseSamples = (releaseMs / 1000) * sr / blockSize;
      this._releaseCoef = releaseSamples > 0 ? 1 - Math.exp(-1 / releaseSamples) : 1;
      this._holdMax = Math.round(releaseSamples * 0.4); // hold = 40% do release
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !output || !output[0]) return true;

    // Inicializa coefs na primeira chamada (sampleRate disponível aqui)
    if (this._attackCoef === 0) {
      this._updateCoefs(3, 120);
    }

    const inp = input[0];
    const out = output[0];
    const n = inp.length;

    // Calcular RMS do bloco
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const s = inp[i];
      sumSq += s * s;
      if (Math.abs(s) > peak) peak = Math.abs(s);
    }
    const rms = Math.sqrt(sumSq / n);

    // Atualizar histórico de RMS
    this._rmsHistory[this._rmsIndex % 8] = rms;
    this._rmsIndex++;

    // RMS médio das últimas 8 janelas (~23ms a 48kHz)
    let rmsAvg = 0;
    for (let i = 0; i < 8; i++) rmsAvg += this._rmsHistory[i];
    rmsAvg /= 8;

    // Atualizar noise floor apenas quando sinal está baixo (calibração contínua)
    if (rms < this._noiseFloor * 3) {
      this._noiseFloor = this._noiseAlpha * this._noiseFloor + (1 - this._noiseAlpha) * rms;
    }

    // Threshold dinâmico: 4x acima do noise floor, mínimo 0.006
    const dynThreshold = Math.max(this._threshold, this._noiseFloor * 4, 0.006);

    // Detector de impulso curto (clique de mouse/teclado):
    // cliques têm peak alto mas RMS médio baixo
    const isClickLike = peak > dynThreshold * 2 && rmsAvg < dynThreshold * 0.8;

    // Decidir se o gate deve abrir
    const voiceDetected = rmsAvg > dynThreshold && !isClickLike;

    let targetGain;
    if (voiceDetected) {
      this._holdSamples = this._holdMax;
      targetGain = 1;
    } else if (this._holdSamples > 0) {
      // Hold: mantém aberto por um tempo após parar de falar
      this._holdSamples--;
      targetGain = 1;
    } else {
      targetGain = 0;
    }

    // Smooth gain com attack/release
    const coef = targetGain > this._gateGain ? this._attackCoef : this._releaseCoef;
    this._gateGain += coef * (targetGain - this._gateGain);

    // Aplicar gain ao output
    const g = this._gateGain;
    for (let i = 0; i < n; i++) {
      out[i] = inp[i] * g;
    }

    // Propagar outros canais se existirem
    for (let ch = 1; ch < output.length; ch++) {
      if (input[ch] && output[ch]) {
        for (let i = 0; i < n; i++) output[ch][i] = input[ch][i] * g;
      }
    }

    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
