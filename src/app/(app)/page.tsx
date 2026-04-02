'use client'
import { useEffect, useState } from 'react'
import { Truck, Factory, AlertTriangle, DollarSign, TrendingUp, RefreshCw, ArrowLeft, Clock, Wallet, ShieldCheck, Sprout, Banknote, BadgePercent, Receipt, Lock } from 'lucide-react'
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
  factoryShareCollected: number
  factoryShareUncollected: number
  monthTripsCount: number
  activeFactoriesThisMonth: number
  activeFactoriesTotal: number
  avgTripsPerFactory: number
  tripsWithCostCount: number
  projectBudget: number
  spentFromBudget: number
  remainingBudget: number
  budgetSpentPct: number
  totalDisbursed: number
  totalRetained: number
  closedDisbursementsCount: number
  // أحجام
  totalVolume: number
  monthVolume: number
  liquidCount: number
  liquidVolume: number
  dryCount: number
  dryVolume: number
  liquidCountMonth: number
  liquidVolumeMonth: number
  dryCountMonth: number
  dryVolumeMonth: number
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
    totalProjectCost: 0, totalFactoryShare: 0, factoryShareCollected: 0, factoryShareUncollected: 0,
    monthTripsCount: 0, activeFactoriesThisMonth: 0, activeFactoriesTotal: 0, avgTripsPerFactory: 0,
    tripsWithCostCount: 0,
    projectBudget: 0, spentFromBudget: 0, remainingBudget: 0, budgetSpentPct: 0,
    totalDisbursed: 0, totalRetained: 0, closedDisbursementsCount: 0,
    totalVolume: 0, monthVolume: 0,
    liquidCount: 0, liquidVolume: 0, dryCount: 0, dryVolume: 0,
    liquidCountMonth: 0, liquidVolumeMonth: 0, dryCountMonth: 0, dryVolumeMonth: 0,
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
    ? Math.min(Math.round(stats.factoryShareCollected / stats.totalFactoryShare * 100), 100) : 0
  const uncollectedPct = stats.totalFactoryShare > 0
    ? Math.min(Math.round(stats.factoryShareUncollected / stats.totalFactoryShare * 100), 100) : 0
  // قيمة مساهمة المصنع للنقلة الواحدة (مشتقة من إجمالي ÷ عدد النقلات)
  const contributionPerTrip = stats.totalTrips > 0
    ? Math.round(stats.totalFactoryShare / stats.totalTrips) : 50

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
            {/* إجمالي النقلات */}
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
            {/* نقلات هذا الشهر */}
            <KpiCard
              label="نقلات هذا الشهر"
              value={stats.monthTripsCount}
              suffix="نقلة"
              icon={Truck}
              bg="bg-sky-50" text="text-sky-600" border="border-sky-100"
              sub={`متوسط: ${stats.avgTripsPerFactory} نقلة / مصنع`}
            />
            {/* المصانع */}
            <KpiCard
              label="إجمالي المصانع"
              value={stats.totalFactories}
              suffix="مصنع"
              icon={Factory}
              bg="bg-violet-50" text="text-violet-600" border="border-violet-100"
              sub={`نشطة (لها نقلات): ${stats.activeFactoriesTotal}`}
              badge={stats.overdueFactories > 0
                ? <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-lg">⚠ {stats.overdueFactories} متأخرة</span>
                : <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-lg">✓ منتظمة</span>
              }
            />
            {/* مصانع نشطة هذا الشهر */}
            <KpiCard
              label="مصانع نشطة هذا الشهر"
              value={stats.activeFactoriesThisMonth}
              suffix="مصنع"
              icon={Factory}
              bg="bg-fuchsia-50" text="text-fuchsia-600" border="border-fuchsia-100"
              sub={`من أصل ${stats.totalFactories} مسجلة`}
            />
          </>}
        </div>
      </div>

      {/* ── بطاقة الأحجام ──────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-0.5">🚛 إحصائيات الأحجام</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {loading ? [...Array(3)].map((_, i) => <SkeletonCard key={i} />) : <>

            {/* إجمالي الحجم */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Truck size={20} className="text-slate-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">إجمالي الحجم المنقول</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {stats.totalVolume.toLocaleString()}
                    <span className="text-sm font-normal text-slate-400 ms-1">م³</span>
                  </p>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3 flex justify-between text-xs text-slate-500">
                <span>هذا الشهر</span>
                <span className="font-semibold text-slate-700">{stats.monthVolume.toLocaleString()} م³</span>
              </div>
            </div>

            {/* سائل */}
            <div className="bg-white rounded-2xl border border-blue-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">💧</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">ربو سائل</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {stats.liquidVolume.toLocaleString()}
                      <span className="text-sm font-normal text-slate-400 ms-1">م³</span>
                    </p>
                  </div>
                </div>
                <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-semibold">{stats.liquidCount} نقلة</span>
              </div>
              <div className="border-t border-blue-50 pt-3 flex justify-between text-xs text-slate-500">
                <span>هذا الشهر</span>
                <span className="font-semibold text-blue-700">{stats.liquidVolumeMonth.toLocaleString()} م³ · {stats.liquidCountMonth} نقلة</span>
              </div>
            </div>

            {/* جاف */}
            <div className="bg-white rounded-2xl border border-orange-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">🪨</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">ربو جاف</p>
                    <p className="text-2xl font-bold text-orange-700">
                      {stats.dryVolume.toLocaleString()}
                      <span className="text-sm font-normal text-slate-400 ms-1">م³</span>
                    </p>
                  </div>
                </div>
                <span className="text-[11px] bg-orange-100 text-orange-700 px-2 py-1 rounded-lg font-semibold">{stats.dryCount} نقلة</span>
              </div>
              <div className="border-t border-orange-50 pt-3 flex justify-between text-xs text-slate-500">
                <span>هذا الشهر</span>
                <span className="font-semibold text-orange-700">{stats.dryVolumeMonth.toLocaleString()} م³ · {stats.dryCountMonth} نقلة</span>
              </div>
            </div>

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

            {/* إيرادات مساهمات المصانع */}
            <div className="bg-white rounded-2xl border border-blue-100 p-4 hover:shadow-md transition-shadow col-span-2 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Factory size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">إيرادات مساهمات المصانع</p>
                    <p className="text-lg font-bold text-slate-800">
                      {Math.round(stats.totalFactoryShare).toLocaleString()}
                      <span className="text-xs font-normal text-slate-400 ms-1">₪ إجمالي</span>
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-lg">
                  {contributionPerTrip}₪ / نقلة
                </span>
              </div>
              {/* شريط المحصّل */}
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${collectPct}%` }}
                />
              </div>
              {/* صفان: محصّل / غير محصّل */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-emerald-600 font-medium mb-0.5">✅ محصّل (مدفوع)</p>
                  <p className="text-sm font-bold text-emerald-700">{Math.round(stats.factoryShareCollected).toLocaleString()} ₪</p>
                  <p className="text-[10px] text-emerald-500">{stats.paidTripsCount} نقلة × {contributionPerTrip}₪</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-amber-600 font-medium mb-0.5">⏳ غير محصّل (ذمة)</p>
                  <p className="text-sm font-bold text-amber-700">{Math.round(stats.factoryShareUncollected).toLocaleString()} ₪</p>
                  <p className="text-[10px] text-amber-500">{stats.creditTripsCount} نقلة × {contributionPerTrip}₪</p>
                </div>
              </div>
            </div>

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

        {/* بطاقة الدفعات المصروفة الفعلية */}
        {!loading && stats.closedDisbursementsCount > 0 && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Lock size={18} className="text-emerald-700" />
                </div>
                <div>
                  <p className="text-xs text-emerald-700 font-medium">صافي المصروف الفعلي ({stats.closedDisbursementsCount} دفعة)</p>
                  <p className="text-xl font-bold text-emerald-800">
                    {Math.round(stats.totalDisbursed).toLocaleString()} <span className="text-sm font-normal">₪</span>
                  </p>
                </div>
              </div>
                <Link href="/disbursements" className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1">
                <Receipt size={11} /> عرض المطالبات المالية
              </Link>
            </div>
            {stats.totalRetained > 0 && (
              <div className="flex items-center gap-3 border-t border-emerald-200 pt-3">
                <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ShieldCheck size={14} className="text-orange-700" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-orange-700 font-medium">إجمالي حجز التأمينات (محتجز، يُعاد عند انتهاء المشروع)</p>
                  <p className="text-base font-bold text-orange-800">
                    {Math.round(stats.totalRetained).toLocaleString()} <span className="text-xs font-normal">₪</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── أشرطة التقدم المالي ────────────────────────────── */}
      {!loading && (stats.totalProjectCost > 0 || stats.projectBudget > 0) && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-5">
          <p className="text-sm font-semibold text-slate-700">📊 نسب المشروع</p>

          {/* 1. إيرادات مساهمات المصانع: محصّل / غير محصّل */}
          {stats.totalFactoryShare > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span className="flex items-center gap-1"><Factory size={12} className="text-blue-500" /> إيرادات مساهمات المصانع</span>
                <span className="font-semibold text-blue-600">{Math.round(stats.totalFactoryShare).toLocaleString()} ₪</span>
              </div>
              {/* شريط ثلاثي: محصّل (أخضر) + غير محصّل (برتقالي) + الباقي (رمادي) */}
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${collectPct}%` }} title="محصّل" />
                <div className="h-full bg-amber-400 transition-all" style={{ width: `${uncollectedPct}%` }} title="ذمة غير محصّلة" />
              </div>
              <div className="flex justify-between text-[11px] mt-1">
                <span className="text-emerald-600">✅ محصّل: {Math.round(stats.factoryShareCollected).toLocaleString()} ₪ ({collectPct}%)</span>
                <span className="text-amber-600">⏳ ذمة: {Math.round(stats.factoryShareUncollected).toLocaleString()} ₪ ({uncollectedPct}%)</span>
              </div>
            </div>
          )}

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
