/**
 * Noise Gate AudioWorklet Processor — v2
 *
 * Técnicas combinadas:
 * 1. Gate baseado em RMS com threshold dinâmico adaptativo
 * 2. Detecção de impulsos (cliques de mouse/teclado) via crest factor
 * 3. Subtração espectral simplificada para reduzir ruído de fundo
 * 4. Histórico de voz mais longo para evitar cortes em pausas naturais
 *
 * Parâmetros ajustáveis via port.postMessage:
 *   { threshold: 0.006, attackMs: 2, releaseMs: 150, noiseReduction: 0.7 }
 */
class NoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Gate state
    this._gateGain = 0;
    this._threshold = 0.006;       // RMS threshold base (mais sensível)
    this._holdSamples = 0;
    this._holdMax = 0;

    // Smoothing
    this._attackCoef = 0;
    this._releaseCoef = 0;

    // Noise floor tracker (média exponencial longa)
    this._noiseFloor = 0.0005;
    this._noiseAlpha = 0.9998;     // adapta mais lentamente ao ruído de fundo

    // Noise spectrum profile (para subtração espectral)
    this._noiseProfile = new Float32Array(128);
    this._noiseProfileReady = false;
    this._silentFrames = 0;
    this._noiseReduction = 0.7;    // intensidade da subtração espectral (0-1)

    // Buffer para histórico de RMS — 16 janelas (~43ms a 48kHz) para decisão mais suave
    this._rmsHistory = new Float32Array(16);
    this._rmsIndex = 0;

    // Hysteresis: threshold diferente para abrir e fechar o gate
    this._isOpen = false;
    this._hysteresisRatio = 0.6;   // fecha em 60% do threshold de abertura

    // Voice activity tracking — suaviza transições
    this._voiceConfidence = 0;
    this._confidenceAttack = 0.3;
    this._confidenceRelease = 0.05;

    this.port.onmessage = (e) => {
      if (e.data.threshold !== undefined) this._threshold = e.data.threshold;
      if (e.data.attackMs !== undefined) this._updateCoefs(e.data.attackMs, null);
      if (e.data.releaseMs !== undefined) this._updateCoefs(null, e.data.releaseMs);
      if (e.data.noiseReduction !== undefined) this._noiseReduction = e.data.noiseReduction;
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
      this._holdMax = Math.round(releaseSamples * 0.5); // hold = 50% do release
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0] || !output || !output[0]) return true;

    // Inicializa coefs na primeira chamada
    if (this._attackCoef === 0) {
      this._updateCoefs(2, 150);
    }

    const inp = input[0];
    const out = output[0];
    const n = inp.length;

    // Calcular RMS e peak do bloco
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const s = inp[i];
      sumSq += s * s;
      const abs = s < 0 ? -s : s;
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sumSq / n);

    // Crest factor: picos altos com energia baixa = impulsos
    const crestFactor = rms > 0.0001 ? peak / rms : 0;

    // Atualizar histórico de RMS
    this._rmsHistory[this._rmsIndex & 15] = rms;
    this._rmsIndex++;

    // RMS médio das últimas 16 janelas (~43ms a 48kHz)
    let rmsAvg = 0;
    for (let i = 0; i < 16; i++) rmsAvg += this._rmsHistory[i];
    rmsAvg /= 16;

    // RMS recente (últimas 4 janelas) para resposta rápida
    let rmsRecent = 0;
    for (let i = 0; i < 4; i++) {
      rmsRecent += this._rmsHistory[(this._rmsIndex - 1 - i) & 15];
    }
    rmsRecent /= 4;

    // Atualizar noise floor quando sinal está claramente baixo
    if (rms < this._noiseFloor * 2.5 && crestFactor < 8) {
      this._noiseFloor = this._noiseAlpha * this._noiseFloor + (1 - this._noiseAlpha) * rms;
      this._silentFrames++;

      // Atualizar perfil de ruído espectral (média durante silêncio)
      if (this._silentFrames > 50) { // ~135ms de silêncio para calibrar
        const alpha = this._noiseProfileReady ? 0.95 : 0.5;
        for (let i = 0; i < n; i++) {
          const mag = inp[i] < 0 ? -inp[i] : inp[i];
          this._noiseProfile[i] = alpha * this._noiseProfile[i] + (1 - alpha) * mag;
        }
        this._noiseProfileReady = true;
      }
    } else {
      this._silentFrames = 0;
    }

    // Threshold dinâmico: 3.5x acima do noise floor, mínimo configurável
    const dynThreshold = Math.max(this._threshold, this._noiseFloor * 3.5, 0.004);

    // Detecção de impulsos: crest factor alto = clique/teclado
    const isClickLike = crestFactor > 12 && rmsAvg < dynThreshold * 1.2;

    // Hysteresis: threshold diferente para abrir e fechar
    const openThreshold = dynThreshold;
    const closeThreshold = dynThreshold * this._hysteresisRatio;

    // Decisão com hysteresis
    let voiceDetected;
    if (this._isOpen) {
      voiceDetected = rmsRecent > closeThreshold && !isClickLike;
    } else {
      voiceDetected = rmsAvg > openThreshold && rmsRecent > openThreshold * 0.7 && !isClickLike;
    }
    this._isOpen = voiceDetected || this._holdSamples > 0;

    // Atualizar voice confidence (suavização adicional)
    if (voiceDetected) {
      this._voiceConfidence += this._confidenceAttack * (1 - this._voiceConfidence);
    } else {
      this._voiceConfidence += this._confidenceRelease * (0 - this._voiceConfidence);
    }

    let targetGain;
    if (voiceDetected) {
      this._holdSamples = this._holdMax;
      targetGain = 1;
    } else if (this._holdSamples > 0) {
      this._holdSamples--;
      targetGain = 1;
    } else {
      // Em vez de cortar abruptamente para 0, usar um gain residual baseado no confidence
      targetGain = this._voiceConfidence > 0.1 ? this._voiceConfidence * 0.3 : 0;
    }

    // Smooth gain com attack/release
    const coef = targetGain > this._gateGain ? this._attackCoef : this._releaseCoef;
    this._gateGain += coef * (targetGain - this._gateGain);

    // Aplicar gate + subtração espectral ao output
    const g = this._gateGain;
    const nr = this._noiseReduction;

    if (g < 0.01) {
      // Gate fechado — silêncio total
      for (let i = 0; i < n; i++) out[i] = 0;
    } else if (this._noiseProfileReady && g < 1 && nr > 0) {
      // Gate parcialmente aberto — aplicar subtração espectral suave
      const subAmount = (1 - g) * nr;
      for (let i = 0; i < n; i++) {
        const sample = inp[i];
        const noiseMag = this._noiseProfile[i] * subAmount;
        // Subtrai ruído mantendo o sinal
        if (sample > noiseMag) {
          out[i] = (sample - noiseMag) * g + sample * (1 - g) * 0.1;
        } else if (sample < -noiseMag) {
          out[i] = (sample + noiseMag) * g + sample * (1 - g) * 0.1;
        } else {
          out[i] = sample * g * 0.3;
        }
      }
    } else {
      // Gate aberto — passa o sinal normalmente
      for (let i = 0; i < n; i++) {
        out[i] = inp[i] * g;
      }
    }

    // Propagar outros canais
    for (let ch = 1; ch < output.length; ch++) {
      if (input[ch] && output[ch]) {
        for (let i = 0; i < n; i++) output[ch][i] = output[0][i];
      }
    }

    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
