export type IceHealth = 'connected' | 'reconnecting' | 'failed';

interface WatchIceConnectionOptions {
  onHealthChange: (health: IceHealth) => void;
  /** Reinicia a negociação ICE (ex.: `pc.restartIce()` + reenviar offer). */
  restart: () => Promise<void>;
  /** Tempo de espera antes de tentar recuperar — ICE costuma se
   *  autorrecuperar de blips curtos sem precisar de restart. */
  graceMs?: number;
  /** Tentativas de restart antes de desistir e reportar `failed` (terminal). */
  maxAttempts?: number;
}

/**
 * Observa `iceConnectionState` e tenta recuperar sozinho de quedas
 * transitórias (o caso comum: NAT/roteador fecha o mapeamento depois de um
 * tempo sem tráfego de áudio) via `restart()`, em vez de deixar a conexão
 * morta em silêncio ou derrubar a call na primeira falha. Reporta o estado
 * pra UI (`onHealthChange`) em vez de só logar — ver comentário original em
 * useVoiceRoom.ts sobre falha de ICE ser "muda" sem isso.
 */
export function watchIceConnection(
  pc: RTCPeerConnection,
  { onHealthChange, restart, graceMs = 2500, maxAttempts = 4 }: WatchIceConnectionOptions,
): () => void {
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let health: IceHealth = 'connected';
  let stopped = false;

  const setHealth = (h: IceHealth) => {
    if (h === health) return;
    health = h;
    onHealthChange(h);
  };

  const clearTimer = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  const scheduleAttempt = () => {
    clearTimer();
    timer = setTimeout(attemptRestart, graceMs);
  };

  const attemptRestart = async () => {
    if (stopped) return;
    const state = pc.iceConnectionState;
    if (state === 'connected' || state === 'completed' || state === 'closed') return;

    attempts += 1;
    if (attempts > maxAttempts) {
      setHealth('failed');
      return;
    }
    try {
      await restart();
    } catch {
      // A próxima tentativa (ou o timeout de tentativas) resolve.
    }
    if (!stopped) scheduleAttempt();
  };

  const onChange = () => {
    const state = pc.iceConnectionState;
    if (state === 'connected' || state === 'completed') {
      clearTimer();
      attempts = 0;
      setHealth('connected');
    } else if (state === 'disconnected') {
      setHealth('reconnecting');
      scheduleAttempt();
    } else if (state === 'failed') {
      setHealth('reconnecting');
      clearTimer();
      attemptRestart();
    } else if (state === 'closed') {
      clearTimer();
    }
  };

  pc.addEventListener('iceconnectionstatechange', onChange);
  return () => {
    stopped = true;
    clearTimer();
    pc.removeEventListener('iceconnectionstatechange', onChange);
  };
}
