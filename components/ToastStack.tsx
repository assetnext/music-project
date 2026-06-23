'use client';

export type ToastItem = {
  id: string;
  text: string;
  kind: 'join' | 'leave';
};

type ToastStackProps = {
  toasts: ToastItem[];
};

export default function ToastStack({ toasts }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 px-4 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="w-full bg-panel border border-line px-4 py-2.5 text-xs flex items-center gap-2 shadow-lg animate-toast-in"
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
              t.kind === 'join' ? 'bg-phosphor' : 'bg-mute'
            }`}
          />
          <span className="text-bone truncate">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
