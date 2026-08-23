import { useEffect, useMemo, useState } from 'react';
import { useEventStore } from '../../stores/eventStore';
import { useGroupStore } from '../../stores/groupStore';
import { useUiStore } from '../../stores/uiStore';
import { groupsAPI } from '../../services/api';
import type { useVoiceRoom } from '../../hooks/useVoiceRoom';
import type { ServerEvent, VoiceChannel } from '../../types';

interface Props {
  voice: ReturnType<typeof useVoiceRoom>;
}

const WINDOW_MS = 10_000; // começa a contar nos últimos 10s
const GRACE_MS = 2_000; // margem depois do 0 pra não sumir instantaneamente

function isInsideChannel(event: ServerEvent, voice: ReturnType<typeof useVoiceRoom>): boolean {
  if (event.channelKind === 'voice') return voice.activeVcId === event.channelId;
  const { view } = useUiStore.getState();
  const { activeGroupId, activeChannelId } = useGroupStore.getState();
  return view === 'group' && activeGroupId === event.groupId && activeChannelId === event.channelId;
}

function CountdownFullScreen({ event, secondsLeft, onDismiss }: {
  event: ServerEvent;
  secondsLeft: number;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in">
      <button
        onClick={onDismiss}
        className="absolute top-6 right-6 text-surface-400 hover:text-white text-sm transition-colors"
      >
        Dispensar
      </button>

      <div className="text-center px-6">
        <p className="text-accent-400 font-semibold tracking-widest uppercase text-xs mb-2">
          {event.groupName} · {event.channelKind === 'voice' ? '🔊' : '#'} {event.channelName}
        </p>
        <h2 className="text-2xl font-bold text-white mb-8">{event.title}</h2>
        <div
          key={secondsLeft}
          className="text-[160px] leading-none font-black text-white"
          style={{
            animation: 'zynk-countdown-pop 0.6s ease-out',
            textShadow: '0 0 80px rgb(var(--color-accent-500) / 0.7)',
          }}
        >
          {secondsLeft}
        </div>
        <p className="text-surface-400 mt-6 text-sm">O evento está começando...</p>
      </div>
    </div>
  );
}

function JoinNowPrompt({ event, voice, onClose }: {
  event: ServerEvent;
  voice: ReturnType<typeof useVoiceRoom>;
  onClose: () => void;
}) {
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    setJoining(true);
    try {
      useUiStore.getState().setView('group');
      if (event.channelKind === 'text') {
        useGroupStore.getState().setPendingChannelId(event.channelId);
        useGroupStore.getState().setActiveGroup(event.groupId);
      } else {
        useGroupStore.getState().setActiveGroup(event.groupId);
        const { data } = await groupsAPI.getVoiceChannels(event.groupId);
        const vc = (data as VoiceChannel[]).find((v) => v.id === event.channelId);
        if (vc) await voice.join(vc);
      }
    } finally {
      setJoining(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center animate-fade-in">
      <div className="zk-modal rounded-2xl w-[420px] p-6 text-center animate-scale-in">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-accent-400 mb-3">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <h2 className="text-lg font-bold text-surface-100">{event.title}</h2>
        <p className="text-sm text-surface-400 mt-1">
          Está começando em {event.groupName} · {event.channelKind === 'voice' ? '🔊' : '#'} {event.channelName}
        </p>
        <div className="flex gap-3 justify-center mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors">
            Agora não
          </button>
          <button onClick={handleJoin} disabled={joining} className="px-4 py-2 zk-btn-primary text-sm rounded-xl">
            {joining ? 'Entrando...' : 'Entrar agora'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Vigia os eventos aceitos e, nos últimos 10s antes do horário marcado,
 * interrompe a tela com uma contagem regressiva — ao chegar no zero, some
 * sozinho se a pessoa já estiver no canal do evento, ou mostra um prompt
 * "Entrar agora" se não estiver.
 */
export function EventCountdownOverlay({ voice }: Props) {
  const events = useEventStore((s) => s.events);
  const [now, setNow] = useState(() => Date.now());
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [joinPromptEvent, setJoinPromptEvent] = useState<ServerEvent | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const activeEvent = useMemo(() => {
    return events.find((e) => {
      if (e.myStatus !== 'accepted') return false;
      if (dismissedIds.has(e.id)) return false;
      const diff = new Date(e.scheduledAt).getTime() - now;
      return diff <= WINDOW_MS && diff > -GRACE_MS;
    }) ?? null;
  }, [events, now, dismissedIds]);

  const secondsLeft = activeEvent
    ? Math.max(0, Math.ceil((new Date(activeEvent.scheduledAt).getTime() - now) / 1000))
    : null;

  useEffect(() => {
    if (!activeEvent || secondsLeft !== 0) return;
    setDismissedIds((prev) => new Set(prev).add(activeEvent.id));
    if (!isInsideChannel(activeEvent, voice)) {
      setJoinPromptEvent(activeEvent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvent, secondsLeft]);

  const dismiss = () => {
    if (activeEvent) setDismissedIds((prev) => new Set(prev).add(activeEvent.id));
  };

  if (activeEvent && secondsLeft !== null && secondsLeft > 0) {
    return <CountdownFullScreen event={activeEvent} secondsLeft={secondsLeft} onDismiss={dismiss} />;
  }

  if (joinPromptEvent) {
    return <JoinNowPrompt event={joinPromptEvent} voice={voice} onClose={() => setJoinPromptEvent(null)} />;
  }

  return null;
}
