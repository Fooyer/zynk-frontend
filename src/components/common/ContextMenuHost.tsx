import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useContextMenuStore } from '../../stores/contextMenuStore';

/**
 * Renderiza o menu de contexto ativo (grupo, canal, mensagem...) e fecha em
 * clique fora ou Esc. Montado uma vez na raiz — os componentes só chamam
 * contextMenuStore.open(pos, content), nunca desenham o próprio menu.
 */
export function ContextMenuHost() {
  const request = useContextMenuStore((s) => s.request);
  const close = useContextMenuStore((s) => s.close);
  const menuRef = useRef<HTMLDivElement>(null);
  // Posição final (já corrigida pra caber na tela) — null enquanto ainda não
  // medimos o menu real (primeiro frame), pra não flashar no canto errado
  // antes de corrigir.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

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

  // Mede o menu depois de renderizado (tamanho real varia por conteúdo) e
  // corrige left/top pra ele nunca ultrapassar a borda direita/inferior da
  // janela — sem isso, abrir perto da borda cortava o menu pra fora da tela.
  useLayoutEffect(() => {
    if (!request) { setPos(null); return; }
    const el = menuRef.current;
    if (!el) return;
    const margin = 8;
    const { offsetWidth: w, offsetHeight: h } = el;
    let left = request.pos.x;
    let top = request.pos.y;
    if (left + w > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - margin - w);
    if (top + h > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - margin - h);
    setPos({ left, top });
  }, [request]);

  if (!request) return null;

  const style: React.CSSProperties = pos
    ? { top: pos.top, left: pos.left }
    // Primeiro frame (ainda sem medição) — invisível na posição bruta, só
    // pra existir no DOM e o useLayoutEffect acima conseguir medir.
    : { top: request.pos.y, left: request.pos.x, visibility: 'hidden' };

  return (
    <div
      ref={menuRef}
      style={style}
      className="fixed z-50 zk-elevated rounded-xl p-1 min-w-[160px] animate-menu-in origin-top-left"
      onClick={(e) => e.stopPropagation()}
    >
      {request.content}
    </div>
  );
}
