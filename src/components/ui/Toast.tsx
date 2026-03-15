'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

// Simple global toast manager
let toastHandler: ((t: Toast) => void) | null = null

export function showToast(type: ToastType, message: string) {
  if (toastHandler) {
    toastHandler({ id: Date.now().toString(), type, message })
  }
}

const icons = {
  success: <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />,
  error: <XCircle size={18} className="text-red-500 flex-shrink-0" />,
  warning: <AlertCircle size={18} className="text-amber-500 flex-shrink-0" />,
  info: <Info size={18} className="text-blue-500 flex-shrink-0" />,
}

const colors = {
  success: 'border-emerald-100 bg-emerald-50',
  error: 'border-red-100 bg-red-50',
  warning: 'border-amber-100 bg-amber-50',
  info: 'border-blue-100 bg-blue-50',
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    toastHandler = (t) => {
      setToasts(prev => [...prev, t])
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id))
      }, 4000)
    }
    return () => { toastHandler = null }
  }, [])

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg min-w-64 max-w-80 ${colors[t.type]}`}
        >
          {icons[t.type]}
          <p className="text-sm text-slate-700 flex-1">{t.message}</p>
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="text-slate-400 hover:text-slate-600 flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
