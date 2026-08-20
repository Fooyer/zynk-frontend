// ─── Padrãozinho de menu de contexto ────────────────────────
// Item + cabeçalho reutilizados em todo canto que abre um menu de contexto
// (grupo, canal, mensagem...) via contextMenuStore, pra não ter cada tela
// desenhando o próprio botão com espaçamento/tamanho diferente.

export function ContextMenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-[13px] transition-colors ${
        disabled
          ? 'text-surface-600 cursor-not-allowed'
          : danger
            ? 'text-danger hover:bg-danger/10'
            : 'text-surface-200 hover:bg-white/[0.06]'
      }`}
    >
      {icon && <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">{icon}</span>}
      <span className="flex-1 text-left truncate">{label}</span>
    </button>
  );
}

export function ContextMenuHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-0.5 pb-1 mb-0.5 border-b border-white/[0.06]">
      <p className="text-[12px] font-semibold text-surface-100 truncate">{children}</p>
    </div>
  );
}

export function ContextMenuHint({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-1 text-[11px] text-surface-500">{children}</p>;
}

export function ContextMenuSeparator() {
  return <div className="h-px bg-white/[0.06] my-1" />;
}
