import { useEffect, useMemo, useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceRoom } from '../../hooks/useVoiceRoom';
import { GroupView } from './GroupView';
import { GroupMemberList } from './GroupMemberList';
import { groupsAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import { getInitials, getUserColor } from '../../utils/formatDate';
import type { GroupTextChannel, VoiceChannel } from '../../types';

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
}

function ChannelSidebar({ group, voice, activeChannelId, onSelectChannel }: ChannelSidebarProps) {
  const currentUser = useAuthStore((s) => s.user);

  const [textChannels, setTextChannels] = useState<GroupTextChannel[]>([]);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<ChannelType>('text');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasVoice = group?.features.includes('voice') ?? false;

  // Carrega os canais de texto (principal + adicionais) quando o grupo muda
  useEffect(() => {
    if (!group) { setTextChannels([]); return; }
    groupsAPI.getTextChannels(group.id).then(({ data }) => setTextChannels(data));
  }, [group?.id]);

  // Escuta novos canais de texto criados por outros membros
  useEffect(() => {
    const socket = getSocket();
    const onCreated = (ch: GroupTextChannel) => {
      if (ch.groupId === group?.id) {
        setTextChannels((prev) => prev.some((p) => p.id === ch.id) ? prev : [...prev, ch]);
      }
    };
    socket.on('group-channel:created', onCreated);
    return () => { socket.off('group-channel:created', onCreated); };
  }, [group?.id]);

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
    setError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !group) return;
    setError(null);
    try {
      if (createType === 'voice') {
        await voice.createChannel(newName.trim());
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

  const handleDrop = (targetRow: ChannelRow) => {
    if (!group || !draggedKey) return;
    const fromIdx = merged.findIndex((r) => rowKey(r) === draggedKey);
    const toIdx = merged.findIndex((r) => rowKey(r) === rowKey(targetRow));
    setDraggedKey(null);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

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

  if (!group) {
    return (
      <div className="w-60 h-full bg-surface-800 border-r border-surface-700/50 flex flex-col flex-shrink-0">
        <div className="h-12 border-b border-surface-700/50 flex items-center px-4">
          <span className="text-sm font-semibold text-surface-500">Selecione um grupo</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 h-full bg-surface-800 border-r border-surface-700/50 flex flex-col flex-shrink-0 overflow-hidden">
      {/* Group name header */}
      <div className="h-12 border-b border-surface-700/50 flex items-center px-4 flex-shrink-0 shadow-sm">
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
                        : 'bg-surface-700 border-surface-600 text-surface-300 hover:border-surface-500'
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
                        : 'bg-surface-700 border-surface-600 text-surface-300 hover:border-surface-500'
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
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="nome do canal"
                maxLength={64}
                className="w-full px-2 py-1 bg-surface-700 border border-surface-600 rounded text-xs text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500"
              />
              {error && <p className="text-[10px] text-danger px-0.5">{error}</p>}
              <div className="flex gap-1">
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="flex-1 py-1 bg-accent-600 text-white text-xs rounded disabled:opacity-50 hover:bg-accent-500 transition-colors"
                >
                  Criar
                </button>
                <button type="button" onClick={resetCreateForm} className="px-2 py-1 bg-surface-700 text-surface-400 text-xs rounded hover:bg-surface-600 transition-colors">
                  ✕
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Voz e texto juntos numa lista só, na ordem que cada um arrastou */}
        <div className="px-2 space-y-1">
          {merged.map((row) => {
            const isDragging = draggedKey === rowKey(row);
            const dragProps = {
              draggable: true,
              onDragStart: () => setDraggedKey(rowKey(row)),
              onDragEnd: () => setDraggedKey(null),
              onDragOver: (e: React.DragEvent) => e.preventDefault(),
              onDrop: (e: React.DragEvent) => { e.preventDefault(); handleDrop(row); },
            };

            if (row.type === 'voice') {
              const vc = row.channel;
              const isActive = voice.activeVcId === vc.id;
              return (
                <div
                  key={rowKey(row)}
                  {...dragProps}
                  className={`group/vc rounded-lg transition-colors cursor-grab active:cursor-grabbing ${
                    isDragging ? 'opacity-40' : ''
                  } ${isActive ? 'bg-success/10 ring-1 ring-inset ring-success/30' : ''}`}
                >
                  <button
                    onClick={() => voice.join(vc)}
                    disabled={voice.isConnecting}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'text-success'
                        : 'text-surface-300 hover:bg-surface-700/60 hover:text-surface-100'
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`flex-shrink-0 ${isActive ? 'text-success' : 'text-surface-500'}`}>
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    <span className={`flex-1 min-w-0 text-sm truncate ${isActive ? 'font-semibold' : ''}`}>{vc.name}</span>
                    {vc.participants.length > 0 && (
                      <span className="text-[10px] text-surface-400 flex-shrink-0">{vc.participants.length}</span>
                    )}
                    <span
                      onClick={(e) => { e.stopPropagation(); voice.deleteChannel(vc.id); }}
                      className="opacity-0 group-hover/vc:opacity-100 text-surface-500 hover:text-danger transition-all cursor-pointer p-0.5 rounded flex-shrink-0"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </span>
                  </button>

                  {/* Participantes — linha conectora reforça que pertencem a este canal */}
                  {vc.participants.length > 0 && (
                    <div className="pb-2 pl-[27px] pr-2">
                      <div className={`space-y-2 border-l-2 pl-3 ${isActive ? 'border-success/40' : 'border-surface-600'}`}>
                        {vc.participants.map((p) => {
                          const isSharing = isActive && voice.screenStreams.has(p.userId);
                          return (
                            <div key={p.userId} className="flex items-center gap-2">
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-semibold flex-shrink-0 ring-2 ${
                                  isActive ? 'ring-success/60' : 'ring-surface-600'
                                }`}
                                style={{ backgroundColor: getUserColor(p.username) }}
                              >
                                {p.avatarUrl ? (
                                  <img src={p.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                  getInitials(p.username)
                                )}
                              </div>
                              <span className="text-xs text-surface-100 font-medium truncate flex-1">{p.username}</span>
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
                </div>
              );
            }

            const ch = row.channel;
            const isPrimary = ch.id === group.channelId;
            const isActive = activeChannelId === ch.id;
            return (
              <div key={rowKey(row)} {...dragProps} className={`group/tc cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}>
                <button
                  onClick={() => onSelectChannel(ch.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'text-accent-300 bg-accent-600/15'
                      : 'text-surface-300 hover:bg-surface-700/60 hover:text-surface-100'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-sm truncate flex-1">{isPrimary ? 'geral' : ch.name}</span>
                  {!isPrimary && Number(ch.ownerId) === Number(currentUser?.id) && (
                    <span
                      onClick={(e) => { e.stopPropagation(); handleTextDelete(ch); }}
                      className="opacity-0 group-hover/tc:opacity-100 text-surface-500 hover:text-danger transition-all cursor-pointer p-0.5 rounded"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main layout ────────────────────────────────────────────

export function GroupLayout({ voice }: { voice: ReturnType<typeof useVoiceRoom> }) {
  const groups = useGroupStore((s) => s.groups);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const [collapsed, setCollapsed] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  // Reset active channel when group changes
  useEffect(() => {
    setActiveChannelId(activeGroup?.channelId ?? null);
  }, [activeGroupId, activeGroup?.channelId]);

  return (
    <>
      {/* ── Col 1: Channel sidebar (recolhível) ─────────────── */}
      <div
        className={`h-full flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200 ${
          collapsed ? 'w-0' : 'w-60'
        }`}
      >
        <ChannelSidebar
          group={activeGroup}
          voice={voice}
          activeChannelId={activeChannelId}
          onSelectChannel={setActiveChannelId}
        />
      </div>

      {/* ── Col 2: Main content ───────────────────────────── */}
      <GroupView
        channelId={activeChannelId}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        collapsed={collapsed}
      />

      {/* ── Col 3: Members ───────────────────────────────── */}
      <GroupMemberList />
    </>
  );
}
