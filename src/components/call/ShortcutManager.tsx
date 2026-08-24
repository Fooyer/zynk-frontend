import { useEffect } from 'react';
import { useKeybindingsStore, type ShortcutActionId } from '../../stores/keybindingsStore';
import { useShortcutStatusStore } from '../../stores/shortcutStatusStore';
import { SHORTCUT_ACTIONS_BY_ID, voiceRuntimeRef } from '../../services/shortcutActions';
import { isTypingTarget, keyComboMatchesEvent, keyComboToAccelerator } from '../../utils/keyCombo';
import type { useVoiceRoom } from '../../hooks/useVoiceRoom';

interface Props {
  voice: ReturnType<typeof useVoiceRoom>;
}

/**
 * Sem UI própria — só liga os atalhos configurados (Configurações > Atalhos)
 * às ações de call. Dois caminhos em paralelo:
 *  - Dentro do app (janela em foco): keydown normal no window.
 *  - System-wide, só no Electron (globalShortcut no main): funciona mesmo
 *    com o Zynk minimizado/sem foco — o caso de uso principal de um atalho
 *    de mudo é justamente enquanto se está em outro programa (jogo).
 * Montado uma vez em App.tsx, ao lado de CallManager — é lá que `voice`
 * (canal de voz de grupo) de fato existe.
 */
export function ShortcutManager({ voice }: Props) {
  const bindings = useKeybindingsStore((s) => s.bindings);

  useEffect(() => {
    voiceRuntimeRef.current = voice;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      for (const [action, combo] of Object.entries(bindings)) {
        if (combo && keyComboMatchesEvent(combo, e)) {
          e.preventDefault();
          SHORTCUT_ACTIONS_BY_ID.get(action as ShortcutActionId)?.run();
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindings]);

  // Reregistra tudo no main process sempre que os atalhos configurados
  // mudam — o handler no main já zera o registro anterior antes de aplicar
  // o novo (ver electron/main.ts, 'shortcuts:set').
  useEffect(() => {
    if (!window.electronAPI?.setGlobalShortcuts) return;
    const items = Object.entries(bindings)
      .map(([action, combo]) => ({ action, accelerator: combo ? keyComboToAccelerator(combo) : null }))
      .filter((i): i is { action: string; accelerator: string } => !!i.accelerator);

    window.electronAPI.setGlobalShortcuts(items).then(({ failed }) => {
      useShortcutStatusStore.getState().setFailedGlobalActions(new Set(failed as ShortcutActionId[]));
    });
  }, [bindings]);

  useEffect(() => {
    if (!window.electronAPI?.onGlobalShortcut) return;
    window.electronAPI.onGlobalShortcut((action) => {
      SHORTCUT_ACTIONS_BY_ID.get(action as ShortcutActionId)?.run();
    });
    return () => window.electronAPI?.offGlobalShortcut?.();
  }, []);

  return null;
}
