export type ToastKind = 'error' | 'info' | 'success';

export type ToastMessage = {
  id: string;
  kind: ToastKind;
  message: string;
};

const TOAST_EVENT = 'pm-growth-os.toast';

export function notify(message: string, kind: ToastKind = 'info') {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<ToastMessage>(TOAST_EVENT, {
      detail: {
        id: crypto.randomUUID?.() ?? `toast-${Date.now()}-${Math.random()}`,
        kind,
        message,
      },
    }),
  );
}

export function addToastListener(listener: (toast: ToastMessage) => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    listener((event as CustomEvent<ToastMessage>).detail);
  };

  window.addEventListener(TOAST_EVENT, handler);
  return () => window.removeEventListener(TOAST_EVENT, handler);
}
