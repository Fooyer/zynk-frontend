import { create } from 'zustand';
import { groupsAPI } from '../services/api';
import { useUnreadStore } from './unreadStore';
import type { Group, GroupMemberEntry } from '../types';

interface GroupState {
  groups: Group[];
  activeGroupId: number | null;
  /** Canal de texto do grupo atualmente aberto (vive aqui, não como useState
   *  local de GroupLayout, pra que notification.ts e o unreadStore consigam
   *  saber qual canal de grupo está "ativo" de verdade. */
  activeChannelId: number | null;
  // Canal de texto que a PRÓXIMA troca de grupo deve abrir, em vez do canal
  // principal padrão — usado pelo prompt "Entrar agora" de eventos, que
  // precisa navegar pra um servidor E selecionar um canal específico ao
  // mesmo tempo (setActiveGroup() sozinho sempre reseta pro canal principal).
  pendingChannelId: number | null;
  members: GroupMemberEntry[];
  isLoading: boolean;
  isLoadingMembers: boolean;

  loadGroups: () => Promise<void>;
  createGroup: (name: string, maxMembers?: number, features?: string[]) => Promise<Group>;
  renameGroup: (groupId: number, name: string) => Promise<void>;
  setGroupName: (groupId: number, name: string) => void;
  deleteGroup: (groupId: number) => Promise<void>;
  inviteMember: (groupId: number, userId: number) => Promise<void>;
  leaveGroup: (groupId: number) => Promise<void>;
  setActiveGroup: (groupId: number | null) => void;
  setActiveChannelId: (channelId: number | null) => void;
  /** Chame ANTES de setActiveGroup — marca qual canal abrir assim que o grupo virar ativo. */
  setPendingChannelId: (channelId: number) => void;
  consumePendingChannelId: () => number | null;
  loadMembers: (groupId: number) => Promise<void>;
  getActiveGroup: () => Group | null;
  removeGroupFromState: (groupId: number) => void;
  /** Presença (online/offline/in_call) vem só do socket `user:status` — sem
   *  isso um membro ficava com o status de quando a lista foi carregada. */
  updateMemberStatus: (userId: number, status: GroupMemberEntry['user']['status']) => void;
  /** Username mudou nas Configurações de outro membro — reflete em todo
   *  lugar que guarda uma cópia (lista de membros ativa + grupos carregados). */
  updateMemberIdentity: (userId: number, username: string) => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  activeGroupId: null,
  activeChannelId: null,
  pendingChannelId: null,
  members: [],
  isLoading: false,
  isLoadingMembers: false,

  loadGroups: async () => {
    set({ isLoading: true });
    try {
      const { data } = await groupsAPI.list();
      set({ groups: data });
    } finally {
      set({ isLoading: false });
    }
  },

  createGroup: async (name, maxMembers, features) => {
    const { data } = await groupsAPI.create({ name, maxMembers, features });
    set((s) => ({ groups: [...s.groups, data] }));
    return data;
  },

  renameGroup: async (groupId, name) => {
    const { data } = await groupsAPI.update(groupId, name);
    set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, name: data.name } : g)) }));
  },

  setGroupName: (groupId, name) => {
    set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) }));
  },

  deleteGroup: async (groupId) => {
    await groupsAPI.delete(groupId);
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== groupId),
      activeGroupId: s.activeGroupId === groupId ? null : s.activeGroupId,
    }));
  },

  inviteMember: async (groupId, userId) => {
    await groupsAPI.invite(groupId, userId);
    await get().loadMembers(groupId);
  },

  leaveGroup: async (groupId) => {
    await groupsAPI.leave(groupId);
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== groupId),
      activeGroupId: s.activeGroupId === groupId ? null : s.activeGroupId,
    }));
  },

  setActiveGroup: (groupId) => {
    set({ activeGroupId: groupId, activeChannelId: null, members: [] });
    if (groupId) get().loadMembers(groupId);
  },

  setActiveChannelId: (channelId) => {
    set({ activeChannelId: channelId });
    if (channelId) useUnreadStore.getState().clear(channelId);
  },

  setPendingChannelId: (channelId) => set({ pendingChannelId: channelId }),

  consumePendingChannelId: () => {
    const id = get().pendingChannelId;
    if (id !== null) set({ pendingChannelId: null });
    return id;
  },

  loadMembers: async (groupId) => {
    set({ isLoadingMembers: true });
    try {
      const { data } = await groupsAPI.getMembers(groupId);
      set({ members: data });
    } finally {
      set({ isLoadingMembers: false });
    }
  },

  getActiveGroup: () => {
    const { groups, activeGroupId } = get();
    return groups.find((g) => g.id === activeGroupId) || null;
  },

  removeGroupFromState: (groupId) => {
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== groupId),
      activeGroupId: s.activeGroupId === groupId ? null : s.activeGroupId,
    }));
  },

  updateMemberStatus: (userId, status) => {
    set((s) => ({
      members: s.members.map((m) =>
        Number(m.user.id) === Number(userId) ? { ...m, user: { ...m.user, status } } : m,
      ),
      groups: s.groups.map((g) => ({
        ...g,
        members: g.members?.map((m) =>
          Number(m.user.id) === Number(userId) ? { ...m, user: { ...m.user, status } } : m,
        ),
      })),
    }));
  },

  updateMemberIdentity: (userId, username) => {
    set((s) => ({
      members: s.members.map((m) =>
        Number(m.user.id) === Number(userId) ? { ...m, user: { ...m.user, username } } : m,
      ),
      groups: s.groups.map((g) => ({
        ...g,
        owner: Number(g.owner.id) === Number(userId) ? { ...g.owner, username } : g.owner,
        members: g.members?.map((m) =>
          Number(m.user.id) === Number(userId) ? { ...m, user: { ...m.user, username } } : m,
        ),
      })),
    }));
  },
}));
