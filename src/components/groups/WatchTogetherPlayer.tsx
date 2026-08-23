import { useEffect, useRef, useState } from 'react';
import { loadYouTubeIframeAPI } from '../../services/youtube';
import type { YT } from '../../services/youtube';
import type { WatchTogetherState } from '../../types';

interface Props {
  state: WatchTogetherState;
  onPlay: (positionSec: number) => void;
  onPause: (positionSec: number) => void;
  onSeek: (positionSec: number) => void;
  /** Vídeo chegou ao fim sozinho — quem chama decide se avança a fila. */
  onEnded: (endedVideoId: string) => void;
  /** Pular manualmente pro próximo da fila (botão, não fim natural do vídeo). */
  onSkip: () => void;
  isTheater: boolean;
  onToggleTheater: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const DRIFT_THRESHOLD_SEC = 1.5;
const UNSTARTED = -1;
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

function expectedPosition(state: WatchTogetherState): number {
  if (!state.isPlaying) return state.positionSec;
  return state.positionSec + (Date.now() - state.updatedAtMs) / 1000;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Player do YouTube sincronizado entre todos os participantes da call — o
 * estado (vídeo, play/pause, posição) é sempre o que veio do servidor via
 * `state`; este componente só reconcilia o player local pra bater com ele,
 * nunca decide por conta própria. Controles nativos do YouTube ficam
 * desligados (`controls: 0`) em favor de uma barra própria, temática com o
 * resto do app.
 */
export function WatchTogetherPlayer({
  state, onPlay, onPause, onSeek, onEnded, onSkip, isTheater, onToggleTheater, isFullscreen, onToggleFullscreen,
}: Props) {
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
  const onSkipRef = useRef(onSkip); onSkipRef.current = onSkip;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlayingUI, setIsPlayingUI] = useState(false);
  const [duration, setDuration] = useState(0);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [volume, setVolumeState] = useState(80);
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
      console.error('[WatchTogether] falha ao carregar o player do YouTube:', err);
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
  //
  // Com os controles nativos desligados, arrastar a NOSSA barra de progresso
  // é o único jeito de buscar (já emitido explicitamente em
  // handleSeekCommit); qualquer diferença detectada aqui não é uma ação do
  // usuário, é deriva natural (buffering, variação de clock entre máquinas).
  // Por isso essa checagem se AUTOCORRIGE (seekTo local) em vez de propagar
  // — a versão antiga tratava a própria deriva como um "seek" e mandava o
  // resto da call pular pra ONDE EU tinha driftado, em vez do contrário.
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

  const handleTogglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState() === PLAYING) player.pauseVideo();
    else player.playVideo();
  };

  const handleSeekCommit = (value: number) => {
    playerRef.current?.seekTo(value, true);
    setDisplayPosition(value);
    setIsScrubbing(false);
    onSeekRef.current(value);
  };

  const handleVolumeChange = (value: number) => {
    setVolumeState(value);
    playerRef.current?.setVolume(value);
    if (value === 0) { playerRef.current?.mute(); setIsMuted(true); }
    else if (isMuted) { playerRef.current?.unMute(); setIsMuted(false); }
  };

  const handleToggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (isMuted) { player.unMute(); setIsMuted(false); }
    else { player.mute(); setIsMuted(true); }
  };

  const progressPct = duration > 0 ? Math.min(100, (displayPosition / duration) * 100) : 0;
  const volumePct = isMuted ? 0 : volume;

  return (
    <div className="relative w-full h-full bg-black group/player">
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center text-center px-6">
          <p className="text-sm text-red-400">Não foi possível carregar o player do YouTube.<br />{loadError}</p>
        </div>
      ) : isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center text-surface-400 text-sm">
          Carregando player...
        </div>
      ) : null}

      <div ref={containerRef} className="w-full h-full" />

      {!isLoading && !loadError && (
        <div className="absolute bottom-0 inset-x-0 z-10 px-4 pb-3 pt-8 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover/player:opacity-100 focus-within:opacity-100 transition-opacity">
          {/* Barra de progresso */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.5}
            value={displayPosition}
            onMouseDown={() => setIsScrubbing(true)}
            onChange={(e) => setDisplayPosition(Number(e.target.value))}
            onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
            className="w-full mb-2 cursor-pointer"
            style={{
              background: `linear-gradient(to right, rgb(var(--color-accent-500)) ${progressPct}%, rgba(255,255,255,0.15) ${progressPct}%)`,
            }}
          />

          <div className="flex items-center gap-3">
            <button onClick={handleTogglePlay} className="text-white hover:text-accent-300 transition-colors flex-shrink-0">
              {isPlayingUI ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3" /></svg>
              )}
            </button>

            <button onClick={() => onSkipRef.current()} title="Pular vídeo" className="text-white hover:text-accent-300 transition-colors flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4" /><rect x="17" y="4" width="3" height="16" /></svg>
            </button>

            <span className="text-xs text-surface-200 font-mono tabular-nums flex-shrink-0">
              {formatTime(displayPosition)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* Volume */}
            <div className="flex items-center gap-1.5 group/volume flex-shrink-0">
              <button onClick={handleToggleMute} className="text-white hover:text-accent-300 transition-colors">
                {isMuted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                    <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    {volume > 60 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                  </svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={volumePct}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-0 group-hover/volume:w-16 focus:w-16 transition-[width] duration-150 cursor-pointer"
                style={{
                  background: `linear-gradient(to right, rgb(var(--color-accent-500)) ${volumePct}%, rgba(255,255,255,0.15) ${volumePct}%)`,
                }}
              />
            </div>

            {/* Modo teatro */}
            <button onClick={onToggleTheater} title={isTheater ? 'Sair do modo teatro' : 'Modo teatro'} className="text-white hover:text-accent-300 transition-colors flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="18" rx="2" />
                <line x1="7" y1="3" x2="7" y2="21" /><line x1="17" y1="3" x2="17" y2="21" />
                <line x1="2" y1="8" x2="7" y2="8" /><line x1="2" y1="16" x2="7" y2="16" />
                <line x1="17" y1="8" x2="22" y2="8" /><line x1="17" y1="16" x2="22" y2="16" />
              </svg>
            </button>

            {/* Tela cheia */}
            <button onClick={onToggleFullscreen} title={isFullscreen ? 'Sair da tela cheia (Esc)' : 'Tela cheia'} className="text-white hover:text-accent-300 transition-colors flex-shrink-0">
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
