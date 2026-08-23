import { useEffect } from 'react';
import { useContextMenuStore } from '../../stores/contextMenuStore';

/**
 * Renderiza o menu de contexto ativo (grupo, canal, mensagem...) e fecha em
 * clique fora ou Esc. Montado uma vez na raiz — os componentes só chamam
 * contextMenuStore.open(pos, content), nunca desenham o próprio menu.
 */
export function ContextMenuHost() {
  const request = useContextMenuStore((s) => s.request);
  const close = useContextMenuStore((s) => s.close);

  useEffect(() => {
    if (!request) return;
    const handleClick = () => close();
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [request, close]);

  if (!request) return null;

  return (
    <div
      style={{ top: request.pos.y, left: request.pos.x }}
      className="fixed z-50 zk-elevated rounded-xl p-1 min-w-[160px] animate-menu-in origin-top-left"
      onClick={(e) => e.stopPropagation()}
    >
      {request.content}
    </div>
  );
}
