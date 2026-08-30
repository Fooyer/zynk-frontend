import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
import { isHlsUrl } from '../services/videoSource';
import { useSettingsStore } from '../stores/settingsStore';
import type { VideoSource, WatchTogetherState } from '../types';
import { DRIFT_THRESHOLD_SEC, expectedPosition } from './watchSync';

export interface UseDirectVideoSyncOptions {
  onPlay: (positionSec: number) => void;
  onPause: (positionSec: number) => void;
  onSeek: (positionSec: number) => void;
  /** Vídeo chegou ao fim sozinho — quem chama decide se avança a fila. */
  onEnded: (endedSource: VideoSource) => void;
}

/**
 * Motor de sincronização do "assistir junto" pra link direto de vídeo
 * (mp4/webm/ogg progressivo, ou HLS via hls.js) — mesma forma de retorno que
 * useYouTubeSync, trocando o <div> de montagem do player do YouTube por um
 * <video> nativo, pra WatchPlayerControls poder ficar agnóstico de motor.
 */
export function useDirectVideoSync(state: WatchTogetherState, { onPlay, onPause, onSeek, onEnded }: UseDirectVideoSyncOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const isReadyRef = useRef(false);
  // true enquanto uma mudança no <video> foi disparada por NÓS aplicando um
  // sync remoto (não por ação do usuário) — sem essa trava, o listener nativo
  // de play/pause ecoaria toda sincronização remota como se fosse uma nova
  // ação do usuário (mesmo problema documentado em useYouTubeSync).
  const isSyncingRef = useRef(false);
  const loadedSourceRef = useRef<string | null>(null);
  const destroyedRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onPlayRef = useRef(onPlay); onPlayRef.current = onPlay;
  const onPauseRef = useRef(onPause); onPauseRef.current = onPause;
  const onSeekRef = useRef(onSeek); onSeekRef.current = onSeek;
  const onEndedRef = useRef(onEnded); onEndedRef.current = onEnded;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlayingUI, setIsPlayingUI] = useState(false);
  const [duration, setDuration] = useState(0);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [volume, setVolumeState] = useState(() => useSettingsStore.getState().watchTogetherVolume);
  const [isMuted, setIsMuted] = useState(false);

  // Nunca reaceita http(s) por garantido só porque já passou pelo modal ou
  // pela validação do servidor — este estado também chega via `watch:state`
  // no join/reconnect, sem passar pelo modal, então revalida aqui de novo
  // antes de atribuir a um <video src> ou ao hls.js.
  const isSafeToPlay = (value: string) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const attachSource = async (video: HTMLVideoElement, source: VideoSource) => {
    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (!isSafeToPlay(source.value)) {
      setLoadError('Link de vídeo inválido.');
      setIsLoading(false);
      return;
    }

    if (isHlsUrl(source.value)) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari/WebKit decodifica HLS nativamente — sem necessidade do hls.js.
        video.src = source.value;
        video.load();
        return;
      }
      const { default: HlsCtor } = await import('hls.js');
      if (destroyedRef.current || videoRef.current !== video) return;
      if (!HlsCtor.isSupported()) {
        setLoadError('Este link HLS não é suportado neste navegador.');
        setIsLoading(false);
        return;
      }
      const hls = new HlsCtor();
      hlsRef.current = hls;
      hls.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setLoadError('Não foi possível carregar esse vídeo.');
          setIsLoading(false);
        }
      });
      hls.loadSource(source.value);
      hls.attachMedia(video);
      return;
    }

    video.src = source.value;
    video.load();
  };

  const applyRemoteState = (s: WatchTogetherState) => {
    const video = videoRef.current;
    if (!video || !isReadyRef.current) return;

    if (loadedSourceRef.current !== s.source.value) {
      loadedSourceRef.current = s.source.value;
      isReadyRef.current = false;
      setIsLoading(true);
      setLoadError(null);
      void attachSource(video, s.source);
      return; // seek/play acontece no handler de loadedmetadata, quando a duração já existe
    }

    isSyncingRef.current = true;
    const drift = Math.abs(video.currentTime - expectedPosition(s));
    if (drift > DRIFT_THRESHOLD_SEC) video.currentTime = expectedPosition(s);
    if (s.isPlaying && video.paused) video.play().catch(() => {});
    if (!s.isPlaying && !video.paused) video.pause();

    setTimeout(() => { isSyncingRef.current = false; }, 600);
  };

  // Cria os listeners e carrega a fonte inicial uma única vez.
  useEffect(() => {
    destroyedRef.current = false;
    const video = videoRef.current;
    if (!video) return;

    let readyTimeout: ReturnType<typeof setTimeout> | undefined;

    const onLoadedMetadata = () => {
      if (destroyedRef.current) return;
      if (readyTimeout) clearTimeout(readyTimeout);
      isReadyRef.current = true;
      setIsLoading(false);
      setDuration(video.duration || 0);
      video.volume = volume / 100;
      applyRemoteState(stateRef.current);
    };
    const onNativePlay = () => {
      setIsPlayingUI(true);
      if (isSyncingRef.current) return;
      onPlayRef.current(video.currentTime);
    };
    const onNativePause = () => {
      setIsPlayingUI(false);
      if (isSyncingRef.current) return;
      onPauseRef.current(video.currentTime);
    };
    const onNativeEnded = () => onEndedRef.current(stateRef.current.source);
    const onNativeError = () => {
      if (destroyedRef.current) return;
      setLoadError('Não foi possível carregar esse vídeo. Verifique o link.');
      setIsLoading(false);
    };

    // Posição exibida é atualizada pelo intervalo de 500ms abaixo (mesmo
    // padrão de useYouTubeSync) — não por 'timeupdate', que dispararia por
    // cima de um arrasto de scrub em andamento sem essa distinção.
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('play', onNativePlay);
    video.addEventListener('pause', onNativePause);
    video.addEventListener('ended', onNativeEnded);
    video.addEventListener('error', onNativeError);

    loadedSourceRef.current = stateRef.current.source.value;
    void attachSource(video, stateRef.current.source);

    // Mesma proteção que useYouTubeSync: sem isso, uma fonte que nunca
    // dispara loadedmetadata (link morto, CORS, host fora do ar) deixava o
    // spinner girando pra sempre sem nenhuma pista do que deu errado.
    readyTimeout = setTimeout(() => {
      if (!destroyedRef.current && !isReadyRef.current) {
        setLoadError('O vídeo não respondeu a tempo. Verifique o link.');
      }
    }, 15_000);

    return () => {
      destroyedRef.current = true;
      if (readyTimeout) clearTimeout(readyTimeout);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('play', onNativePlay);
      video.removeEventListener('pause', onNativePause);
      video.removeEventListener('ended', onNativeEnded);
      video.removeEventListener('error', onNativeError);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
      isReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcilia sempre que o estado autoritativo do servidor mudar.
  useEffect(() => {
    applyRemoteState(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.source.value, state.isPlaying, state.positionSec, state.updatedAtMs]);

  // Corrige deriva de reprodução em relação ao grupo continuamente, mesmo
  // sem nenhum evento novo — mesmo padrão de useYouTubeSync.
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || !isReadyRef.current) return;

      if (!isScrubbing) setDisplayPosition(video.currentTime);

      if (isSyncingRef.current || video.paused) return;
      const drift = Math.abs(video.currentTime - expectedPosition(stateRef.current));
      if (drift > DRIFT_THRESHOLD_SEC) {
        isSyncingRef.current = true;
        video.currentTime = expectedPosition(stateRef.current);
        setTimeout(() => { isSyncingRef.current = false; }, 600);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isScrubbing]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const seekCommit = (value: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = value;
    setDisplayPosition(value);
    setIsScrubbing(false);
    onSeekRef.current(value);
  };

  const changeVolume = (value: number) => {
    setVolumeState(value);
    useSettingsStore.getState().setWatchTogetherVolume(value);
    const video = videoRef.current;
    if (video) video.volume = value / 100;
    if (value === 0) { setIsMuted(true); if (video) video.muted = true; }
    else if (isMuted) { setIsMuted(false); if (video) video.muted = false; }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) { video.muted = false; setIsMuted(false); }
    else { video.muted = true; setIsMuted(true); }
  };

  return {
    videoRef,
    isLoading,
    loadError,
    isPlayingUI,
    duration,
    displayPosition,
    isScrubbing,
    setIsScrubbing,
    setDisplayPosition,
    volume,
    isMuted,
    togglePlay,
    seekCommit,
    changeVolume,
    toggleMute,
  };
}
