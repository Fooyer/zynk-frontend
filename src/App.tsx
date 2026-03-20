import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useChannelStore } from './stores/channelStore';
import { useChatStore } from './stores/chatStore';
import { useSocket } from './hooks/useSocket';
import { Sidebar } from './components/layout/Sidebar';
import { ChatArea } from './components/layout/ChatArea';
import { MemberList } from './components/layout/MemberList';
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';

function TitleBar() {
  return (
    <div className="h-9 flex-shrink-0 bg-surface-900 drag-region flex items-center px-4 border-b border-surface-700/50">
      <span className="text-xs font-semibold text-surface-500 no-drag select-none">ChatApp</span>
    </div>
  );
}

function AppLayout() {
  const loadChannels = useChannelStore((s) => s.loadChannels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const loadMessages = useChatStore((s) => s.loadMessages);

  // Conecta os eventos do socket às stores
  useSocket();

  // Carrega canais ao montar
  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Carrega mensagens quando muda o canal ativo
  useEffect(() => {
    if (activeChannelId) {
      loadMessages(activeChannelId);
    }
  }, [activeChannelId, loadMessages]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <ChatArea />
        <MemberList />
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
