import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import agcWorkletPath from './agcWorklet.js?url';
import noiseGateWorkletPath from './noiseGateWorklet.js?url';
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
 * nunca mutando o sinal.
 *
 * A saída do RNNoise (85%) é misturada com uma fração do sinal só filtrado
 * (15%, sem RNNoise) antes do compressor — em microfone ruim/muito ruidoso
 * o RNNoise pode perder confiança de que existe voz num frame e atenuar
 * ele quase inteiro, o que soava como a voz cortando junto com o ruído.
 * Essa mistura garante um piso mínimo de sinal sempre presente.
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

    const [wasmBinary] = await Promise.all([
      getRnnoiseWasmBinary(),
      audioCtx.audioWorklet.addModule(rnnoiseWorkletPath),
      audioCtx.audioWorklet.addModule(agcWorkletPath),
      audioCtx.audioWorklet.addModule(noiseGateWorkletPath),
    ]);

    const rnnoise = forceMono(new RnnoiseWorkletNode(audioCtx, { maxChannels: 1, wasmBinary }));
    lowPass.connect(rnnoise);

    // Mistura wet (RNNoise) + um pouco de dry (sinal só filtrado, sem
    // RNNoise) — em microfone ruim/muito ruidoso, o RNNoise pode perder a
    // confiança de que existe voz ali e atenuar o frame quase inteiro,
    // cortando a voz junto com o ruído (relatado: "não sai nada"). Manter
    // uma fração do sinal original sempre passando garante que nunca fica
    // em silêncio total, custando só um pouco do ruído de volta.
    const wetGain = forceMono(audioCtx.createGain());
    wetGain.gain.value = 0.85;
    rnnoise.connect(wetGain);

    const dryGain = forceMono(audioCtx.createGain());
    dryGain.gain.value = 0.15;
    lowPass.connect(dryGain);

    const mixed = forceMono(audioCtx.createGain());
    wetGain.connect(mixed);
    dryGain.connect(mixed);

    let lastNode: AudioNode = mixed;

    // Isolamento de voz (expansor suave, não gate binário — ver comentário
    // em noiseGateWorklet.js) — atenua o que sobra de ruído de fundo depois
    // do RNNoise, principalmente o piso de 15% de sinal "seco" sempre
    // presente na mixagem acima. Roda antes do compressor/AGC de propósito,
    // pra eles nivelarem o sinal já mais limpo em vez de realçar ruído.
    if (settings.noiseGateEnabled) {
      const noiseGate = forceMono(
        new AudioWorkletNode(audioCtx, 'noise-gate-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers',
        }),
      );
      noiseGate.port.postMessage({ auto: settings.noiseGateAuto, thresholdDb: settings.noiseGateThreshold });
      lastNode.connect(noiseGate);
      lastNode = noiseGate;
    }

    // Compressor suave — só pra nivelar volume, não faz parte da remoção
    // de ruído (isso é o RNNoise acima).
    const compressor = forceMono(audioCtx.createDynamicsCompressor());
    compressor.threshold.value = -24;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    lastNode.connect(compressor);
    lastNode = compressor;

    // AGC (Automatic Gain Control) — mede o RMS do sinal já limpo (pós
    // RNNoise + compressor) e ajusta o ganho pra manter a voz numa faixa de
    // volume alvo (-20dBFS), em vez de um ganho fixo. Sem isso, quem tem
    // microfone baixo (comum em quem não tem supressão de ruído de
    // hardware) fica bem mais baixo que o resto do canal; com ganho fixo
    // isso nunca se resolvia. Implementado como AudioWorkletProcessor
    // (agcWorklet.js) pra rodar na thread de áudio, sem round-trip pro
    // main thread.
    const agc = forceMono(
      new AudioWorkletNode(audioCtx, 'agc-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      }),
    );
    lastNode.connect(agc);
    lastNode = agc;

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
