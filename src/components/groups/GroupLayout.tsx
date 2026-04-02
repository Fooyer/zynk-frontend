import { useEffect, useState, useRef } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceRoom } from '../../hooks/useVoiceRoom';
import { GroupView } from './GroupView';
import { GroupMemberList } from './GroupMemberList';
import { CreateGroupModal } from './CreateGroupModal';
import { getUserColor } from '../../utils/formatDate';
import { groupsAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import type { PrivateChannel } from '../../types';

// ─── Group icon (left rail) ─────────────────────────────────

function GroupIcon({
  name,
  active,
  onClick,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  const initials = name.slice(0, 2).toUpperCase();
  const color = getUserColor(name);
  return (
    <div className="relative flex items-center group/icon">
      <span
        className={`absolute -left-3 w-1 rounded-r-full bg-surface-100 transition-all duration-150 ${
          active ? 'h-8' : 'h-0 group-hover/icon:h-4'
        }`}
      />
      <button
        onClick={onClick}
        className={`w-12 h-12 rounded-[50%] flex items-center justify-center text-white text-sm font-bold transition-all duration-150 flex-shrink-0 ${
          active ? 'rounded-[30%]' : 'hover:rounded-[30%]'
        }`}
        style={{ backgroundColor: color }}
        title={name}
      >
        {initials}
      </button>
    </div>
  );
}

// ─── Channel sidebar ────────────────────────────────────────

interface ChannelSidebarProps {
  group: { id: number; name: string; channelId: number | null; features: string[] } | null;
  voice: ReturnType<typeof useVoiceRoom>;
  activeChannelId: number | null;
  onSelectChannel: (id: number) => void;
}

function ChannelSidebar({ group, voice, activeChannelId, onSelectChannel }: ChannelSidebarProps) {
  const members = useGroupStore((s) => s.members);
  const currentUser = useAuthStore((s) => s.user);

  const [showVoiceCreate, setShowVoiceCreate] = useState(false);
  const [newVcName, setNewVcName] = useState('');
  const [newVcDesc, setNewVcDesc] = useState('');

  const [privateChannels, setPrivateChannels] = useState<PrivateChannel[]>([]);
  const [showPrivateCreate, setShowPrivateCreate] = useState(false);
  const [newPcName, setNewPcName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [pcError, setPcError] = useState<string | null>(null);

  const hasVoice = group?.features.includes('voice') ?? false;

  // Load private channels when group changes
  useEffect(() => {
    if (!group) { setPrivateChannels([]); return; }
    groupsAPI.getPrivateChannels(group.id).then(({ data }) => setPrivateChannels(data));
  }, [group?.id]);

  // Listen for new private channels from socket
  useEffect(() => {
    const socket = getSocket();
    const onCreated = (ch: PrivateChannel) => {
      if (ch.groupId === group?.id) {
        setPrivateChannels((prev) => prev.some((p) => p.id === ch.id) ? prev : [...prev, ch]);
      }
    };
    socket.on('private-channel:created', onCreated);
    return () => { socket.off('private-channel:created', onCreated); };
  }, [group?.id]);

  const handleVoiceCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVcName.trim()) return;
    voice.createChannel(newVcName.trim(), newVcDesc.trim() || undefined);
    setNewVcName('');
    setNewVcDesc('');
    setShowVoiceCreate(false);
  };

  const handlePrivateDelete = async (pc: PrivateChannel) => {
    if (!group) return;
    try {
      await groupsAPI.deletePrivateChannel(group.id, pc.id);
      setPrivateChannels((prev) => prev.filter((p) => p.id !== pc.id));
    } catch {}
  };

  const handlePrivateCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPcName.trim() || selectedMemberIds.length === 0 || !group) return;
    setPcError(null);
    try {
      const { data } = await groupsAPI.createPrivateChannel(group.id, newPcName.trim(), selectedMemberIds);
      setPrivateChannels((prev) => prev.some((p) => p.id === data.id) ? prev : [...prev, data]);
      onSelectChannel(data.id);
      setNewPcName('');
      setSelectedMemberIds([]);
      setShowPrivateCreate(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setPcError(Array.isArray(msg) ? msg[0] : (msg ?? 'Erro ao criar canal'));
    }
  };

  const toggleMember = (uid: number) => {
    setSelectedMemberIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  };

  if (!group) {
    return (
      <div className="w-60 bg-surface-800 border-r border-surface-700/50 flex flex-col flex-shrink-0">
        <div className="h-12 border-b border-surface-700/50 flex items-center px-4">
          <span className="text-sm font-semibold text-surface-500">Selecione um grupo</span>
        </div>
      </div>
    );
  }

  const otherMembers = members.filter((m) => Number(m.user.id) !== Number(currentUser?.id));

  return (
    <div className="w-60 bg-surface-800 border-r border-surface-700/50 flex flex-col flex-shrink-0 overflow-hidden">
      {/* Group name header */}
      <div className="h-12 border-b border-surface-700/50 flex items-center px-4 flex-shrink-0 shadow-sm">
        <h2 className="text-sm font-bold text-surface-100 truncate flex-1">{group.name}</h2>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        {/* Text channel — always there */}
        <div>
          <div className="flex items-center justify-between px-3 mb-0.5">
            <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest">Texto</span>
          </div>
          <div className="px-2">
            <button
              onClick={() => group.channelId && onSelectChannel(group.channelId)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                activeChannelId === group.channelId
                  ? 'text-accent-300 bg-accent-600/15'
                  : 'text-surface-400 hover:bg-surface-700/60 hover:text-surface-200'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-sm font-medium">geral</span>
            </button>
          </div>
        </div>

        {/* Private channels */}
        <div>
          <div className="flex items-center justify-between px-3 mb-0.5">
            <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest">Privados</span>
            <button
              onClick={() => { setShowPrivateCreate((s) => !s); setPcError(null); }}
              className="w-4 h-4 flex items-center justify-center text-surface-500 hover:text-surface-200 transition-colors"
              title="Criar canal privado"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          {showPrivateCreate && (
            <form onSubmit={handlePrivateCreate} className="px-2 mb-2 space-y-1">
              <input
                autoFocus
                type="text"
                value={newPcName}
                onChange={(e) => setNewPcName(e.target.value)}
                placeholder="nome do canal"
                maxLength={64}
                className="w-full px-2 py-1 bg-surface-700 border border-surface-600 rounded text-xs text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500"
              />
              <div className="max-h-28 overflow-y-auto space-y-0.5 rounded bg-surface-700/50 p-1">
                {otherMembers.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-surface-700">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(m.user.id)}
                      onChange={() => toggleMember(m.user.id)}
                      className="accent-accent-500"
                    />
                    <span className="text-xs text-surface-200 truncate">{m.user.username}</span>
                  </label>
                ))}
              </div>
              {pcError && <p className="text-[10px] text-red-400 px-1">{pcError}</p>}
              <div className="flex gap-1">
                <button
                  type="submit"
                  disabled={!newPcName.trim() || selectedMemberIds.length === 0}
                  className="flex-1 py-1 bg-accent-600 text-white text-xs rounded disabled:opacity-50 hover:bg-accent-500 transition-colors"
                >
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPrivateCreate(false); setPcError(null); }}
                  className="px-2 py-1 bg-surface-700 text-surface-400 text-xs rounded hover:bg-surface-600 transition-colors"
                >
                  ✕
                </button>
              </div>
            </form>
          )}

          <div className="px-2 space-y-0.5">
            {privateChannels.map((pc) => (
              <div key={pc.id} className="group/pc">
                <button
                  onClick={() => onSelectChannel(pc.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                    activeChannelId === pc.id
                      ? 'text-accent-300 bg-accent-600/15'
                      : 'text-surface-400 hover:bg-surface-700/60 hover:text-surface-200'
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span className="text-sm truncate flex-1">{pc.name}</span>
                  {Number(pc.ownerId) === Number(currentUser?.id) && (
                    <span
                      onClick={(e) => { e.stopPropagation(); handlePrivateDelete(pc); }}
                      className="opacity-0 group-hover/pc:opacity-100 text-surface-600 hover:text-red-400 transition-all cursor-pointer p-0.5 rounded"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </span>
                  )}
                </button>
              </div>
            ))}
            {!showPrivateCreate && (
              <button
                onClick={() => { setShowPrivateCreate(true); setPcError(null); }}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-surface-600 hover:text-surface-400 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Criar canal privado
              </button>
            )}
          </div>
        </div>

        {/* Voice channels */}
        {hasVoice && (
          <div>
            <div className="flex items-center justify-between px-3 mb-0.5">
              <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest">Voz</span>
              <button
                onClick={() => setShowVoiceCreate((s) => !s)}
                className="w-4 h-4 flex items-center justify-center text-surface-500 hover:text-surface-200 transition-colors"
                title="Criar canal de voz"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {showVoiceCreate && (
              <form onSubmit={handleVoiceCreate} className="px-2 mb-1 space-y-1">
                <input
                  autoFocus
                  type="text"
                  value={newVcName}
                  onChange={(e) => setNewVcName(e.target.value)}
                  placeholder="nome do canal"
                  maxLength={64}
                  className="w-full px-2 py-1 bg-surface-700 border border-surface-600 rounded text-xs text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500"
                />
                <input
                  type="text"
                  value={newVcDesc}
                  onChange={(e) => setNewVcDesc(e.target.value)}
                  placeholder="assunto (opcional)"
                  maxLength={255}
                  className="w-full px-2 py-1 bg-surface-700 border border-surface-600 rounded text-xs text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500"
                />
                <div className="flex gap-1">
                  <button type="submit" disabled={!newVcName.trim()} className="flex-1 py-1 bg-accent-600 text-white text-xs rounded disabled:opacity-50 hover:bg-accent-500 transition-colors">
                    Criar
                  </button>
                  <button type="button" onClick={() => setShowVoiceCreate(false)} className="px-2 py-1 bg-surface-700 text-surface-400 text-xs rounded hover:bg-surface-600 transition-colors">
                    ✕
                  </button>
                </div>
              </form>
            )}

            <div className="px-2 space-y-0.5">
              {voice.voiceChannels.map((vc) => {
                const isActive = voice.activeVcId === vc.id;
                return (
                  <div key={vc.id} className="group/vc">
                    <button
                      onClick={() => voice.join(vc)}
                      disabled={voice.isConnecting}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                        isActive
                          ? 'bg-green-900/30 text-green-300'
                          : 'text-surface-400 hover:bg-surface-700/60 hover:text-surface-200'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`flex-shrink-0 ${isActive ? 'text-green-400' : 'text-surface-600'}`}>
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm truncate">{vc.name}</div>
                        {vc.description && (
                          <div className="text-[10px] text-surface-500 truncate">{vc.description}</div>
                        )}
                      </div>
                      {vc.participants.length > 0 && (
                        <span className="text-[10px] text-surface-500 flex-shrink-0">{vc.participants.length}</span>
                      )}
                      <span
                        onClick={(e) => { e.stopPropagation(); voice.deleteChannel(vc.id); }}
                        className="opacity-0 group-hover/vc:opacity-100 text-surface-600 hover:text-red-400 transition-all cursor-pointer p-0.5 rounded flex-shrink-0"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </span>
                    </button>

                    {/* Description tooltip on hover */}
                    {vc.participants.map((p) => (
                      <div key={p.userId} className="flex items-center gap-2 pl-8 pr-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                        <span className="text-[11px] text-surface-500 truncate">{p.username}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {!showVoiceCreate && (
                <button
                  onClick={() => setShowVoiceCreate(true)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-surface-600 hover:text-surface-400 transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Criar canal de voz
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main layout ────────────────────────────────────────────

export function GroupLayout() {
  const loadGroups = useGroupStore((s) => s.loadGroups);
  const groups = useGroupStore((s) => s.groups);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);
  const [showCreate, setShowCreate] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  const voice = useVoiceRoom(activeGroupId ?? 0, activeGroup?.channelId ?? null);

  // Reset active channel when group changes
  useEffect(() => {
    setActiveChannelId(activeGroup?.channelId ?? null);
  }, [activeGroupId, activeGroup?.channelId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return (
    <>
      {/* ── Col 1: Group rail ─────────────────────────────── */}
      <div
        className={`bg-surface-900 flex flex-col items-center flex-shrink-0 overflow-hidden transition-all duration-200 ${
          collapsed ? 'w-0' : 'w-[72px]'
        }`}
      >
        <div className="w-[72px] flex flex-col items-center py-3 gap-2 h-full">
          <div className="flex flex-col items-center gap-2 flex-1 overflow-y-auto w-full px-3 overflow-x-hidden">
            {groups.map((g) => (
              <GroupIcon
                key={g.id}
                name={g.name}
                active={g.id === activeGroupId}
                onClick={() => setActiveGroup(g.id)}
              />
            ))}

            {groups.length > 0 && <div className="w-8 h-px bg-surface-700 my-1 flex-shrink-0" />}
            <button
              onClick={() => setShowCreate(true)}
              className="w-12 h-12 rounded-[50%] hover:rounded-[30%] bg-surface-700 hover:bg-green-700 flex items-center justify-center text-green-400 hover:text-white transition-all duration-150 flex-shrink-0"
              title="Criar grupo"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Col 2: Channel sidebar ────────────────────────── */}
      <ChannelSidebar
        group={activeGroup}
        voice={voice}
        activeChannelId={activeChannelId}
        onSelectChannel={setActiveChannelId}
      />

      {/* ── Col 3: Main content ───────────────────────────── */}
      <GroupView
        voice={voice}
        channelId={activeChannelId}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        collapsed={collapsed}
      />

      {/* ── Col 4: Members ───────────────────────────────── */}
      <GroupMemberList />

      <CreateGroupModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
