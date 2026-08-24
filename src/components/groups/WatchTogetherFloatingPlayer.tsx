import { useEffect, useRef, useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useUiStore } from '../../stores/uiStore';
import { useWatchTogetherUiStore } from '../../stores/watchTogetherUiStore';
import { useYouTubeSync } from '../../hooks/useYouTubeSync';
import type { useVoiceRoom } from '../../hooks/useVoiceRoom';
import type { WatchTogetherState } from '../../types';

interface Props {
  voice: ReturnType<typeof useVoiceRoom>;
}

const MARGIN = 16;
// Tamanho de nascença do widget — também o PISO do redimensionamento (o
// usuário pediu explicitamente pra nunca poder encolher além do padrão).
const DEFAULT_WIDTH = 288;
const MIN_WIDTH = DEFAULT_WIDTH;
const MAX_WIDTH = 640;
const HEADER_H = 32;

function FloatingPlayerWidget({
  state, voice, onDismiss,
}: {
  state: WatchTogetherState;
  voice: ReturnType<typeof useVoiceRoom>;
  onDismiss: () => void;
}) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  // null = ainda não foi arrastado — fica ancorado no canto via classe CSS
  // (responsivo sozinho); só vira coordenada absoluta depois do 1º arrasto.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  const {
    containerRef, isLoading, loadError, isPlayingUI, volume, isMuted,
    togglePlay, changeVolume, toggleMute,
  } = useYouTubeSync(state, {
    onPlay: voice.playVideo,
    onPause: voice.pauseVideo,
    onSeek: voice.seekVideo,
    onEnded: (endedVideoId) => voice.playNextInQueue(endedVideoId),
  });

  const clamp = (x: number, y: number) => {
    const el = widgetRef.current;
    const w = el?.offsetWidth ?? width;
    const h = el?.offsetHeight ?? HEADER_H + (width * 9) / 16;
    const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN);
    const maxY = Math.max(MARGIN, window.innerHeight - h - MARGIN);
    return { x: Math.min(Math.max(x, MARGIN), maxX), y: Math.min(Math.max(y, MARGIN), maxY) };
  };

  // Corrige a posição se a janela for redimensionada depois de arrastado —
  // sem isso, encolher a janela podia deixar o widget preso fora da tela.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mesma correção quando o próprio widget cresce/encolhe (redimensionado
  // pelo usuário) — sem isso, aumentar o tamanho perto de uma borda podia
  // empurrar parte do widget pra fora da tela.
  useEffect(() => {
    setPos((p) => (p ? clamp(p.x, p.y) : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const startDrag = (e: React.PointerEvent) => {
    const rect = widgetRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, origX, origY } = dragRef.current;
    setPos(clamp(origX + (e.clientX - startX), origY + (e.clientY - startY)));
  };
  const endDrag = () => { dragRef.current = null; };
  // Botões do cabeçalho não devem iniciar arrasto — sem isso, clicar neles
  // também movia o widget (o pointerdown borbulha pro handler do cabeçalho).
  const stopDragStart = (e: React.PointerEvent) => e.stopPropagation();

  // Redimensionar — só a largura (a altura do vídeo acompanha sozinha via
  // `aspect-video`), evitando esticar/distorcer o vídeo. Alça no canto
  // inferior direito, mesma convenção visual de qualquer janela do SO.
  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startWidth: width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const { startX, startWidth } = resizeRef.current;
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (e.clientX - startX))));
  };
  const endResize = () => { resizeRef.current = null; };

  const handleExpand = () => {
    const vc = voice.activeVc;
    if (!vc) return;
    useGroupStore.getState().setActiveGroup(vc.groupId);
    useUiStore.getState().setView('group');
    useWatchTogetherUiStore.getState().requestCallFocus('watch');
    useWatchTogetherUiStore.getState().requestCallTab();
  };

  const handleSkip = () => voice.playNextInQueue(state.videoId);

  return (
    <div
      ref={widgetRef}
      className={`fixed z-[85] rounded-xl overflow-hidden bg-black shadow-elevated border border-white/[0.10] select-none ${pos ? '' : 'bottom-4 right-4'}`}
      style={{ width, ...(pos ? { left: pos.x, top: pos.y } : null) }}
    >
      {/* Cabeçalho — arrastável (Pointer Events cobre mouse e toque juntos) */}
      <div
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex items-center gap-1.5 px-2.5 h-8 bg-surface-900 cursor-grab active:cursor-grabbing touch-none"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse flex-shrink-0" />
        <span className="flex-1 min-w-0 text-[11px] font-medium text-surface-200 truncate">Assistindo junto</span>
        <button
          onPointerDown={stopDragStart}
          onClick={handleExpand}
          title="Expandir na call"
          className="p-1 text-surface-400 hover:text-surface-100 transition-colors flex-shrink-0"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
        <button
          onPointerDown={stopDragStart}
          onClick={onDismiss}
          title="Minimizar"
          className="p-1 text-surface-400 hover:text-surface-100 transition-colors flex-shrink-0"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Vídeo */}
      <div className="relative w-full aspect-video bg-black group/mini">
        {loadError ? (
          <div className="absolute inset-0 flex items-center justify-center text-center px-3">
            <p className="text-[11px] text-red-400">Não foi possível carregar o player.</p>
          </div>
        ) : isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-surface-400 text-[11px]">
            Carregando...
          </div>
        ) : null}

        <div ref={containerRef} className="w-full h-full" />

        {!isLoading && !loadError && (
          <div className="absolute bottom-0 inset-x-0 flex items-center gap-2.5 px-2.5 py-1.5 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover/mini:opacity-100 transition-opacity">
            <button onClick={togglePlay} className="text-white hover:text-accent-300 transition-colors flex-shrink-0">
              {isPlayingUI ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3" /></svg>
              )}
            </button>
            <div className="flex items-center gap-1.5 group/volume flex-shrink-0">
              <button onClick={toggleMute} className="text-white hover:text-accent-300 transition-colors flex-shrink-0">
                {isMuted || volume === 0 ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                    <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                title="Volume"
                className="w-0 group-hover/volume:w-14 focus:w-14 transition-[width] duration-150 cursor-pointer"
                style={{
                  background: `linear-gradient(to right, rgb(var(--color-accent-500)) ${isMuted ? 0 : volume}%, rgba(255,255,255,0.15) ${isMuted ? 0 : volume}%)`,
                }}
              />
            </div>
            <div className="flex-1" />
            <button onClick={handleSkip} title="Pular vídeo" className="text-white hover:text-accent-300 transition-colors flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4" /><rect x="17" y="4" width="3" height="16" /></svg>
            </button>
          </div>
        )}

        {/* Alça de redimensionar — só cresce, nunca encolhe além do padrão
            (MIN_WIDTH = tamanho de nascença, pedido explícito). */}
        <div
          onPointerDown={startResize}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          title="Redimensionar"
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize touch-none flex items-end justify-end p-0.5 opacity-40 hover:opacity-90 transition-opacity"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="21" y1="9" x2="9" y2="21" /><line x1="21" y1="16" x2="16" y2="21" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/**
 * Mini player persistente do "assistir junto" — flutua sobre qualquer tela
 * do app (outro grupo, DMs, configurações, ou até a própria call olhando
 * uma tela compartilhada) enquanto há um vídeo tocando e o player grande
 * (dentro da aba Chamada) não está sendo exibido. Nunca os dois ao mesmo
 * tempo — ver watchTogetherUiStore.isMainPlayerVisible — senão dois embeds
 * do YouTube tocariam o mesmo vídeo ao mesmo tempo (áudio duplicado).
 */
