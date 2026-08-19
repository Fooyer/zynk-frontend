import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import { useSettingsStore } from '../stores/settingsStore';
import { LOW_LATENCY_AUDIO_CONSTRAINTS } from './lowLatencyAudio';
import type { CallMode } from '../types';

// Binário do RNNoise é ~600KB — busca/compila uma vez só e reaproveita em
// toda call depois (cada RnnoiseWorkletNode novo só precisa do ArrayBuffer,
// não precisa buscar de novo).
let rnnoiseWasmBinaryPromise: Promise<ArrayBuffer> | null = null;
function getRnnoiseWasmBinary(): Promise<ArrayBuffer> {
  if (!rnnoiseWasmBinaryPromise) {
    rnnoiseWasmBinaryPromise = loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseWasmSimdPath });
  }
  return rnnoiseWasmBinaryPromise;
}

export interface ProcessedStreamResult {
  stream: MediaStream;
  /** null quando o processamento está desligado (getUserMedia cru). */
  analyser: AnalyserNode | null;
  /** Libera o microfone de verdade e fecha o AudioContext interno. */
  stop: () => void;
}

export interface GetProcessedStreamOptions {
  /**
   * Toca o áudio já processado direto na saída de som (via Web Audio,
   * `AudioContext.destination` — não via MediaStream/<audio>). Usado só
   * pelo teste de microfone, pra ouvir a si mesmo. NUNCA passar isso numa
   * call de verdade — a outra ponta já tem o próprio áudio, isso só criaria
   * eco local.
   */
  monitor?: boolean;
}

/**
 * Trava o nó em mono explícito. Sem isso, todo AudioNode nativo (gain,
 * biquad, compressor...) tem `channelCountMode: 'max'` por padrão — assim
 * que o sinal (1 canal) passa pelo primeiro nó, ele já vira 2 canais
 * duplicados. O RNNoise (rodando com maxChannels: 1) então só lê e escreve
 * no canal 0, deixando o canal 1 mudo — daí o áudio sair só de um lado.
 * Forçando mono em cada nó da cadeia, o sinal nunca vira estéreo até o
 * ponto final de verdade (destination), onde o upmix mono→estéreo é feito
 * uma vez só e correto (duplicado nos dois lados).
 */
function forceMono<T extends AudioNode>(node: T): T {
  node.channelCount = 1;
  node.channelCountMode = 'explicit';
  node.channelInterpretation = 'speakers';
  return node;
}

/** Aplica setSinkId (dispositivo de saída escolhido) se o navegador suportar — API ainda não é padrão em todo lugar. */
function applyOutputDevice(ctx: AudioContext, outputDeviceId: string) {
  const ctxWithSink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (outputDeviceId && typeof ctxWithSink.setSinkId === 'function') {
    ctxWithSink.setSinkId(outputDeviceId).catch(() => {});
  }
}

function monitorRawStream(rawStream: MediaStream, monitor: boolean): { analyser: AnalyserNode | null; stop: () => void } {
  try {
    const ctx = new AudioContext({ sampleRate: 48000 });
    if (monitor) applyOutputDevice(ctx, useSettingsStore.getState().outputDeviceId);
    const src = ctx.createMediaStreamSource(rawStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    if (monitor) analyser.connect(ctx.destination);
    return {
      analyser,
      stop: () => { rawStream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); },
    };
  } catch {
    return { analyser: null, stop: () => rawStream.getTracks().forEach((t) => t.stop()) };
  }
}

/**
 * Captura o microfone e aplica o pipeline de áudio conforme as preferências
 * do usuário (Configurações > Áudio) — compartilhado entre call 1:1, canal
 * de voz de grupo e o teste de microfone: um pipeline só, testado num lugar
 * só, ouvido igual em todo canto.
 *
 * A remoção de ruído usa só RNNoise — rede neural do xiph/rnnoise (mesma
 * base usada por Mumble, OBS, Jitsi), treinada especificamente pra separar
 * voz de ruído de fundo, incluindo transientes como clique de mouse/
 * teclado. De propósito SEM gate: um gate liga/desliga o áudio (binário),
 * o que cortava pedaços da própria voz quando ela ficava mais baixa por um
 * instante. RNNoise processa de forma contínua — sempre atenuando o ruído,
 * nunca mutando o sinal — então a voz nunca é cortada, só o ruído é
 * reduzido.
 */
