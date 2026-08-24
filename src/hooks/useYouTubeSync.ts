import { useEffect, useRef, useState } from 'react';
import { loadYouTubeIframeAPI } from '../services/youtube';
import type { YT } from '../services/youtube';
import { useSettingsStore } from '../stores/settingsStore';
import type { WatchTogetherState } from '../types';

const DRIFT_THRESHOLD_SEC = 1.5;
const UNSTARTED = -1;
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

function expectedPosition(state: WatchTogetherState): number {
  if (!state.isPlaying) return state.positionSec;
  return state.positionSec + (Date.now() - state.updatedAtMs) / 1000;
}

export interface UseYouTubeSyncOptions {
  onPlay: (positionSec: number) => void;
  onPause: (positionSec: number) => void;
  onSeek: (positionSec: number) => void;
  /** Vídeo chegou ao fim sozinho — quem chama decide se avança a fila. */
  onEnded: (endedVideoId: string) => void;
}

/**
 * Motor de sincronização do "assistir junto" — cria e mantém UM player do
 * YouTube reconciliado com o estado autoritativo do servidor. Extraído de
 * WatchTogetherPlayer.tsx pra poder ser reaproveitado por uma segunda casca
 * de UI (o mini player flutuante) sem duplicar essa lógica — CRÍTICO ter só
 * uma instância do player montada por vez em toda a árvore, senão dois
 * embeds do YouTube tocariam o mesmo vídeo ao mesmo tempo (áudio duplicado).
 * A coordenação de qual casca está montada em cada momento fica em
 * watchTogetherUiStore, fora daqui.
 */
