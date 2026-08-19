import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useFriendStore } from './stores/friendStore';
import { useGroupStore } from './stores/groupStore';
import { useUiStore } from './stores/uiStore';
import { useCallStore } from './stores/callStore';
import { useSocket } from './hooks/useSocket';
import { useVoiceRoom } from './hooks/useVoiceRoom';
import { ActiveCallOverlay } from './components/call/ActiveCallOverlay';
import { NavBar } from './components/layout/NavBar';
import { HomeLayout } from './components/home/HomeLayout';
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { CallManager } from './components/call/CallManager';
import { SettingsPage } from './components/settings/SettingsPage';
import { GroupLayout } from './components/groups/GroupLayout';
import { DialogHost } from './components/common/DialogHost';
import { ContextMenuHost } from './components/common/ContextMenuHost';
import { AppShellSkeleton } from './components/common/Skeleton';


function TitleBar() {
  const isLinux = window.electronAPI?.platform === 'linux';

  return (
    <div className="h-9 flex-shrink-0 bg-surface-900 drag-region flex items-center gap-2 px-4 border-b border-white/[0.06]">
      <span className="w-1.5 h-1.5 rounded-full bg-accent-500 shadow-glow-accent-sm animate-pulse no-drag select-none" />
      <span className="text-xs font-semibold text-surface-400 uppercase tracking-[0.2em] no-drag select-none">Zynk</span>
      {isLinux && (
        <div className="ml-auto flex items-center no-drag">
          <button
            onClick={() => window.electronAPI?.windowMinimize()}
            className="w-9 h-9 flex items-center justify-center text-surface-400 hover:text-surface-100 hover:bg-white/[0.06] transition-colors"
            title="Minimizar"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="0" y="5.5" width="12" height="1" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI?.windowMaximize()}
            className="w-9 h-9 flex items-center justify-center text-surface-400 hover:text-surface-100 hover:bg-white/[0.06] transition-colors"
            title="Maximizar"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="10" height="10" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI?.windowClose()}
            className="w-9 h-9 flex items-center justify-center text-surface-400 hover:text-white hover:bg-danger transition-colors"
            title="Fechar"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function AppLayout() {
  const view = useUiStore((s) => s.view);
  const loadFriends = useFriendStore((s) => s.loadAll);
  const loadDmChannels = useFriendStore((s) => s.loadDmChannels);
  const loadGroups = useGroupStore((s) => s.loadGroups);
  const groups = useGroupStore((s) => s.groups);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const callStatus = useCallStore((s) => s.status);
  const activeDmChannelId = useFriendStore((s) => s.activeDmChannelId);
  const callChannelId = useCallStore((s) => s.channelId);

  useSocket();

  // Montado aqui (não dentro de GroupLayout) pra sobreviver à navegação —
  // trocar de tela não deve derrubar uma chamada de voz em andamento.
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  const voice = useVoiceRoom(activeGroupId ?? 0, activeGroup?.channelId ?? null);

  useEffect(() => {
    loadFriends();
    loadDmChannels();
    loadGroups();
  }, [loadFriends, loadDmChannels, loadGroups]);

  // A barra flutuante só aparece quando a chamada está ativa e o usuário
  // não está olhando para a própria conversa (que já tem os controles inline).
  const showFloatingCall =
    callStatus !== 'idle' && !(view === 'home' && activeDmChannelId === callChannelId);

  return (
    <div className="window-shell h-screen flex flex-col overflow-hidden bg-surface-950">
      <TitleBar />
      {/* Cada seção principal (nav, conteúdo) é seu próprio painel flutuante com
          cantos arredondados e um respiro entre elas — em vez de coladas com só
          uma linha de borda — pra reforçar a leitura "módulos de HUD" do tema. */}
      <div className="flex-1 flex gap-2 p-2 overflow-hidden">
        <NavBar />
        {view === 'settings' ? <SettingsPage /> : view === 'group' ? <GroupLayout voice={voice} /> : <HomeLayout voice={voice} />}
      </div>
      <CallManager />
      {showFloatingCall && <ActiveCallOverlay />}
      <DialogHost />
      <ContextMenuHost />
    </div>
  );
}

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  return (
    <div className="window-shell h-screen flex flex-col bg-surface-950">
      <TitleBar />
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* Glow decorativo atrás do card — dá profundidade ao fundo sólido sem sair do preto/cinza */}
        <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-accent-500/[0.07] blur-[120px]" />
        {isLogin ? (
          <LoginForm onSwitch={() => setIsLogin(false)} />
        ) : (
          <RegisterForm onSwitch={() => setIsLogin(true)} />
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { token, isLoading, loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading) {
      const splash = document.getElementById('splash');
      if (splash) {
        splash.classList.add('fade-out');
        setTimeout(() => splash.remove(), 300);
      }
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="window-shell">
        <AppShellSkeleton />
      </div>
    );
  }

  return token ? <AppLayout /> : <AuthScreen />;
}
