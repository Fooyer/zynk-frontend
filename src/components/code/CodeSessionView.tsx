import { useEffect, useRef, useState, useCallback } from 'react';
import { useCodeSessionStore } from '../../stores/codeSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { getSocket } from '../../services/socket';
import { getUserColor, getInitials } from '../../utils/formatDate';

interface Props {
  onBack: () => void;
  channelId: number | null;
}

interface FileActivity {
  id: number;
  relativePath: string;
  action: 'change' | 'create' | 'delete';
  username: string;
  timestamp: number;
}

let activityIdCounter = 0;

export function CodeSessionView({ onBack, channelId }: Props) {
  const { activeSession, tunnelInfo } = useCodeSessionStore();
  const user = useAuthStore((s) => s.user);
  const socket = getSocket();

  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const [activity, setActivity] = useState<FileActivity[]>([]);
  const [error, setError] = useState<string | null>(null);

  const folderPathRef = useRef(folderPath);
  folderPathRef.current = folderPath;

  const isHost = user && activeSession && Number(activeSession.hostId) === Number(user.id);
  const hasElectron = !!window.electronAPI?.tunnelWatchFolder;

  const addActivity = useCallback((relativePath: string, action: FileActivity['action'], username: string) => {
    setActivity((prev) => {
      const entry: FileActivity = {
        id: ++activityIdCounter,
        relativePath,
        action,
        username,
        timestamp: Date.now(),
      };
      return [entry, ...prev].slice(0, 200);
    });
  }, []);

  // ─── Listen for local file changes (Electron watcher) → send to server ───
  useEffect(() => {
    if (!hasElectron || !isWatching || !activeSession || !channelId) return;

    const handleLocalChange = (data: { relativePath: string; action: 'change' | 'create' | 'delete'; content: string | null }) => {
      socket.emit('code:file-sync', {
        sessionId: activeSession.id,
        channelId,
        relativePath: data.relativePath,
        action: data.action,
        content: data.content,
      });
      addActivity(data.relativePath, data.action, user?.username || 'Eu');
    };

    window.electronAPI!.tunnelOnFileChanged(handleLocalChange);
    return () => { window.electronAPI?.tunnelOffFileChanged(); };
  }, [isWatching, activeSession?.id, channelId, socket, user?.username, addActivity, hasElectron]);

  // ─── Listen for remote file changes → write to local disk ───
  useEffect(() => {
    if (!activeSession || !channelId) return;

    const handleRemoteSync = (data: {
      sessionId: number;
      relativePath: string;
      action: 'change' | 'create' | 'delete';
      content: string | null;
      fromUserId: number;
    }) => {
      if (data.sessionId !== activeSession.id) return;
      if (data.fromUserId === user?.id) return;

      const fromUser = activeSession.participants?.find((p) => p.userId === data.fromUserId);
      const username = fromUser?.user.username || `User#${data.fromUserId}`;
      addActivity(data.relativePath, data.action, username);

      // Write to local folder if we have one open
      if (folderPathRef.current && window.electronAPI) {
        if (data.action === 'delete') {
          window.electronAPI.tunnelDeleteRemoteFile(folderPathRef.current, data.relativePath);
        } else if (data.content !== null) {
          window.electronAPI.tunnelWriteRemoteFile(folderPathRef.current, data.relativePath, data.content);
        }
      }
    };

    socket.on('code:file-sync', handleRemoteSync);
    return () => { socket.off('code:file-sync', handleRemoteSync); };
  }, [activeSession?.id, channelId, user?.id, socket, addActivity]);

  // ─── Cleanup watcher on unmount ───
  useEffect(() => {
    return () => {
      if (window.electronAPI) {
        window.electronAPI.tunnelStopWatching();
        window.electronAPI.tunnelOffFileChanged();
      }
    };
  }, []);

  // ─── Actions ───
  const handleSelectFolder = async () => {
    if (!window.electronAPI?.fsSelectFolder) {
      setError('Funcionalidade disponivel apenas no app desktop (Electron)');
      return;
    }
    setError(null);
    const selected = await window.electronAPI.fsSelectFolder();
    if (selected) setFolderPath(selected);
  };

  const handleStartTunnel = async () => {
    if (!folderPath) {
      setError('Selecione uma pasta primeiro');
      return;
    }
    if (!window.electronAPI?.tunnelWatchFolder) {
      setError('Funcionalidade disponivel apenas no app desktop. Reinicie o app se voce acabou de atualizar.');
      return;
    }
    if (!activeSession || !channelId) {
      setError('Sessao ou canal nao encontrado');
      return;
    }

    setError(null);

    try {
      const watchResult = await window.electronAPI.tunnelWatchFolder(folderPath);
      if (!watchResult.success) {
        setError(`Erro ao iniciar watcher: ${watchResult.error || 'desconhecido'}`);
        return;
      }

      setIsWatching(true);

      // Broadcast tunnel status to other participants
      const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
      socket.emit('code:tunnel-started', {
        channelId,
        sessionId: activeSession.id,
        folderName,
        userId: user?.id,
        username: user?.username,
      });
    } catch (err: any) {
      setError(`Erro: ${err.message || 'falha ao iniciar tunnel'}`);
    }
  };

  const handleStopTunnel = async () => {
    if (window.electronAPI) {
      await window.electronAPI.tunnelStopWatching();
      window.electronAPI.tunnelOffFileChanged();
    }
    setIsWatching(false);

    if (activeSession && channelId) {
      socket.emit('code:tunnel-stopped', {
        channelId,
        sessionId: activeSession.id,
        userId: user?.id,
      });
    }
  };

  const handleOpenVSCode = async () => {
    if (!folderPath) {
      setError('Selecione uma pasta primeiro');
      return;
    }
    if (!window.electronAPI?.tunnelOpenVSCode) {
      setError('Funcionalidade disponivel apenas no app desktop');
      return;
    }
    setError(null);
    const result = await window.electronAPI.tunnelOpenVSCode(folderPath);
    if (!result.success) {
      setError(`Erro ao abrir VS Code: ${result.error || 'verifique se o comando "code" esta no PATH'}`);
    }
  };

  // ─── Connect as participant (select folder + auto-start watcher) ───
  const handleConnectToTunnel = async () => {
    if (!window.electronAPI?.fsSelectFolder) {
      setError('Funcionalidade disponivel apenas no app desktop');
      return;
    }
    setError(null);
    const selected = await window.electronAPI.fsSelectFolder();
    if (!selected) return;
    setFolderPath(selected);

    // Auto-start watcher
    if (window.electronAPI.tunnelWatchFolder && activeSession && channelId) {
      const watchResult = await window.electronAPI.tunnelWatchFolder(selected);
      if (watchResult.success) {
        setIsWatching(true);
        const folderName = selected.split(/[\\/]/).pop() || selected;
        socket.emit('code:tunnel-started', {
          channelId,
          sessionId: activeSession.id,
          folderName,
          userId: user?.id,
          username: user?.username,
        });
      }
    }
  };

  const tunnelIsActive = isWatching || !!tunnelInfo || activity.length > 0;

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create': return '+';
      case 'delete': return '−';
      default: return '~';
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create': return 'text-emerald-400';
      case 'delete': return 'text-red-400';
      default: return 'text-amber-400';
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (!activeSession) return null;

  return (
    <div className="flex-1 flex flex-col bg-surface-950">
      {/* Header */}
      <div className="h-10 flex items-center px-3 bg-surface-900 border-b border-surface-700/50 gap-2 flex-shrink-0">
        <button onClick={onBack} className="text-surface-400 hover:text-surface-100 transition-colors text-xs px-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="w-px h-4 bg-surface-700" />

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            tunnelIsActive ? 'bg-emerald-400 animate-pulse' : 'bg-surface-600'
          }`} />
          <span className="text-sm font-medium text-surface-100 truncate">{activeSession.title}</span>
          <span className="text-xs text-surface-500">
            {isWatching ? 'Tunnel ativo' :
             tunnelInfo ? `Tunnel ativo por ${tunnelInfo.username}` :
             activity.length > 0 ? 'Recebendo alteracoes' :
             'Pronto para conectar'}
          </span>
        </div>

        {/* Participants */}
        <div className="flex items-center gap-1">
          {(activeSession.participants || []).map((p) => (
            <div
              key={p.id}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white"
              style={{ backgroundColor: getUserColor(p.user.username) }}
              title={p.user.username}
            >
              {getInitials(p.user.username)}
            </div>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-600/20 border-b border-red-600/30 flex items-center gap-2">
          <span className="text-xs text-red-400 flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Tunnel controls */}
        <div className="w-80 bg-surface-900 border-r border-surface-700/50 flex flex-col flex-shrink-0">

          {/* ─── Host flow: select folder + start tunnel ─── */}
          {isHost && (
            <>
              <div className="p-4 border-b border-surface-700/30">
                <label className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide mb-2 block">
                  Pasta do Projeto
                </label>
                {folderPath ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-2.5 py-1.5 bg-surface-800 rounded text-xs text-surface-200 truncate" title={folderPath}>
                      {folderPath.split(/[\\/]/).pop()}
                    </div>
                    <button
                      onClick={handleSelectFolder}
                      disabled={isWatching}
                      className="p-1.5 text-surface-400 hover:text-surface-100 transition-colors disabled:opacity-30"
                      title="Trocar pasta"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleSelectFolder}
                    className="w-full px-3 py-2 bg-surface-800 hover:bg-surface-700 border border-dashed border-surface-600 rounded-lg text-xs text-surface-400 hover:text-surface-200 transition-colors"
                  >
                    Selecionar pasta...
                  </button>
                )}
              </div>

              <div className="p-4 border-b border-surface-700/30 space-y-2">
                {isWatching ? (
                  <button
                    onClick={handleStopTunnel}
                    className="w-full px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium rounded-lg transition-colors border border-red-600/30"
                  >
                    Parar Tunnel
                  </button>
                ) : (
                  <button
                    onClick={handleStartTunnel}
                    disabled={!folderPath}
                    className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Iniciar Tunnel
                  </button>
                )}

                <button
                  onClick={handleOpenVSCode}
                  disabled={!folderPath}
                  className="w-full px-3 py-2 bg-[#007ACC] hover:bg-[#0098FF] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.583.063a1.5 1.5 0 00-1.032.392 1.5 1.5 0 00-.001 0L7.05 9.958 2.862 6.624a1 1 0 00-1.303.074l-1.286 1.18a1 1 0 00-.011 1.425L4.26 12 .262 14.697a1 1 0 00.011 1.425l1.286 1.18a1 1 0 001.303.074L7.05 14.04l9.5 9.503a1.5 1.5 0 001.033.392h.001A1.5 1.5 0 0019.084 22.5V1.5A1.5 1.5 0 0017.583.063zM17.084 18.56l-6.56-6.56 6.56-6.56z" />
                  </svg>
                  Abrir VS Code
                </button>
              </div>
            </>
          )}

          {/* ─── Participant flow: select folder + connect ─── */}
          {!isHost && (
            <>
              {/* Tunnel info from host (if available) */}
              {tunnelInfo && (
                <div className="px-4 py-2.5 border-b border-surface-700/30 bg-emerald-600/5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-medium text-emerald-400">
                      {tunnelInfo.username} compartilhando: {tunnelInfo.folderName}
                    </span>
                  </div>
                </div>
              )}

              <div className="p-4 border-b border-surface-700/30">
                {isWatching && folderPath ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-medium text-emerald-400">Conectado</span>
                    </div>
                    <div className="px-2.5 py-1.5 bg-surface-800 rounded text-xs text-surface-200 truncate" title={folderPath}>
                      {folderPath.split(/[\\/]/).pop()}
                    </div>
                    <button
                      onClick={handleOpenVSCode}
                      className="w-full px-3 py-2 bg-[#007ACC] hover:bg-[#0098FF] text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.583.063a1.5 1.5 0 00-1.032.392 1.5 1.5 0 00-.001 0L7.05 9.958 2.862 6.624a1 1 0 00-1.303.074l-1.286 1.18a1 1 0 00-.011 1.425L4.26 12 .262 14.697a1 1 0 00.011 1.425l1.286 1.18a1 1 0 001.303.074L7.05 14.04l9.5 9.503a1.5 1.5 0 001.033.392h.001A1.5 1.5 0 0019.084 22.5V1.5A1.5 1.5 0 0017.583.063zM17.084 18.56l-6.56-6.56 6.56-6.56z" />
                      </svg>
                      Abrir VS Code
                    </button>
                    <button
                      onClick={handleStopTunnel}
                      className="w-full px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium rounded-lg transition-colors border border-red-600/30"
                    >
                      Desconectar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[11px] text-surface-500 leading-relaxed">
                      Selecione uma pasta local para sincronizar. Alteracoes do host e suas serao aplicadas automaticamente.
                    </p>
                    <button
                      onClick={handleConnectToTunnel}
                      className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Conectar e Selecionar Pasta
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Sync info */}
          {isWatching && (
            <div className="p-4 border-b border-surface-700/30">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-emerald-400">Sincronizando</span>
              </div>
              <p className="text-[11px] text-surface-500 leading-relaxed">
                {isHost
                  ? 'Alteracoes no VS Code sao detectadas e enviadas para todos os participantes.'
                  : 'Recebendo alteracoes em tempo real. Edite no VS Code e suas mudancas tambem serao enviadas.'}
              </p>
            </div>
          )}

          {/* Participants */}
          <div className="p-4 border-b border-surface-700/30">
            <label className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide mb-2 block">
              Participantes ({(activeSession.participants || []).length})
            </label>
            <div className="space-y-1.5">
              {(activeSession.participants || []).map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0"
                    style={{ backgroundColor: getUserColor(p.user.username) }}
                  >
                    {getInitials(p.user.username)}
                  </div>
                  <span className="text-xs text-surface-200 truncate">{p.user.username}</span>
                  {Number(p.userId) === Number(activeSession.hostId) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium ml-auto">Host</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* How it works (only when idle) */}
          {!isWatching && !tunnelInfo && (
            <div className="p-4 flex-1">
              <label className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide mb-3 block">
                Como funciona
              </label>
              <div className="space-y-3">
                {(isHost ? [
                  { step: '1', text: 'Selecione a pasta do projeto' },
                  { step: '2', text: 'Clique em "Iniciar Tunnel"' },
                  { step: '3', text: 'Abra o VS Code e edite normalmente' },
                  { step: '4', text: 'Alteracoes aparecem para todos em tempo real' },
                ] : [
                  { step: '1', text: 'Aguarde o host iniciar o tunnel' },
                  { step: '2', text: 'Clique "Conectar" e selecione uma pasta local' },
                  { step: '3', text: 'Abra o VS Code para editar' },
                  { step: '4', text: 'Suas mudancas tambem sincronizam com todos' },
                ]).map((item) => (
                  <div key={item.step} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-surface-800 flex items-center justify-center text-[10px] font-bold text-accent-400 flex-shrink-0">
                      {item.step}
                    </span>
                    <span className="text-xs text-surface-400 leading-relaxed">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel: Activity feed */}
        <div className="flex-1 flex flex-col bg-surface-950">
          <div className="px-4 py-2.5 border-b border-surface-700/30 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wide">
              Atividade em Tempo Real
            </span>
            {activity.length > 0 && (
              <button
                onClick={() => setActivity([])}
                className="text-[10px] text-surface-500 hover:text-surface-300 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-16 h-16 bg-surface-900 rounded-2xl flex items-center justify-center mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-surface-600">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <p className="text-sm text-surface-500 mb-1">Nenhuma atividade ainda</p>
                <p className="text-xs text-surface-600">
                  {isWatching
                    ? 'Edite arquivos no VS Code para ver as mudancas aqui'
                    : tunnelInfo
                      ? 'Conecte-se ao tunnel para sincronizar arquivos'
                      : 'Inicie o tunnel para comecar'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-surface-800/50">
                {activity.map((entry) => (
                  <div key={entry.id} className="px-4 py-2 hover:bg-surface-900/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-mono font-bold w-4 text-center ${getActionColor(entry.action)}`}>
                        {getActionIcon(entry.action)}
                      </span>
                      <span className="text-xs text-surface-200 font-mono truncate flex-1">
                        {entry.relativePath}
                      </span>
                      <span className="text-[10px] text-surface-600 flex-shrink-0">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                    <div className="ml-6 mt-0.5">
                      <span className="text-[10px] text-surface-500">{entry.username}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