export function useYouTubeSync(state: WatchTogetherState, { onPlay, onPause, onSeek, onEnded }: UseYouTubeSyncOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const isReadyRef = useRef(false);
  // true enquanto uma mudança no player foi disparada por NÓS aplicando um
  // sync remoto (não por clique do usuário) — o onStateChange do YouTube não
  // distingue as duas origens, então sem essa trava toda sincronização
  // remota vira um novo evento local, ecoando pra sempre.
  const isSyncingRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Callbacks guardados em ref (não capturados direto no efeito de criação,
  // que roda só uma vez) — assim sempre chamamos a versão mais recente sem
  // precisar destruir/recriar o player a cada re-render do componente pai.
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
  // Semeado com o volume salvo (mesmo valor pro mini player e pro grande,
  // qualquer um dos dois que tiver sido usado por último) — persistido a
  // cada mudança em changeVolume, pra virar o padrão do próximo vídeo/sessão.
  const [volume, setVolumeState] = useState(() => useSettingsStore.getState().watchTogetherVolume);
  const [isMuted, setIsMuted] = useState(false);

  const applyRemoteState = (s: WatchTogetherState) => {
    const player = playerRef.current;
    if (!player || !isReadyRef.current) return;

    isSyncingRef.current = true;

    if (loadedVideoIdRef.current !== s.videoId) {
      loadedVideoIdRef.current = s.videoId;
      player.loadVideoById(s.videoId);
      player.seekTo(expectedPosition(s), true);
    } else {
      const drift = Math.abs(player.getCurrentTime() - expectedPosition(s));
      if (drift > DRIFT_THRESHOLD_SEC) player.seekTo(expectedPosition(s), true);
    }

    const currentPlayerState = player.getPlayerState();
    if (s.isPlaying && currentPlayerState !== PLAYING) player.playVideo();
    if (!s.isPlaying && currentPlayerState !== PAUSED) player.pauseVideo();

    // Solta a trava só depois de um tempo suficiente pro onStateChange
    // disparado por essas chamadas ser ignorado, sem engolir uma ação
    // genuína do usuário logo em seguida.
    setTimeout(() => { isSyncingRef.current = false; }, 600);
  };

  // Cria o player uma única vez, mesmo que `state`/callbacks mudem depois.
  useEffect(() => {
    let destroyed = false;
    let readyTimeout: ReturnType<typeof setTimeout> | undefined;

    loadYouTubeIframeAPI().then(() => {
      if (destroyed || !containerRef.current || !window.YT) return;

      const player = new window.YT.Player(containerRef.current, {
        videoId: stateRef.current.videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          // Sem isso, o widget tenta adivinhar a origem da página que o
          // embutiu (via document.referrer ou heurística própria) pra saber
          // pra onde mandar seus postMessage de onReady/onStateChange — e
          // erra silenciosamente em contextos não-padrão (Electron com
          // esquema customizado, ou até localhost em alguns casos), travando
          // o handshake e quebrando a sincronização (getCurrentTime,
          // eventos de estado) sem lançar nenhum erro visível no app.
          // Passar explicitamente elimina a adivinhação.
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (readyTimeout) clearTimeout(readyTimeout);
            isReadyRef.current = true;
            loadedVideoIdRef.current = stateRef.current.videoId;
            setIsLoading(false);
            setDuration(e.target.getDuration());
            e.target.setVolume(volume);
            applyRemoteState(stateRef.current);
          },
          onStateChange: (e) => {
            const p = playerRef.current;
            if (p && e.data !== UNSTARTED) setDuration(p.getDuration());
            setIsPlayingUI(e.data === PLAYING);

            if (isSyncingRef.current) return;
            if (!p) return;
            if (e.data === PLAYING) onPlayRef.current(p.getCurrentTime());
            else if (e.data === PAUSED) onPauseRef.current(p.getCurrentTime());
            else if (e.data === ENDED) onEndedRef.current(loadedVideoIdRef.current ?? stateRef.current.videoId);
          },
        },
      });
      playerRef.current = player;

      // O script da IFrame API pode carregar sem erro e ainda assim o
      // handshake onReady nunca chegar (postMessage engolido por origem
      // divergente, CSP do YOUTUBE bloqueando o script interno dele,
      // extensão de bloqueio de anúncio, etc.) — sem isso o spinner de
      // "Carregando player..." fica girando pra sempre, sem nenhuma pista.
      readyTimeout = setTimeout(() => {
        if (!destroyed && !isReadyRef.current) {
          setLoadError('O player do YouTube não respondeu a tempo. Tente recarregar.');
        }
      }, 15_000);
    }).catch((err) => {
      console.error('[useYouTubeSync] falha ao carregar o player do YouTube:', err);
      if (!destroyed) setLoadError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      destroyed = true;
      if (readyTimeout) clearTimeout(readyTimeout);
      playerRef.current?.destroy();
      playerRef.current = null;
      isReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcilia sempre que o estado autoritativo do servidor mudar (vídeo
  // trocado, play/pause/seek de QUALQUER participante — inclusive o eco da
  // própria ação, que aqui vira um no-op já que o player local já está lá).
  useEffect(() => {
    applyRemoteState(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.videoId, state.isPlaying, state.positionSec, state.updatedAtMs]);

  // Atualiza a barra de progresso E corrige deriva de reprodução em relação
  // ao grupo a cada 500ms — verificação contínua, não só reação a eventos.
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !isReadyRef.current) return;

      if (!isScrubbing) setDisplayPosition(player.getCurrentTime());

      if (isSyncingRef.current || player.getPlayerState() !== PLAYING) return;
      const drift = Math.abs(player.getCurrentTime() - expectedPosition(stateRef.current));
      if (drift > DRIFT_THRESHOLD_SEC) {
        isSyncingRef.current = true;
        player.seekTo(expectedPosition(stateRef.current), true);
        setTimeout(() => { isSyncingRef.current = false; }, 600);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isScrubbing]);

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState() === PLAYING) player.pauseVideo();
    else player.playVideo();
  };

  const seekCommit = (value: number) => {
    playerRef.current?.seekTo(value, true);
    setDisplayPosition(value);
    setIsScrubbing(false);
    onSeekRef.current(value);
  };

  const changeVolume = (value: number) => {
    setVolumeState(value);
    useSettingsStore.getState().setWatchTogetherVolume(value);
    playerRef.current?.setVolume(value);
    if (value === 0) { playerRef.current?.mute(); setIsMuted(true); }
    else if (isMuted) { playerRef.current?.unMute(); setIsMuted(false); }
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (isMuted) { player.unMute(); setIsMuted(false); }
    else { player.mute(); setIsMuted(true); }
  };

  return {
    containerRef,
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
