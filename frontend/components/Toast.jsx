import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export function ToastContainer({ toasts = [], onDismiss }) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2.5 max-w-sm">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const config = {
    success: { icon: CheckCircle2, color: 'text-emerald-600', border: 'border-emerald-200', bg: 'bg-emerald-50' },
    error: { icon: AlertCircle, color: 'text-rose-600', border: 'border-rose-200', bg: 'bg-rose-50' },
    info: { icon: Info, color: 'text-blue-600', border: 'border-blue-200', bg: 'bg-blue-50' },
  };
  const { icon: Icon, color, border, bg } = config[toast.type] || config.info;

  return (
    <div
      className={`animate-slide-in-right flex items-start gap-3 rounded-2xl border ${border} ${bg} bg-white p-4 shadow-xl text-slate-800`}
    >
      <Icon className={`h-5 w-5 flex-shrink-0 ${color} mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-900">{toast.title}</p>
        {toast.message && <p className="text-xs text-slate-500 mt-0.5 leading-tight">{toast.message}</p>}
      </div>
      <button onClick={() => onDismiss(toast.id)} className="text-slate-400 hover:text-slate-700 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
