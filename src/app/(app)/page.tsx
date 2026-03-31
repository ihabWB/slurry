'use client'
import { useEffect, useState } from 'react'
import { Truck, Factory, AlertTriangle, DollarSign, TrendingUp, RefreshCw, ArrowLeft, Clock, Wallet, ShieldCheck, Sprout, Banknote, BadgePercent } from 'lucide-react'
import { getDashboardStats, getTrips } from '@/lib/api'
import Link from 'next/link'
import { format } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'
import { useAuth } from '@/context/AuthContext'
import { useLang } from '@/context/LangContext'
import { translations as T, t } from '@/lib/i18n'

interface Stats {
  totalTrips: number
  todayTripsCount: number
  todayPaidCount: number
  todayCreditCount: number
  paidTripsCount: number
  creditTripsCount: number
  totalFactories: number
  overdueFactories: number
  totalCollected: number
  totalDebt: number
  totalProjectCost: number
  totalFactoryShare: number
  totalSubsidy: number
  monthTripsCount: number
  activeFactoriesThisMonth: number
  avgTripsPerFactory: number
  tripsWithCostCount: number
  projectBudget: number
  spentFromBudget: number
  remainingBudget: number
  budgetSpentPct: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecentTrip = any

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 bg-slate-100 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 bg-slate-100 rounded w-2/3" />
          <div className="h-6 bg-slate-100 rounded w-1/2" />
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

// بطاقة KPI بسيطة
function KpiCard({
  label, value, suffix, icon: Icon, bg, text, border,
  warn = false, sub, badge,
}: {
  label: string; value: number; suffix: string; icon: React.ElementType
  bg: string; text: string; border: string
  warn?: boolean; sub?: string; badge?: React.ReactNode
}) {
  return (
    <div className={`bg-white rounded-2xl border ${border} p-5 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
          <Icon size={20} className={text} />
        </div>
        {badge}
      </div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-2xl font-bold ${warn && value > 0 ? 'text-red-600' : 'text-slate-800'}`}>
        {value.toLocaleString()}
        <span className="text-sm font-normal text-slate-400 ms-1">{suffix}</span>
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { lang, dir } = useLang()
  const dateLocale = lang === 'ar' ? ar : enUS

  const [stats, setStats] = useState<Stats>({
    totalTrips: 0, todayTripsCount: 0, todayPaidCount: 0, todayCreditCount: 0,
    paidTripsCount: 0, creditTripsCount: 0, totalFactories: 0, overdueFactories: 0,
    totalCollected: 0, totalDebt: 0,
    totalProjectCost: 0, totalFactoryShare: 0, totalSubsidy: 0,
    monthTripsCount: 0, activeFactoriesThisMonth: 0, avgTripsPerFactory: 0,
    tripsWithCostCount: 0,
    projectBudget: 0, spentFromBudget: 0, remainingBudget: 0, budgetSpentPct: 0,
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
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'AbortError') console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const collectPct = stats.totalFactoryShare > 0
    ? Math.min(Math.round(stats.totalCollected / stats.totalFactoryShare * 100), 100) : 0

  const quickActions = [
    { href: '/trips/new',    label: t(T.dashboard.newTrip, lang),     sub: t(T.dashboard.newTripSub, lang),    icon: Truck,      bg: 'bg-blue-600',    shadow: 'shadow-blue-200' },
    { href: '/payments/new', label: t(T.dashboard.newPayment, lang),  sub: t(T.dashboard.newPaymentSub, lang), icon: DollarSign, bg: 'bg-emerald-500', shadow: 'shadow-emerald-200' },
    { href: '/reports',      label: t(T.dashboard.viewReports, lang), sub: 'PDF / Excel',                      icon: TrendingUp, bg: 'bg-violet-500',  shadow: 'shadow-violet-200' },
  ]

  return (
    <div className="space-y-6" dir={dir}>

      {/* ── Header ─────────────────────────────────────────── */}
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

      {/* ── الصف الأول: التشغيلي ───────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-0.5">📋 النشاط التشغيلي</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? [...Array(4)].map((_, i) => <SkeletonCard key={i} />) : <>
            {/* النقلات الكلية */}
            <KpiCard
              label="إجمالي النقلات"
              value={stats.totalTrips}
              suffix="نقلة"
              icon={Truck}
              bg="bg-blue-50" text="text-blue-600" border="border-blue-100"
              sub={`اليوم: ${stats.todayTripsCount} نقلة`}
              badge={
                <div className="flex gap-1 flex-wrap justify-end">
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-lg font-semibold">✓ {stats.paidTripsCount}</span>
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-lg font-semibold">◷ {stats.creditTripsCount}</span>
                </div>
              }
            />
            {/* المصانع */}
            <KpiCard
              label={t(T.dashboard.totalFactory, lang)}
              value={stats.totalFactories}
              suffix={t(T.dashboard.factory, lang)}
              icon={Factory}
              bg="bg-violet-50" text="text-violet-600" border="border-violet-100"
              sub={`نشطة هذا الشهر: ${stats.activeFactoriesThisMonth}`}
              badge={stats.overdueFactories > 0
                ? <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-lg">⚠ {stats.overdueFactories} متأخرة</span>
                : <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-lg">✓ منتظمة</span>
              }
            />
            {/* المحصّل */}
            <KpiCard
              label="إجمالي المحصّل"
              value={Math.round(stats.totalCollected)}
              suffix="₪"
              icon={Wallet}
              bg="bg-emerald-50" text="text-emerald-600" border="border-emerald-100"
              sub={`${collectPct}% من مساهمات المصانع`}
            />
            {/* الذمم */}
            <KpiCard
              label="ذمم المصانع"
              value={Math.round(stats.totalDebt)}
              suffix="₪"
              icon={AlertTriangle}
              bg="bg-red-50" text="text-red-500" border="border-red-100"
              warn={true}
              sub={`${stats.overdueFactories} مصنع لديه رصيد مستحق`}
            />
          </>}
        </div>
      </div>

      {/* ── الصف الثاني: مالي / تمويل ──────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-0.5">💰 الملخص المالي للمشروع</p>

        {/* تحذير: نقلات بدون تسعيرة */}
        {!loading && stats.totalTrips > 0 && stats.tripsWithCostCount < stats.totalTrips && (
          <div className="mb-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠️</span>
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold">{stats.totalTrips - stats.tripsWithCostCount} نقلة</span>
              {' '}لا تحتوي بيانات تسعيرة — التكلفة الكلية غير مكتملة.
              شغّل{' '}
              <code className="bg-amber-100 px-1 rounded font-mono">backfill_trip_costs.sql</code>
              {' '}في Supabase SQL Editor لتحديث الأرقام.
            </p>
          </div>
        )}

        {/* 4 بطاقات مالية */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? [...Array(4)].map((_, i) => <SkeletonCard key={i} />) : <>

            {/* إجمالي تكلفة النقلات */}
            <KpiCard
              label="إجمالي تكلفة النقلات"
              value={Math.round(stats.totalProjectCost)}
              suffix="₪"
              icon={TrendingUp}
              bg="bg-slate-100" text="text-slate-600" border="border-slate-200"
              sub={`${stats.tripsWithCostCount} نقلة مسعّرة من ${stats.totalTrips}`}
            />

            {/* مساهمات المصانع المطلوبة */}
            <KpiCard
              label="مساهمات المصانع"
              value={Math.round(stats.totalFactoryShare)}
              suffix="₪"
              icon={ShieldCheck}
              bg="bg-blue-50" text="text-blue-600" border="border-blue-100"
              sub={`${collectPct}% تم تحصيله`}
              badge={
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-lg">
                  ✓ {Math.round(stats.totalCollected).toLocaleString()} ₪
                </span>
              }
            />

            {/* الصرف الفعلي من التمويل */}
            <KpiCard
              label="الصرف من التمويل"
              value={Math.round(stats.spentFromBudget)}
              suffix="₪"
              icon={Sprout}
              bg="bg-teal-50" text="text-teal-600" border="border-teal-100"
              sub={`${stats.budgetSpentPct}% من إجمالي التمويل`}
            />

            {/* المتبقي من التمويل */}
            <KpiCard
              label="المتبقي من التمويل"
              value={Math.round(stats.remainingBudget)}
              suffix="₪"
              icon={Banknote}
              bg="bg-violet-50" text="text-violet-600" border="border-violet-100"
              sub={`من أصل ${stats.projectBudget > 0 ? stats.projectBudget.toLocaleString() : '—'} ₪`}
            />
          </>}
        </div>
      </div>

      {/* ── أشرطة التقدم المالي ────────────────────────────── */}
      {!loading && (stats.totalProjectCost > 0 || stats.projectBudget > 0) && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-5">
          <p className="text-sm font-semibold text-slate-700">📊 نسب المشروع</p>

          {/* 1. نسبة تحصيل مساهمات المصانع */}
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>تحصيل مساهمات المصانع</span>
              <span className="font-semibold text-emerald-600">{collectPct}%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${collectPct}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>محصّل: {Math.round(stats.totalCollected).toLocaleString()} ₪</span>
              <span>مطلوب: {Math.round(stats.totalFactoryShare).toLocaleString()} ₪</span>
            </div>
          </div>

          {/* 2. توزيع تكلفة المشروع (مصانع vs تمويل) */}
          {stats.totalProjectCost > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>توزيع تكلفة المشروع</span>
                <span className="font-semibold text-slate-600">{Math.round(stats.totalProjectCost).toLocaleString()} ₪</span>
              </div>
              <div className="h-2.5 bg-teal-100 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${stats.totalProjectCost > 0 ? Math.round(stats.totalFactoryShare / stats.totalProjectCost * 100) : 0}%` }}
                  title="مساهمة المصانع"
                />
              </div>
              <div className="flex justify-between text-[11px] mt-1">
                <span className="text-blue-500">مصانع: {Math.round(stats.totalFactoryShare).toLocaleString()} ₪</span>
                <span className="text-teal-600">تمويل: {Math.round(stats.spentFromBudget).toLocaleString()} ₪</span>
              </div>
            </div>
          )}

          {/* 3. نسبة الصرف من إجمالي التمويل */}
          {stats.projectBudget > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span className="flex items-center gap-1">
                  <BadgePercent size={12} className="text-violet-500" />
                  نسبة الصرف من إجمالي التمويل
                </span>
                <span className="font-semibold text-violet-600">{stats.budgetSpentPct}%</span>
              </div>
              <div className="h-2.5 bg-violet-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${stats.budgetSpentPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] mt-1">
                <span className="text-violet-600">مُصرف: {Math.round(stats.spentFromBudget).toLocaleString()} ₪</span>
                <span className="text-slate-400">
                  متبقٍ: <span className="text-violet-700 font-semibold">{Math.round(stats.remainingBudget).toLocaleString()} ₪</span>
                  {' '}من {stats.projectBudget.toLocaleString()} ₪
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── إجراءات سريعة ──────────────────────────────────── */}
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

      {/* ── آخر النقلات ────────────────────────────────────── */}
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
                <th className="text-start px-6 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">سعر الوحدة</th>
                <th className="text-start px-6 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">مساهمة المصنع</th>
                <th className="text-start px-6 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">{t(T.dashboard.colStatus, lang)}</th>
                <th className="text-start px-6 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">{t(T.dashboard.colDate, lang)}</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
                : recentTrips.length === 0
                  ? <tr><td colSpan={6} className="text-center py-12 text-slate-400">{t(T.dashboard.noTrips, lang)}</td></tr>
                  : recentTrips.map((trip: RecentTrip, i: number) => (
                    <tr key={trip.id} className={`border-b border-slate-50 hover:bg-blue-50/30 transition-colors ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                      <td className="px-6 py-3.5 font-semibold text-slate-800">{trip.factories?.name ?? '—'}</td>
                      <td className="px-6 py-3.5 text-slate-500">{trip.factories?.region ?? '—'}</td>
                      <td className="px-6 py-3.5 font-bold text-slate-800">
                        {trip.trip_cost ? <>{trip.trip_cost.toLocaleString()} <span className="text-slate-400 font-normal text-xs">₪</span></> : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-blue-700 font-semibold">
                        {trip.factory_contribution ? <>{trip.factory_contribution} <span className="text-slate-400 font-normal text-xs">₪</span></> : '—'}
                      </td>
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
