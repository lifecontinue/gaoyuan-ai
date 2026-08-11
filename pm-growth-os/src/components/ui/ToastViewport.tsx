import { useEffect, useState } from 'react';
import { addToastListener, type ToastMessage } from '../../lib/notifications';

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return addToastListener((toast) => {
      setToasts((current) => [toast, ...current].slice(0, 4));
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 3200);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.kind}`} key={toast.id}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
