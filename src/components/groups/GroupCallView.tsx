import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useWatchTogetherUiStore, type MediaFocus } from '../../stores/watchTogetherUiStore';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { ScreenPicker } from '../call/ScreenPicker';
import { WatchTogetherPlayer } from './WatchTogetherPlayer';
import { WatchTogetherModal } from './WatchTogetherModal';
import { WatchQueuePanel } from './WatchQueuePanel';
import type { useVoiceRoom } from '../../hooks/useVoiceRoom';
import type { ScreenSource, VoiceParticipant } from '../../types';

interface Props {
  voice: ReturnType<typeof useVoiceRoom>;
}

function ParticipantTile({ participant, isSelf, isMuted, isSpeaking }: {
  participant: VoiceParticipant;
  isSelf: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 w-28">
      <div className="relative">
        <div
          className={`w-20 h-20 rounded-full ring-2 flex items-center justify-center text-white text-2xl font-bold overflow-hidden transition-all duration-150 ${
            isSpeaking
              ? 'ring-accent-500 shadow-glow-accent'
              : participant.isSharingAudio
              ? 'ring-success'
              : 'ring-white/[0.10]'
          }`}
          style={{ backgroundColor: getUserColor(participant.username) }}
        >
          {participant.avatarUrl ? (
            <img src={participant.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            getInitials(participant.username)
          )}
        </div>
        {isMuted && (
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-danger flex items-center justify-center border-2 border-surface-950">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            </svg>
          </div>
        )}
        {participant.isSharingAudio && (
          <div
            className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-success flex items-center justify-center border-2 border-surface-950"
            title="Compartilhando áudio"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-surface-200 truncate max-w-full">
        {isSelf ? 'Você' : participant.username}
      </span>
    </div>
  );
}

function ParticipantChip({ participant, isFocused, isSpeaking, onClick }: {
  participant: VoiceParticipant;
  isFocused: boolean;
  isSpeaking: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 flex-shrink-0 w-16 cursor-pointer">
      {/* Wrapper "relative" próprio, SEM overflow-hidden — o distintivo de
          compartilhamento abaixo é posicionado com offset negativo (sai um
          pouco do círculo), e antes ele vivia dentro do mesmo elemento que
          recorta o avatar (overflow-hidden), cortando um pedaço do ícone. */}
      <div className="relative">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xs font-semibold overflow-hidden transition-all duration-150 ${
            isFocused || isSpeaking ? 'ring-2 ring-accent-500' : 'ring-1 ring-white/[0.10]'
          } ${isSpeaking ? 'shadow-glow-accent-sm' : ''}`}
          style={{ backgroundColor: getUserColor(participant.username) }}
        >
          {participant.avatarUrl ? (
            <img src={participant.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            getInitials(participant.username)
          )}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-success flex items-center justify-center border border-surface-950">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <polyline points="8 21 12 17 16 21" />
          </svg>
        </span>
      </div>
      <span className="text-[10px] text-surface-400 truncate max-w-full">{participant.username}</span>
    </button>
  );
}

/**
 * Seletor "Tela / YouTube" — só aparece quando as duas fontes estão ativas
 * ao mesmo tempo (alguém compartilhando tela E um "assistir junto" rolando),
 * já que só dá pra ver uma delas grande por vez. Fica dentro da mesma barra
 * superior (hover) que já existe nas duas visões, pra não introduzir mais um
 * elemento sempre visível ocupando espaço.
 */
function MediaSwitcher({ focus, onSelect }: { focus: MediaFocus; onSelect: (f: MediaFocus) => void }) {
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/40 backdrop-blur-sm">
      <button
        onClick={() => onSelect('screen')}
        title="Tela compartilhada"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          focus === 'screen' ? 'bg-accent-600 text-white' : 'text-surface-200 hover:bg-white/10'
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" /><polyline points="8 21 12 17 16 21" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        Tela
      </button>
      <button
        onClick={() => onSelect('watch')}
        title="Assistir junto — YouTube"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          focus === 'watch' ? 'bg-accent-600 text-white' : 'text-surface-200 hover:bg-white/10'
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="3" /><polygon points="10 9 15 12 10 15" fill="currentColor" stroke="none" />
        </svg>
        YouTube
      </button>
    </div>
  );
}

function ControlButton({ onClick, title, danger, active, children }: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-3.5 rounded-full transition-colors flex items-center justify-center ${
        danger
          ? 'bg-danger text-white hover:bg-red-700'
          : active
          ? 'bg-success text-white hover:bg-success-600'
          : 'bg-white/[0.06] text-surface-200 hover:bg-white/[0.12]'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Visão de chamada — abre no lugar do chat (aba "Chamada"), como um app de
 * reunião: grade com a foto de todo mundo quando ninguém compartilha tela;
 * quando alguém compartilha, a tela vira o foco e os participantes viram
 * uma tira de miniaturas embaixo (clicável, se mais de uma tela ativa).
 */
export function GroupCallView({ voice }: Props) {
  const vc = voice.activeVc;
  const currentUser = useAuthStore((s) => s.user);
  const [focusedUserId, setFocusedUserId] = useState<number | null>(null);
  // Qual das duas fontes concorrentes (tela compartilhada vs "assistir
  // junto") ganha a área grande quando as duas estão ativas — só importa
  // nesse caso; com uma só, ela vira o foco sozinha (ver effectiveFocus).
  const [focus, setFocus] = useState<MediaFocus>('screen');
  const [showPicker, setShowPicker] = useState(false);
  const [watchModalMode, setWatchModalMode] = useState<'add' | 'swap' | null>(null);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const focusedVideoRef = useRef<HTMLVideoElement>(null);
  const focusedContainerRef = useRef<HTMLDivElement>(null);

  // Foca automaticamente a primeira tela compartilhada disponível; troca
  // sozinho se quem estava em foco parar de compartilhar.
  useEffect(() => {
    if (focusedUserId !== null && voice.screenStreams.has(focusedUserId)) return;
    const first = voice.screenStreams.keys().next();
    setFocusedUserId(first.done ? null : first.value);
  }, [voice.screenStreams, focusedUserId]);

  const focusedStream = focusedUserId !== null ? voice.screenStreams.get(focusedUserId) ?? null : null;
  // De propósito NÃO é `focusedStream !== null` — focusedUserId é estado
  // local que só se popula um render depois do mount (via o efeito acima),
  // então logo ao abrir a aba com uma tela já ativa, `focusedStream` ficava
  // null por um instante. Isso fazia hasScreen nascer falso e virar
  // verdadeiro um tick depois, e essa transição disparava o "fonte nova
  // apareceu" (efeito abaixo) sem ter aparecido nada de novo de verdade —
  // sequestrando o foco de volta pra tela bem na hora que você tinha acabado
  // de pedir pra ver o YouTube (ex.: clicando "expandir" no mini player).
  // `voice.screenStreams` já vem certo desde o primeiro render (vive no
  // hook `voice`, não reseta com este componente), sem esse atraso.
  const hasScreen = voice.screenStreams.size > 0;
  const hasWatch = !!voice.watchState;

  // Com as duas fontes ativas, quem decide qual aparece grande é o seletor
  // (MediaSwitcher); com só uma, ela ganha o foco sozinha, sem escolha manual.
  const effectiveFocus: MediaFocus | 'grid' =
    !hasScreen && !hasWatch ? 'grid' : hasScreen && hasWatch ? focus : hasScreen ? 'screen' : 'watch';

  // Uma fonte nova apareceu (0→1 telas ou watch começou agora) — pula pra
  // ela automaticamente. Já era o comportamento da call pra tela
  // compartilhada (uma nova apresentação sempre tomava a frente); agora
  // vale nos dois sentidos.
  const prevHasScreenRef = useRef(hasScreen);
  const prevHasWatchRef = useRef(hasWatch);
  useEffect(() => {
    if (hasScreen && !prevHasScreenRef.current) setFocus('screen');
    else if (hasWatch && !prevHasWatchRef.current) setFocus('watch');
    prevHasScreenRef.current = hasScreen;
    prevHasWatchRef.current = hasWatch;
  }, [hasScreen, hasWatch]);

  // "Expandir" no mini player flutuante (App.tsx) pede um foco específico ao
  // (re)abrir esta aba — consumido uma vez (mesmo padrão do pendingChannelId
  // de groupStore). Reage a MUDANÇAS de valor, não só ao montar: o pedido
  // pode chegar com o componente já montado (ex.: você está vendo uma tela
  // compartilhada e clica "expandir" no mini player do YouTube).
  const pendingCallFocus = useWatchTogetherUiStore((s) => s.pendingCallFocus);
  useEffect(() => {
    if (pendingCallFocus) {
      useWatchTogetherUiStore.getState().consumeCallFocus();
      setFocus(pendingCallFocus);
    }
  }, [pendingCallFocus]);

  // Anuncia globalmente quando O PLAYER GRANDE está mostrando o YouTube — é
  // o que faz o mini player flutuante (App.tsx) se esconder. Essencial pra
  // nunca ter dois embeds do YouTube tocando o mesmo vídeo ao mesmo tempo
  // (áudio duplicado, os dois brigando pela mesma sincronização).
  useEffect(() => {
    useWatchTogetherUiStore.getState().setMainPlayerVisible(effectiveFocus === 'watch');
    return () => useWatchTogetherUiStore.getState().setMainPlayerVisible(false);
  }, [effectiveFocus]);

  useEffect(() => {
    if (focusedStream && focusedVideoRef.current) {
      focusedVideoRef.current.srcObject = focusedStream;
      focusedVideoRef.current.play().catch(() => {});
    }
  }, [focusedStream]);

  // Tela cheia de verdade (Fullscreen API), não só um overlay dentro do
  // app — cobre o monitor inteiro. Sincroniza com Esc/F11 nativos também.
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === focusedContainerRef.current);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Sai da tela cheia sozinho se não sobrar nenhuma fonte em foco (mesma
  // área/ref serve pras duas — só uma está ativa por vez).
  useEffect(() => {
    if (effectiveFocus === 'grid' && document.fullscreenElement === focusedContainerRef.current) {
      document.exitFullscreen().catch(() => {});
    }
  }, [effectiveFocus]);

  // Sai do modo cinema/teatro junto se nem tela compartilhada nem "assistir
  // junto" estiverem mais ativos.
  useEffect(() => {
    if (effectiveFocus === 'grid') setCinemaMode(false);
  }, [effectiveFocus]);

  // Reflete o modo cinema local no layout global — recolhe nav/membros na
  // versão menor e esconde a sidebar de canais, restaurando o estado de
  // antes ao desligar. Mesmo efeito serve pra sincronizar o toggle E pra
  // desfazer no cleanup, se o usuário sair da aba "Chamada" com o modo
  // cinema ainda ligado (troca de aba desmonta este componente).
  useEffect(() => {
    if (cinemaMode) useLayoutStore.getState().enterCinemaMode();
    else useLayoutStore.getState().exitCinemaMode();
    return () => useLayoutStore.getState().exitCinemaMode();
  }, [cinemaMode]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      focusedContainerRef.current?.requestFullscreen().catch(() => {});
    }
  };

  if (!vc) return null;

  const handleScreenClick = () => {
    if (voice.isScreenSharing) voice.stopScreenShare();
    else setShowPicker(true);
  };

  const handleAudioShareClick = () => {
    if (voice.isSharingAudio) voice.stopAudioShare();
    else voice.startAudioShare();
  };

  const handlePickerSelect = (source: ScreenSource) => {
    setShowPicker(false);
    voice.startScreenShare(source.id);
  };

  // Passa o videoId atual como referência — o servidor usa isso pra ignorar
  // um "pular" tardio/duplicado se o vídeo já tiver avançado por outro meio.
  const handleSkip = () => {
    if (voice.watchState) voice.playNextInQueue(voice.watchState.videoId);
  };

  const nameFor = (uid: number) => vc.participants.find((p) => p.userId === uid)?.username ?? 'Alguém';

  const gridCols = vc.participants.length <= 1 ? 1 : vc.participants.length <= 4 ? 2 : vc.participants.length <= 6 ? 3 : 4;

  // Seletor "Tela / YouTube" (MediaSwitcher) só faz sentido quando as duas
  // fontes competem pelo mesmo espaço — com uma só, não há o que escolher.
  const showSwitcher = hasScreen && hasWatch;

  // Tira de miniaturas abaixo do vídeo em foco — só quem está compartilhando
  // a tela (não o roster inteiro): serve pra escolher ENTRE apresentações
  // simultâneas, não é mais uma lista geral de participantes.
  const sharers = vc.participants.filter((p) => voice.screenStreams.has(p.userId));

  const focusScreen = (uid: number) => { setFocusedUserId(uid); setFocus('screen'); };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-950">
      <div className={`flex-1 overflow-hidden flex items-center justify-center min-h-0 ${cinemaMode ? 'p-0' : 'p-6'}`}>
        {effectiveFocus === 'screen' ? (
          <div className="w-full h-full flex flex-col gap-4">
            <div
              ref={focusedContainerRef}
              className={`flex-1 min-h-0 overflow-hidden bg-black relative group/screen ${isFullscreen || cinemaMode ? '' : 'rounded-2xl'}`}
            >
              <video
                ref={focusedVideoRef}
                autoPlay
                muted
                className="w-full h-full object-contain cursor-pointer"
                onDoubleClick={toggleFullscreen}
              />

              {/* Barra superior — nome + modo cinema + tela cheia + sair da
                  call (mesma estrutura da call privada, pra ficar consistente) */}
              <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover/screen:opacity-100 transition-opacity">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="text-sm font-medium text-white">
                    {Number(focusedUserId) === Number(currentUser?.id) ? 'Você' : nameFor(focusedUserId!)} — Tela compartilhada
                  </span>
                </div>
                {showSwitcher && (
                  <div className="absolute left-1/2 -translate-x-1/2">
                    <MediaSwitcher focus={focus} onSelect={setFocus} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCinemaMode((v) => !v)}
                    title={cinemaMode ? 'Sair do modo cinema' : 'Modo cinema'}
                    className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${cinemaMode ? 'bg-accent-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="18" rx="2" />
                      <line x1="7" y1="3" x2="7" y2="21" /><line x1="17" y1="3" x2="17" y2="21" />
                      <line x1="2" y1="8" x2="7" y2="8" /><line x1="2" y1="16" x2="7" y2="16" />
                      <line x1="17" y1="8" x2="22" y2="8" /><line x1="17" y1="16" x2="22" y2="16" />
                    </svg>
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
                  >
                    {isFullscreen ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                        <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={voice.leave}
                    title="Sair da call"
                    className="p-2 rounded-lg bg-danger text-white hover:bg-red-700 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Barra inferior — mute + compartilhar + sair da call. Fica
                  dentro do elemento que vai pra tela cheia nativa, senão os
                  controles somem quando o usuário entra em tela cheia de verdade. */}
              <div className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-center gap-3 px-4 py-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/screen:opacity-100 transition-opacity">
                <button
                  onClick={voice.toggleMute}
                  title={voice.isMuted ? 'Ativar microfone' : 'Silenciar'}
                  className={`p-3 rounded-full transition-colors ${voice.isMuted ? 'bg-danger text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {voice.isMuted ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleScreenClick}
                  disabled={voice.isSharingAudio}
                  title={voice.isSharingAudio ? 'Pare o compartilhamento de áudio primeiro' : voice.isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
                  className={`p-3 rounded-full transition-colors ${voice.isSharingAudio ? 'opacity-30 cursor-not-allowed bg-white/10 text-white' : voice.isScreenSharing ? 'bg-success text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" /><polyline points="8 21 12 17 16 21" /><line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </button>
                <button
                  onClick={handleAudioShareClick}
                  disabled={voice.isScreenSharing}
                  title={voice.isScreenSharing ? 'Pare o compartilhamento de tela primeiro' : voice.isSharingAudio ? 'Parar compartilhamento de áudio' : 'Compartilhar apenas o áudio'}
                  className={`p-3 rounded-full transition-colors ${voice.isScreenSharing ? 'opacity-30 cursor-not-allowed bg-white/10 text-white' : voice.isSharingAudio ? 'bg-success text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                  </svg>
                </button>
                <button
                  onClick={voice.leave}
                  title="Sair da call"
                  className="p-3 rounded-full bg-danger text-white hover:bg-red-700 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                  </svg>
                </button>
              </div>
            </div>

            {sharers.length > 1 && !cinemaMode && (
              <div className="flex-shrink-0 flex items-center gap-3 overflow-x-auto pb-1">
                {sharers.map((p) => (
                  <ParticipantChip
                    key={p.userId}
                    participant={p}
                    isFocused={effectiveFocus === 'screen' && p.userId === focusedUserId}
                    isSpeaking={voice.speakingUserIds.has(p.userId)}
                    onClick={() => focusScreen(p.userId)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : effectiveFocus === 'watch' && voice.watchState ? (
          <div className="w-full h-full flex flex-col gap-4">
            <div
              ref={focusedContainerRef}
              className={`flex-1 min-h-0 overflow-hidden bg-black relative group/watch ${isFullscreen || cinemaMode ? '' : 'rounded-2xl'}`}
            >
              <WatchTogetherPlayer
                state={voice.watchState}
                onPlay={voice.playVideo}
                onPause={voice.pauseVideo}
                onSeek={voice.seekVideo}
                onEnded={(endedVideoId) => voice.playNextInQueue(endedVideoId)}
                onSkip={handleSkip}
                isTheater={cinemaMode}
                onToggleTheater={() => setCinemaMode((v) => !v)}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />

              <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover/watch:opacity-100 transition-opacity">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                  <span className="text-sm font-medium text-white">Assistindo junto — YouTube</span>
                </div>
                {showSwitcher && (
                  <div className="absolute left-1/2 -translate-x-1/2">
                    <MediaSwitcher focus={focus} onSelect={setFocus} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowQueuePanel((v) => !v)}
                    title="Fila de vídeos"
                    className={`relative p-2 rounded-lg backdrop-blur-sm transition-colors ${showQueuePanel ? 'bg-accent-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    {voice.watchState.queue.length > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {voice.watchState.queue.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setWatchModalMode('swap')}
                    title="Trocar vídeo"
                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  </button>
                  <button
                    onClick={voice.stopWatch}
                    title="Parar de assistir junto"
                    className="p-2 rounded-lg bg-danger text-white hover:bg-red-700 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              {showQueuePanel && (
                <WatchQueuePanel
                  queue={voice.watchState.queue}
                  onRemove={voice.removeFromQueue}
                  onAdd={() => setWatchModalMode('add')}
                  onSkip={handleSkip}
                  onClose={() => setShowQueuePanel(false)}
                />
              )}
            </div>

            {sharers.length > 0 && !cinemaMode && (
              <div className="flex-shrink-0 flex items-center gap-3 overflow-x-auto pb-1">
                {sharers.map((p) => (
                  <ParticipantChip
                    key={p.userId}
                    participant={p}
                    isFocused={false}
                    isSpeaking={voice.speakingUserIds.has(p.userId)}
                    onClick={() => focusScreen(p.userId)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className="grid gap-x-8 gap-y-6 justify-center content-center"
            style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, max-content))` }}
          >
            {vc.participants.map((p) => {
              const isSelf = Number(p.userId) === Number(currentUser?.id);
              return (
                <ParticipantTile
                  key={p.userId}
                  participant={p}
                  isSelf={isSelf}
                  // Espelha o meu próprio estado otimista (não espera o
                  // round-trip do roster), mas confia no roster pra todo
                  // mundo — é o roster que carrega isMuted de verdade pra
                  // quem não sou eu (antes só aparecia o ícone pra mim mesmo).
                  isMuted={isSelf ? voice.isMuted : !!p.isMuted}
                  isSpeaking={voice.speakingUserIds.has(p.userId)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Controles — escondidos quando a tela compartilhada está em foco
          (com ou sem modo cinema), já que a barra inferior dentro do
          próprio vídeo já assume mute/compartilhar/sair nesse caso. Segue
          visível no foco "watch" (o player do YouTube não tem esses
          controles embutidos) e na grade normal. */}
      {effectiveFocus !== 'screen' && (
      <div className="flex-shrink-0 border-t border-white/[0.06] py-4 flex items-center justify-center gap-3">
        <ControlButton onClick={voice.toggleMute} title={voice.isMuted ? 'Ativar microfone' : 'Silenciar'} active={voice.isMuted ? false : undefined}>
          {voice.isMuted ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-danger">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </ControlButton>

        <ControlButton onClick={handleScreenClick} title={voice.isSharingAudio ? 'Pare o compartilhamento de áudio primeiro' : voice.isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'} active={voice.isScreenSharing}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <polyline points="8 21 12 17 16 21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </ControlButton>

        <ControlButton onClick={handleAudioShareClick} title={voice.isScreenSharing ? 'Pare o compartilhamento de tela primeiro' : voice.isSharingAudio ? 'Parar compartilhamento de áudio' : 'Compartilhar apenas o áudio'} active={voice.isSharingAudio}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </svg>
        </ControlButton>

        <ControlButton
          onClick={() => setWatchModalMode('add')}
          title={voice.watchState ? 'Adicionar à fila' : 'Assistir YouTube junto'}
          active={!!voice.watchState}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="3" />
            <polygon points="10 9 15 12 10 15" fill="currentColor" stroke="none" />
          </svg>
        </ControlButton>

        <ControlButton onClick={voice.leave} title="Sair da call" danger>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
          </svg>
        </ControlButton>
      </div>
      )}

      {showPicker && <ScreenPicker onSelect={handlePickerSelect} onCancel={() => setShowPicker(false)} />}
      {watchModalMode && (
        <WatchTogetherModal
          mode={watchModalMode}
          onClose={() => setWatchModalMode(null)}
          onSubmit={(videoId) => (watchModalMode === 'swap' ? voice.loadVideo(videoId) : voice.addToQueue(videoId))}
        />
      )}
    </div>
  );
}
