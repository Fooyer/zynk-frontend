import { create } from 'zustand';

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface AlertOptions {
  title?: string;
}

export interface SelectChoice {
  value: string;
  label: string;
}

interface SelectOptions {
  title?: string;
  cancelLabel?: string;
}

interface DialogRequest {
  kind: 'confirm' | 'alert' | 'select';
  message: string;
  title?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  /** Só usado quando kind === 'select'. */
  choices?: SelectChoice[];
  resolve: (value: boolean | string | null) => void;
}

interface DialogState {
  request: DialogRequest | null;
  open: (request: DialogRequest) => void;
  close: (result: boolean | string | null) => void;
}

/**
 * Store imperativa — precisa ser chamável de fora de componentes (hooks como
 * useVoiceRoom) sem depender de estado local de modal em cada callsite.
 */
export const useDialogStore = create<DialogState>((set, get) => ({
  request: null,
  open: (request) => set({ request }),
  close: (result) => {
    get().request?.resolve(result);
    set({ request: null });
  },
}));

/** Substitui window.confirm — resolve true/false conforme o botão clicado. */
export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({
      kind: 'confirm',
      message,
      title: options.title,
      confirmLabel: options.confirmLabel ?? 'Confirmar',
      cancelLabel: options.cancelLabel ?? 'Cancelar',
      danger: options.danger ?? false,
      resolve: (value) => resolve(value as boolean),
    });
  });
}

/** Substitui window.alert — resolve quando o usuário fecha o diálogo. */
export function alertDialog(message: string, options: AlertOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({
      kind: 'alert',
      message,
      title: options.title,
      confirmLabel: 'OK',
      cancelLabel: '',
      danger: false,
      resolve: () => resolve(),
    });
  });
}

/** Pede pra escolher um entre N valores — resolve o `value` clicado, ou `null` se cancelar. */
export function selectDialog(message: string, choices: SelectChoice[], options: SelectOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({
      kind: 'select',
      message,
      title: options.title,
      confirmLabel: '',
      cancelLabel: options.cancelLabel ?? 'Cancelar',
      danger: false,
      choices,
      resolve: (value) => resolve(value as string | null),
    });
  });
}
