import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayoutState {
  // Menus recolhíveis — cada um lembra o último estado escolhido pelo usuário
  navCollapsed: boolean;
  memberListCollapsed: boolean;

  // Ordem dos servidores (grupos) na barra da esquerda, escolhida por arrastar-e-soltar
  groupOrder: number[];

  setNavCollapsed: (v: boolean) => void;
  setMemberListCollapsed: (v: boolean) => void;
  moveGroup: (groupId: number, targetId: number, position: 'before' | 'after', allIds: number[]) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      navCollapsed: false,
      memberListCollapsed: false,
      groupOrder: [],

      setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
      setMemberListCollapsed: (memberListCollapsed) => set({ memberListCollapsed }),

      moveGroup: (groupId, targetId, position, allIds) => {
        if (groupId === targetId) return;
        const known = new Set(allIds);
        const order = get().groupOrder.filter((id) => known.has(id));
        for (const id of allIds) if (!order.includes(id)) order.push(id);

        const fromIdx = order.indexOf(groupId);
        let toIdx = order.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return;
        if (position === 'after') toIdx += 1;
        if (fromIdx < toIdx) toIdx -= 1;
        if (toIdx === fromIdx) return;

        const next = [...order];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        set({ groupOrder: next });
      },
    }),
    { name: 'zynk-layout' },
  ),
);

/** Aplica a ordem salva (groupOrder) sobre uma lista de grupos, jogando os novos/desconhecidos pro fim. */
export function applyGroupOrder<T extends { id: number }>(groups: T[], order: number[]): T[] {
  const known = order.filter((id) => groups.some((g) => g.id === id));
  const remaining = groups.filter((g) => !known.includes(g.id)).map((g) => g.id);
  const finalOrder = [...known, ...remaining];
  return finalOrder.map((id) => groups.find((g) => g.id === id)!).filter(Boolean);
}
