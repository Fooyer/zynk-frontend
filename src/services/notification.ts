import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useGroupStore } from '../stores/groupStore';
import { useUiStore } from '../stores/uiStore';
import { useUnreadStore } from '../stores/unreadStore';
import { getNotificationIcon } from './notificationIcon';
import type { Message } from '../types';

// ─── Som ────────────────────────────────────────────

let audioEl: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio('/notification.wav');
  }
  return audioEl;
}

function playSound() {
  const { notifSound, notifVolume, outputDeviceId } = useSettingsStore.getState();
  if (!notifSound) return;

  const audio = getAudio();
  audio.volume = notifVolume;
  audio.currentTime = 0;

  // Roteia para o dispositivo de saída selecionado (se suportado)
  if (outputDeviceId && typeof audio.setSinkId === 'function') {
    audio.setSinkId(outputDeviceId).catch(() => {});
  }

  audio.play().catch(() => {});
}

// ─── Push (Notification API / Electron) ─────────────

function sendPush(title: string, body: string) {
  const { notifPush } = useSettingsStore.getState();
  if (!notifPush) return;

  // Usa a Notification API nativa (funciona tanto em Electron quanto web).
  // silent:true porque o toast nativo do SO tem seu próprio som padrão, que
  // não respeita notifSound/notifVolume — o som de verdade é o playSound()
  // acima, então o toast do sistema só deve ser visual.
  // O ícone é gerado em runtime (getNotificationIcon) na cor de destaque
  // escolhida pelo usuário, em vez do /icon.svg estático — fica consistente
  // com o tema do app e renderiza nítido no Action Center do Windows.
  if ('Notification' in window) {
    const icon = getNotificationIcon();
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon, silent: true });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          new Notification(title, { body, icon, silent: true });
        }
      });
    }
  }
}

// ─── Lógica principal ───────────────────────────────

function isChannelActive(channelId: number): boolean {
  const { view } = useUiStore.getState();
  const { activeDmChannelId } = useFriendStore.getState();
  const { activeChannelId } = useGroupStore.getState();

  if (view === 'home' && activeDmChannelId === channelId) return true;
  if (view === 'group' && activeChannelId === channelId) return true;
  return false;
}

function getChannelName(channelId: number): string | null {
  // Tenta DM
  const dm = useFriendStore.getState().dmChannels.find((d) => d.channelId === channelId);
  if (dm) return dm.friend.username;

  return null;
}

export function notifyMessage(message: Message) {
  // Ignora mensagens do próprio usuário
  const me = useAuthStore.getState().user;
  if (!me || message.senderId === me.id) return;

  // Ignora mensagens de sistema
  if (message.isSystem) return;

  // Ignora se a conversa já está aberta — mesmo sem foco na janela, o
  // usuário já está "olhando" pra ela, então nem o badge nem o toast do
  // sistema fazem sentido (antes isso só valia com a janela focada, e o
  // toast continuava vindo com a conversa aberta em segundo plano).
  if (isChannelActive(message.channelId)) return;

  // Não lida — conta pro badge do Início/servidor, independente de som/push
  useUnreadStore.getState().increment(message.channelId);

  // Som
  playSound();

  // Push
  const channelName = getChannelName(message.channelId);
  const title = channelName
    ? `${message.sender.username} em ${channelName}`
    : message.sender.username;

  const body = message.imageUrl
    ? message.content || '📷 Imagem'
    : message.content.length > 100
      ? message.content.slice(0, 100) + '…'
      : message.content;

  sendPush(title, body);
}

// Pede permissão de notificação na inicialização
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
