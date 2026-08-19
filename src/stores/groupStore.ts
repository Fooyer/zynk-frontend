import { create } from 'zustand';
import { groupsAPI } from '../services/api';
import type { Group, GroupMemberEntry } from '../types';

interface GroupState {
  groups: Group[];
  activeGroupId: number | null;
  members: GroupMemberEntry[];
  isLoading: boolean;

  loadGroups: () => Promise<void>;
  createGroup: (name: string, maxMembers?: number, features?: string[]) => Promise<Group>;
  renameGroup: (groupId: number, name: string) => Promise<void>;
  setGroupName: (groupId: number, name: string) => void;
  deleteGroup: (groupId: number) => Promise<void>;
  inviteMember: (groupId: number, userId: number) => Promise<void>;
  leaveGroup: (groupId: number) => Promise<void>;
  setActiveGroup: (groupId: number | null) => void;
  loadMembers: (groupId: number) => Promise<void>;
  getActiveGroup: () => Group | null;
  removeGroupFromState: (groupId: number) => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  activeGroupId: null,
  members: [],
  isLoading: false,

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
    set({ activeGroupId: groupId, members: [] });
    if (groupId) get().loadMembers(groupId);
  },

  loadMembers: async (groupId) => {
    const { data } = await groupsAPI.getMembers(groupId);
    set({ members: data });
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
}));
