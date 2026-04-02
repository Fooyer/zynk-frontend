import { useEffect, useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useVoiceRoom } from '../../hooks/useVoiceRoom';
import { GroupView } from './GroupView';
import { GroupMemberList } from './GroupMemberList';
import { CreateGroupModal } from './CreateGroupModal';
import { getUserColor } from '../../utils/formatDate';
import type { VoiceChannel } from '../../types';

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
      {/* Active pill */}
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
  onCreateGroup: () => void;
}

function ChannelSidebar({ group, voice, onCreateGroup }: ChannelSidebarProps) {
  const [showVoiceCreate, setShowVoiceCreate] = useState(false);
  const [newVcName, setNewVcName] = useState('');
  const hasVoice = group?.features.includes('voice') ?? false;

  const handleVoiceCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVcName.trim()) return;
    voice.createChannel(newVcName.trim());
    setNewVcName('');
    setShowVoiceCreate(false);
  };

  if (!group) {
    return (
      <div className="w-60 bg-surface-850 border-r border-surface-700/50 flex flex-col flex-shrink-0">
        <div className="h-12 border-b border-surface-700/50 flex items-center px-4">
          <span className="text-sm font-semibold text-surface-500">Selecione um grupo</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 bg-surface-850 border-r border-surface-700/50 flex flex-col flex-shrink-0 overflow-hidden">
      {/* Group name header */}
      <div className="h-12 border-b border-surface-700/50 flex items-center px-4 flex-shrink-0 shadow-sm">
        <h2 className="text-sm font-bold text-surface-100 truncate flex-1">{group.name}</h2>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        {/* Text channel — always there */}
        <div>
          <div className="flex items-center justify-between px-3 mb-0.5">
            <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest">
              Texto
            </span>
          </div>
          <div className="px-2">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded text-accent-300 bg-accent-600/15">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-accent-400">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-sm font-medium">geral</span>
            </div>
          </div>
        </div>

        {/* Voice channels */}
        {hasVoice && (
          <div>
            <div className="flex items-center justify-between px-3 mb-0.5 group/hdr">
              <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest">
                Voz
              </span>
              <button
                onClick={() => setShowVoiceCreate((s) => !s)}
                className="opacity-0 group-hover/hdr:opacity-100 w-4 h-4 flex items-center justify-center text-surface-500 hover:text-surface-200 transition-all"
                title="Criar canal de voz"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {showVoiceCreate && (
              <form onSubmit={handleVoiceCreate} className="px-2 mb-1 flex gap-1">
                <input
                  autoFocus
                  type="text"
                  value={newVcName}
                  onChange={(e) => setNewVcName(e.target.value)}
                  placeholder="nome do canal"
                  maxLength={64}
                  className="flex-1 px-2 py-1 bg-surface-700 border border-surface-600 rounded text-xs text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500"
                />
                <button type="submit" disabled={!newVcName.trim()} className="px-2 py-1 bg-accent-600 text-white text-xs rounded disabled:opacity-50 hover:bg-accent-500 transition-colors">
                  OK
                </button>
              </form>
            )}

            <div className="px-2 space-y-0.5">
              {voice.voiceChannels.length === 0 && !showVoiceCreate && (
                <button
                  onClick={() => setShowVoiceCreate(true)}
                  className="w-full text-left px-2 py-1 text-[11px] text-surface-600 hover:text-surface-400 transition-colors"
                >
                  + Criar canal de voz
                </button>
              )}

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
                      <span className="flex-1 text-sm truncate">{vc.name}</span>
                      {vc.participants.length > 0 && (
                        <span className="text-[10px] text-surface-500">{vc.participants.length}</span>
                      )}
                      <span
                        onClick={(e) => { e.stopPropagation(); voice.deleteChannel(vc.id); }}
                        className="opacity-0 group-hover/vc:opacity-100 text-surface-600 hover:text-red-400 transition-all cursor-pointer p-0.5 rounded"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </span>
                    </button>

                    {/* Participants in channel */}
                    {vc.participants.map((p) => (
                      <div key={p.userId} className="flex items-center gap-2 pl-8 pr-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                        <span className="text-[11px] text-surface-500 truncate">{p.username}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
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

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  const voice = useVoiceRoom(activeGroupId ?? 0, activeGroup?.channelId ?? null);

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
          {/* Groups */}
          <div className="flex flex-col items-center gap-2 flex-1 overflow-y-auto w-full px-3 overflow-x-hidden">
            {groups.map((g) => (
              <GroupIcon
                key={g.id}
                name={g.name}
                active={g.id === activeGroupId}
                onClick={() => setActiveGroup(g.id)}
              />
            ))}

            {/* Divider + create */}
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
        onCreateGroup={() => setShowCreate(true)}
      />

      {/* ── Col 3: Main content ───────────────────────────── */}
      <GroupView voice={voice} onToggleCollapse={() => setCollapsed((c) => !c)} collapsed={collapsed} />

      {/* ── Col 4: Members ───────────────────────────────── */}
      <GroupMemberList />

      <CreateGroupModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
