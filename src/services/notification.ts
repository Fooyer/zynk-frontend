import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useChannelStore } from '../stores/channelStore';
import { useFriendStore } from '../stores/friendStore';
import { useUiStore } from '../stores/uiStore';
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

  // Usa a Notification API nativa (funciona tanto em Electron quanto web)
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/zynk-icon.png' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          new Notification(title, { body, icon: '/zynk-icon.png' });
        }
      });
    }
  }
}

// ─── Lógica principal ───────────────────────────────

function isChannelActive(channelId: number): boolean {
  const { view } = useUiStore.getState();
  const { activeChannelId } = useChannelStore.getState();
  const { activeDmChannelId } = useFriendStore.getState();

  if (view === 'server' && activeChannelId === channelId) return true;
  if (view === 'home' && activeDmChannelId === channelId) return true;
  return false;
}

function getChannelName(channelId: number): string | null {
  // Tenta DM
  const dm = useFriendStore.getState().dmChannels.find((d) => d.channelId === channelId);
  if (dm) return dm.friend.username;

  // Tenta canal de servidor
  const ch = useChannelStore.getState().channels.find((c) => c.id === channelId);
  if (ch) return `#${ch.name}`;

  return null;
}

export function notifyMessage(message: Message) {
  // Ignora mensagens do próprio usuário
  const me = useAuthStore.getState().user;
  if (!me || message.senderId === me.id) return;

  // Ignora mensagens de sistema
  if (message.isSystem) return;

  // Ignora se o canal está ativo e a janela está em foco
  if (document.hasFocus() && isChannelActive(message.channelId)) return;

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
