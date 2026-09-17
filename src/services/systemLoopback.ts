/**
 * Captura o loopback de áudio do sistema (tudo que as caixas de som estão
 * tocando — inclusive apps fora do Zynk, como um jogo à parte) pra servir de
 * referência ao cancelamento de eco "de sistema" (ver systemEchoCancelWorklet.js
 * e settings.systemEchoCancellation). Sem isso, o eco de áudio que o Zynk não
 * está tocando (jogo separado, sons do Windows) nunca pode ser cancelado pelo
 * echoCancellation nativo do navegador — ele só cancela o que o próprio Zynk
 * reproduz (ver ticket "Eco do sistema").
 *
 * Só funciona no Electron/Windows/macOS — mesma limitação do loopback usado
 * no compartilhamento de tela (ver screenCapture.ts); no Linux normalmente
 * não vem faixa de áudio nenhuma.
 *
 * Reaproveita a MESMA infra de captura de tela (setDisplayMediaRequestHandler
 * com audio:'loopback' no main process, ver electron/main.ts) — não existe
 * uma API separada de "só áudio do sistema" no Electron. Pedimos vídeo de uma
 * tela qualquer e descartamos a faixa de vídeo na hora, mantendo só o áudio.
 * Sem abrir o ScreenPicker (igual ao GameSessionView.tsx, que já
 * auto-seleciona a primeira tela sem perguntar).
 */

let cachedTrackPromise: Promise<MediaStreamTrack | null> | null = null;

async function captureNewLoopbackTrack(): Promise<MediaStreamTrack | null> {
  if (!window.electronAPI) return null; // navegador puro não tem loopback do sistema

  try {
    const sources = await window.electronAPI.getScreenSources();
    const firstScreen = sources.find((s) => s.isScreen) ?? sources[0];
    if (!firstScreen) return null;

    await window.electronAPI.selectScreenSource(firstScreen.id);
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

    // Descarta o vídeo assim que a captura entrega — só precisamos do áudio,
    // manter a faixa de vídeo viva custaria CPU/GPU à toa.
    stream.getVideoTracks().forEach((t) => t.stop());

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return null; // Linux: loopback de áudio não existe (ver screenCapture.ts)

    // Se a faixa morrer (usuário revogou permissão, dispositivo mudou etc.),
    // esquece o cache — a próxima chamada tenta capturar de novo do zero.
    audioTrack.onended = () => {
      if (cachedTrackPromise) cachedTrackPromise = null;
    };

    return audioTrack;
  } catch (e) {
    console.error('[systemLoopback] Não foi possível capturar o loopback do sistema:', e);
    return null;
  }
}

/**
 * Devolve uma faixa de áudio de loopback do sistema, reaproveitando a mesma
 * entre chamadas. getDisplayMedia normalmente só funciona logo após um gesto
 * do usuário (clique) — chamar de novo a cada início de call arriscava falhar
 * silenciosamente fora desse gesto (ex.: reconexão automática). Por isso o
 * ideal é chamar isso UMA vez, de propósito, quando o usuário liga o switch
 * em Configurações (clique é gesto válido — ver SettingsPage.tsx) — e só
 * reaproveitar aqui depois, inclusive entre calls diferentes.
 */
export function getOrCreateSystemLoopbackTrack(): Promise<MediaStreamTrack | null> {
  if (!cachedTrackPromise) cachedTrackPromise = captureNewLoopbackTrack();
  return cachedTrackPromise;
}

/** Libera de vez — chamado quando o usuário desliga o switch em Configurações. */
export function releaseSystemLoopbackTrack(): void {
  cachedTrackPromise?.then((t) => t?.stop());
  cachedTrackPromise = null;
}
