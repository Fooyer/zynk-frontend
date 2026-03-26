import { useState } from 'react';
import { useGameSessionStore } from '../../stores/gameSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { getSocket } from '../../services/socket';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { GameSessionView } from './GameSessionView';

interface Props {
  groupId: number;
  channelId: number | null;
}

export function GameSessionPanel({ groupId, channelId }: Props) {
  const user = useAuthStore((s) => s.user);
  const { activeSession, createSession, joinSession, endSession } = useGameSessionStore();
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showView, setShowView] = useState(false);

  const isHost = activeSession?.id && user && Number(activeSession.hostId) === Number(user.id);
  const isParticipant = activeSession?.participants?.some((p) => Number(p.userId) === Number(user?.id));

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const session = await createSession(groupId, title || undefined);
      if (channelId) {
        getSocket().emit('game:session-created', { channelId, session });
      }
      setTitle('');
      setShowView(true);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!activeSession) return;
    await joinSession(activeSession.id);
    if (channelId) {
      getSocket().emit('game:session-joined', {
        channelId,
        userId: user?.id,
        username: user?.username,
        sessionId: activeSession.id,
      });
    }
    setShowView(true);
  };

  const handleEnd = async () => {
    if (!activeSession) return;
    if (channelId) {
      getSocket().emit('game:session-ended', { channelId, sessionId: activeSession.id });
    }
    await endSession(activeSession.id);
    setShowView(false);
  };

  if (showView && activeSession && isParticipant) {
    return <GameSessionView onBack={() => setShowView(false)} />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      {activeSession?.id && activeSession.status !== 'ended' ? (
        <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md border border-surface-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-accent-600 rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-surface-100">
                {activeSession.title || 'Game Session'}
              </h3>
              <p className="text-xs text-surface-400">
                Host: {activeSession.host.username} - {(activeSession.participants?.length || 0)}/{activeSession.maxPlayers} jogadores
              </p>
            </div>
            <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
              activeSession.status === 'waiting' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
            }`}>
              {activeSession.status === 'waiting' ? 'Aguardando' : 'Em jogo'}
            </span>
          </div>

          <div className="space-y-1 mb-4">
            {(activeSession.participants || []).map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-2 py-1">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                  style={{ backgroundColor: getUserColor(p.user.username) }}
                >
                  {getInitials(p.user.username)}
                </div>
                <span className="text-sm text-surface-200">{p.user.username}</span>
                {p.role === 'host' && (
                  <span className="text-[10px] text-accent-400 font-semibold uppercase">Host</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            {!isParticipant && (
              <button
                onClick={handleJoin}
                className="flex-1 px-4 py-2 bg-success hover:bg-success/80 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Entrar
              </button>
            )}
            {isParticipant && (
              <button
                onClick={() => setShowView(true)}
                className="flex-1 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Abrir Sessao
              </button>
            )}
            {isHost && (
              <button
                onClick={handleEnd}
                className="px-4 py-2 bg-danger hover:bg-danger/80 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Encerrar
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-surface-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-surface-400">
              <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
          </div>
          <h3 className="text-lg font-bold text-surface-100 mb-2">Jogar Juntos</h3>
          <p className="text-sm text-surface-400 mb-6">
            Compartilhe sua tela e jogue com seus amigos como se fosse local. O host roda o jogo e os outros enviam input de gamepad.
          </p>

          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome da sessao (opcional)"
              maxLength={128}
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-surface-100 text-sm placeholder-surface-500 focus:outline-none focus:border-accent-500"
            />
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="px-6 py-2.5 bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Criando...' : 'Iniciar Game Session'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
