import { useUiStore } from '../../stores/uiStore';
import { useFriendStore } from '../../stores/friendStore';

export function NavBar() {
  const { view, setView } = useUiStore();
  const pendingRequests = useFriendStore((s) => s.requests.length);

  return (
    <nav className="w-[72px] bg-surface-950 flex flex-col items-center py-3 gap-2 flex-shrink-0 border-r border-surface-800">
      {/* Home / DMs */}
      <button
        onClick={() => setView('home')}
        title="Início"
        className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          view === 'home'
            ? 'bg-accent-600 rounded-[16px] text-white'
            : 'bg-surface-700 text-surface-300 hover:bg-accent-600 hover:text-white hover:rounded-[16px]'
        }`}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
        {pendingRequests > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger rounded-full text-white text-xs font-bold flex items-center justify-center border-2 border-surface-950">
            {pendingRequests > 9 ? '9+' : pendingRequests}
          </span>
        )}
      </button>

      {/* Divider */}
      <div className="w-8 h-px bg-surface-700 my-1" />

      {/* Server (canais) */}
      <button
        onClick={() => setView('server')}
        title="Servidor"
        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          view === 'server'
            ? 'bg-accent-600 rounded-[16px] text-white'
            : 'bg-surface-700 text-surface-300 hover:bg-accent-600 hover:text-white hover:rounded-[16px]'
        }`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      {/* Settings — fixo no fundo */}
      <div className="mt-auto">
        <button
          onClick={() => setView('settings')}
          title="Configurações"
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 ${
            view === 'settings'
              ? 'bg-accent-600 rounded-[16px] text-white'
              : 'bg-surface-700 text-surface-300 hover:bg-accent-600 hover:text-white hover:rounded-[16px]'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
