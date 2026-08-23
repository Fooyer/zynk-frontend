import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useGroupStore } from './groupStore';

interface LayoutState {
  // Menus recolhíveis — cada um lembra o último estado escolhido pelo usuário
  navCollapsed: boolean;
  // Roster de membros: um estado por servidor (não um boolean global) — entrar
  // num servidor que o usuário deixou recolhido deve vir já recolhido, sem
  // "herdar" o estado de qualquer outro servidor visitado antes.
  memberListCollapsedByGroup: Record<number, boolean>;

  // Ordem dos servidores (grupos) na barra da esquerda, escolhida por arrastar-e-soltar
  groupOrder: number[];

  // Modo cinema (compartilhamento de tela em foco) — nunca persiste entre
  // sessões (ver partialize abaixo). Recolhe nav/membros na "versão menor"
  // (mesmo docked que o usuário já usa manualmente) e guarda o estado de
  // antes pra restaurar exatamente ao sair, em vez de sempre voltar expandido.
  cinemaMode: boolean;
  prevNavCollapsed: boolean | null;
  prevMemberListCollapsed: boolean | null;
  prevMemberListGroupId: number | null;

  setNavCollapsed: (v: boolean) => void;
  setMemberListCollapsed: (groupId: number, v: boolean) => void;
  moveGroup: (groupId: number, targetId: number, position: 'before' | 'after', allIds: number[]) => void;
  enterCinemaMode: () => void;
  exitCinemaMode: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      navCollapsed: false,
      memberListCollapsedByGroup: {},
      groupOrder: [],
      cinemaMode: false,
      prevNavCollapsed: null,
      prevMemberListCollapsed: null,
      prevMemberListGroupId: null,

      setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
      setMemberListCollapsed: (groupId, collapsed) =>
        set((state) => ({
          memberListCollapsedByGroup: { ...state.memberListCollapsedByGroup, [groupId]: collapsed },
        })),

      enterCinemaMode: () => {
        if (get().cinemaMode) return; // idempotente — não sobrescreve o snapshot já guardado
        const groupId = useGroupStore.getState().activeGroupId;
        set({
          cinemaMode: true,
          prevNavCollapsed: get().navCollapsed,
          prevMemberListCollapsed: groupId != null ? (get().memberListCollapsedByGroup[groupId] ?? false) : null,
          prevMemberListGroupId: groupId,
          navCollapsed: true,
          memberListCollapsedByGroup:
            groupId != null
              ? { ...get().memberListCollapsedByGroup, [groupId]: true }
              : get().memberListCollapsedByGroup,
        });
      },

      exitCinemaMode: () => {
        if (!get().cinemaMode) return;
        const { prevNavCollapsed, prevMemberListCollapsed, prevMemberListGroupId } = get();
        set({
          cinemaMode: false,
          navCollapsed: prevNavCollapsed ?? false,
          memberListCollapsedByGroup:
            prevMemberListGroupId != null
              ? { ...get().memberListCollapsedByGroup, [prevMemberListGroupId]: prevMemberListCollapsed ?? false }
              : get().memberListCollapsedByGroup,
          prevNavCollapsed: null,
          prevMemberListCollapsed: null,
          prevMemberListGroupId: null,
        });
      },

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
    {
      name: 'zynk-layout',
      // Modo cinema é sempre transitório — nunca deve sobreviver a um
      // reinício do app (senão o usuário poderia abrir o app de novo com
      // o nav/membros presos recolhidos "sem motivo aparente").
      partialize: (state) => ({
        navCollapsed: state.navCollapsed,
        memberListCollapsedByGroup: state.memberListCollapsedByGroup,
        groupOrder: state.groupOrder,
      }),
    },
  ),
);

/** Aplica a ordem salva (groupOrder) sobre uma lista de grupos, jogando os novos/desconhecidos pro fim. */
export function applyGroupOrder<T extends { id: number }>(groups: T[], order: number[]): T[] {
  const known = order.filter((id) => groups.some((g) => g.id === id));
  const remaining = groups.filter((g) => !known.includes(g.id)).map((g) => g.id);
  const finalOrder = [...known, ...remaining];
  return finalOrder.map((id) => groups.find((g) => g.id === id)!).filter(Boolean);
}
