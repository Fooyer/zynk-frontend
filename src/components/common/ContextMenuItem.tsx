// ─── Padrãozinho de menu de contexto ────────────────────────
// Item + cabeçalho reutilizados em todo canto que abre um menu de contexto
// (grupo, canal, mensagem...) via contextMenuStore, pra não ter cada tela
// desenhando o próprio botão com espaçamento/tamanho diferente.

export function ContextMenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
        danger ? 'text-danger hover:bg-danger/10' : 'text-surface-200 hover:bg-surface-700'
      }`}
    >
      {icon && <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">{icon}</span>}
      <span className="flex-1 text-left truncate">{label}</span>
    </button>
  );
}

export function ContextMenuHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-1 pb-1.5 mb-1 border-b border-surface-700/50">
      <p className="text-[12px] font-semibold text-surface-100 truncate">{children}</p>
    </div>
  );
}

export function ContextMenuHint({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-1.5 text-[11px] text-surface-500">{children}</p>;
}
