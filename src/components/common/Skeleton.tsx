// ─── Skeletons ──────────────────────────────────────────────
// Placeholders com o formato aproximado do conteúdo final, pra loading não
// ser um "pop" brusco de vazio → conteúdo. `Skeleton` é o bloco base
// (retângulo/círculo pulsando); o resto daqui compõe layouts específicos
// de cada tela que tem uma janela de loading perceptível.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-700/50 ${className}`} />;
}

function AvatarLineRow({ lines = 2, avatarSize = 'w-8 h-8' }: { lines?: 1 | 2; avatarSize?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <Skeleton className={`${avatarSize} rounded-full flex-shrink-0`} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3 w-2/3 rounded" />
        {lines === 2 && <Skeleton className="h-2.5 w-1/3 rounded" />}
      </div>
    </div>
  );
}

/** Lista de mensagens (chat de grupo ou DM) — bolhas alternando lado/largura. */
export function MessageListSkeleton() {
  const widths = ['w-1/3', 'w-1/2', 'w-2/5', 'w-1/4', 'w-2/3', 'w-1/3'];
  return (
    <div className="flex-1 px-4 py-4 space-y-5">
      {widths.map((w, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-2.5 w-24 rounded" />
            <Skeleton className={`h-3.5 ${w} rounded`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lista de canais (texto/voz) dentro de um grupo. */
export function ChannelListSkeleton() {
  return (
    <div className="px-2 space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="w-3.5 h-3.5 rounded flex-shrink-0" />
          <Skeleton className={`h-3 rounded ${i % 2 === 0 ? 'w-24' : 'w-16'}`} />
        </div>
      ))}
    </div>
  );
}

/** Lista de membros de um grupo. */
export function MemberListSkeleton() {
  return (
    <div className="px-1 pt-2">
      <Skeleton className="h-2.5 w-16 rounded ml-2 mb-2" />
      {Array.from({ length: 4 }).map((_, i) => (
        <AvatarLineRow key={i} lines={1} avatarSize="w-7 h-7" />
      ))}
    </div>
  );
}

/** Lista de conversas diretas (DMs). */
export function DMListSkeleton() {
  return (
    <div className="px-2 space-y-0.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <AvatarLineRow key={i} />
      ))}
    </div>
  );
}

/** Grade de cards de amigos (FriendsPage). */
export function FriendGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[0.07] bg-surface-800/60 p-3 flex items-center gap-3">
          <Skeleton className="w-11 h-11 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3.5 w-2/3 rounded" />
            <Skeleton className="h-2.5 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Rail de servidores/grupos (NavBar), variantes recolhida e expandida. */
export function GroupRailSkeleton({ collapsed }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="w-9 h-9 rounded-xl flex-shrink-0" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2.5 py-2">
          <Skeleton className="w-6 h-6 rounded-md flex-shrink-0" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Board do Kanban — 3 colunas com alguns cards. */
export function KanbanSkeleton() {
  return (
    <div className="flex-1 flex gap-4 p-4 overflow-hidden">
      {Array.from({ length: 3 }).map((_, col) => (
        <div key={col} className="flex-1 min-w-[240px] max-w-sm space-y-3">
          <Skeleton className="h-3 w-20 rounded" />
          {Array.from({ length: col === 1 ? 3 : 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-white/[0.06] bg-surface-800/60 p-3 space-y-2">
              <Skeleton className="h-3.5 w-4/5 rounded" />
              <Skeleton className="h-2.5 w-1/2 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Grade de miniaturas do seletor de tela/janela pra compartilhar. */
export function ScreenPickerSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="w-full aspect-video rounded-lg" />
      ))}
    </div>
  );
}

/** Editor de notas — algumas linhas de texto. */
export function NotesSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-3">
      <Skeleton className="h-3.5 w-3/4 rounded" />
      <Skeleton className="h-3.5 w-1/2 rounded" />
      <Skeleton className="h-3.5 w-5/6 rounded" />
      <Skeleton className="h-3.5 w-2/3 rounded" />
    </div>
  );
}

/** Casca do app inteiro — usada só no boot (antes de saber se está logado). */
export function AppShellSkeleton() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-950">
      <div className="h-9 flex-shrink-0 bg-surface-900 border-b border-white/[0.06]" />
      <div className="flex-1 flex gap-2 p-2 overflow-hidden">
        <div className="w-60 zk-surface shadow-panel rounded-2xl flex flex-col flex-shrink-0 p-3 overflow-hidden">
          <GroupRailSkeleton />
        </div>
        <div className="flex-1 flex flex-col zk-surface shadow-panel rounded-2xl overflow-hidden">
          <div className="h-12 border-b border-white/[0.06] flex-shrink-0 flex items-center px-4">
            <Skeleton className="h-4 w-32 rounded" />
          </div>
          <MessageListSkeleton />
        </div>
      </div>
    </div>
  );
}
