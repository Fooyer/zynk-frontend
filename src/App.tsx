import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useFriendStore } from './stores/friendStore';
import { useGroupStore } from './stores/groupStore';
import { useUiStore } from './stores/uiStore';
import { useThemeStore } from './stores/themeStore';
import { generateAccentRamp, mixHex, rgbTriple } from './utils/color';
import { PRESET_RAMPS } from './utils/accentPresets';
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
import { UpdateToast } from './components/common/UpdateToast';
import { AppShellSkeleton } from './components/common/Skeleton';


function TitleBar() {
  // Botões de controle da janela são sempre os nossos (React + IPC) em vez do
  // overlay nativo do Electron — funcionam igual em Windows e Linux e evitam
  // o titleBarOverlay nativo, que fica pouco confiável combinado com a
  // transparência que o Linux precisa para o arredondado via CSS. No macOS os
  // "traffic lights" nativos já aparecem sozinhos (titleBarStyle:'hidden'),
  // então não duplicamos botões lá.
  const platform = window.electronAPI?.platform;
  const showWindowControls = !!window.electronAPI && platform !== 'darwin';

  return (
    <div className="h-9 flex-shrink-0 bg-surface-900 drag-region flex items-center gap-2 px-4 border-b border-white/[0.06]">
      <span className="w-1.5 h-1.5 rounded-full bg-accent-500 shadow-glow-accent-sm animate-pulse no-drag select-none" />
      <span className="text-xs font-semibold text-surface-400 uppercase tracking-[0.2em] no-drag select-none">Zynk</span>
      {showWindowControls && (
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
      <UpdateToast />
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
  const mode = useThemeStore((s) => s.mode);
  const accentMode = useThemeStore((s) => s.accentMode);
  const accentPreset = useThemeStore((s) => s.accentPreset);
  const customColor = useThemeStore((s) => s.customColor);
  const gradientFrom = useThemeStore((s) => s.gradientFrom);
  const gradientTo = useThemeStore((s) => s.gradientTo);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Aplica claro/escuro no elemento raiz assim que muda — recolore o app
  // inteiro (bg-surface-* já é var() em runtime) sem precisar de reload. O
  // index.html já seta o data-theme certo antes do primeiro paint (lendo o
  // localStorage), então essa run inicial é só uma confirmação, não um
  // flash visível.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  // Aplica a cor de destaque (predefinida, personalizada ou gradiente) via
  // variáveis CSS em runtime — precisa ser JS (não dá pra fazer só com CSS
  // estático) porque cor personalizada/gradiente é arbitrária, escolhida
  // pelo usuário. Uma cor sólida "escuro/vermelho" no primeiro frame antes
  // desse efeito rodar é aceitável (ao contrário do claro/escuro, não causa
  // um flash de contraste ruim).
  useEffect(() => {
    const root = document.documentElement;
    const ramp =
      accentMode === 'preset'
        ? PRESET_RAMPS[accentPreset]
        : accentMode === 'custom'
          ? generateAccentRamp(customColor)
          : generateAccentRamp(mixHex(gradientFrom, gradientTo, 0.5));

    (Object.keys(ramp) as (keyof typeof ramp)[]).forEach((step) => {
      root.style.setProperty(`--color-accent-${step}`, rgbTriple(ramp[step]));
    });

    if (accentMode === 'gradient') {
      root.style.setProperty('--color-accent-gradient', `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`);
      root.setAttribute('data-accent-style', 'gradient');
    } else {
      root.removeAttribute('data-accent-style');
    }
  }, [accentMode, accentPreset, customColor, gradientFrom, gradientTo]);

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
