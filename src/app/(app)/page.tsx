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
  // وجهات النقل
  dumpSiteStats: {
    centralPress:    { count: number; volume: number; countMonth: number; volumeMonth: number }
    khalletSharbati: { count: number; volume: number; countMonth: number; volumeMonth: number }
    sa3ir:           { count: number; volume: number; countMonth: number; volumeMonth: number }
  }
  // مؤشر الاتجاه الشهري
  prevMonthTripsCount: number
  currentMonthDay: number
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
    dumpSiteStats: {
      centralPress:    { count: 0, volume: 0, countMonth: 0, volumeMonth: 0 },
      khalletSharbati: { count: 0, volume: 0, countMonth: 0, volumeMonth: 0 },
      sa3ir:           { count: 0, volume: 0, countMonth: 0, volumeMonth: 0 },
    },
    prevMonthTripsCount: 0, currentMonthDay: 1,
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
    { href: '/map',          label: 'خريطة المصانع',                  sub: 'عرض المواقع الجغرافية',            icon: Factory,    bg: 'bg-teal-500',    shadow: 'shadow-teal-200' },
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

      {/* ── صف النشاط التشغيلي + الملخص المالي السريع ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

        {/* ── النشاط التشغيلي (2/5) ──────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
            <span className="text-base">📋</span>
            <h2 className="font-semibold text-slate-700 text-sm">النشاط التشغيلي</h2>
          </div>

          {/* نبضة اليوم */}
          {!loading && (
            <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
              <span className="text-slate-400 text-xs font-semibold">اليوم</span>
              <span className="w-px h-4 bg-slate-200" />
              <span className="flex items-center gap-1.5 font-bold text-slate-700 text-sm">
                <Truck size={13} className="text-blue-500" />
                {stats.todayTripsCount} نقلة
              </span>
              {stats.todayPaidCount > 0 && (
                <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg font-semibold">✓ {stats.todayPaidCount} مدفوعة</span>
              )}
              {stats.todayCreditCount > 0 && (
                <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-semibold">◷ {stats.todayCreditCount} ذمة</span>
              )}
              {stats.todayTripsCount === 0 && (
                <span className="text-xs text-slate-400 italic">لا توجد نقلات مسجّلة اليوم</span>
              )}
            </div>
          )}

          {/* تحذير المتأخرين */}
          {!loading && stats.overdueFactories > 0 && (
            <div className="flex items-center justify-between gap-3 px-5 py-3 bg-red-50 border-b border-red-100">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
                <p className="text-xs font-semibold text-red-700">{stats.overdueFactories} مصنع لديهم مستحقات متأخرة</p>
              </div>
              <Link href="/reports" className="flex-shrink-0 text-[11px] font-semibold text-red-600 hover:text-red-800 bg-red-100 hover:bg-red-200 px-2.5 py-1 rounded-lg transition-colors">
                عرض المتأخرين
              </Link>
            </div>
          )}

          {/* 4 خانات الإحصائيات */}
          {loading ? (
            <div className="grid grid-cols-2 gap-px bg-slate-100">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white p-5"><SkeletonCard /></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-100">

              {/* إجمالي النقلات */}
              <div className="p-3.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Truck size={12} className="text-blue-600" />
                  </div>
                  <p className="text-[11px] text-slate-500">إجمالي النقلات</p>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  {stats.totalTrips.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ms-1">نقلة</span>
                </p>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">✓ {stats.paidTripsCount}</span>
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">◷ {stats.creditTripsCount}</span>
                </div>
              </div>

              {/* نقلات هذا الشهر */}
              <div className="p-3.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded-md bg-sky-50 flex items-center justify-center flex-shrink-0">
                    <Truck size={12} className="text-sky-600" />
                  </div>
                  <p className="text-[11px] text-slate-500">هذا الشهر</p>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  {stats.monthTripsCount.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ms-1">نقلة</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-1.5">متوسط: {stats.avgTripsPerFactory}/مصنع</p>
              </div>

              {/* إجمالي المصانع */}
              <div className="p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-md bg-violet-50 flex items-center justify-center flex-shrink-0">
                      <Factory size={12} className="text-violet-600" />
                    </div>
                    <p className="text-[11px] text-slate-500">المصانع</p>
                  </div>
                  {stats.overdueFactories > 0
                    ? <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">⚠ {stats.overdueFactories}</span>
                    : <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">✓</span>}
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  {stats.totalFactories.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ms-1">مصنع</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-1.5">نشطة: {stats.activeFactoriesTotal}</p>
              </div>

              {/* مصانع نشطة هذا الشهر */}
              <div className="p-3.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded-md bg-fuchsia-50 flex items-center justify-center flex-shrink-0">
                    <Factory size={12} className="text-fuchsia-600" />
                  </div>
                  <p className="text-[11px] text-slate-500">نشطة الشهر</p>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  {stats.activeFactoriesThisMonth.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ms-1">مصنع</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-1.5">من {stats.totalFactories} مسجلة</p>
              </div>

            </div>

            {/* ── مؤشر الاتجاه الشهري ──────────────────────── */}
            {!loading && (() => {
              const curr = stats.monthTripsCount
              const prev = stats.prevMonthTripsCount
              const day  = stats.currentMonthDay
              if (prev === 0 && curr === 0) return null
              const diff = curr - prev
              const pct  = prev > 0 ? Math.round(Math.abs(diff) / prev * 100) : 100
              const up   = diff > 0
              const same = diff === 0
              return (
                <div className="px-3.5 pb-3.5">
                  <div className={`rounded-lg px-3 py-2 flex items-center justify-between gap-2 ${
                    same ? 'bg-slate-50 border border-slate-100' :
                    up   ? 'bg-emerald-50 border border-emerald-100' :
                           'bg-red-50 border border-red-100'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-bold ${
                        same ? 'text-slate-400' : up ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {same ? '↔' : up ? '▲' : '▼'}
                      </span>
                      <p className={`text-[11px] font-semibold ${
                        same ? 'text-slate-500' : up ? 'text-emerald-700' : 'text-red-600'
                      }`}>
                        {same
                          ? 'نفس وتيرة الشهر الماضي'
                          : `${up ? '+' : ''}${diff} نقلة (${up ? '+' : '-'}${pct}%)`
                        }
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      1–{day} مقابل نفس الفترة الشهر الماضي · {prev} نقلة
                    </p>
                  </div>
                </div>
              )
            })()}
          )}
        </div>

        {/* ── الملخص المالي السريع (3/5) ─────────────────── */}
        <div className="lg:col-span-3 bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
            <span className="text-base">💰</span>
            <h2 className="font-semibold text-slate-700 text-sm">الملخص المالي</h2>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : (
            <div className="p-5 space-y-4">

              {/* صف علوي: تكلفة + مساهمات */}
              <div className="grid grid-cols-2 gap-4">

                {/* تكلفة النقلات */}
                <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-1">
                  <p className="text-[11px] text-slate-400 font-medium">إجمالي تكلفة النقلات</p>
                  <p className="text-2xl font-bold text-slate-800">{Math.round(stats.totalProjectCost).toLocaleString()} <span className="text-xs font-normal text-slate-400">₪</span></p>
                  <p className="text-[10px] text-slate-400">{stats.tripsWithCostCount} نقلة مسعّرة من {stats.totalTrips}</p>
                  {stats.totalTrips > 0 && stats.tripsWithCostCount < stats.totalTrips && (
                    <p className="text-[10px] text-amber-600 font-semibold">⚠️ {stats.totalTrips - stats.tripsWithCostCount} بدون تسعيرة</p>
                  )}
                </div>

                {/* مساهمات المصانع */}
                <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-400 font-medium">مساهمات المصانع</p>
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{contributionPerTrip} ₪/نقلة</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{Math.round(stats.totalFactoryShare).toLocaleString()} <span className="text-xs font-normal text-slate-400">₪</span></p>
                  <div className="flex gap-1.5">
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-semibold">✓ {Math.round(stats.factoryShareCollected).toLocaleString()} ₪ · {collectPct}%</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-semibold">◷ {Math.round(stats.factoryShareUncollected).toLocaleString()} ₪ · {uncollectedPct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${collectPct}%` }} />
                    <div className="h-full bg-amber-400 transition-all" style={{ width: `${uncollectedPct}%` }} />
                  </div>
                </div>

              </div>

              {/* صف سفلي: التمويل / الدفعات */}
              {stats.projectBudget > 0 ? (
                <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-400 font-medium">التمويل والميزانية</p>
                    <span className="text-[10px] text-violet-600 font-semibold">{stats.budgetSpentPct}% مُصرف</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400">الميزانية الكلية</p>
                      <p className="text-lg font-bold text-slate-700">{stats.projectBudget.toLocaleString()} <span className="text-xs font-normal text-slate-400">₪</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">مُصرف</p>
                      <p className="text-lg font-bold text-teal-700">{Math.round(stats.spentFromBudget).toLocaleString()} <span className="text-xs font-normal text-slate-400">₪</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">متبقٍ</p>
                      <p className="text-lg font-bold text-violet-700">{Math.round(stats.remainingBudget).toLocaleString()} <span className="text-xs font-normal text-slate-400">₪</span></p>
                    </div>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${stats.budgetSpentPct}%` }} />
                  </div>
                </div>
              ) : null}

              {/* الدفعات المقفلة — تظهر دائماً لو في دفعات */}
              {stats.closedDisbursementsCount > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-slate-400 font-medium mb-1">صافي المصروف الفعلي</p>
                      <p className="text-2xl font-bold text-emerald-700">{Math.round(stats.totalDisbursed).toLocaleString()} <span className="text-xs font-normal text-slate-400">₪</span></p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{stats.closedDisbursementsCount} دفعة مقفلة معتمدة</p>
                    </div>
                    {stats.totalRetained > 0 && (
                      <>
                        <div className="w-px h-12 bg-slate-100" />
                        <div className="text-right">
                          <p className="text-[11px] text-slate-400 font-medium mb-1">حجز التأمينات (محتجز)</p>
                          <p className="text-xl font-bold text-orange-700">{Math.round(stats.totalRetained).toLocaleString()} <span className="text-xs font-normal text-slate-400">₪</span></p>
                          <p className="text-[10px] text-slate-400 mt-0.5">يُعاد عند انتهاء المشروع</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <Link href="/disbursements" className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl transition-colors">
                <Receipt size={13} /> عرض المطالبات التفصيلية
              </Link>
            </div>
          )}
        </div>

      </div>{/* ── end صف النشاط + الملخص السريع ───────────────── */}

      {/* ── بطاقة الأحجام + وجهات النقل جنب بعض ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      {/* ── بطاقة الأحجام ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <span className="text-base">🚛</span>
          <h2 className="font-semibold text-slate-700 text-sm">إحصائيات الأحجام</h2>
          <span className="ms-auto text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg">إجمالي هذا الشهر: {loading ? '...' : `${stats.monthVolume.toLocaleString()} م³`}</span>
        </div>
        {loading ? (
          <div className="p-5"><SkeletonCard /></div>
        ) : (
          <div className="p-5 space-y-5">

            {/* الإجمالي */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">إجمالي الحجم المنقول</p>
                <p className="text-3xl font-bold text-slate-800">
                  {stats.totalVolume.toLocaleString()}
                  <span className="text-sm font-normal text-slate-400 ms-1">م³</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-0.5">إجمالي النقلات</p>
                <p className="text-2xl font-bold text-slate-600">{stats.totalTrips.toLocaleString()} <span className="text-sm font-normal text-slate-400">نقلة</span></p>
              </div>
            </div>

            {/* شريط سائل vs جاف */}
            {(() => {
              const total = stats.liquidVolume + stats.dryVolume
              const liquidPct = total > 0 ? Math.round(stats.liquidVolume / total * 100) : 0
              const dryPct    = total > 0 ? Math.round(stats.dryVolume    / total * 100) : 0
              return (
                <div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-blue-400 transition-all" style={{ width: `${liquidPct}%` }} title="سائل" />
                    <div className="h-full bg-orange-400 transition-all" style={{ width: `${dryPct}%` }} title="جاف" />
                  </div>
                  <div className="flex justify-between text-[11px] mt-1.5">
                    <span className="text-blue-500">💧 سائل: {liquidPct}%</span>
                    <span className="text-orange-500">🪨 جاف: {dryPct}%</span>
                  </div>
                </div>
              )
            })()}

            {/* صف سائل + جاف */}
            <div className="grid grid-cols-2 gap-4 pt-1">

              {/* سائل */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base">💧</span>
                  <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg font-semibold">{stats.liquidCount} نقلة</span>
                </div>
                <p className="text-xs text-blue-600 mb-1">ربو سائل</p>
                <p className="text-2xl font-bold text-blue-800">{stats.liquidVolume.toLocaleString()} <span className="text-xs font-normal text-blue-500">م³</span></p>
                <div className="mt-2 pt-2 border-t border-blue-100 flex justify-between text-[10px] text-blue-500">
                  <span>هذا الشهر</span>
                  <span className="font-semibold">{stats.liquidVolumeMonth.toLocaleString()} م³ · {stats.liquidCountMonth} نقلة</span>
                </div>
              </div>

              {/* جاف */}
              <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base">🪨</span>
                  <span className="text-[11px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-lg font-semibold">{stats.dryCount} نقلة</span>
                </div>
                <p className="text-xs text-orange-600 mb-1">ربو جاف</p>
                <p className="text-2xl font-bold text-orange-800">{stats.dryVolume.toLocaleString()} <span className="text-xs font-normal text-orange-500">م³</span></p>
                <div className="mt-2 pt-2 border-t border-orange-100 flex justify-between text-[10px] text-orange-500">
                  <span>هذا الشهر</span>
                  <span className="font-semibold">{stats.dryVolumeMonth.toLocaleString()} م³ · {stats.dryCountMonth} نقلة</span>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ── بطاقة وجهات النقل ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
          <span className="text-base">📍</span>
          <h2 className="font-semibold text-slate-700 text-sm">وجهات النقل</h2>
          <span className="ms-auto text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg">إجمالي: {loading ? '...' : `${stats.totalTrips.toLocaleString()} نقلة`}</span>
        </div>
        {loading ? (
          <div className="p-5"><SkeletonCard /></div>
        ) : (() => {
          const sites = [
            { key: 'centralPress',    label: 'عصارة الربو المركزية', icon: '🏭', color: 'blue',    data: stats.dumpSiteStats.centralPress },
            { key: 'khalletSharbati', label: 'مكب خلة الشرباتي',    icon: '🗑️', color: 'emerald', data: stats.dumpSiteStats.khalletSharbati },
            { key: 'sa3ir',           label: 'مكب سعير',             icon: '🗑️', color: 'orange',  data: stats.dumpSiteStats.sa3ir },
          ] as const
          const totalForBar = sites.reduce((s, site) => s + site.data.count, 0)
          const colorMap = {
            blue:    { bar: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700',       sub: 'text-blue-500',    border: 'border-blue-100',    bg: 'bg-blue-50/60' },
            emerald: { bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', sub: 'text-emerald-600', border: 'border-emerald-100', bg: 'bg-emerald-50/60' },
            orange:  { bar: 'bg-orange-500',  badge: 'bg-orange-100 text-orange-700',   sub: 'text-orange-500',  border: 'border-orange-100',  bg: 'bg-orange-50/60' },
          }
          return (
            <div className="p-5 space-y-4">
              {/* شريط توزيع كلي */}
              {totalForBar > 0 && (
                <div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    {sites.map(site => (
                      <div key={site.key} className={`h-full ${colorMap[site.color].bar} transition-all`}
                        style={{ width: `${Math.round(site.data.count / totalForBar * 100)}%` }} title={site.label} />
                    ))}
                  </div>
                  <div className="flex gap-4 mt-1.5 flex-wrap">
                    {sites.map(site => (
                      <span key={site.key} className={`text-[10px] flex items-center gap-1 ${colorMap[site.color].sub}`}>
                        <span className={`w-2 h-2 rounded-full ${colorMap[site.color].bar}`} />
                        {site.label}: {totalForBar > 0 ? Math.round(site.data.count / totalForBar * 100) : 0}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* صفوف الوجهات */}
              <div className="space-y-2">
                {sites.map(site => {
                  const pct = totalForBar > 0 ? Math.round(site.data.count / totalForBar * 100) : 0
                  const c = colorMap[site.color]
                  return (
                    <div key={site.key} className={`rounded-xl border ${c.border} ${c.bg} px-4 py-3 flex items-center gap-4`}>
                      <span className="text-lg w-7 text-center flex-shrink-0">{site.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700">{site.label}</p>
                        <p className={`text-[10px] ${c.sub} mt-0.5`}>هذا الشهر: {site.data.countMonth} نقلة · {site.data.volumeMonth.toLocaleString()} م³</p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 text-right">
                        <div>
                          <p className="text-xl font-bold text-slate-800">{site.data.count.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-400">نقلة</p>
                        </div>
                        <div>
                          <p className="text-base font-semibold text-slate-600">{site.data.volume.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-400">م³</p>
                        </div>
                        <span className={`text-[11px] font-bold ${c.badge} px-2.5 py-1 rounded-lg w-12 text-center`}>{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>

      </div>{/* ── end grid (أحجام + وجهات) ─────────────────────── */}

      {/* ── إجراءات سريعة ──────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 mb-3 px-0.5">{t(T.dashboard.quickActions, lang)}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
