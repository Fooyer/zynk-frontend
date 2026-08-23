import { useEventStore } from '../../stores/eventStore';

/**
 * Popup de convite pra um evento recém-criado num servidor — aparece pra
 * todo mundo que recebeu (via socket `event:created`), exceto quem criou.
 * Aceitar/recusar aqui é o mesmo fluxo do hub de eventos (Aceitar marca no
 * calendário e liga a contagem regressiva; Recusar só dispensa).
 */
export function EventInviteModal() {
  const invite = useEventStore((s) => s.pendingInvite);
  const respond = useEventStore((s) => s.respond);
  const setPendingInvite = useEventStore((s) => s.setPendingInvite);

  if (!invite) return null;

  const dateLabel = new Date(invite.scheduledAt).toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  });

  const handleRespond = (status: 'accepted' | 'declined') => {
    respond(invite.id, status).catch(() => {});
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9990] animate-fade-in">
      <div className="zk-modal rounded-2xl w-[420px] p-6 animate-scale-in">
        <div className="flex items-center gap-2 mb-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-400">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="text-xs font-semibold text-accent-400 uppercase tracking-wide">Convite para evento</span>
        </div>

        <h2 className="text-lg font-bold text-surface-100 mt-2">{invite.title}</h2>
        <p className="text-sm text-surface-400 mt-1">
          {invite.groupName} · {invite.channelKind === 'voice' ? '🔊' : '#'} {invite.channelName}
        </p>
        <p className="text-sm text-surface-300 mt-2 capitalize">{dateLabel}</p>
        {invite.description && (
          <p className="text-sm text-surface-400 mt-3 leading-relaxed">{invite.description}</p>
        )}
        <p className="text-xs text-surface-500 mt-2">
          Criado por {invite.creator.username}
        </p>

        <div className="flex gap-3 justify-end mt-5">
          <button
            onClick={() => setPendingInvite(null)}
            className="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors"
          >
            Decidir depois
          </button>
          <button
            onClick={() => handleRespond('declined')}
            className="px-4 py-2 text-sm rounded-xl bg-white/[0.06] text-surface-300 hover:bg-white/[0.1] transition-colors"
          >
            Recusar
          </button>
          <button
            onClick={() => handleRespond('accepted')}
            className="px-4 py-2 zk-btn-primary text-sm rounded-xl"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