export async function getProcessedStream(
  mode: CallMode,
  opts: GetProcessedStreamOptions = {},
): Promise<ProcessedStreamResult> {
  const settings = useSettingsStore.getState();
  const monitor = opts.monitor ?? false;

  // Call de jogo: ignora as preferências de processamento do usuário e vai
  // sempre de áudio cru — é o próprio propósito desse modo (menor delay
  // possível, abre mão de eco/ruído em troca disso).
  if (mode === 'game') {
    const deviceConstraints: MediaTrackConstraints = {
      ...LOW_LATENCY_AUDIO_CONSTRAINTS,
      channelCount: 1,
      sampleRate: 48000,
    };
    if (settings.inputDeviceId) deviceConstraints.deviceId = { exact: settings.inputDeviceId };
    const rawStream = await navigator.mediaDevices.getUserMedia({ audio: deviceConstraints });
    const { analyser, stop } = monitorRawStream(rawStream, monitor);
    return { stream: rawStream, analyser, stop };
  }

  // Ruído nativo do navegador fica desligado sempre — com a supressão
  // ligada o RNNoise já cuida disso (empilhar os dois soa pior, não
  // melhor); com ela desligada, o objetivo é microfone cru de verdade.
  const deviceConstraints: MediaTrackConstraints = {
    noiseSuppression: false,
    echoCancellation: settings.echoCancellation,
    autoGainControl: settings.autoGainControl,
    channelCount: 1,
    sampleRate: 48000,
  };
  if (settings.inputDeviceId) {
    deviceConstraints.deviceId = { exact: settings.inputDeviceId };
  }

  const rawStream = await navigator.mediaDevices.getUserMedia({ audio: deviceConstraints });

  // Supressão desligada — retorna stream cru sem processamento
  if (!settings.noiseSuppression) {
    const { analyser, stop } = monitorRawStream(rawStream, monitor);
    return { stream: rawStream, analyser, stop };
  }

  try {
    const audioCtx = new AudioContext({ sampleRate: 48000 });
    if (monitor) applyOutputDevice(audioCtx, settings.outputDeviceId);

    const source = forceMono(audioCtx.createMediaStreamSource(rawStream));
    const destination = forceMono(audioCtx.createMediaStreamDestination());

    const inputGain = forceMono(audioCtx.createGain());
    inputGain.gain.value = settings.inputVolume;

    // Filtros leves — só cortam o que não é voz (rumble grave, chiado
    // agudo). A remoção de ruído de verdade é o RNNoise logo abaixo.
    const highPass = forceMono(audioCtx.createBiquadFilter());
    highPass.type = 'highpass';
    highPass.frequency.value = 90;
    highPass.Q.value = 0.71;

    const lowPass = forceMono(audioCtx.createBiquadFilter());
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 11000;
    lowPass.Q.value = 0.71;

    source.connect(inputGain);
    inputGain.connect(highPass);
    highPass.connect(lowPass);

    let lastNode: AudioNode = lowPass;

    const [wasmBinary] = await Promise.all([
      getRnnoiseWasmBinary(),
      audioCtx.audioWorklet.addModule(rnnoiseWorkletPath),
    ]);

    const rnnoise = forceMono(new RnnoiseWorkletNode(audioCtx, { maxChannels: 1, wasmBinary }));
    lastNode.connect(rnnoise);
    lastNode = rnnoise;

    // Compressor suave — só pra nivelar volume, não faz parte da remoção
    // de ruído (isso é 100% o RNNoise acima).
    const compressor = forceMono(audioCtx.createDynamicsCompressor());
    compressor.threshold.value = -24;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    lastNode.connect(compressor);
    lastNode = compressor;

    const makeupGain = forceMono(audioCtx.createGain());
    makeupGain.gain.value = 1.15;
    lastNode.connect(makeupGain);
    lastNode = makeupGain;

    // Analyser para detecção de fala (speaking indicator)
    const analyser = forceMono(audioCtx.createAnalyser());
    analyser.fftSize = 256;
    lastNode.connect(analyser);

    lastNode.connect(destination);

    // Monitoramento local (teste de microfone) — conecta direto no destino
    // nativo do Web Audio, NÃO via MediaStream/<audio>. Um MediaStreamTrack
    // mono tocado por um elemento <audio> às vezes sai só no canal esquerdo
    // (o navegador/driver não faz o upmix mono→estéreo corretamente nesse
    // caminho); o destino nativo do AudioContext faz esse upmix certo, sempre.
    if (monitor) lastNode.connect(audioCtx.destination);

    const outStream = new MediaStream([...destination.stream.getAudioTracks()]);
    const stop = () => {
      rawStream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
    };
    return { stream: outStream, analyser, stop };
  } catch {
    const { analyser, stop } = monitorRawStream(rawStream, monitor);
    return { stream: rawStream, analyser, stop };
  }
}
