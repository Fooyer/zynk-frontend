import { useEffect, useState } from 'react';
import { useCodeSessionStore } from '../../stores/codeSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { getSocket } from '../../services/socket';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { CodeSessionView } from './CodeSessionView';

interface Props {
  groupId: number;
  channelId: number | null;
}

interface RecentChange {
  id: number;
  relativePath: string;
  action: string;
  fromUserId: number;
  timestamp: number;
}

let changeIdCounter = 0;

export function CodeSessionPanel({ groupId, channelId }: Props) {
  const user = useAuthStore((s) => s.user);
  const { activeSession, tunnelInfo, createSession, joinSession, endSession } = useCodeSessionStore();
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showView, setShowView] = useState(false);
  const [recentChanges, setRecentChanges] = useState<RecentChange[]>([]);

  const isHost = activeSession?.id && user && Number(activeSession.hostId) === Number(user.id);
  const isParticipant = activeSession?.participants?.some((p) => Number(p.userId) === Number(user?.id));

  // Escuta file-sync no panel para mostrar atividade
  useEffect(() => {
    if (!activeSession?.id || !channelId) return;

    const socket = getSocket();

    const handleSync = (data: { sessionId: number; relativePath: string; action: string; fromUserId: number }) => {
      if (data.sessionId !== activeSession.id) return;
      setRecentChanges((prev) => [
        { ...data, id: ++changeIdCounter, timestamp: Date.now() },
        ...prev,
      ].slice(0, 5));
    };

    socket.on('code:file-sync', handleSync);
    return () => { socket.off('code:file-sync', handleSync); };
  }, [activeSession?.id, channelId]);

  const handleCreate = async () => {
    if (!title.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const session = await createSession(groupId, title.trim());
      if (channelId) {
        getSocket().emit('code:session-created', { channelId, session });
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
      getSocket().emit('code:session-joined', {
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
      getSocket().emit('code:session-ended', { channelId, sessionId: activeSession.id });
    }
    await endSession(activeSession.id);
    setShowView(false);
    setRecentChanges([]);
  };

  if (showView && activeSession && isParticipant) {
    return <CodeSessionView onBack={() => setShowView(false)} channelId={channelId} />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      {activeSession?.id && activeSession.status !== 'ended' ? (
        <div className="bg-surface-800 rounded-xl p-6 w-full max-w-md border border-surface-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-surface-100">{activeSession.title}</h3>
              <p className="text-xs text-surface-400">
                Host: {activeSession.host.username} - {(activeSession.participants?.length || 0)} editores
              </p>
            </div>
            <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
              tunnelInfo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-success/20 text-success'
            }`}>
              {tunnelInfo ? 'Tunnel ativo' : 'Ativa'}
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
              </div>
            ))}
          </div>

          {/* Tunnel info from host */}
          {tunnelInfo && (
            <div className="mb-4 p-2.5 bg-emerald-600/10 border border-emerald-600/20 rounded-lg">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-[11px] text-emerald-400 font-medium">
                  {tunnelInfo.username} compartilhando: {tunnelInfo.folderName}
                </p>
              </div>
              {recentChanges.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {recentChanges.map((c) => (
                    <div key={c.id} className="flex items-center gap-1.5 px-1">
                      <span className={`text-[10px] font-mono font-bold ${
                        c.action === 'create' ? 'text-emerald-400' : c.action === 'delete' ? 'text-red-400' : 'text-amber-400'
                      }`}>
                        {c.action === 'create' ? '+' : c.action === 'delete' ? '−' : '~'}
                      </span>
                      <span className="text-[10px] text-surface-300 font-mono truncate">{c.relativePath}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!tunnelInfo && (activeSession.files?.length || 0) > 0 && (
            <div className="mb-4 p-2 bg-surface-900 rounded-lg">
              <p className="text-xs text-surface-400 mb-1">Arquivos ({(activeSession.files?.length || 0)})</p>
              {(activeSession.files || []).map((f) => (
                <div key={f.id} className="flex items-center gap-2 px-1 py-0.5">
                  <span className="text-xs text-surface-300">{f.filename}</span>
                  <span className="text-[10px] text-surface-500">{f.language}</span>
                </div>
              ))}
            </div>
          )}

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
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Abrir Tunnel
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
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-surface-100 mb-2">Code Tunnel</h3>
          <p className="text-sm text-surface-400 mb-6">
            Abra o VS Code e edite em tempo real com seus amigos. Alteracoes sincronizam automaticamente entre todos os participantes.
          </p>

          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Refatorando auth module"
              maxLength={128}
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-surface-100 text-sm placeholder-surface-500 focus:outline-none focus:border-accent-500"
            />
            <button
              onClick={handleCreate}
              disabled={!title.trim() || isCreating}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Criando...' : 'Iniciar Code Tunnel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
