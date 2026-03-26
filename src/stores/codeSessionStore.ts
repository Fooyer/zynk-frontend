import { create } from 'zustand';
import { codeSessionsAPI } from '../services/api';
import type { CodeSession, CodeSessionFileEntry } from '../types';

export interface TunnelInfo {
  folderName: string;
  userId: number;
  username: string;
}

interface CodeSessionState {
  activeSession: CodeSession | null;
  activeFileId: number | null;
  isLoading: boolean;
  tunnelInfo: TunnelInfo | null;

  createSession: (groupId: number, title: string) => Promise<CodeSession>;
  joinSession: (sessionId: number) => Promise<void>;
  leaveSession: (sessionId: number) => Promise<void>;
  endSession: (sessionId: number) => Promise<void>;
  loadActiveSession: (groupId: number) => Promise<void>;
  setActiveSession: (session: CodeSession | null) => void;
  setActiveFile: (fileId: number | null) => void;
  setTunnelInfo: (info: TunnelInfo | null) => void;
  saveFile: (sessionId: number, filename: string, language: string, content: string) => Promise<void>;
  addFile: (file: CodeSessionFileEntry) => void;
}

export const useCodeSessionStore = create<CodeSessionState>((set, get) => ({
  activeSession: null,
  activeFileId: null,
  isLoading: false,
  tunnelInfo: null,

  createSession: async (groupId, title) => {
    const { data } = await codeSessionsAPI.create({ groupId, title });
    set({ activeSession: data, activeFileId: null, tunnelInfo: null });
    return data;
  },

  joinSession: async (sessionId) => {
    await codeSessionsAPI.join(sessionId);
    const { data } = await codeSessionsAPI.get(sessionId);
    set({ activeSession: data });
  },

  leaveSession: async (sessionId) => {
    await codeSessionsAPI.leave(sessionId);
    set({ activeSession: null, activeFileId: null, tunnelInfo: null });
  },

  endSession: async (sessionId) => {
    await codeSessionsAPI.end(sessionId);
    set({ activeSession: null, activeFileId: null, tunnelInfo: null });
  },

  loadActiveSession: async (groupId) => {
    set({ isLoading: true });
    try {
      const { data } = await codeSessionsAPI.getActive(groupId);
      set({ activeSession: data && data.id ? data : null });
    } catch {
      set({ activeSession: null });
    } finally {
      set({ isLoading: false });
    }
  },

  setActiveSession: (session) => set({ activeSession: session }),
  setActiveFile: (fileId) => set({ activeFileId: fileId }),
  setTunnelInfo: (info) => set({ tunnelInfo: info }),

  saveFile: async (sessionId, filename, language, content) => {
    await codeSessionsAPI.saveFile(sessionId, { filename, language, content });
  },

  addFile: (file) => {
    const session = get().activeSession;
    if (!session) return;
    set({
      activeSession: {
        ...session,
        files: [...session.files, file],
      },
    });
  },
}));
