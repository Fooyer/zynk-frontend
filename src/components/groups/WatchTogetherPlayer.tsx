import { useYouTubeSync } from '../../hooks/useYouTubeSync';
import { useDirectVideoSync } from '../../hooks/useDirectVideoSync';
import { WatchPlayerControls } from './WatchPlayerControls';
import type { VideoSource, WatchTogetherState } from '../../types';

interface Props {
  state: WatchTogetherState;
  onPlay: (positionSec: number) => void;
  onPause: (positionSec: number) => void;
  onSeek: (positionSec: number) => void;
  /** Vídeo chegou ao fim sozinho — quem chama decide se avança a fila. */
  onEnded: (endedSource: VideoSource) => void;
  /** Pular manualmente pro próximo da fila (botão, não fim natural do vídeo). */
  onSkip: () => void;
  isTheater: boolean;
  onToggleTheater: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

interface EngineProps extends Omit<Props, 'state'> {
  state: WatchTogetherState;
}

/**
 * Motor YouTube — player embutido via IFrame API, montado num <div>.
 */
function YouTubeEngine({ state, onPlay, onPause, onSeek, onEnded, onSkip, isTheater, onToggleTheater, isFullscreen, onToggleFullscreen }: EngineProps) {
  const {
    containerRef, isLoading, loadError, isPlayingUI, duration, displayPosition,
    setIsScrubbing, setDisplayPosition, volume, isMuted,
    togglePlay, seekCommit, changeVolume, toggleMute,
  } = useYouTubeSync(state, { onPlay, onPause, onSeek, onEnded });

  return (
    <>
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center text-center px-6">
          <p className="text-sm text-red-400">Não foi possível carregar o vídeo.<br />{loadError}</p>
        </div>
      ) : isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center text-surface-400 text-sm">
          Carregando player...
        </div>
      ) : null}

      <div ref={containerRef} className="w-full h-full" />

      {!isLoading && !loadError && (
        <WatchPlayerControls
          isPlayingUI={isPlayingUI} duration={duration} displayPosition={displayPosition}
          setIsScrubbing={setIsScrubbing} setDisplayPosition={setDisplayPosition} seekCommit={seekCommit}
          togglePlay={togglePlay} onSkip={onSkip} volume={volume} isMuted={isMuted}
          changeVolume={changeVolume} toggleMute={toggleMute} isTheater={isTheater}
          onToggleTheater={onToggleTheater} isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen}
        />
      )}
    </>
  );
}

/**
 * Motor de link direto — vídeo progressivo (mp4/webm/ogg) ou HLS via hls.js,
 * montado num <video> nativo.
 */
function DirectVideoEngine({ state, onPlay, onPause, onSeek, onEnded, onSkip, isTheater, onToggleTheater, isFullscreen, onToggleFullscreen }: EngineProps) {
  const {
    videoRef, isLoading, loadError, isPlayingUI, duration, displayPosition,
    setIsScrubbing, setDisplayPosition, volume, isMuted,
    togglePlay, seekCommit, changeVolume, toggleMute,
  } = useDirectVideoSync(state, { onPlay, onPause, onSeek, onEnded });

  return (
    <>
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center text-center px-6">
          <p className="text-sm text-red-400">Não foi possível carregar o vídeo.<br />{loadError}</p>
        </div>
      ) : isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center text-surface-400 text-sm">
          Carregando vídeo...
        </div>
      ) : null}

      <video ref={videoRef} className="w-full h-full" playsInline />

      {!isLoading && !loadError && (
        <WatchPlayerControls
          isPlayingUI={isPlayingUI} duration={duration} displayPosition={displayPosition}
          setIsScrubbing={setIsScrubbing} setDisplayPosition={setDisplayPosition} seekCommit={seekCommit}
          togglePlay={togglePlay} onSkip={onSkip} volume={volume} isMuted={isMuted}
          changeVolume={changeVolume} toggleMute={toggleMute} isTheater={isTheater}
          onToggleTheater={onToggleTheater} isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen}
        />
      )}
    </>
  );
}

/**
 * Player do "assistir junto" sincronizado entre todos os participantes da
 * call — o estado (fonte, play/pause, posição) é sempre o que veio do
 * servidor via `state`; este componente só escolhe o motor certo pra fonte
 * (YouTube ou link direto) e reconcilia o player local pra bater com ele,
 * nunca decide por conta própria. Motores em useYouTubeSync.ts/
 * useDirectVideoSync.ts, compartilhados com o mini player flutuante.
 * Cada motor é montado como um componente próprio (não um branch dentro do
 * mesmo componente) pra chamar seu hook incondicionalmente — se a fonte
 * trocar de tipo no meio da sessão, React desmonta um e monta o outro em vez
 * de violar as regras de hooks.
 */
export function WatchTogetherPlayer(props: Props) {
  return (
    <div className="relative w-full h-full bg-black group/player">
      {props.state.source.type === 'youtube' ? <YouTubeEngine {...props} /> : <DirectVideoEngine {...props} />}
    </div>
  );
}
