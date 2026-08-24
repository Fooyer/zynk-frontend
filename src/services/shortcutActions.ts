import { useCallStore } from '../stores/callStore';
import type { ShortcutActionId } from '../stores/keybindingsStore';

/**
 * Subconjunto de `useVoiceRoom()` que as ações de atalho precisam — só o
 * shape, não o hook inteiro (evita importar o hook aqui e criar acoplamento
 * circular; quem monta `ShortcutManager` já tem a instância de verdade).
 */
interface VoiceRuntime {
  activeVc: unknown;
  isScreenSharing: boolean;
  isSharingAudio: boolean;
  toggleMute: () => void;
  startScreenShare: () => void;
  stopScreenShare: () => void;
  startAudioShare: () => void;
  stopAudioShare: () => void;
  leave: () => void;
}

/**
 * Atualizada a cada render de `ShortcutManager` (montado em App.tsx, onde
 * `voice` de verdade vive) — as ações abaixo rodam fora da árvore React (o
 * listener de keydown global e o callback do IPC do Electron), então não dá
 * pra ler `voice` via closure de um componente qualquer.
 */
export const voiceRuntimeRef: { current: VoiceRuntime | null } = { current: null };

/** true quando há uma call 1:1 em andamento — nesse caso as ações usam o
 *  mesmo barramento de CustomEvent que ActiveCallOverlay/DMChatArea já usam
 *  (CallManager.tsx escuta), em vez de mexer na call de voz de grupo. */
const hasActiveDmCall = () => useCallStore.getState().status !== 'idle';

export interface ShortcutActionMeta {
  id: ShortcutActionId;
  label: string;
  description: string;
  run: () => void;
}

export const SHORTCUT_ACTIONS: ShortcutActionMeta[] = [
  {
    id: 'toggleMute',
    label: 'Mutar / desmutar microfone',
    description: 'Liga ou desliga seu microfone na call ativa (1:1 ou canal de voz)',
    run: () => {
      if (hasActiveDmCall()) { window.dispatchEvent(new CustomEvent('call:toggle-mute')); return; }
      if (voiceRuntimeRef.current?.activeVc) voiceRuntimeRef.current.toggleMute();
    },
  },
  {
    id: 'toggleScreenShare',
    label: 'Compartilhar / parar tela',
    description: 'Inicia ou para o compartilhamento de tela na call ativa',
    run: () => {
      if (hasActiveDmCall()) { window.dispatchEvent(new CustomEvent('call:screen-share-toggle')); return; }
      const v = voiceRuntimeRef.current;
      if (!v?.activeVc) return;
      if (v.isScreenSharing) v.stopScreenShare();
      else if (!v.isSharingAudio) v.startScreenShare();
    },
  },
  {
    id: 'toggleAudioShare',
    label: 'Compartilhar / parar áudio do sistema',
    description: 'Inicia ou para o compartilhamento de só áudio (sem tela) na call ativa',
    run: () => {
      if (hasActiveDmCall()) { window.dispatchEvent(new CustomEvent('call:audio-share-toggle')); return; }
      const v = voiceRuntimeRef.current;
      if (!v?.activeVc) return;
      if (v.isSharingAudio) v.stopAudioShare();
      else if (!v.isScreenSharing) v.startAudioShare();
    },
  },
  {
    id: 'leaveCall',
    label: 'Sair da call',
    description: 'Encerra a call 1:1 ou desconecta do canal de voz ativo',
    run: () => {
      if (hasActiveDmCall()) { window.dispatchEvent(new CustomEvent('call:hangup')); return; }
      if (voiceRuntimeRef.current?.activeVc) voiceRuntimeRef.current.leave();
    },
  },
];

export const SHORTCUT_ACTIONS_BY_ID = new Map(SHORTCUT_ACTIONS.map((a) => [a.id, a]));
