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

/**
 * Captura só o áudio do sistema (loopback), sem vídeo, pra compartilhar com
 * o outro participante sem expor a tela — ex: tocar uma música ou o áudio de
 * um jogo pra call sem mostrar nada visualmente.
 *
 * O Chromium não permite pedir só áudio via getDisplayMedia (`video` é
 * obrigatório), então a captura passa pelo mesmo fluxo de tela — o main
 * process (setDisplayMediaRequestHandler) sempre inclui `audio: 'loopback'`
 * automaticamente — e a faixa de vídeo é descartada assim que o stream
 * chega, antes de qualquer track ser adicionada à chamada.
 *
 * Importante: o loopback captura o áudio do SISTEMA INTEIRO (o que estiver
 * tocando no computador), não de um app específico isolado — o Windows não
 * expõe captura de áudio por processo através da API que o Electron usa.
 */
export async function captureSystemAudio(): Promise<MediaStream> {
  const stream = await captureScreen();
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.stop();
    stream.removeTrack(videoTrack);
  }
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('Nenhum áudio do sistema disponível pra capturar.');
  }
  return stream;
}
