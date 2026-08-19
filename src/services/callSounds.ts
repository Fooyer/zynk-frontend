import { useSettingsStore } from '../stores/settingsStore';

/**
 * Efeitos sonoros curtos pra ações de call — entrar, sair, compartilhar
 * tela, mudo/desmudo. Sintetizados via Web Audio (mesma técnica do toque de
 * chamada em CallManager.tsx), não é um arquivo baixado — então "free to
 * use" do jeito mais garantido possível, sem questão de licença nenhuma.
 * Reaproveita o toggle/volume que já existe em Configurações > Notificações
 * (notifSound/notifVolume) em vez de criar uma preferência nova.
 */

let ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

interface ToneStep {
  freq: number;
  /** duração em segundos */
  duration: number;
  /** início em segundos, relativo ao começo da sequência */
  at: number;
}

function playTones(steps: ToneStep[], type: OscillatorType = 'sine', peakGain = 0.18) {
  const { notifSound, notifVolume } = useSettingsStore.getState();
  if (!notifSound) return;

  try {
    const audioCtx = getCtx();
    const now = audioCtx.currentTime;
    const master = audioCtx.createGain();
    master.gain.value = notifVolume;
    master.connect(audioCtx.destination);

    for (const step of steps) {
      const osc = audioCtx.createOscillator();
      osc.type = type;
      osc.frequency.value = step.freq;

      const gain = audioCtx.createGain();
      const start = now + step.at;
      const end = start + step.duration;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peakGain, start + 0.012);
      gain.gain.setValueAtTime(peakGain, Math.max(start + 0.012, end - 0.02));
      gain.gain.linearRampToValueAtTime(0, end);

      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    // Web Audio indisponível — silencioso, som nunca é crítico
  }
}

/** Duas notas subindo — usado ao entrar num canal de voz ou call conectar. */
export function playJoinCallSound() {
  playTones([
    { freq: 523.25, duration: 0.09, at: 0 }, // C5
    { freq: 783.99, duration: 0.13, at: 0.08 }, // G5
  ]);
}

/** Duas notas descendo — usado ao sair de um canal de voz ou encerrar a call. */
export function playLeaveCallSound() {
  playTones([
    { freq: 587.33, duration: 0.09, at: 0 }, // D5
    { freq: 392.0, duration: 0.14, at: 0.08 }, // G4
  ]);
}

/** Timbre diferente (triangle) pra não confundir com entrar/sair da call. */
export function playScreenShareStartSound() {
  playTones(
    [
      { freq: 659.25, duration: 0.07, at: 0 }, // E5
      { freq: 987.77, duration: 0.11, at: 0.06 }, // B5
    ],
    'triangle',
    0.15,
  );
}

export function playScreenShareStopSound() {
  playTones(
    [
      { freq: 987.77, duration: 0.07, at: 0 },
      { freq: 659.25, duration: 0.11, at: 0.06 },
    ],
    'triangle',
    0.15,
  );
}

export function playMuteSound() {
  playTones([{ freq: 330, duration: 0.08, at: 0 }], 'sine', 0.14);
}

export function playUnmuteSound() {
  playTones([{ freq: 523, duration: 0.08, at: 0 }], 'sine', 0.14);
}
