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
    return await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch (e) {
    console.error('[captureScreen] getDisplayMedia falhou:', e);
    throw e;
  }
}
