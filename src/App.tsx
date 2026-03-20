import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useChannelStore } from './stores/channelStore';
import { useChatStore } from './stores/chatStore';
import { useFriendStore } from './stores/friendStore';
import { useUiStore } from './stores/uiStore';
import { useSocket } from './hooks/useSocket';
import { NavBar } from './components/layout/NavBar';
import { Sidebar } from './components/layout/Sidebar';
import { ChatArea } from './components/layout/ChatArea';
import { MemberList } from './components/layout/MemberList';
import { HomeLayout } from './components/home/HomeLayout';
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;
    };
  }
}

function TitleBar() {
  const isLinux = window.electronAPI?.platform === 'linux';

  return (
    <div className="h-9 flex-shrink-0 bg-surface-900 drag-region flex items-center px-4 border-b border-surface-700/50">
      <span className="text-xs font-semibold text-surface-500 no-drag select-none">Zynk</span>
      {isLinux && (
        <div className="ml-auto flex items-center no-drag">
          <button
            onClick={() => window.electronAPI?.windowMinimize()}
            className="w-9 h-9 flex items-center justify-center text-surface-400 hover:text-surface-100 hover:bg-surface-700 transition-colors"
            title="Minimizar"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="0" y="5.5" width="12" height="1" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI?.windowMaximize()}
            className="w-9 h-9 flex items-center justify-center text-surface-400 hover:text-surface-100 hover:bg-surface-700 transition-colors"
            title="Maximizar"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="10" height="10" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI?.windowClose()}
            className="w-9 h-9 flex items-center justify-center text-surface-400 hover:text-white hover:bg-red-600 transition-colors"
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

function ServerLayout() {
  const loadChannels = useChannelStore((s) => s.loadChannels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const loadMessages = useChatStore((s) => s.loadMessages);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (activeChannelId) loadMessages(activeChannelId);
  }, [activeChannelId, loadMessages]);

  return (
    <>
      <Sidebar />
      <ChatArea />
      <MemberList />
    </>
  );
}

function AppLayout() {
  const view = useUiStore((s) => s.view);
  const loadFriends = useFriendStore((s) => s.loadAll);
  const loadDmChannels = useFriendStore((s) => s.loadDmChannels);

  useSocket();

  useEffect(() => {
    loadFriends();
    loadDmChannels();
  }, [loadFriends, loadDmChannels]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <NavBar />
        {view === 'home' ? <HomeLayout /> : <ServerLayout />}
      </div>
    </div>
  );
}

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  return (
    <div className="h-screen flex flex-col bg-surface-950">
      <TitleBar />
      <div className="flex-1 flex items-center justify-center">
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

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col bg-surface-950">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-surface-400 text-sm">Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  return token ? <AppLayout /> : <AuthScreen />;
}
