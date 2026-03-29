'use client'
import { useEffect, useState } from 'react'
import { Truck, Factory, AlertTriangle, DollarSign, TrendingUp, RefreshCw, ArrowLeft, Clock, CalendarDays, BarChart2 } from 'lucide-react'
import { getDashboardStats, getTrips } from '@/lib/api'
import Link from 'next/link'
import { format } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'
import { useAuth } from '@/context/AuthContext'
import { useLang } from '@/context/LangContext'
import { translations as T, t } from '@/lib/i18n'

interface Stats {
  todayTripsCount: number
  paidTripsCount: number
  creditTripsCount: number
  totalFactories: number
  overdueFactories: number
  todayCollection: number
  totalDue: number
  monthTripsCount: number
  activeFactoriesThisMonth: number
  monthCollection: number
  totalDebt: number
  avgTripsPerFactory: number
}

type RecentTrip = any

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-slate-100 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-slate-100 rounded w-2/3" />
          <div className="h-5 bg-slate-100 rounded w-1/2" />
        </div>
      </div>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-50 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <td key={i} className="px-6 py-3.5">
          <div className="h-3.5 bg-slate-100 rounded w-3/4" />
        </td>
      ))}
    </tr>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { lang, dir } = useLang()
  const dateLocale = lang === 'ar' ? ar : enUS
  const [stats, setStats] = useState<Stats>({
    todayTripsCount: 0, paidTripsCount: 0, creditTripsCount: 0,
    totalFactories: 0, overdueFactories: 0, todayCollection: 0,
    totalDue: 0, monthTripsCount: 0, activeFactoriesThisMonth: 0, monthCollection: 0, totalDebt: 0, avgTripsPerFactory: 0,
  })
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const [s, trips] = await Promise.all([
        getDashboardStats(),
        getTrips({ from: new Date(Date.now() - 7 * 86400000).toISOString() }),
      ])
      setStats(s)
      setRecentTrips((trips || []).slice(0, 10))
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const statCards = [
    {
      label: t(T.dashboard.todayTrips, lang),
      value: stats.todayTripsCount,
      suffix: t(T.dashboard.trip, lang),
      icon: Truck,
      bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100',
      paid: stats.paidTripsCount,
      credit: stats.creditTripsCount,
    },
    { label: t(T.dashboard.todayCollect, lang),    value: stats.todayCollection,  suffix: '₪',                          icon: DollarSign,     bg: 'bg-emerald-50', text: 'text-emerald-600',border: 'border-emerald-100', isCurrency: true },
    { label: t(T.dashboard.totalFactory, lang),    value: stats.totalFactories,   suffix: t(T.dashboard.factory, lang),  icon: Factory,        bg: 'bg-violet-50',  text: 'text-violet-600', border: 'border-violet-100' },
    { label: t(T.dashboard.overdueFactory, lang),  value: stats.overdueFactories, suffix: t(T.dashboard.factory, lang),  icon: AlertTriangle,  bg: 'bg-red-50',     text: 'text-red-500',    border: 'border-red-100',   warn: true },
  ]

  const monthCards = [
    {
      label: 'نقلات هذا الشهر',
      value: stats.monthTripsCount,
      suffix: 'نقلة',
      icon: Truck,
      bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-100',
      sub: `تحصيل: ${stats.monthCollection.toLocaleString()} ₪`,
    },
    {
      label: 'مصانع نشطة هذا الشهر',
      value: stats.activeFactoriesThisMonth,
      suffix: 'مصنع',
      icon: Factory,
      bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-100',
      sub: `متوسط نقلات/مصنع: ${stats.avgTripsPerFactory}`,
    },
    {
      label: 'إجمالي الذمم المتراكمة',
      value: stats.totalDebt,
      suffix: '₪',
      icon: AlertTriangle,
      bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100',
      isCurrency: true,
      warn: stats.totalDebt > 0,
      sub: `من ${stats.overdueFactories} مصنع`,
    },
  ]

  const quickActions = [
    { href: '/trips/new',    label: t(T.dashboard.newTrip, lang),     sub: t(T.dashboard.newTripSub, lang),     icon: Truck,       bg: 'bg-blue-600',    shadow: 'shadow-blue-200' },
    { href: '/payments/new', label: t(T.dashboard.newPayment, lang),  sub: t(T.dashboard.newPaymentSub, lang),  icon: DollarSign,  bg: 'bg-emerald-500', shadow: 'shadow-emerald-200' },
    { href: '/reports',      label: t(T.dashboard.viewReports, lang), sub: 'PDF / Excel',                       icon: TrendingUp,  bg: 'bg-violet-500',  shadow: 'shadow-violet-200' },
  ]

  return (
    <div className="space-y-6" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-2xl font-bold text-slate-800">{t(T.dashboard.title, lang)}</h1>
            {user?.full_name && (
              <span className="text-slate-400 font-normal text-lg">، {user.full_name.split(' ')[0]}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 text-sm">
            <Clock size={13} />
            <span>{format(new Date(), lang === 'ar' ? 'EEEE، dd MMMM yyyy' : 'EEEE, MMMM dd yyyy', { locale: dateLocale })}</span>
          </div>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-300 px-3 py-2 rounded-xl transition-all shadow-sm hover:shadow disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">{t(T.dashboard.refresh, lang)}</span>
        </button>
      </div>

      {/* Stat Cards Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
          : statCards.map(({ label, value, icon: Icon, bg, text, border, suffix, isCurrency, warn, ...rest }) => (
          <div key={label} className={`bg-white rounded-2xl border ${border} p-5 hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon size={20} className={text} />
              </div>
              {warn && value > 0 && (
                <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-lg">{t(T.dashboard.alert, lang)}</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-0.5">{label}</p>
            <p className={`text-2xl font-bold ${warn && value > 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {isCurrency ? value.toLocaleString() : value}
              <span className="text-sm font-normal text-slate-400 ms-1">{suffix}</span>
            </p>
            {'paid' in rest && (
              <div className="flex gap-2 mt-2">
                <span className="flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  محصلة {(rest as any).paid}
                </span>
                <span className="flex items-center gap-1 text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                  ذمة {(rest as any).credit}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stat Cards Row 2 — monthly */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading
          ? [...Array(3)].map((_, i) => <SkeletonCard key={i} />)
          : monthCards.map(({ label, value, icon: Icon, bg, text, border, suffix, isCurrency, warn, sub }) => (
          <div key={label} className={`bg-white rounded-2xl border ${border} p-5 hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon size={20} className={text} />
              </div>
              <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-lg flex items-center gap-1">
                <CalendarDays size={10} /> هذا الشهر
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-0.5">{label}</p>
            <p className={`text-2xl font-bold ${warn ? 'text-orange-600' : 'text-slate-800'}`}>
              {isCurrency ? value.toLocaleString() : value}
              <span className="text-sm font-normal text-slate-400 ms-1">{suffix}</span>
            </p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Financial Summary Card */}
      {!loading && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-600">الملخص المالي الكلي</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {/* Total Due */}
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">إجمالي المستحق</p>
              <p className="text-2xl font-bold text-slate-800">{stats.totalDue.toLocaleString()}</p>
              <p className="text-xs text-slate-400">₪</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{stats.todayTripsCount} نقلة × 50₪</p>
            </div>
            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-y-0 right-0 w-px bg-slate-100" />
              <div className="absolute inset-y-0 left-0 w-px bg-slate-100" />
              <div className="text-center h-full flex flex-col justify-center">
                <p className="text-xs text-slate-400 mb-1">تم تحصيله</p>
                <p className="text-2xl font-bold text-emerald-600">{stats.todayCollection.toLocaleString()}</p>
                <p className="text-xs text-slate-400">₪</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {stats.totalDue > 0 ? Math.round(stats.todayCollection / stats.totalDue * 100) : 0}% من الإجمالي
                </p>
              </div>
            </div>
            {/* Total Debt */}
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">ذمم متراكمة</p>
              <p className={`text-2xl font-bold ${stats.totalDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {stats.totalDebt.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400">₪</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{stats.overdueFactories} مصنع مدين</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>نسبة التحصيل</span>
              <span>{stats.totalDue > 0 ? Math.round(stats.todayCollection / stats.totalDue * 100) : 0}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${stats.totalDue > 0 ? Math.min(stats.todayCollection / stats.totalDue * 100, 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 mb-3 px-0.5">{t(T.dashboard.quickActions, lang)}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {quickActions.map(({ href, label, sub, icon: Icon, bg, shadow }) => (
            <Link key={href} href={href}
              className="group bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 hover:shadow-md hover:border-slate-200 transition-all">
              <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${shadow} group-hover:scale-105 transition-transform`}>
                <Icon size={20} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm">{label}</p>
                <p className="text-xs text-slate-400">{sub}</p>
              </div>
              <ArrowLeft size={16} className={`text-slate-300 group-hover:text-slate-500 transition-all flex-shrink-0 ${dir === 'ltr' ? 'rotate-180' : ''}`} />
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Trips */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
          <div>
            <h2 className="font-semibold text-slate-800">{t(T.dashboard.recentTrips, lang)}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t(T.dashboard.last7days, lang)}</p>
          </div>
          <Link href="/trips" className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors">
            <span>{t(T.dashboard.viewAll, lang)}</span>
            <ArrowLeft size={14} className={dir === 'ltr' ? 'rotate-180' : ''} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/70">
                <th className="text-start px-6 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">{t(T.dashboard.colFactory, lang)}</th>
                <th className="text-start px-6 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">{t(T.dashboard.colRegion, lang)}</th>
                <th className="text-start px-6 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">{t(T.dashboard.colAmount, lang)}</th>
                <th className="text-start px-6 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">{t(T.dashboard.colStatus, lang)}</th>
                <th className="text-start px-6 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">{t(T.dashboard.colDate, lang)}</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
                : recentTrips.length === 0
                  ? <tr><td colSpan={5} className="text-center py-12 text-slate-400">{t(T.dashboard.noTrips, lang)}</td></tr>
                  : recentTrips.map((trip: RecentTrip, i: number) => (
                    <tr key={trip.id} className={`border-b border-slate-50 hover:bg-blue-50/30 transition-colors ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                      <td className="px-6 py-3.5 font-semibold text-slate-800">{trip.factories?.name ?? '—'}</td>
                      <td className="px-6 py-3.5 text-slate-500">{trip.factories?.region ?? '—'}</td>
                      <td className="px-6 py-3.5 font-bold text-slate-800">{trip.amount?.toLocaleString()} <span className="text-slate-400 font-normal text-xs">₪</span></td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          trip.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${trip.payment_status === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {trip.payment_status === 'paid' ? t(T.dashboard.paid, lang) : t(T.dashboard.unpaid, lang)}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-500 text-xs">
                        {format(new Date(trip.trip_date ?? trip.created_at), lang === 'ar' ? 'dd MMM yyyy' : 'MMM dd, yyyy', { locale: dateLocale })}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
