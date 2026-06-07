'use client'
import Sidebar from '@/components/Sidebar'
import ToastContainer from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { useLang } from '@/context/LangContext'
import { translations as T, t } from '@/lib/i18n'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'

// المسارات المسموح بها للـ approver فقط
const APPROVER_ALLOWED = ['/', '/trips']
// المسارات المسموح بها للـ operator فقط
const OPERATOR_ALLOWED = ['/trips']

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isApprover, isOperator } = useAuth()
  const { lang, dir } = useLang()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [loading, user, router])

  // approver: إعادة توجيه لأي مسار غير مسموح
  useEffect(() => {
    if (!loading && user && isApprover) {
      const allowed = APPROVER_ALLOWED.some(p => pathname === p || pathname.startsWith(p + '/'))
      if (!allowed) router.replace('/trips')
    }
  }, [loading, user, isApprover, pathname, router])

  // operator: إعادة توجيه لأي مسار غير مسموح
  useEffect(() => {
    if (!loading && user && isOperator) {
      const allowed = OPERATOR_ALLOWED.some(p => pathname === p || pathname.startsWith(p + '/'))
      if (!allowed) router.replace('/trips')
    }
  }, [loading, user, isOperator, pathname, router])

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#f8fafc]">
        <aside className="hidden lg:flex flex-col w-60 bg-[#0f172a] min-h-screen">
          <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10">
            <div className="w-8 h-8 bg-white/10 rounded-lg animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-white/10 rounded animate-pulse w-3/4" />
              <div className="h-2 bg-white/10 rounded animate-pulse w-1/2" />
            </div>
          </div>
          <div className="p-3 space-y-1 mt-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-9 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        </aside>
        {/* Mobile skeleton top bar */}
        <div className="lg:hidden fixed top-0 right-0 left-0 z-50 bg-[#0f172a] h-14 animate-pulse" />
        {/* Content skeleton */}
        <div className="flex-1 flex flex-col min-w-0" dir="rtl">
          <div className="flex-1 pt-14 lg:pt-16 p-8">
            <div className="max-w-5xl mx-auto space-y-4">
              <div className="h-8 bg-slate-200 rounded-xl w-1/3 animate-pulse" />
              <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0" dir={dir}>
        {/* Top header */}
        <header className="hidden lg:flex items-center justify-between px-8 py-4 bg-white border-b border-slate-100 sticky top-0 z-30">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="text-slate-800 font-semibold">{t(T.layout.org, lang)}</span>
            <span>/</span>
            <span>{t(T.layout.system, lang)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-400">{t(T.layout.online, lang)}</span>
          </div>
        </header>
        <main className="flex-1 pt-14 lg:pt-0 overflow-auto">
          <div className="max-w-5xl mx-auto p-4 lg:p-8">
            {children}
          </div>
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}