export function WatchTogetherFloatingPlayer({ voice }: Props) {
  const isMainPlayerVisible = useWatchTogetherUiStore((s) => s.isMainPlayerVisible);
  const watchState = voice.watchState;
  const [dismissed, setDismissed] = useState(false);
  const lastVideoIdRef = useRef<string | null>(null);

  // "Minimizar" é só uma preferência local pra ESTE vídeo — se o vídeo
  // trocar (ou "assistir junto" for encerrado e começar de novo depois), o
  // mini player volta a aparecer sozinho em vez de ficar escondido pra
  // sempre sem o usuário saber que tem algo tocando.
  useEffect(() => {
    const nextId = watchState?.videoId ?? null;
    if (nextId !== lastVideoIdRef.current) {
      lastVideoIdRef.current = nextId;
      setDismissed(false);
    }
  }, [watchState?.videoId]);

  if (!watchState || !voice.activeVc || isMainPlayerVisible) return null;

  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        title="Mostrar o player do YouTube"
        className="fixed bottom-4 right-4 z-[85] flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-surface-900/95 border border-white/[0.10] shadow-elevated text-surface-100 text-xs font-medium hover:bg-surface-800 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-danger animate-pulse flex-shrink-0" />
        Assistindo junto
      </button>
    );
  }

  return <FloatingPlayerWidget state={watchState} voice={voice} onDismiss={() => setDismissed(true)} />;
}
