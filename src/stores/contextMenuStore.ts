import { create } from 'zustand';
import type { ReactNode } from 'react';

interface ContextMenuRequest {
  pos: { x: number; y: number };
  content: ReactNode;
}

interface ContextMenuState {
  request: ContextMenuRequest | null;
  open: (pos: { x: number; y: number }, content: ReactNode) => void;
  close: () => void;
}

/**
 * Estado global único para menus de contexto (grupo, canal, mensagem...).
 * Como só existe um `request` por vez, abrir um novo automaticamente
 * substitui — e portanto fecha — o que estava aberto antes, mesmo vindo
 * de um componente completamente diferente.
 */
export const useContextMenuStore = create<ContextMenuState>((set) => ({
  request: null,
  open: (pos, content) => set({ request: { pos, content } }),
  close: () => set({ request: null }),
}));
