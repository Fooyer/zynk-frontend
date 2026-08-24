import { useYouTubeSync } from '../../hooks/useYouTubeSync';
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
 * nunca decide por conta própria (motor de sync em useYouTubeSync.ts,
 * compartilhado com o mini player flutuante). Controles nativos do YouTube
 * ficam desligados (`controls: 0`) em favor de uma barra própria, temática
 * com o resto do app.
 */
export function WatchTogetherPlayer({
  state, onPlay, onPause, onSeek, onEnded, onSkip, isTheater, onToggleTheater, isFullscreen, onToggleFullscreen,
}: Props) {
  const {
    containerRef, isLoading, loadError, isPlayingUI, duration, displayPosition,
    setIsScrubbing, setDisplayPosition, volume, isMuted,
    togglePlay, seekCommit, changeVolume, toggleMute,
  } = useYouTubeSync(state, { onPlay, onPause, onSeek, onEnded });

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
            onMouseUp={(e) => seekCommit(Number((e.target as HTMLInputElement).value))}
            className="w-full mb-2 cursor-pointer"
            style={{
              background: `linear-gradient(to right, rgb(var(--color-accent-500)) ${progressPct}%, rgba(255,255,255,0.15) ${progressPct}%)`,
            }}
          />

          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="text-white hover:text-accent-300 transition-colors flex-shrink-0">
              {isPlayingUI ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3" /></svg>
              )}
            </button>

            <button onClick={onSkip} title="Pular vídeo" className="text-white hover:text-accent-300 transition-colors flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4" /><rect x="17" y="4" width="3" height="16" /></svg>
            </button>

            <span className="text-xs text-surface-200 font-mono tabular-nums flex-shrink-0">
              {formatTime(displayPosition)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* Volume */}
            <div className="flex items-center gap-1.5 group/volume flex-shrink-0">
              <button onClick={toggleMute} className="text-white hover:text-accent-300 transition-colors">
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
                onChange={(e) => changeVolume(Number(e.target.value))}
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
