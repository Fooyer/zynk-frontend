import { useAuthStore } from '../../stores/authStore';
import { usePollStore } from '../../stores/pollStore';
import { alertDialog, confirmDialog } from '../../stores/dialogStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { ContextMenuItem } from '../common/ContextMenuItem';
import { getUserColor, getInitials, formatMessageDate } from '../../utils/formatDate';
import type { Poll } from '../../types';

interface Props {
  poll: Poll;
}

export function PollMessage({ poll }: Props) {
  const currentUser = useAuthStore((s) => s.user);
  const vote = usePollStore((s) => s.vote);
  const closePoll = usePollStore((s) => s.closePoll);
  const reopenPoll = usePollStore((s) => s.reopenPoll);
  const deletePoll = usePollStore((s) => s.deletePoll);

  const isCreator = Number(poll.creator.id) === Number(currentUser?.id);
  const isClosed = !!poll.closedAt;
  const color = getUserColor(poll.creator.username);

  const handleVote = (optionId: number) => {
    if (isClosed) return;
    vote(poll.id, optionId).catch(() => {});
  };

  const handleClose = () => {
    closePoll(poll.id).catch(() => {
      alertDialog('Não foi possível encerrar a enquete.', { title: 'Erro' });
    });
  };

  const handleReopen = () => {
    useContextMenuStore.getState().close();
    reopenPoll(poll.id).catch(() => {
      alertDialog('Não foi possível reabrir a enquete.', { title: 'Erro' });
    });
  };

  const handleDelete = async () => {
    useContextMenuStore.getState().close();
    const ok = await confirmDialog('Essa ação não pode ser desfeita.', {
      title: 'Excluir enquete?',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    deletePoll(poll.id).catch(() => {
      alertDialog('Não foi possível excluir a enquete.', { title: 'Erro' });
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isCreator) return;
    e.preventDefault();
    useContextMenuStore.getState().open({ x: e.clientX, y: e.clientY }, (
      <>
        {isClosed && (
          <ContextMenuItem
            icon={(
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            )}
            label="Reabrir enquete"
            onClick={handleReopen}
          />
        )}
        <ContextMenuItem
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          )}
          label="Excluir enquete"
          danger
          onClick={handleDelete}
        />
      </>
    ));
  };

  return (
    <div
      className="mx-2 my-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] max-w-md"
      onContextMenu={handleContextMenu}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {poll.creator.avatarUrl ? (
            <img src={poll.creator.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            getInitials(poll.creator.username)
          )}
        </div>
        <span className="text-xs text-surface-400">
          <span className="font-medium" style={{ color }}>{poll.creator.username}</span> criou uma enquete
        </span>
        <span className="text-xs text-surface-600">· {formatMessageDate(poll.createdAt)}</span>
      </div>

      <div className="flex items-start gap-2 mb-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400 flex-shrink-0 mt-0.5">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
        <p className="text-sm font-semibold text-surface-100 leading-snug">{poll.question}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        {poll.options.map((opt) => {
          const pct = poll.totalVotes > 0 ? Math.round((opt.voteCount / poll.totalVotes) * 100) : 0;
          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={isClosed}
              className={`relative w-full text-left px-3 py-2 rounded-lg border overflow-hidden transition-colors ${
                opt.votedByMe ? 'border-accent-500/60' : 'border-white/[0.08]'
              } ${isClosed ? 'cursor-default' : 'hover:border-accent-500/40'}`}
            >
              <div
                className={`absolute inset-y-0 left-0 transition-all ${opt.votedByMe ? 'bg-accent-600/25' : 'bg-white/[0.06]'}`}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  {opt.votedByMe && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-400 flex-shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  <span className="text-sm text-surface-200 truncate">{opt.text}</span>
                </span>
                <span className="text-xs text-surface-400 flex-shrink-0">{opt.voteCount} · {pct}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[11px] text-surface-500">
          {poll.totalVotes} {poll.totalVotes === 1 ? 'voto' : 'votos'}
          {poll.allowMultiple && ' · múltipla escolha'}
          {isClosed && ' · encerrada'}
        </span>
        {isCreator && !isClosed && (
          <button
            onClick={handleClose}
            className="text-[11px] font-medium text-surface-500 hover:text-danger transition-colors"
          >
            Encerrar enquete
          </button>
        )}
      </div>
    </div>
  );
}
