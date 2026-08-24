import { useEffect, useMemo, useRef, useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useWatchTogetherUiStore } from '../../stores/watchTogetherUiStore';
import { useAuthStore } from '../../stores/authStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { useVoiceRoom } from '../../hooks/useVoiceRoom';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';
import { GroupView } from './GroupView';
import type { Tab } from './GroupView';
import { GroupMemberList } from './GroupMemberList';
import { VoiceStatusBar } from './VoiceStatusBar';
import { ChannelListSkeleton } from '../common/Skeleton';
import { ContextMenuItem, ContextMenuHeader, ContextMenuHint, ContextMenuSeparator } from '../common/ContextMenuItem';
import { groupsAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import { getInitials, getUserColor } from '../../utils/formatDate';
import type { CallMode, GroupTextChannel, VoiceChannel } from '../../types';

// ─── Channel sidebar ────────────────────────────────────────
// Voz e texto são canais separados de verdade (tipos distintos), mas com
// uma única entrada de criação — você escolhe o tipo na hora de criar — e
// ficam numa lista só, sem cabeçalhos separando. A ordem é livre: arrasta
// e solta, salva pra todo mundo do grupo.

type ChannelType = 'text' | 'voice';

type ChannelRow =
  | { type: 'voice'; channel: VoiceChannel }
  | { type: 'text'; channel: GroupTextChannel };

const rowKey = (row: ChannelRow) => `${row.type}-${row.channel.id}`;

interface ChannelSidebarProps {
  group: { id: number; name: string; channelId: number | null; features: string[] } | null;
  voice: ReturnType<typeof useVoiceRoom>;
  activeChannelId: number | null;
  onSelectChannel: (id: number) => void;
  onOpenCall: () => void;
}

function ChannelSidebar({ group, voice, activeChannelId, onSelectChannel, onOpenCall }: ChannelSidebarProps) {
  const currentUser = useAuthStore((s) => s.user);

  const [textChannels, setTextChannels] = useState<GroupTextChannel[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ key: string; position: 'before' | 'after' } | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<ChannelType>('text');
  const [createMode, setCreateMode] = useState<CallMode>('normal');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);
  const handleNewNameContextMenu = useEditableContextMenu(newNameRef);
  const voiceEditRef = useRef<HTMLInputElement>(null);
  const handleVoiceEditContextMenu = useEditableContextMenu(voiceEditRef);
  const textEditRef = useRef<HTMLInputElement>(null);
  const handleTextEditContextMenu = useEditableContextMenu(textEditRef);

  const hasVoice = group?.features.includes('voice') ?? false;

  // Carrega os canais de texto (principal + adicionais) quando o grupo muda
  useEffect(() => {
    if (!group) { setTextChannels([]); return; }
    setIsLoadingChannels(true);
    groupsAPI.getTextChannels(group.id)
      .then(({ data }) => {
        setTextChannels(data);
        // Registra channelId -> groupId pro badge de não lidas do servidor conseguir somar
        useUnreadStore.getState().registerChannels(data.map((c: GroupTextChannel) => c.id), group.id);
      })
      .finally(() => setIsLoadingChannels(false));
  }, [group?.id]);

  // Escuta novos canais de texto criados por outros membros
  useEffect(() => {
    const socket = getSocket();
    const onCreated = (ch: GroupTextChannel) => {
      if (ch.groupId === group?.id) {
        setTextChannels((prev) => prev.some((p) => p.id === ch.id) ? prev : [...prev, ch]);
        useUnreadStore.getState().registerChannels([ch.id], ch.groupId);
      }
    };
    socket.on('group-channel:created', onCreated);
    return () => { socket.off('group-channel:created', onCreated); };
  }, [group?.id]);

  // Escuta renomeações de canais de texto feitas por outros membros
  // (canais de voz já são sincronizados dentro do próprio useVoiceRoom)
  useEffect(() => {
    const socket = getSocket();
    const onRenamed = (data: { channelId: number; type: 'text' | 'voice'; name: string }) => {
      if (data.type !== 'text') return;
      setTextChannels((prev) => prev.map((c) => (c.id === data.channelId ? { ...c, name: data.name } : c)));
    };
    socket.on('channel:renamed', onRenamed);
    return () => { socket.off('channel:renamed', onRenamed); };
  }, []);

  const merged: ChannelRow[] = useMemo(() => {
    const rows: ChannelRow[] = [
      ...(hasVoice ? voice.voiceChannels.map((c): ChannelRow => ({ type: 'voice', channel: c })) : []),
      ...textChannels.map((c): ChannelRow => ({ type: 'text', channel: c })),
    ];
    return rows.sort((a, b) => (a.channel.position ?? 0) - (b.channel.position ?? 0));
  }, [hasVoice, voice.voiceChannels, textChannels]);

  const resetCreateForm = () => {
    setShowCreate(false);
    setNewName('');
    setCreateMode('normal');
    setError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !group) return;
    setError(null);
    try {
      if (createType === 'voice') {
        await voice.createChannel(newName.trim(), createMode);
      } else {
        const { data } = await groupsAPI.createTextChannel(group.id, newName.trim());
        setTextChannels((prev) => prev.some((p) => p.id === data.id) ? prev : [...prev, data]);
        onSelectChannel(data.id);
      }
      resetCreateForm();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Erro ao criar canal'));
    }
  };

  const handleTextDelete = async (ch: GroupTextChannel) => {
    if (!group) return;
    try {
      await groupsAPI.deleteTextChannel(group.id, ch.id);
      setTextChannels((prev) => prev.filter((p) => p.id !== ch.id));
    } catch {}
  };

  const startEdit = (row: ChannelRow) => {
    setEditingKey(rowKey(row));
    setEditValue(row.channel.name);
  };

  const commitEdit = async (row: ChannelRow) => {
    const trimmed = editValue.trim();
    setEditingKey(null);
    if (!trimmed || !group || trimmed === row.channel.name) return;
    try {
      if (row.type === 'voice') {
        await voice.renameChannel(row.channel.id, trimmed);
      } else {
        await groupsAPI.renameTextChannel(group.id, row.channel.id, trimmed);
        setTextChannels((prev) => prev.map((c) => (c.id === row.channel.id ? { ...c, name: trimmed } : c)));
      }
    } catch {}
  };

  const handleDrop = (targetRow: ChannelRow) => {
    const info = dragOverInfo;
    const draggedKeySnapshot = draggedKey;
    setDraggedKey(null);
    setDragOverInfo(null);
    if (!group || !draggedKeySnapshot) return;

    const fromIdx = merged.findIndex((r) => rowKey(r) === draggedKeySnapshot);
    let toIdx = merged.findIndex((r) => rowKey(r) === rowKey(targetRow));
    if (fromIdx === -1 || toIdx === -1) return;
    if (info?.position === 'after') toIdx += 1;
    if (fromIdx < toIdx) toIdx -= 1;
    if (toIdx === fromIdx) return;

    const next = [...merged];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);

    const voicePositions = new Map<number, number>();
    const textPositions = new Map<number, number>();
    next.forEach((row, i) => {
      if (row.type === 'voice') voicePositions.set(row.channel.id, i);
      else textPositions.set(row.channel.id, i);
    });

    voice.updateChannelPositions(voicePositions);
    setTextChannels((prev) => prev.map((ch) => (textPositions.has(ch.id) ? { ...ch, position: textPositions.get(ch.id)! } : ch)));

    const items = next.map((row) => ({ id: row.channel.id, type: row.type }));
    groupsAPI.reorderChannels(group.id, items).catch(() => {});
  };

  /** Menu de opções do canal (renomear/excluir) — abre por clique no ⋮ ou por botão direito. */
  const openChannelMenu = (e: React.MouseEvent, row: ChannelRow) => {
    if (row.type === 'text' && row.channel.id === group?.channelId) return; // canal principal não tem ações
    e.preventDefault();
    e.stopPropagation();

    const isVoice = row.type === 'voice';
    const canManage = isVoice || Number((row.channel as GroupTextChannel).ownerId) === Number(currentUser?.id);
    const displayName = row.type === 'text' && row.channel.id === group?.channelId ? 'geral' : row.channel.name;
    const isConnected = isVoice && voice.activeVcId === row.channel.id;

    useContextMenuStore.getState().open({ x: e.clientX, y: e.clientY }, (
      <>
        <ContextMenuHeader>{displayName}</ContextMenuHeader>

        {isVoice && (
          <>
            <ContextMenuItem
              onClick={() => {
                useContextMenuStore.getState().close();
                if (isConnected) voice.leave();
                else voice.join(row.channel as VoiceChannel);
              }}
              danger={isConnected}
              icon={
                isConnected ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                )
              }
              label={isConnected ? 'Desconectar' : 'Conectar'}
            />
            <ContextMenuSeparator />
          </>
        )}

        {canManage ? (
          <>
            <ContextMenuItem
              onClick={() => { useContextMenuStore.getState().close(); startEdit(row); }}
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" />
                </svg>
              }
              label="Renomear"
            />
            <ContextMenuItem
              onClick={() => {
                useContextMenuStore.getState().close();
                if (row.type === 'voice') voice.deleteChannel(row.channel.id);
                else handleTextDelete(row.channel);
              }}
              danger
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              }
              label="Excluir"
            />
          </>
        ) : (
          <ContextMenuHint>Sem permissão para gerenciar este canal</ContextMenuHint>
        )}
      </>
    ));
  };

  /** Menu de opções de um participante da call (silenciar localmente/copiar nome). */
  const openParticipantMenu = (e: React.MouseEvent, p: VoiceChannel['participants'][number], isConnectedHere: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const isSelf = Number(p.userId) === Number(currentUser?.id);
    const isLocallyMuted = voice.locallyMutedIds.has(p.userId);

    useContextMenuStore.getState().open({ x: e.clientX, y: e.clientY }, (
      <>
        <ContextMenuHeader>{p.username}</ContextMenuHeader>

        {!isSelf && isConnectedHere && (
          <ContextMenuItem
            onClick={() => { useContextMenuStore.getState().close(); voice.toggleLocalMute(p.userId); }}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isLocallyMuted ? (
                  <path d="M11 5 6 9H2v6h4l5 4V5z" />
                ) : (
                  <>
                    <path d="M11 5 6 9H2v6h4l5 4V5z" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </>
                )}
              </svg>
            }
            label={isLocallyMuted ? 'Dessilenciar localmente' : 'Silenciar localmente'}
          />
        )}
        <ContextMenuItem
          onClick={() => { useContextMenuStore.getState().close(); navigator.clipboard.writeText(p.username).catch(() => {}); }}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          }
          label="Copiar nome de usuário"
        />
      </>
    ));
  };

  if (!group) {
    return (
      <div className="w-60 h-full zk-surface shadow-panel rounded-2xl flex flex-col flex-shrink-0 overflow-hidden">
        <div className="h-12 border-b border-white/[0.06] flex items-center px-4">
          <span className="text-sm font-semibold text-surface-500">Selecione um grupo</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 h-full zk-surface shadow-panel rounded-2xl flex flex-col flex-shrink-0 overflow-hidden">
      {/* Group name header */}
      <div className="h-12 border-b border-white/[0.06] flex items-center px-4 flex-shrink-0 shadow-sm">
        <h2 className="text-sm font-bold text-surface-100 truncate flex-1">{group.name}</h2>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        {/* Criar canal — entrada única, tipo escolhido aqui */}
        <div className="px-2">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest">Canais</span>
            <button
              onClick={() => { setShowCreate((s) => !s); setError(null); }}
              className="w-4 h-4 flex items-center justify-center text-surface-500 hover:text-surface-200 transition-colors"
              title="Criar canal"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          {showCreate && (
            <form onSubmit={handleCreate} className="space-y-1.5 mb-1">
              {hasVoice && (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCreateType('text')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      createType === 'text'
                        ? 'bg-accent-600/15 border-accent-500 text-accent-300'
                        : 'bg-white/[0.06] border-white/[0.08] text-surface-300 hover:border-white/[0.14]'
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    Texto
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateType('voice')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      createType === 'voice'
                        ? 'bg-success/15 border-success text-success'
                        : 'bg-white/[0.06] border-white/[0.08] text-surface-300 hover:border-white/[0.14]'
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    Voz
                  </button>
                </div>
              )}
              {hasVoice && createType === 'voice' && (
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest px-0.5">
                    Modo de áudio
                  </span>
                  <div className="flex items-center gap-0.5 p-0.5 bg-surface-900/60 border border-white/[0.08] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setCreateMode('normal')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        createMode === 'normal'
                          ? 'bg-accent-600/20 text-accent-300'
                          : 'text-surface-400 hover:text-surface-200'
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="4" y1="10" x2="4" y2="14" />
                        <line x1="9" y1="6" x2="9" y2="18" />
                        <line x1="14" y1="3" x2="14" y2="21" />
                        <line x1="19" y1="8" x2="19" y2="16" />
                      </svg>
                      Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateMode('game')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        createMode === 'game'
                          ? 'bg-warning/20 text-warning'
                          : 'text-surface-400 hover:text-surface-200'
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                      </svg>
                      Jogos
                    </button>
                  </div>
                  <p className="text-[10px] text-surface-500 px-0.5 leading-tight">
                    {createMode === 'normal'
                      ? 'Processamento normal de áudio — melhor pra conversar.'
                      : 'Sem processamento de áudio — menor delay possível, pensado pra call durante partida.'}
                  </p>
                </div>
              )}
              <input
                ref={newNameRef}
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onContextMenu={handleNewNameContextMenu}
                placeholder="nome do canal"
                maxLength={64}
                className="zk-input w-full px-2 py-1 rounded text-xs"
              />
              {error && <p className="text-[10px] text-danger px-0.5">{error}</p>}
              <div className="flex gap-1">
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="flex-1 py-1 bg-accent-600 text-on-accent text-xs rounded hover:bg-accent-500 hover:shadow-glow-accent disabled:opacity-50 disabled:shadow-none transition-all"
                >
                  Criar
                </button>
                <button type="button" onClick={resetCreateForm} className="px-2 py-1 bg-white/[0.06] text-surface-400 text-xs rounded hover:bg-white/[0.12] transition-colors">
                  ✕
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Voz e texto juntos numa lista só, na ordem que cada um arrastou */}
        {isLoadingChannels ? <ChannelListSkeleton /> : (
        <div className="px-2 space-y-1">
          {merged.map((row) => {
            const isDragging = draggedKey === rowKey(row);
            const dragProps = {
              draggable: true,
              onDragStart: () => setDraggedKey(rowKey(row)),
              onDragEnd: () => { setDraggedKey(null); setDragOverInfo(null); },
              onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                setDragOverInfo((prev) => (prev?.key === rowKey(row) && prev.position === position ? prev : { key: rowKey(row), position }));
              },
              onDrop: (e: React.DragEvent) => { e.preventDefault(); handleDrop(row); },
            };
            // Linha indicadora de onde o canal vai parar ao soltar
            const showDropBefore = dragOverInfo?.key === rowKey(row) && dragOverInfo.position === 'before' && draggedKey !== rowKey(row);
            const showDropAfter = dragOverInfo?.key === rowKey(row) && dragOverInfo.position === 'after' && draggedKey !== rowKey(row);
            const DropIndicator = () => <div className="h-0.5 mx-1 rounded-full bg-accent-400" />;

            if (row.type === 'voice') {
              const vc = row.channel;
              const isActive = voice.activeVcId === vc.id;
              return (
                <div
                  key={rowKey(row)}
                  {...dragProps}
                  onContextMenu={(e) => openChannelMenu(e, row)}
                  className={`group/vc rounded-lg transition-colors cursor-grab active:cursor-grabbing ${
                    isDragging ? 'opacity-40' : ''
                  } ${isActive ? 'bg-accent-600/10 ring-1 ring-inset ring-accent-500/30' : ''}`}
                >
                  {showDropBefore && <DropIndicator />}
                  {editingKey === rowKey(row) ? (
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 text-surface-500">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                      <input
                        ref={voiceEditRef}
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => commitEdit(row)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit(row); }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingKey(null); }
                        }}
                        onContextMenu={handleVoiceEditContextMenu}
                        maxLength={64}
                        className="flex-1 min-w-0 bg-surface-900/70 border border-accent-500 rounded px-1.5 py-0.5 text-sm text-surface-100 focus:outline-none"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => { if (isActive) onOpenCall(); else voice.join(vc); }}
                      disabled={voice.isConnecting}
                      title={isActive ? 'Abrir a chamada' : undefined}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'text-accent-400'
                          : 'text-surface-300 hover:bg-white/[0.06] hover:text-surface-100'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`flex-shrink-0 ${isActive ? 'text-accent-400' : 'text-surface-500'}`}>
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                      <span className={`flex-1 min-w-0 text-sm truncate ${isActive ? 'font-semibold' : ''}`}>{vc.name}</span>
                      {vc.mode === 'game' && (
                        <span
                          title="Canal de jogos — menor delay possível"
                          className="flex-shrink-0 flex items-center gap-0.5 px-1 py-0.5 rounded bg-warning/15 text-warning"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                          </svg>
                        </span>
                      )}
                      {vc.participants.length > 0 && (
                        <span className={`text-[10px] flex-shrink-0 ${isActive ? 'text-accent-400' : 'text-surface-400'}`}>{vc.participants.length}</span>
                      )}
                      <span
                        onClick={(e) => { e.stopPropagation(); openChannelMenu(e, row); }}
                        className="opacity-0 group-hover/vc:opacity-100 text-surface-500 hover:text-surface-200 transition-all cursor-pointer p-0.5 rounded flex-shrink-0"
                        title="Opções"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
                        </svg>
                      </span>
                    </button>
                  )}

                  {/* Participantes — linha conectora reforça que pertencem a este canal */}
                  {vc.participants.length > 0 && (
                    <div className="pb-2 pl-[27px] pr-2">
                      <div className={`space-y-2 border-l-2 pl-3 ${isActive ? 'border-accent-500/40' : 'border-white/[0.10]'}`}>
                        {vc.participants.map((p) => {
                          // Vem do roster (servidor), não do WebRTC — por
                          // isso aparece mesmo pra quem não está na call.
                          const isSharing = !!p.isSharing;
                          const isMuted = !!p.isMuted;
                          // Só faz sentido medir quem está falando pra quem
                          // está de fato conectado aqui (é o WebRTC que
                          // alimenta os AnalyserNodes) — pra quem só aparece
                          // no roster sem estar na call ativa, sempre false.
                          const isSpeaking = isActive && voice.speakingUserIds.has(p.userId);
                          return (
                            <div
                              key={p.userId}
                              className={`flex items-center gap-2 -mx-1.5 px-1.5 py-1 rounded-md transition-colors duration-150 ${
                                isSpeaking ? 'bg-accent-500/15' : ''
                              }`}
                              onContextMenu={(e) => openParticipantMenu(e, p, isActive)}
                            >
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-semibold flex-shrink-0 ring-2 transition-all duration-150 ${
                                  isSpeaking ? 'ring-accent-400 shadow-glow-accent-sm' : isActive ? 'ring-accent-500/60' : 'ring-white/[0.10]'
                                }`}
                                style={{ backgroundColor: getUserColor(p.username) }}
                              >
                                {p.avatarUrl ? (
                                  <img src={p.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                  getInitials(p.username)
                                )}
                              </div>
                              <span className={`text-xs font-medium truncate flex-1 ${isSpeaking ? 'text-accent-200' : 'text-surface-100'}`}>{p.username}</span>
                              {isMuted && (
                                <span title="Sem microfone" className="flex-shrink-0 text-danger">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                                    <line x1="12" y1="19" x2="12" y2="23" />
                                  </svg>
                                </span>
                              )}
                              {isSharing && (
                                <span title="Compartilhando tela" className="flex-shrink-0 text-success">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="3" width="20" height="14" rx="2" />
                                    <polyline points="8 21 12 17 16 21" />
                                    <line x1="12" y1="17" x2="12" y2="21" />
                                  </svg>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {showDropAfter && <DropIndicator />}
                </div>
              );
            }

            const ch = row.channel;
            const isPrimary = ch.id === group.channelId;
            const isActive = activeChannelId === ch.id;
            return (
              <div
                key={rowKey(row)}
                {...dragProps}
                onContextMenu={(e) => openChannelMenu(e, row)}
                className={`group/tc cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
              >
                {showDropBefore && <DropIndicator />}
                {editingKey === rowKey(row) ? (
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-surface-500">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <input
                      ref={textEditRef}
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => commitEdit(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitEdit(row); }
                        if (e.key === 'Escape') { e.preventDefault(); setEditingKey(null); }
                      }}
                      onContextMenu={handleTextEditContextMenu}
                      maxLength={64}
                      className="flex-1 min-w-0 bg-surface-900/70 border border-accent-500 rounded px-1.5 py-0.5 text-sm text-surface-100 focus:outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => onSelectChannel(ch.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'text-accent-300 bg-accent-600/15'
                        : 'text-surface-300 hover:bg-white/[0.06] hover:text-surface-100'
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="text-sm truncate flex-1">{isPrimary ? 'geral' : ch.name}</span>
                    {!isPrimary && Number(ch.ownerId) === Number(currentUser?.id) && (
                      <span
                        onClick={(e) => { e.stopPropagation(); openChannelMenu(e, row); }}
                        className="opacity-0 group-hover/tc:opacity-100 text-surface-500 hover:text-surface-200 transition-all cursor-pointer p-0.5 rounded"
                        title="Opções"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
                        </svg>
                      </span>
                    )}
                  </button>
                )}
                {showDropAfter && <DropIndicator />}
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Call de voz em andamento — colada no rodapé da seção de canais,
          mesma posição do Discord. Some sozinha quando não há call ativa. */}
      <VoiceStatusBar voice={voice} />
    </div>
  );
}

// ─── Main layout ────────────────────────────────────────────

export function GroupLayout({ voice }: { voice: ReturnType<typeof useVoiceRoom> }) {
  const groups = useGroupStore((s) => s.groups);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const cinemaMode = useLayoutStore((s) => s.cinemaMode);
  // Vive na store (não como useState local) pra que notification.ts e o
  // unreadStore consigam saber qual canal de grupo está aberto de verdade.
  const activeChannelId = useGroupStore((s) => s.activeChannelId);
  const setActiveChannelId = useGroupStore((s) => s.setActiveChannelId);
  // Vive aqui (não dentro de GroupView) porque o clique no canal de voz já
  // conectado, na sidebar, precisa poder trocar pra aba "Chamada".
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  // Reset active channel when group changes — a não ser que exista um canal
  // "pendente" marcado de fora (ex: prompt "Entrar agora" de um evento),
  // que tem prioridade sobre o canal principal padrão.
  useEffect(() => {
    const pending = useGroupStore.getState().consumePendingChannelId();
    setActiveChannelId(pending ?? activeGroup?.channelId ?? null);
  }, [activeGroupId, activeGroup?.channelId]);

  // "Expandir" no mini player flutuante do YouTube (App.tsx) pede pra abrir
  // a aba Chamada — mesmo padrão de "pendente consumido uma vez" do canal
  // acima. Assina o valor em si (não só activeGroupId): o pedido pode
  // chegar mesmo já estando no grupo certo, só faltando trocar de aba.
  const pendingCallTab = useWatchTogetherUiStore((s) => s.pendingCallTab);
  useEffect(() => {
    if (pendingCallTab) {
      useWatchTogetherUiStore.getState().consumeCallTab();
      setActiveTab('call');
    }
  }, [pendingCallTab]);

  return (
    <>
      {/* ── Col 1: Channel sidebar — some inteira no modo cinema, em vez de
          só recolher, pra liberar toda a largura pro vídeo em foco. ──── */}
      {!cinemaMode && (
        <div className="h-full w-60 flex flex-col flex-shrink-0 overflow-hidden">
          <ChannelSidebar
            group={activeGroup}
            voice={voice}
            activeChannelId={activeChannelId}
            onSelectChannel={(id) => { setActiveChannelId(id); setActiveTab('chat'); }}
            onOpenCall={() => setActiveTab('call')}
          />
        </div>
      )}

      {/* ── Col 2: Main content ───────────────────────────── */}
      <GroupView
        channelId={activeChannelId}
        voice={voice}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* ── Col 3: Members ───────────────────────────────── */}
      <GroupMemberList />
    </>
  );
}
