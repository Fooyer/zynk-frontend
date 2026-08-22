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

// Colunas bigint do MySQL voltam do TypeORM como STRING (evita perder
// precisão acima de Number.MAX_SAFE_INTEGER) — mas nem todo endpoint
// converte de volta pra number antes de mandar pro cliente (a lista de DMs
// converte, o payload de mensagem do socket não). Sem o Number(...) aqui,
// `activeDmChannelId` (42, number) nunca batia com `message.channelId`
// ("42", string), e a checagem de "conversa já aberta" nunca dava match —
// a notificação (badge, som, toast) disparava mesmo com o DM ativo na tela.
function isChannelActive(channelId: number): boolean {
  const { view } = useUiStore.getState();
  const { activeDmChannelId } = useFriendStore.getState();
  const { activeChannelId } = useGroupStore.getState();

  if (view === 'home' && activeDmChannelId !== null && Number(activeDmChannelId) === Number(channelId)) return true;
  if (view === 'group' && activeChannelId !== null && Number(activeChannelId) === Number(channelId)) return true;
  return false;
}

function getChannelName(channelId: number): string | null {
  // Tenta DM
  const dm = useFriendStore.getState().dmChannels.find((d) => Number(d.channelId) === Number(channelId));
  if (dm) return dm.friend.username;

  return null;
}

export function notifyMessage(message: Message) {
  // Ignora mensagens do próprio usuário
  const me = useAuthStore.getState().user;
  if (!me || Number(message.senderId) === Number(me.id)) return;

  // Ignora mensagens de sistema
  if (message.isSystem) return;

  // Ignora se a conversa já está aberta — mesmo sem foco na janela, o
  // usuário já está "olhando" pra ela, então nem o badge nem o toast do
  // sistema fazem sentido (antes isso só valia com a janela focada, e o
  // toast continuava vindo com a conversa aberta em segundo plano).
  const channelId = Number(message.channelId);
  if (isChannelActive(channelId)) return;

  // Não lida — conta pro badge do Início/servidor, independente de som/push
  useUnreadStore.getState().increment(channelId);

  // Som
  playSound();

  // Push
  const channelName = getChannelName(channelId);
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
