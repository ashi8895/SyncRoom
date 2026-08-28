export interface ToastItem {
  id: string;
  message: string;
}

interface Props {
  toasts: ToastItem[];
}

/** Small stack of auto-dismissing notifications, bottom-left. */
export function ToastStack({ toasts }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.message}
        </div>
      ))}
    </div>
  );
}
