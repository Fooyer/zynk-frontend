import { selectDialog } from '../stores/dialogStore';

/**
 * Captura a tela usando getDisplayMedia.
 * Se sourceId é fornecido (Electron), avisa o main process antes para que o
 * setDisplayMediaRequestHandler use o source escolhido pelo usuário.
 */
export async function captureScreen(sourceId?: string): Promise<MediaStream> {
  try {
    // O await garante que o main process já guardou o source ANTES
    // de getDisplayMedia disparar o handler.
    if (sourceId && window.electronAPI?.selectScreenSource) {
      await window.electronAPI.selectScreenSource(sourceId);
    }
    // audio:true aqui é o que faz o Chromium de fato aceitar a faixa de
    // áudio que o main process concede via `audio: 'loopback'` no
    // setDisplayMediaRequestHandler — sem pedir áudio na constraint da
    // própria chamada, o loopback do main é ignorado e o stream sempre
    // volta só com vídeo. Mesmo assim, no Linux o stream ainda volta sem
    // áudio (loopback só existe no Windows/macOS) — ver
    // captureScreenWithAudioFallback logo abaixo.
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (e) {
    console.error('[captureScreen] getDisplayMedia falhou:', e);
    throw e;
  }
}

/**
 * Pergunta qual dispositivo de áudio usar quando a captura de tela não veio
 * com áudio nenhum — o loopback de áudio do sistema que o main process pede
 * via `audio: 'loopback'` (electron/main.ts) só existe no Windows e macOS;
 * no Linux `getDisplayMedia` simplesmente devolve zero faixas de áudio, sem
 * erro. Dispositivos com "monitor" no nome (PulseAudio/PipeWire) capturam o
 * que está tocando no sistema e aparecem como entrada de áudio comum — por
 * isso ficam no topo da lista. Resolve `null` se não achar nenhum
 * dispositivo ou se o usuário cancelar.
 */
async function pickFallbackAudioTrack(): Promise<MediaStreamTrack | null> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  if (audioInputs.length === 0) return null;

  const sorted = [...audioInputs].sort((a, b) => {
    const aMonitor = a.label.toLowerCase().includes('monitor') ? 0 : 1;
    const bMonitor = b.label.toLowerCase().includes('monitor') ? 0 : 1;
    return aMonitor - bMonitor;
  });

  const deviceId = await selectDialog(
    'Não conseguimos capturar o áudio do sistema automaticamente. Escolha um dispositivo de áudio pra compartilhar junto com a tela — no Linux, dispositivos com "monitor" no nome costumam captar o som do sistema.',
    sorted.map((d) => ({ value: d.deviceId, label: d.label || 'Dispositivo de áudio' })),
    { title: 'Áudio da tela compartilhada', cancelLabel: 'Continuar sem áudio' },
  );
  if (!deviceId) return null;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
  return stream.getAudioTracks()[0] ?? null;
}

/**
 * Captura a tela e, se o stream não vier com áudio (comum no Linux — ver
 * pickFallbackAudioTrack acima), pergunta ao usuário um dispositivo
 * alternativo e anexa a faixa resultante ao mesmo stream antes de devolver —
 * assim quem chama continua lendo `getAudioTracks()[0]` normalmente.
 */
export async function captureScreenWithAudioFallback(sourceId?: string): Promise<MediaStream> {
  const stream = await captureScreen(sourceId);
  if (stream.getAudioTracks().length === 0) {
    const fallbackTrack = await pickFallbackAudioTrack();
    if (fallbackTrack) stream.addTrack(fallbackTrack);
  }
  return stream;
}
