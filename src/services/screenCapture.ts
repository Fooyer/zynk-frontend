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
    // volta só com vídeo (era por isso que captureSystemAudio() nunca
    // achava nenhuma faixa de áudio pra capturar).
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
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
  // Diagnóstico: a faixa pode vir "viva" (não cai no erro acima) mas sem
  // áudio real chegando — em geral sinal de que o Windows negou a captura de
  // loopback silenciosamente (permissão de microfone do app nas configs de
  // privacidade) em vez de estourar erro. `muted`/`onmute` aqui ajudam a
  // distinguir "capturou mas tá tudo em silêncio no PC" de "Windows nunca
  // entregou frame nenhum".
  const audioTrack = stream.getAudioTracks()[0];
  const settings = audioTrack.getSettings();
  // channelCount/sampleRate primeiro de propósito: o preview inline do
  // console do Chrome trunca depois de ~5 propriedades com "…", e um
  // descompasso de canais/sample rate do loopback do WASAPI é a suspeita
  // atual pra "captura real, mas chega zerada do outro lado" — precisa
  // aparecer sem precisar expandir o objeto manualmente no devtools.
  console.log('[captureSystemAudio] track capturada:', {
    channelCount: settings.channelCount,
    sampleRate: settings.sampleRate,
    sampleSize: settings.sampleSize,
    label: audioTrack.label,
    readyState: audioTrack.readyState,
    muted: audioTrack.muted,
    enabled: audioTrack.enabled,
  });
  audioTrack.onmute = () => console.warn('[captureSystemAudio] track ficou muted (Windows parou de entregar áudio)');
  audioTrack.onunmute = () => console.log('[captureSystemAudio] track voltou a entregar áudio');
  return stream;
}
