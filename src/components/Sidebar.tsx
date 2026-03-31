'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Factory, Truck, Wallet, BarChart2, MapPin, Users, LogOut, Menu, X, Droplets, ChevronLeft, Languages, Settings } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useLang } from '@/context/LangContext'
import { translations as T, t } from '@/lib/i18n'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { user, signOut, isAdmin, canEdit } = useAuth()
  const { lang, setLang, dir } = useLang()

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  function canShow(show: string) {
    if (show === 'always') return true
    if (show === 'edit') return canEdit
    if (show === 'admin') return isAdmin
    return false
  }

  const groups = [
    { label: t(T.navGroups.main, lang), items: [
      { href: '/', label: t(T.nav.dashboard, lang), icon: LayoutDashboard, show: 'always' },
    ]},
    { label: t(T.navGroups.operations, lang), items: [
      { href: '/factories', label: t(T.nav.factories, lang), icon: Factory,  show: 'edit' },
      { href: '/trips',     label: t(T.nav.trips,     lang), icon: Truck,    show: 'edit' },
      { href: '/payments',  label: t(T.nav.payments,  lang), icon: Wallet,   show: 'edit' },
    ]},
    { label: t(T.navGroups.analytics, lang), items: [
      { href: '/reports', label: t(T.nav.reports, lang), icon: BarChart2, show: 'edit' },
      { href: '/map',     label: t(T.nav.map,     lang), icon: MapPin,    show: 'edit' },
    ]},
    { label: t(T.navGroups.admin, lang), items: [
      { href: '/users',    label: t(T.nav.users,    lang), icon: Users,    show: 'admin' },
      { href: '/settings', label: t(T.nav.settings, lang), icon: Settings, show: 'admin' },
    ]},
  ]

  const roleLabel = user?.role ? t(T.roles[user.role as keyof typeof T.roles], lang) : ''

  const sidebarInner = (
    <div className="flex flex-col h-full" dir={dir}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 flex-shrink-0">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <Droplets size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white text-sm leading-tight">
            {lang === 'ar' ? 'نظام الربو' : 'Slurry System'}
          </p>
          <p className="text-[11px] text-slate-400 truncate">{t(T.layout.org, lang)}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {groups.map(group => {
          const visible = group.items.filter((i: any) => canShow(i.show))
          if (!visible.length) return null
          return (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-1.5">{group.label}</p>
              <div className="space-y-0.5">
                {visible.map(({ href, label, icon: Icon }: any) => {
                  const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
                  return (
                    <Link key={href} href={href} onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'
                      }`}>
                      <Icon size={16} />
                      <span>{label}</span>
                      {active && <ChevronLeft size={14} className={`${dir === 'rtl' ? 'mr-auto' : 'ml-auto rotate-180'} opacity-60`} />}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Lang + User + Signout */}
      <div className="p-3 border-t border-white/10 flex-shrink-0 space-y-1">
        {/* Language switcher */}
        <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-all">
          <Languages size={15} />
          <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          <span className="flex-1" />
          <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono">
            {lang === 'ar' ? 'EN' : 'AR'}
          </span>
        </button>

        {/* User info */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {user?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate leading-tight">{user?.full_name ?? user?.email ?? ''}</p>
            <p className="text-[11px] text-slate-400">{roleLabel}</p>
          </div>
        </div>

        {/* Sign out */}
        <button onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-white/5 transition-all">
          <LogOut size={15} />
          <span>{t(T.nav.signOut, lang)}</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 right-0 left-0 z-50 bg-[#0f172a] flex items-center justify-between px-4 h-14" dir={dir}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <Droplets size={14} className="text-white" />
          </div>
          <span className="font-bold text-white text-sm">
            {lang === 'ar' ? 'نظام الربو' : 'Slurry System'}
          </span>
        </div>
        <button onClick={() => setOpen(!open)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className={`absolute top-0 bottom-0 w-64 bg-[#0f172a] shadow-2xl ${dir === 'rtl' ? 'right-0' : 'left-0'}`}>
            {sidebarInner}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-[#0f172a] min-h-screen sticky top-0 self-start h-screen">
        {sidebarInner}
      </aside>
    </>
  )
}
