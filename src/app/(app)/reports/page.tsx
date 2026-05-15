'use client'
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  FileText, FileSpreadsheet, Filter, BarChart2, Droplets, Package,
  Building2, AlertTriangle, DollarSign, TrendingUp, TrendingDown, Truck, Users,
  MapPin, Coins, Activity
} from 'lucide-react'
import {
  getTrips, getFactoriesSummary, getPayments,
  getTripsForCosts, getTripsForContributions, getSettings, getDisbursements
} from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, Input } from '@/components/ui/Input'
import { format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
  LineChart, Line, ComposedChart, Area
} from 'recharts'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import { Document, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle, ImageRun, ShadingType, Packer } from 'docx'
import Link from 'next/link'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any

const WASTE_LABEL: Record<string, string> = { liquid: 'سائل', solid: 'جاف' }
const WASTE_COLORS: Record<string, string> = { liquid: '#3b82f6', solid: '#f59e0b', unknown: '#94a3b8' }

/** Returns the dump site label from trip data */
function getDumpSiteLabel(t: AnyData): string {
  if (t.dump_site === 'central_press') return 'عصارة الربو'
  if (t.dump_site === 'municipal_dump') {
    const km = Number(t.distance_km ?? 0)
    return km <= 7 ? 'خلة الشرباتي' : 'سعير'
  }
  return t.dump_site ?? '—'
}

type Tab = 'active_factories' | 'trips' | 'costs' | 'contributions' | 'overdue' | 'payments' | 'cashflow'

// Quick month buttons helper
function getMonthRange(monthsAgo: number): { from: string; to: string } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
  const end = monthsAgo === 0
    ? format(now, 'yyyy-MM-dd')
    : format(new Date(d.getFullYear(), d.getMonth() + 1, 0), 'yyyy-MM-dd')
  return { from: format(d, 'yyyy-MM-dd'), to: end }
}

export default function ReportsPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const firstOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')
  const [activeTab, setActiveTab] = useState<Tab>('active_factories')

  // ── Settings ──
  const [contributionPerTrip, setContributionPerTrip] = useState(50)
  useEffect(() => {
    getSettings().then(s => {
      const fc = s.find(x => x.key === 'factory_contribution')
      if (fc) setContributionPerTrip(Number(fc.value) || 50)
    }).catch(console.error)
  }, [])

  // ── Tab 1: المصانع النشطة ──
  const [afFrom, setAfFrom] = useState(firstOfMonth)
  const [afTo, setAfTo] = useState(today)
  const [afTrips, setAfTrips] = useState<AnyData[]>([])
  const [afLoading, setAfLoading] = useState(false)
  const [afLoaded, setAfLoaded] = useState(false)

  const loadActiveFactories = useCallback(async () => {
    setAfLoading(true)
    try {
      const data = await getTripsForContributions(afFrom, afTo)
      setAfTrips(data || [])
      setAfLoaded(true)
    } catch (e) { console.error(e) }
    finally { setAfLoading(false) }
  }, [afFrom, afTo])

  const afFactoryMap = useMemo(() => {
    const map = new Map<string, {
      id: string; name: string; trips: number
      due: number; collected: number; outstanding: number
    }>()
    afTrips.forEach((t: AnyData) => {
      const id = t.factory_id
      const name = t.factories?.name ?? 'غير معروف'
      if (!map.has(id)) map.set(id, { id, name, trips: 0, due: 0, collected: 0, outstanding: 0 })
      const e = map.get(id)!
      const contrib = Number(t.factory_contribution ?? contributionPerTrip)
      e.trips++
      e.due += contrib
      if (t.payment_status === 'paid') e.collected += contrib
      else e.outstanding += contrib
    })
    return Array.from(map.values()).sort((a, b) => b.trips - a.trips)
  }, [afTrips, contributionPerTrip])

  const afTotals = useMemo(() => ({
    factories: afFactoryMap.length,
    trips: afTrips.length,
    due: afFactoryMap.reduce((s, f) => s + f.due, 0),
    collected: afFactoryMap.reduce((s, f) => s + f.collected, 0),
    outstanding: afFactoryMap.reduce((s, f) => s + f.outstanding, 0),
  }), [afFactoryMap, afTrips.length])

  const afBarData = useMemo(() =>
    afFactoryMap.slice(0, 10).map(f => ({ name: f.name, trips: f.trips })),
    [afFactoryMap])

  const exportAfExcel = () => {
    const rows = afFactoryMap.map(f => ({
      'المصنع': f.name,
      'عدد النقلات': f.trips,
      'المساهمة المستحقة (₪)': f.due,
      'المحصّل (₪)': f.collected,
      'المتبقي (₪)': f.outstanding,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'المصانع النشطة')
    XLSX.writeFile(wb, `active-factories-${afFrom}-${afTo}.xlsx`)
  }

  // ── Tab 2: النقلات ──
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'credit'>('all')
  const [wasteFilter, setWasteFilter] = useState<'all' | 'liquid' | 'solid'>('all')
  const [factoryFilter, setFactoryFilter] = useState<string>('all')
  const [dumpFilter, setDumpFilter] = useState<'all' | 'central_press' | 'khallet' | 'sa3ir'>('all')
  const [trips, setTrips] = useState<AnyData[]>([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [tripsLoaded, setTripsLoaded] = useState(false)

  const applyPeriod = (p: 'today' | 'week' | 'month' | 'custom') => {
    setPeriod(p)
    const now = new Date()
    if (p === 'today') {
      setFrom(format(now, 'yyyy-MM-dd')); setTo(format(now, 'yyyy-MM-dd'))
    } else if (p === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7)
      setFrom(format(d, 'yyyy-MM-dd')); setTo(format(now, 'yyyy-MM-dd'))
    } else if (p === 'month') {
      setFrom(firstOfMonth); setTo(format(now, 'yyyy-MM-dd'))
    }
  }

  const generateTrips = useCallback(async () => {
    setTripsLoading(true)
    try {
      const filters: AnyData = { from, to }
      if (statusFilter !== 'all') filters.payment_status = statusFilter
      const data = await getTrips(filters)
      setTrips(data || [])
      setTripsLoaded(true)
    } catch (e) { console.error(e) }
    finally { setTripsLoading(false) }
  }, [from, to, statusFilter])

  const tripFactories = useMemo(() => {
    const map = new Map<string, string>()
    trips.forEach((t: AnyData) => { if (t.factory_id && t.factories?.name) map.set(t.factory_id, t.factories.name) })
    return Array.from(map.entries())
  }, [trips])

  const filtered = useMemo(() => trips.filter((t: AnyData) => {
    if (wasteFilter !== 'all' && t.waste_type !== wasteFilter) return false
    if (factoryFilter !== 'all' && t.factory_id !== factoryFilter) return false
    if (dumpFilter !== 'all') {
      const label = getDumpSiteLabel(t)
      if (dumpFilter === 'central_press' && label !== 'عصارة الربو') return false
      if (dumpFilter === 'khallet' && label !== 'خلة الشرباتي') return false
      if (dumpFilter === 'sa3ir' && label !== 'سعير') return false
    }
    return true
  }), [trips, wasteFilter, factoryFilter, dumpFilter])

  const totalTrips = filtered.length
  const totalAmount = filtered.reduce((s: number, t: AnyData) => s + Number(t.amount), 0)
  const totalVolume = filtered.reduce((s: number, t: AnyData) => s + (t.volume_m3 ? Number(t.volume_m3) : 0), 0)
  const totalTripCost = filtered.reduce((s: number, t: AnyData) => s + Number(t.trip_cost ?? 0), 0)
  const liquidTrips = filtered.filter((t: AnyData) => t.waste_type === 'liquid')
  const solidTrips = filtered.filter((t: AnyData) => t.waste_type === 'solid')
  const liquidVolume = liquidTrips.reduce((s: number, t: AnyData) => s + (t.volume_m3 ? Number(t.volume_m3) : 0), 0)
  const solidVolume = solidTrips.reduce((s: number, t: AnyData) => s + (t.volume_m3 ? Number(t.volume_m3) : 0), 0)
  const paidTrips = filtered.filter((t: AnyData) => t.payment_status === 'paid')
  const creditTripsFiltered = filtered.filter((t: AnyData) => t.payment_status === 'credit')

  const dailyChart = useMemo(() => {
    const grouped: Record<string, { liquid: number; solid: number; unknown: number }> = {}
    filtered.forEach((t: AnyData) => {
      const d = t.trip_date ? format(new Date(t.trip_date), 'dd/MM') : format(new Date(t.created_at), 'dd/MM')
      if (!grouped[d]) grouped[d] = { liquid: 0, solid: 0, unknown: 0 }
      if (t.waste_type === 'liquid') grouped[d].liquid++
      else if (t.waste_type === 'solid') grouped[d].solid++
      else grouped[d].unknown++
    })
    return Object.entries(grouped).map(([date, v]) => ({ date, ...v }))
  }, [filtered])

  const factoryChart = useMemo(() => {
    const map = new Map<string, { name: string; liquid: number; solid: number; unknown: number; volume: number }>()
    filtered.forEach((t: AnyData) => {
      const name = t.factories?.name ?? 'غير معروف'
      if (!map.has(name)) map.set(name, { name, liquid: 0, solid: 0, unknown: 0, volume: 0 })
      const entry = map.get(name)!
      if (t.waste_type === 'liquid') entry.liquid++
      else if (t.waste_type === 'solid') entry.solid++
      else entry.unknown++
      entry.volume += t.volume_m3 ? Number(t.volume_m3) : 0
    })
    return Array.from(map.values()).sort((a, b) => (b.liquid + b.solid + b.unknown) - (a.liquid + a.solid + a.unknown))
  }, [filtered])

  const dumpSiteChart = useMemo(() => {
    const counts: Record<string, number> = {}
    filtered.forEach((t: AnyData) => {
      const label = getDumpSiteLabel(t)
      counts[label] = (counts[label] ?? 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [filtered])

  const pieData = [
    { name: 'سائل', value: liquidTrips.length, color: WASTE_COLORS.liquid },
    { name: 'جاف', value: solidTrips.length, color: WASTE_COLORS.solid },
    { name: 'غير محدد', value: filtered.filter((t: AnyData) => !t.waste_type).length, color: WASTE_COLORS.unknown },
  ].filter(d => d.value > 0)

  const exportTripsExcel = () => {
    const tripsRows = filtered.map((t: AnyData, i: number) => ({
      '#': i + 1, 'المصنع': t.factories?.name ?? '', 'المنطقة': t.factories?.region ?? '',
      'رقم القسيمة': t.coupon_number ?? '', 'اسم السائق': t.driver_name ?? '',
      'نوع الربو': t.waste_type ? WASTE_LABEL[t.waste_type] : 'غير محدد',
      'الحجم (م³)': t.volume_m3 ?? '', 'تكلفة النقلة (₪)': t.trip_cost ?? '', 'المبلغ (₪)': t.amount,
      'حالة الدفع': t.payment_status === 'paid' ? 'مدفوع' : 'ذمة',
      'وجهة النقل': getDumpSiteLabel(t),
      'تاريخ النقلة': t.trip_date ?? '', 'ملاحظات': t.notes ?? '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tripsRows), 'النقلات')
    XLSX.writeFile(wb, `trips-${from}-to-${to}.xlsx`)
  }

  const exportTripsPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFontSize(14)
    doc.text(`Trips Report: ${from} to ${to}`, 14, 15)
    doc.setFontSize(9)
    doc.text(`Total: ${totalTrips} | Liquid: ${liquidTrips.length} | Solid: ${solidTrips.length} | Paid: ${paidTrips.length} | Credit: ${creditTripsFiltered.length}`, 14, 22)
    doc.line(14, 25, 280, 25)
    const cols: [string, number][] = [['#', 10], ['Factory', 50], ['Type', 18], ['Vol', 16], ['Amount', 20], ['Status', 18], ['Date', 25]]
    let x = 14; let y = 32
    doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    cols.forEach(([h, w]) => { doc.text(h, x, y); x += w })
    doc.setFont('helvetica', 'normal'); y += 5
    filtered.forEach((t: AnyData, i: number) => {
      if (y > 185) { doc.addPage(); y = 20 }
      x = 14
      const row = [
        String(i + 1), (t.factories?.name ?? '').slice(0, 18),
        t.waste_type === 'liquid' ? 'Liquid' : t.waste_type === 'solid' ? 'Solid' : '-',
        t.volume_m3 ? String(t.volume_m3) : '-', `${t.amount} ILS`,
        t.payment_status === 'paid' ? 'Paid' : 'Credit', t.trip_date ?? '',
      ]
      row.forEach((cell, ci) => { doc.text(cell, x, y); x += cols[ci][1] })
      y += 6
    })
    doc.save(`trips-${from}-to-${to}.pdf`)
  }

  // ── Tab 3: التكاليف ──
  const [costFrom, setCostFrom] = useState(firstOfMonth)
  const [costTo, setCostTo] = useState(today)
  const [costTrips, setCostTrips] = useState<AnyData[]>([])
  const [costsLoading, setCostsLoading] = useState(false)
  const [costsLoaded, setCostsLoaded] = useState(false)

  const loadCosts = useCallback(async () => {
    setCostsLoading(true)
    try {
      const data = await getTripsForCosts(costFrom, costTo)
      setCostTrips(data || [])
      setCostsLoaded(true)
    } catch (e) { console.error(e) }
    finally { setCostsLoading(false) }
  }, [costFrom, costTo])

  const costByFactory = useMemo(() => {
    const map = new Map<string, { name: string; trips: number; cost: number }>()
    costTrips.forEach((t: AnyData) => {
      const name = t.factories?.name ?? 'غير معروف'
      if (!map.has(name)) map.set(name, { name, trips: 0, cost: 0 })
      const e = map.get(name)!
      e.trips++
      e.cost += Number(t.trip_cost ?? 0)
    })
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost)
  }, [costTrips])

  const costByMonth = useMemo(() => {
    const map: Record<string, number> = {}
    costTrips.forEach((t: AnyData) => {
      if (!t.trip_date) return
      const mon = t.trip_date.substring(0, 7)
      map[mon] = (map[mon] ?? 0) + Number(t.trip_cost ?? 0)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cost]) => ({ month, cost: +cost.toFixed(2) }))
  }, [costTrips])

  const totalCost = useMemo(() => costTrips.reduce((s, t) => s + Number(t.trip_cost ?? 0), 0), [costTrips])

  const exportCostsExcel = () => {
    const rows = costByFactory.map(f => ({
      'المصنع': f.name, 'عدد النقلات': f.trips, 'إجمالي التكلفة (₪)': +f.cost.toFixed(2),
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'التكاليف حسب المصنع')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(costByMonth.map(r => ({ 'الشهر': r.month, 'التكلفة (₪)': r.cost }))), 'التكاليف الشهرية')
    XLSX.writeFile(wb, `costs-${costFrom}-${costTo}.xlsx`)
  }

  // ── Tab 4: المساهمات ──
  const [contFrom, setContFrom] = useState(firstOfMonth)
  const [contTo, setContTo] = useState(today)
  const [contTrips, setContTrips] = useState<AnyData[]>([])
  const [contLoading, setContLoading] = useState(false)
  const [contLoaded, setContLoaded] = useState(false)

  const loadContributions = useCallback(async () => {
    setContLoading(true)
    try {
      const data = await getTripsForContributions(contFrom, contTo)
      setContTrips(data || [])
      setContLoaded(true)
    } catch (e) { console.error(e) }
    finally { setContLoading(false) }
  }, [contFrom, contTo])

  const contByFactory = useMemo(() => {
    const map = new Map<string, { name: string; trips: number; due: number; collected: number; outstanding: number }>()
    contTrips.forEach((t: AnyData) => {
      const name = t.factories?.name ?? 'غير معروف'
      if (!map.has(name)) map.set(name, { name, trips: 0, due: 0, collected: 0, outstanding: 0 })
      const e = map.get(name)!
      const contrib = Number(t.factory_contribution ?? contributionPerTrip)
      e.trips++
      e.due += contrib
      if (t.payment_status === 'paid') e.collected += contrib
      else e.outstanding += contrib
    })
    return Array.from(map.values()).sort((a, b) => b.due - a.due)
  }, [contTrips, contributionPerTrip])

  const contTotals = useMemo(() => ({
    due: contByFactory.reduce((s, f) => s + f.due, 0),
    collected: contByFactory.reduce((s, f) => s + f.collected, 0),
    outstanding: contByFactory.reduce((s, f) => s + f.outstanding, 0),
  }), [contByFactory])

  const contPieData = [
    { name: 'محصّل', value: contTotals.collected, color: '#10b981' },
    { name: 'متبقي', value: contTotals.outstanding, color: '#f59e0b' },
  ].filter(d => d.value > 0)

  const exportContribExcel = () => {
    const rows = contByFactory.map(f => ({
      'المصنع': f.name, 'عدد النقلات': f.trips,
      'المستحق (₪)': f.due, 'المحصّل (₪)': f.collected,
      'المتبقي (₪)': f.outstanding,
      'نسبة التحصيل (%)': f.due > 0 ? +(f.collected / f.due * 100).toFixed(1) : 0,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'المساهمات')
    XLSX.writeFile(wb, `contributions-${contFrom}-${contTo}.xlsx`)
  }

  // ── Tab 5: الذمم ──
  const [factoriesSummary, setFactoriesSummary] = useState<AnyData[]>([])
  const [factoriesLoading, setFactoriesLoading] = useState(false)
  const [factoriesLoaded, setFactoriesLoaded] = useState(false)

  const loadFactories = useCallback(async () => {
    setFactoriesLoading(true)
    try {
      const data = await getFactoriesSummary()
      setFactoriesSummary(data)
      setFactoriesLoaded(true)
    } catch (e) { console.error(e) }
    finally { setFactoriesLoading(false) }
  }, [])

  const overdueFactories = useMemo(() =>
    factoriesSummary.filter(f => f.balance > 0).sort((a: AnyData, b: AnyData) => b.balance - a.balance),
    [factoriesSummary])
  const totalDebt = useMemo(() => factoriesSummary.reduce((s: number, f: AnyData) => s + f.balance, 0), [factoriesSummary])

  // ── Tab 6: الدفعات ──
  const [payFrom, setPayFrom] = useState(firstOfMonth)
  const [payTo, setPayTo] = useState(today)
  const [payments, setPayments] = useState<AnyData[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentsLoaded, setPaymentsLoaded] = useState(false)

  const generatePayments = useCallback(async () => {
    setPaymentsLoading(true)
    try {
      const data = await getPayments({ from: payFrom, to: payTo })
      setPayments(data || [])
      setPaymentsLoaded(true)
    } catch (e) { console.error(e) }
    finally { setPaymentsLoading(false) }
  }, [payFrom, payTo])

  const totalPaymentsAmount = useMemo(() =>
    payments.reduce((s: number, p: AnyData) => s + Number(p.amount_paid), 0), [payments])

  const paymentsByFactory = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>()
    payments.forEach((p: AnyData) => {
      const name = p.factories?.name ?? 'غير معروف'
      if (!map.has(name)) map.set(name, { name, total: 0, count: 0 })
      const e = map.get(name)!
      e.total += Number(p.amount_paid); e.count++
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [payments])

  const exportPaymentsExcel = () => {
    const rows = payments.map((p: AnyData, i: number) => ({
      '#': i + 1, 'المصنع': p.factories?.name ?? '',
      'المبلغ المدفوع (₪)': p.amount_paid,
      'التاريخ': p.date ? format(new Date(p.date), 'dd/MM/yyyy') : '',
      'ملاحظات': p.notes ?? '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'الدفعات')
    XLSX.writeFile(wb, `payments-${payFrom}-to-${payTo}.xlsx`)
  }

  // ── Tab 7: التدفق النقدي ──
  const [cfTrips, setCfTrips] = useState<AnyData[]>([])
  const [cfDisbursements, setCfDisbursements] = useState<AnyData[]>([])
  const [cfBudget, setCfBudget] = useState(0)
  const [cfLoading, setCfLoading] = useState(false)
  const [cfLoaded, setCfLoaded] = useState(false)
  const [cfLongTripPerMonth, setCfLongTripPerMonth] = useState(0)
  const [cfLongTripCost, setCfLongTripCost] = useState(0)
  // وضع السيناريو: 'current' | 'partial' | 'full'
  const [cfScenario, setCfScenario] = useState<'current' | 'partial' | 'full'>('current')
  const [cfSa3irTripsPerMonth, setCfSa3irTripsPerMonth] = useState(0)
  const [cfSa3irCostPerTrip, setCfSa3irCostPerTrip] = useState(0)
  const cfMainChartRef = useRef<HTMLDivElement>(null)
  const cf2027ChartRef = useRef<HTMLDivElement>(null)

  const loadCashFlow = useCallback(async () => {
    setCfLoading(true)
    try {
      const [trips, disbs, settings] = await Promise.all([
        getTripsForCosts(),
        getDisbursements(),
        getSettings(),
      ])
      setCfTrips(trips || [])
      setCfDisbursements(disbs || [])
      const budgetSetting = settings.find((s: AnyData) => s.key === 'project_budget')
      setCfBudget(Number(budgetSetting?.value ?? 0))
      setCfLoaded(true)
    } catch (e) { console.error(e) }
    finally { setCfLoading(false) }
  }, [])

  // الشهر الحالي بصيغة YYYY-MM
  const cfCurrentYM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  // تجميع شهري تاريخي
  const cfMonthlyHistory = useMemo(() => {
    const map: Record<string, { trips: number; cost: number; liquid: number; solid: number }> = {}
    cfTrips.forEach((t: AnyData) => {
      if (!t.trip_date) return
      const mon = t.trip_date.substring(0, 7)
      if (!map[mon]) map[mon] = { trips: 0, cost: 0, liquid: 0, solid: 0 }
      map[mon].trips++
      map[mon].cost += Number(t.trip_cost ?? 0)
      if (t.waste_type === 'liquid') map[mon].liquid++
      else if (t.waste_type === 'solid') map[mon].solid++
    })
    let cumulative = 0
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => {
        cumulative += v.cost
        return { month, ...v, cumulative: +cumulative.toFixed(0), forecast: false }
      })
  }, [cfTrips])

  // متوسط آخر 3 أشهر للتوقع (باستثناء الشهر الجاري غير المكتمل)
  const cfAvgMonthly = useMemo(() => {
    const completedMonths = cfMonthlyHistory.filter(m => m.month < cfCurrentYM)
    const last3 = completedMonths.slice(-3)
    if (cfScenario === 'full') {
      // سعير مفعّل كلياً: تجاهل التاريخ، كل النقلات بسعر سعير
      const cost = cfSa3irTripsPerMonth * cfSa3irCostPerTrip
      return { trips: cfSa3irTripsPerMonth, cost }
    }
    if (last3.length === 0) {
      return { trips: 0, cost: 0 }
    }
    const baseTrips = Math.round(last3.reduce((s, m) => s + m.trips, 0) / last3.length)
    const baseCost = Math.round(last3.reduce((s, m) => s + m.cost, 0) / last3.length)
    if (cfScenario === 'partial') {
      // سعير جزئي: نفس عدد النقلات الإجمالي، X منها تحل محل نقلات عادية وتروح لسعير
      const regularCostPerTrip = baseTrips > 0 ? baseCost / baseTrips : 0
      const sa3irTrips = Math.min(cfLongTripPerMonth, baseTrips)
      const regularTrips = baseTrips - sa3irTrips
      const newCost = Math.round(regularTrips * regularCostPerTrip + sa3irTrips * cfLongTripCost)
      return { trips: baseTrips, cost: newCost }
    }
    // الوضع الحالي: متوسط تاريخي فقط
    return { trips: baseTrips, cost: baseCost }
  }, [cfMonthlyHistory, cfCurrentYM, cfScenario, cfLongTripPerMonth, cfLongTripCost, cfSa3irTripsPerMonth, cfSa3irCostPerTrip])

  // توقعات 6 أشهر قادمة
  const cfForecast = useMemo(() => {
    const lastCumulative = cfMonthlyHistory.length > 0 ? cfMonthlyHistory[cfMonthlyHistory.length - 1].cumulative : 0
    let cumulative = lastCumulative
    const results = []
    const now = new Date()
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      cumulative += cfAvgMonthly.cost
      results.push({
        month,
        trips: cfAvgMonthly.trips,
        cost: cfAvgMonthly.cost,
        liquid: 0, solid: 0,
        cumulative: Math.round(cumulative),
        forecast: true,
        budgetRemaining: Math.max(0, cfBudget - cumulative),
      })
    }
    return results
  }, [cfMonthlyHistory, cfAvgMonthly, cfBudget])

  // بيانات الرسم البياني (تاريخي + توقع)
  const cfChartData = useMemo(() => [
    ...cfMonthlyHistory.map(m => ({ ...m, forecastCost: null, forecastCumulative: null })),
    ...cfForecast.map(m => ({ ...m, forecastCost: m.cost, forecastCumulative: m.cumulative, cost: null, cumulative: null })),
  ], [cfMonthlyHistory, cfForecast])

  // مجاميع مالية
  const cfTotalCost = useMemo(() => cfTrips.reduce((s: number, t: AnyData) => s + Number(t.trip_cost ?? 0), 0), [cfTrips])
  const cfTotalDisbursed = useMemo(() =>
    cfDisbursements.filter((d: AnyData) => d.status === 'closed').reduce((s: number, d: AnyData) => s + Number(d.net_payment ?? d.disbursed_amount ?? 0), 0),
    [cfDisbursements])
  const cfAvgCostPerTrip = useMemo(() => {
    const priced = cfTrips.filter((t: AnyData) => t.trip_cost)
    return priced.length > 0 ? cfTotalCost / priced.length : 0
  }, [cfTrips, cfTotalCost])
  const cfEstimatedTotalCost = useMemo(() => {
    const lastForecast = cfForecast[cfForecast.length - 1]
    return lastForecast ? lastForecast.cumulative : cfTotalCost
  }, [cfForecast, cfTotalCost])
  const cfGap = cfBudget > 0 ? cfBudget - cfEstimatedTotalCost : null
  const cfRunwayMonths = cfAvgMonthly.cost > 0 && cfBudget > 0
    ? Math.max(0, Math.floor((cfBudget - cfTotalCost) / cfAvgMonthly.cost))
    : null

  // توقع حتى نهاية 2027
  const cfProjection2027 = useMemo(() => {
    const now = new Date()
    const monthsRemaining = (2027 - now.getFullYear()) * 12 + (12 - (now.getMonth() + 1))
    const months = Math.max(0, monthsRemaining)
    const estimatedTotal = cfTotalCost + months * cfAvgMonthly.cost
    const budgetRemaining2027 = cfBudget > 0 ? cfBudget - estimatedTotal : null
    const tripsToExhaust = cfAvgCostPerTrip > 0 && cfBudget > 0
      ? Math.floor((cfBudget - cfTotalCost) / cfAvgCostPerTrip)
      : null
    const tripsPerMonthNeeded = tripsToExhaust !== null && months > 0
      ? Math.ceil(tripsToExhaust / months)
      : null
    const pricedWithVol = cfTrips.filter((t: AnyData) => t.volume_m3 && t.trip_cost)
    const avgVol = pricedWithVol.length > 0
      ? pricedWithVol.reduce((s: number, t: AnyData) => s + Number(t.volume_m3 ?? 0), 0) / pricedWithVol.length
      : 0
    const volumeToExhaust = tripsToExhaust !== null && avgVol > 0 ? Math.round(tripsToExhaust * avgVol) : null
    // تاريخ نفاد التمويل بالمعدل الحالي
    const remainingBudgetNow = cfBudget > 0 ? Math.max(0, cfBudget - cfTotalCost) : 0
    const arabicMonthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
    const monthsToExhaust = cfAvgMonthly.cost > 0 && cfBudget > 0 ? remainingBudgetNow / cfAvgMonthly.cost : null
    const exhaustionDateObj = monthsToExhaust !== null
      ? new Date(now.getFullYear(), now.getMonth() + Math.ceil(monthsToExhaust), 1)
      : null
    const exhaustionDate = exhaustionDateObj
      ? `${arabicMonthNames[exhaustionDateObj.getMonth()]} ${exhaustionDateObj.getFullYear()}`
      : null
    const exhaustionIsBeforeEnd2027 = exhaustionDateObj !== null
      && (exhaustionDateObj.getFullYear() < 2027
          || (exhaustionDateObj.getFullYear() === 2027 && exhaustionDateObj.getMonth() <= 11))
    const monthsBefore2027End = exhaustionIsBeforeEnd2027 && monthsToExhaust !== null
      ? Math.max(0, months - Math.ceil(monthsToExhaust))
      : 0
    // المعدل الشهري المطلوب لاستنفاد بنهاية 2027
    const requiredMonthlyCost = months > 0 && remainingBudgetNow > 0 ? Math.round(remainingBudgetNow / months) : null
    const requiredMonthlyTrips = requiredMonthlyCost !== null && cfAvgCostPerTrip > 0
      ? Math.ceil(requiredMonthlyCost / cfAvgCostPerTrip)
      : null
    const costDiff = requiredMonthlyCost !== null ? requiredMonthlyCost - cfAvgMonthly.cost : null
    const tripsDiff = requiredMonthlyTrips !== null ? requiredMonthlyTrips - cfAvgMonthly.trips : null
    return {
      monthsRemaining: months, estimatedTotal, budgetRemaining2027,
      tripsToExhaust, tripsPerMonthNeeded, volumeToExhaust,
      exhaustionDate, exhaustionIsBeforeEnd2027, monthsBefore2027End,
      requiredMonthlyCost, requiredMonthlyTrips, costDiff, tripsDiff,
      remainingBudgetNow,
    }
  }, [cfTotalCost, cfAvgMonthly, cfBudget, cfTrips, cfAvgCostPerTrip])

  // مقارنة سيناريو سعير الكامل لأغراض العرض الجانبي (A+C)
  const cfSa3irComparison = useMemo(() => {
    if (!cfSa3irTripsPerMonth || !cfSa3irCostPerTrip) return null
    const sa3irMonthly = { trips: cfSa3irTripsPerMonth, cost: cfSa3irTripsPerMonth * cfSa3irCostPerTrip }
    const now = new Date()
    const monthsRemaining = Math.max(0, (2027 - now.getFullYear()) * 12 + (12 - (now.getMonth() + 1)))
    const estimatedTotal = cfTotalCost + monthsRemaining * sa3irMonthly.cost
    const budgetRemaining2027 = cfBudget > 0 ? cfBudget - estimatedTotal : null
    const remainingNow = cfBudget > 0 ? Math.max(0, cfBudget - cfTotalCost) : 0
    const arabicMonthNames = ['\u064a\u0646\u0627\u064a\u0631','\u0641\u0628\u0631\u0627\u064a\u0631','\u0645\u0627\u0631\u0633','\u0623\u0628\u0631\u064a\u0644','\u0645\u0627\u064a\u0648','\u064a\u0648\u0646\u064a\u0648','\u064a\u0648\u0644\u064a\u0648','\u0623\u063a\u0633\u0637\u0633','\u0633\u0628\u062a\u0645\u0628\u0631','\u0623\u0643\u062a\u0648\u0628\u0631','\u0646\u0648\u0641\u0645\u0628\u0631','\u062f\u064a\u0633\u0645\u0628\u0631']
    const monthsToExhaust = sa3irMonthly.cost > 0 && cfBudget > 0 ? remainingNow / sa3irMonthly.cost : null
    const exhaustionDateObj = monthsToExhaust !== null
      ? new Date(now.getFullYear(), now.getMonth() + Math.ceil(monthsToExhaust), 1) : null
    const exhaustionDate = exhaustionDateObj
      ? `${arabicMonthNames[exhaustionDateObj.getMonth()]} ${exhaustionDateObj.getFullYear()}` : null
    const tripsToExhaust = cfSa3irCostPerTrip > 0 && cfBudget > 0
      ? Math.floor(remainingNow / cfSa3irCostPerTrip) : null
    return { sa3irMonthly, estimatedTotal, budgetRemaining2027, exhaustionDate, tripsToExhaust, monthsRemaining }
  }, [cfTotalCost, cfBudget, cfSa3irTripsPerMonth, cfSa3irCostPerTrip])

  // مقارنة شاملة للثلاث سيناريوهات (مستقل عن السيناريو المختار حالياً)
  const cfAllScenarios = useMemo(() => {
    const completedMonths = cfMonthlyHistory.filter(m => m.month < cfCurrentYM)
    const last3 = completedMonths.slice(-3)
    const now = new Date()
    const monthsRemaining = Math.max(0, (2027 - now.getFullYear()) * 12 + (12 - (now.getMonth() + 1)))
    const remainingNow = cfBudget > 0 ? Math.max(0, cfBudget - cfTotalCost) : 0
    const arabicMonthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
    const getMetrics = (monthly: { trips: number; cost: number }) => {
      const estimatedTotal = Math.round(cfTotalCost + monthsRemaining * monthly.cost)
      const budgetRemaining2027 = cfBudget > 0 ? Math.round(cfBudget - estimatedTotal) : null
      const monthsToExhaust = monthly.cost > 0 && cfBudget > 0 ? remainingNow / monthly.cost : null
      const exhaustionDateObj = monthsToExhaust !== null
        ? new Date(now.getFullYear(), now.getMonth() + Math.ceil(monthsToExhaust), 1) : null
      const exhaustionDate = exhaustionDateObj
        ? `${arabicMonthNames[exhaustionDateObj.getMonth()]} ${exhaustionDateObj.getFullYear()}` : null
      const tripsToExhaust = monthly.cost > 0 && monthly.trips > 0 && cfBudget > 0
        ? Math.floor(remainingNow / (monthly.cost / monthly.trips)) : null
      const costPerTrip = monthly.trips > 0 ? Math.round(monthly.cost / monthly.trips) : 0
      return { monthly, estimatedTotal, budgetRemaining2027, exhaustionDate, tripsToExhaust, costPerTrip }
    }
    let baseTrips = 0, baseCost = 0, regularCostPerTrip = 0
    if (last3.length > 0) {
      baseTrips = Math.round(last3.reduce((s, m) => s + m.trips, 0) / last3.length)
      baseCost  = Math.round(last3.reduce((s, m) => s + m.cost,  0) / last3.length)
      regularCostPerTrip = baseTrips > 0 ? baseCost / baseTrips : 0
    }
    const current = getMetrics({ trips: baseTrips, cost: baseCost })
    const sa3irTripsP = Math.min(cfLongTripPerMonth, baseTrips)
    const regularTripsP = baseTrips - sa3irTripsP
    const partialCost = cfLongTripPerMonth > 0 && cfLongTripCost > 0
      ? Math.round(regularTripsP * regularCostPerTrip + sa3irTripsP * cfLongTripCost)
      : baseCost
    const partial = getMetrics({ trips: baseTrips, cost: partialCost })
    const partialReady = cfLongTripPerMonth > 0 && cfLongTripCost > 0
    const full = getMetrics({ trips: cfSa3irTripsPerMonth, cost: cfSa3irTripsPerMonth * cfSa3irCostPerTrip })
    const fullReady = cfSa3irTripsPerMonth > 0 && cfSa3irCostPerTrip > 0
    return { current, partial, partialReady, full, fullReady, regularCostPerTrip: Math.round(regularCostPerTrip) }
  }, [cfMonthlyHistory, cfCurrentYM, cfBudget, cfTotalCost, cfLongTripPerMonth, cfLongTripCost, cfSa3irTripsPerMonth, cfSa3irCostPerTrip])

  // بيانات شارت 2027 (فعلي + توقع حتى ديسمبر 2027)
  const cf2027ChartData = useMemo(() => {
    const data: { month: string; cost: number | null; forecastCost: number | null; remaining: number | null }[] = []
    cfMonthlyHistory.forEach(m => {
      data.push({
        month: m.month,
        cost: Math.round(m.cost),
        forecastCost: null,
        remaining: cfBudget > 0 ? Math.max(0, Math.round(cfBudget - m.cumulative)) : null,
      })
    })
    const now = new Date()
    const lastCumulative = cfMonthlyHistory.length > 0 ? cfMonthlyHistory[cfMonthlyHistory.length - 1].cumulative : 0
    let cumulative = lastCumulative
    for (let i = 1; i <= 60; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      if (d.getFullYear() > 2027) break
      cumulative += cfAvgMonthly.cost
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      data.push({
        month,
        cost: null,
        forecastCost: Math.round(cfAvgMonthly.cost),
        remaining: cfBudget > 0 ? Math.max(0, Math.round(cfBudget - cumulative)) : null,
      })
      if (d.getFullYear() === 2027 && d.getMonth() === 11) break
    }
    return data
  }, [cfMonthlyHistory, cfAvgMonthly, cfBudget])

  // ── Word export ──
  const exportCfWord = useCallback(async () => {
    const html2canvas = (await import('html2canvas')).default

    // Capture chart images
    const captureChart = async (ref: React.RefObject<HTMLDivElement | null>): Promise<string | null> => {
      if (!ref.current) return null
      try {
        const canvas = await html2canvas(ref.current, { backgroundColor: '#ffffff', scale: 1.5 })
        return canvas.toDataURL('image/png')
      } catch { return null }
    }

    const [mainChartImg, chart2027Img] = await Promise.all([
      captureChart(cfMainChartRef),
      captureChart(cf2027ChartRef),
    ])

    const dataUrlToUint8 = (dataUrl: string | null): Uint8Array | null => {
      if (!dataUrl) return null
      const base64 = dataUrl.split(',')[1]
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return bytes
    }

    const mainChartBytes = dataUrlToUint8(mainChartImg)
    const chart2027Bytes = dataUrlToUint8(chart2027Img)

    const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
    const now = new Date()
    const reportDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    // ── Helper builders ──
    const h1 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } })
    const h2 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } })
    const h3 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } })
    const p = (text: string, opts?: { bold?: boolean; color?: string; size?: number }) => new Paragraph({
      children: [new TextRun({ text, bold: opts?.bold, color: opts?.color, size: opts?.size ?? 22 })],
      spacing: { after: 100 },
    })
    const blank = () => new Paragraph({ text: '' })

    const cell = (text: string, opts?: { bold?: boolean; color?: string; shading?: string; width?: number }) =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text, bold: opts?.bold ?? false, color: opts?.color, size: 20 })],
          alignment: AlignmentType.CENTER,
        })],
        shading: opts?.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
        width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
      })

    const hdrRow = (cols: string[]) => new TableRow({
      children: cols.map(c => cell(c, { bold: true, shading: '1e3a5f', color: 'FFFFFF' })),
      tableHeader: true,
    })

    const dataRow = (cols: string[], shade?: boolean) => new TableRow({
      children: cols.map(c => cell(c)),
      ...(shade ? {} : {}),
    })

    const tbl = (rows: TableRow[]) => new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      },
    })

    const imgPara = (bytes: Uint8Array, w = 580, h = 250) => new Paragraph({
      children: [new ImageRun({ data: bytes, transformation: { width: w, height: h }, type: 'png' })],
      spacing: { before: 150, after: 150 },
    })

    // ── Document sections ──
    const children: (Paragraph | Table)[] = [
      // Cover
      new Paragraph({ text: 'Cash Flow Analysis Report', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: `Generated: ${reportDate}`, size: 22, color: '64748B' })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
      blank(),

      // 1. Executive Summary
      h1('1. Executive Summary'),
      p('This report provides a comprehensive analysis of the project cash flow, including historical trip costs, disbursements, monthly trends, 6-month forecasts, and a full projection to the end of 2027.'),
      blank(),

      // KPI summary table
      tbl([
        hdrRow(['Indicator', 'Value']),
        dataRow(['Total Project Budget', cfBudget > 0 ? `${fmt(cfBudget)} ₪` : 'Not Set']),
        dataRow(['Total Cost Executed (All Time)', `${fmt(cfTotalCost)} ₪`]),
        dataRow(['Total Disbursed (Closed Claims)', `${fmt(cfTotalDisbursed)} ₪`]),
        dataRow(['Avg Monthly Cost (Last 3 Months)', `${fmt(cfAvgMonthly.cost)} ₪`]),
        dataRow(['Avg Trips per Month (Last 3 Months)', `${cfAvgMonthly.trips} trips`]),
        dataRow(['Avg Cost per Trip', cfAvgCostPerTrip > 0 ? `${fmt(cfAvgCostPerTrip)} ₪` : 'N/A']),
        dataRow(['Months of Historical Data', `${cfMonthlyHistory.length} months`]),
        ...(cfBudget > 0 ? [
          dataRow(['Budget Remaining (Current)', `${fmt(cfProjection2027.remainingBudgetNow)} ₪`]),
          dataRow(['% of Budget Spent', `${Math.min(100, Math.round(cfTotalCost / cfBudget * 100))}%`]),
        ] : []),
      ]),
      blank(),

      // 2. Budget Overview
      h1('2. Budget Overview'),
      p('The following table summarizes the financial position of the project against the allocated budget.'),
      blank(),
      ...(cfBudget > 0 ? [
        tbl([
          hdrRow(['Item', 'Amount (₪)', 'Notes']),
          dataRow(['Project Budget', `${fmt(cfBudget)} ₪`, 'Configured in Settings']),
          dataRow(['Total Cost Executed', `${fmt(cfTotalCost)} ₪`, 'Sum of all trip costs']),
          dataRow(['Total Disbursed', `${fmt(cfTotalDisbursed)} ₪`, 'Closed disbursement claims']),
          dataRow(['Budget Remaining', `${fmt(cfProjection2027.remainingBudgetNow)} ₪`, `${Math.round(cfProjection2027.remainingBudgetNow / cfBudget * 100)}% of total`]),
        ]),
      ] : [p('No budget configured. Please set project_budget in Settings.', { color: 'EF4444' })]),
      blank(),

      // 3. Monthly Historical Data
      h1('3. Monthly Historical Performance'),
      p(`Historical trip cost data aggregated by month. The current month (${cfCurrentYM}) is partial and excluded from forecasting averages.`),
      blank(),
      tbl([
        hdrRow(['Month', 'Trips', 'Liquid', 'Solid', 'Monthly Cost (₪)', 'Cumulative (₪)', ...(cfBudget > 0 ? ['Budget Remaining (₪)'] : [])]),
        ...cfMonthlyHistory.map(m => {
          const remaining = cfBudget > 0 ? cfBudget - m.cumulative : null
          return dataRow([
            m.month + (m.month === cfCurrentYM ? ' (current)' : ''),
            String(m.trips),
            String(m.liquid || 0),
            String(m.solid || 0),
            fmt(m.cost),
            fmt(m.cumulative),
            ...(cfBudget > 0 && remaining !== null ? [fmt(remaining)] : []),
          ])
        }),
        dataRow([
          'TOTAL',
          String(cfTrips.length),
          String(cfTrips.filter((t: AnyData) => t.waste_type === 'liquid').length),
          String(cfTrips.filter((t: AnyData) => t.waste_type === 'solid').length),
          fmt(cfTotalCost),
          fmt(cfTotalCost),
          ...(cfBudget > 0 ? [fmt(cfProjection2027.remainingBudgetNow)] : []),
        ]),
      ]),
      blank(),

      // Chart 1
      h2('Chart: Monthly Cost & Cumulative Trend'),
      p('Orange bars = actual monthly cost. Light orange bars = forecast. Blue line = cumulative cost. Green dashed line = budget ceiling.'),
      ...(mainChartBytes ? [imgPara(mainChartBytes, 580, 260)] : [p('(Chart not available)', { color: '94A3B8' })]),
      blank(),

      // 4. 6-Month Forecast
      h1('4. Six-Month Forecast'),
      p(`Forecast scenario: ${cfScenario === 'full' ? 'Sa3ir Full (all trips long-distance)' : cfScenario === 'partial' ? 'Sa3ir Partial (extra long-distance trips added)' : 'Current average'}. Rate: ${fmt(cfAvgMonthly.trips)} trips/month at ${fmt(cfAvgMonthly.cost)} ₪/month.`),
      blank(),
      tbl([
        hdrRow(['Month', 'Expected Trips', 'Expected Cost (₪)', 'Cumulative (₪)', ...(cfBudget > 0 ? ['Budget Remaining (₪)', 'Status'] : [])]),
        ...cfForecast.map(m => {
          const isDeficit = cfBudget > 0 && m.cumulative > cfBudget
          const isWarning = cfBudget > 0 && !isDeficit && m.budgetRemaining < cfAvgMonthly.cost * 2
          return dataRow([
            m.month,
            String(m.trips),
            fmt(m.cost),
            fmt(m.cumulative),
            ...(cfBudget > 0 ? [
              isDeficit ? `-${fmt(m.cumulative - cfBudget)}` : fmt(m.budgetRemaining),
              isDeficit ? 'DEFICIT' : isWarning ? 'WARNING' : 'OK',
            ] : []),
          ])
        }),
      ]),
      blank(),

      // 5. Projection to End of 2027
      h1('5. Projection to End of 2027'),
      p(`This section projects the financial trajectory from now until December 2027 (${cfProjection2027.monthsRemaining} months remaining).`),
      blank(),
      tbl([
        hdrRow(['Indicator', 'Value', 'Explanation']),
        dataRow(['Months Remaining to Dec 2027', `${cfProjection2027.monthsRemaining}`, 'From next month to Dec 2027']),
        dataRow(['Estimated Total Cost by End 2027', `${fmt(cfProjection2027.estimatedTotal)} ₪`, 'Current cost + (months × avg monthly cost)']),
        ...(cfBudget > 0 && cfProjection2027.budgetRemaining2027 !== null ? [
          dataRow([
            cfProjection2027.budgetRemaining2027 >= 0 ? 'Expected Surplus' : 'Expected Deficit',
            `${cfProjection2027.budgetRemaining2027 >= 0 ? '' : '-'}${fmt(Math.abs(cfProjection2027.budgetRemaining2027))} ₪`,
            cfProjection2027.budgetRemaining2027 >= 0 ? 'Budget sufficient through end of 2027' : 'Budget will be exhausted before end of 2027',
          ]),
          dataRow(['Funding Exhaustion Date (Current Rate)', cfProjection2027.exhaustionDate ?? 'N/A', 'Date budget runs out at current spending rate']),
          ...(cfProjection2027.requiredMonthlyCost !== null ? [
            dataRow(['Required Monthly Spend (to exhaust by Dec 2027)', `${fmt(cfProjection2027.requiredMonthlyCost)} ₪`, `${cfProjection2027.requiredMonthlyTrips ?? '?'} trips/month`]),
            dataRow(['Difference from Current Rate', `${cfProjection2027.costDiff !== null && cfProjection2027.costDiff > 0 ? '+' : ''}${fmt(cfProjection2027.costDiff ?? 0)} ₪/month`, cfProjection2027.costDiff !== null && cfProjection2027.costDiff > 0 ? 'Need to increase spending' : 'Current rate already sufficient']),
          ] : []),
          ...(cfProjection2027.tripsToExhaust !== null ? [
            dataRow(['Remaining Trips Budget Can Fund', `${cfProjection2027.tripsToExhaust.toLocaleString('en-US')} trips`, 'At current avg cost per trip']),
          ] : []),
          ...(cfProjection2027.volumeToExhaust !== null && cfProjection2027.volumeToExhaust > 0 ? [
            dataRow(['Sludge Volume Covered by Remaining Budget', `${cfProjection2027.volumeToExhaust.toLocaleString('en-US')} m³`, 'Based on avg m³/trip from historical data']),
          ] : []),
        ] : []),
      ]),
      blank(),

      // Chart 2
      h2('Chart: Monthly Cost & Budget Remaining — Full 2027 View'),
      p('Orange bars = actual. Yellow bars = forecast. Blue line = remaining budget (descending to zero).'),
      ...(chart2027Bytes ? [imgPara(chart2027Bytes, 580, 230)] : [p('(Chart not available)', { color: '94A3B8' })]),
      blank(),

      // 5. Full 2027 monthly table
      h2('Detailed Monthly Breakdown to December 2027'),
      tbl([
        hdrRow(['Month', 'Type', 'Monthly Cost (₪)', ...(cfBudget > 0 ? ['Budget Remaining (₪)'] : [])]),
        ...cf2027ChartData.map(row => dataRow([
          row.month,
          row.cost !== null ? 'Actual' : 'Forecast',
          fmt(row.cost ?? row.forecastCost ?? 0),
          ...(cfBudget > 0 && row.remaining !== null ? [fmt(row.remaining)] : cfBudget > 0 ? ['—'] : []),
        ])),
      ]),
      blank(),

      // Footer
      new Paragraph({
        children: [new TextRun({ text: `Report generated on ${reportDate} | Slurry Management System`, size: 18, color: '94A3B8' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
      }),
    ]

    const doc = new Document({
      title: 'Cash Flow Analysis Report',
      description: 'Full cash flow analysis with historical data, forecasts, and 2027 projections',
      sections: [{ children }],
    })

    const blob = await Packer.toBlob(doc)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cashflow-report-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.docx`
    a.click()
    URL.revokeObjectURL(url)
  }, [cfBudget, cfTotalCost, cfTotalDisbursed, cfAvgMonthly, cfAvgCostPerTrip, cfMonthlyHistory,
      cfTrips, cfForecast, cfProjection2027, cf2027ChartData, cfCurrentYM,
      cfScenario, cfMainChartRef, cf2027ChartRef])

  const exportCfExcel = () => {
    const histRows = cfMonthlyHistory.map(m => ({
      '\u0627\u0644\u0634\u0647\u0631': m.month, '\u0639\u062f\u062f \u0627\u0644\u0646\u0642\u0644\u0627\u062a': m.trips,
      '\u0633\u0627\u0626\u0644': m.liquid, '\u062c\u0627\u0641': m.solid,
      '\u062a\u0643\u0644\u0641\u0629 \u0627\u0644\u0634\u0647\u0631 (\u20aa)': +m.cost.toFixed(0),
      '\u062a\u0643\u0644\u0641\u0629 \u062a\u0631\u0627\u0643\u0645\u064a\u0629 (\u20aa)': m.cumulative,
    }))
    const foreRows = cfForecast.map(m => ({
      '\u0627\u0644\u0634\u0647\u0631': m.month,
      '\u0646\u0642\u0644\u0627\u062a \u0645\u062a\u0648\u0642\u0639\u0629': m.trips,
      '\u062a\u0643\u0644\u0641\u0629 \u0645\u062a\u0648\u0642\u0639\u0629 (\u20aa)': m.cost,
      '\u062a\u0631\u0627\u0643\u0645\u064a \u0645\u062a\u0648\u0642\u0639 (\u20aa)': m.cumulative,
      '\u0645\u064a\u0632\u0627\u0646\u064a\u0629 \u0645\u062a\u0628\u0642\u064a\u0629 (\u20aa)': m.budgetRemaining,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(histRows), '\u0627\u0644\u062a\u0627\u0631\u064a\u062e\u064a')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(foreRows), '\u0627\u0644\u062a\u0648\u0642\u0639\u0627\u062a')
    XLSX.writeFile(wb, 'cashflow-analysis.xlsx')
  }

  // ── Tabs ──
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'active_factories', label: 'المصانع النشطة', icon: <Building2 size={15} /> },
    { id: 'trips', label: 'النقلات', icon: <Truck size={15} /> },
    { id: 'costs', label: 'التكاليف', icon: <TrendingUp size={15} /> },
    { id: 'contributions', label: 'المساهمات', icon: <Coins size={15} /> },
    { id: 'overdue', label: 'الذمم', icon: <AlertTriangle size={15} /> },
    { id: 'payments', label: 'الدفعات', icon: <DollarSign size={15} /> },
    { id: 'cashflow', label: 'التدفق النقدي', icon: <Activity size={15} /> },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">التقارير</h1>
        <p className="text-sm text-slate-500 mt-0.5">تقارير مالية وتشغيلية شاملة</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ══ TAB 1: المصانع النشطة ══ */}
      {activeTab === 'active_factories' && (
        <div className="space-y-5">
          <Card>
            <CardHeader><h2 className="font-semibold text-slate-800 flex items-center gap-2"><Filter size={16} /> فلترة الفترة</h2></CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map(m => {
                  const { from: mf, to: mt } = getMonthRange(m)
                  const label = m === 0 ? 'هذا الشهر' : m === 1 ? 'الشهر الماضي' : 'قبل شهرين'
                  return (
                    <button key={m} onClick={() => { setAfFrom(mf); setAfTo(mt) }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${afFrom === mf && afTo === mt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="من تاريخ" type="date" value={afFrom} onChange={e => setAfFrom(e.target.value)} />
                <Input label="إلى تاريخ" type="date" value={afTo} onChange={e => setAfTo(e.target.value)} />
              </div>
              <Button onClick={loadActiveFactories} loading={afLoading} size="lg"><BarChart2 size={16} /> توليد التقرير</Button>
            </CardBody>
          </Card>

          {afLoaded && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'مصانع نشطة', value: afTotals.factories, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100', icon: <Building2 size={16} className="text-blue-600" /> },
                  { label: 'إجمالي النقلات', value: afTotals.trips, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100', icon: <Truck size={16} className="text-violet-600" /> },
                  { label: 'إجمالي المساهمات المستحقة', value: `${afTotals.due.toLocaleString()} ₪`, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', icon: <Coins size={16} className="text-emerald-600" /> },
                ].map(({ label, value, color, bg, icon }) => (
                  <Card key={label} className={`border ${bg}`}>
                    <CardBody className="flex items-center gap-3 py-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>{icon}</div>
                      <div>
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-slate-500">{label}</p>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>

              {afBarData.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold text-slate-800 text-sm">أعلى 10 مصانع نشاطاً</h2></CardHeader>
                  <CardBody>
                    <ResponsiveContainer width="100%" height={Math.max(200, afBarData.length * 36)}>
                      <BarChart data={afBarData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip />
                        <Bar dataKey="trips" name="نقلات" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              )}

              <div className="flex justify-end">
                <Button variant="success" size="sm" onClick={exportAfExcel}><FileSpreadsheet size={14} /> تصدير Excel</Button>
              </div>

              <Card>
                <CardHeader><h2 className="font-semibold text-slate-800 text-sm">تفاصيل المصانع النشطة</h2></CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                        <th className="text-center px-4 py-3 text-xs text-blue-600 font-semibold">النقلات</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">المستحق</th>
                        <th className="text-center px-4 py-3 text-xs text-emerald-600 font-semibold">✅ محصّل</th>
                        <th className="text-center px-4 py-3 text-xs text-amber-600 font-semibold">⏳ متبقي</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-400 font-semibold">نسبة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {afFactoryMap.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-10 text-slate-400">لا توجد نقلات في هذه الفترة</td></tr>
                      ) : afFactoryMap.map(f => {
                        const pct = f.due > 0 ? Math.round(f.collected / f.due * 100) : 0
                        return (
                          <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="px-5 py-3 font-semibold text-slate-800">{f.name}</td>
                            <td className="px-4 py-3 text-center font-bold text-blue-600">{f.trips}</td>
                            <td className="px-4 py-3 text-center text-slate-600">{f.due.toLocaleString()} ₪</td>
                            <td className="px-4 py-3 text-center text-emerald-700 font-semibold">{f.collected.toLocaleString()} ₪</td>
                            <td className="px-4 py-3 text-center">{f.outstanding > 0 ? <span className="text-amber-600 font-semibold">{f.outstanding.toLocaleString()} ₪</span> : <span className="text-emerald-500">✅</span>}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center gap-2 justify-center">
                                <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-blue-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-slate-500">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                        <td className="px-5 py-3 text-slate-700">الإجمالي</td>
                        <td className="px-4 py-3 text-center text-blue-600">{afTotals.trips}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{afTotals.due.toLocaleString()} ₪</td>
                        <td className="px-4 py-3 text-center text-emerald-700">{afTotals.collected.toLocaleString()} ₪</td>
                        <td className="px-4 py-3 text-center text-amber-600">{afTotals.outstanding.toLocaleString()} ₪</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ TAB 2: النقلات ══ */}
      {activeTab === 'trips' && (
        <div className="space-y-5">
          <Card>
            <CardHeader><h2 className="font-semibold text-slate-800 flex items-center gap-2"><Filter size={16} /> فلترة النقلات</h2></CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {([['today', 'اليوم'], ['week', 'آخر 7 أيام'], ['month', 'هذا الشهر'], ['custom', 'تخصيص']] as const).map(([p, label]) => (
                  <button key={p} onClick={() => applyPeriod(p)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${period === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Input label="من تاريخ" type="date" value={from} onChange={e => setFrom(e.target.value)} />
                <Input label="إلى تاريخ" type="date" value={to} onChange={e => setTo(e.target.value)} />
                <Select label="حالة الدفع" value={statusFilter} onChange={e => setStatusFilter(e.target.value as AnyData)}>
                  <option value="all">كل الحالات</option><option value="paid">مدفوع</option><option value="credit">ذمة</option>
                </Select>
                <Select label="نوع الربو" value={wasteFilter} onChange={e => setWasteFilter(e.target.value as AnyData)}>
                  <option value="all">كل الأنواع</option><option value="liquid">💧 سائل</option><option value="solid">🪨 جاف</option>
                </Select>
                <Select label="وجهة النقل" value={dumpFilter} onChange={e => setDumpFilter(e.target.value as AnyData)}>
                  <option value="all">كل الوجهات</option>
                  <option value="central_press">عصارة الربو</option>
                  <option value="khallet">خلة الشرباتي</option>
                  <option value="sa3ir">سعير</option>
                </Select>
                {tripsLoaded && tripFactories.length > 0 && (
                  <Select label="المصنع" value={factoryFilter} onChange={e => setFactoryFilter(e.target.value)}>
                    <option value="all">كل المصانع</option>
                    {tripFactories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </Select>
                )}
              </div>
              <Button onClick={generateTrips} loading={tripsLoading} size="lg"><BarChart2 size={16} /> توليد التقرير</Button>
            </CardBody>
          </Card>

          {tripsLoaded && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'إجمالي النقلات', value: totalTrips, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
                  { label: 'سائل / جاف', value: `${liquidTrips.length} / ${solidTrips.length}`, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
                  { label: 'إجمالي الحجم', value: `${totalVolume.toFixed(1)} م³`, color: 'text-cyan-600', bg: 'bg-cyan-50 border-cyan-100' },
                  { label: 'مدفوع / ذمة', value: `${paidTrips.length} / ${creditTripsFiltered.length}`, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                  { label: 'إجمالي تكلفة النقلات', value: totalTripCost > 0 ? `${Math.round(totalTripCost).toLocaleString()} ₪` : '—', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
                ].map(({ label, value, color, bg }) => (
                  <Card key={label} className={`border ${bg}`}><CardBody className="text-center py-4">
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-slate-500 mt-1">{label}</p>
                  </CardBody></Card>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {pieData.length > 0 && (
                  <Card>
                    <CardHeader><h2 className="font-semibold text-slate-800 text-sm">توزيع نوع الربو</h2></CardHeader>
                    <CardBody className="flex justify-center">
                      <PieChart width={200} height={180}>
                        <Pie data={pieData} cx={100} cy={80} outerRadius={70} dataKey="value"
                          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </CardBody>
                  </Card>
                )}
                {dailyChart.length > 0 && (
                  <Card className="md:col-span-2">
                    <CardHeader><h2 className="font-semibold text-slate-800 text-sm">النقلات اليومية</h2></CardHeader>
                    <CardBody>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={dailyChart}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip /><Legend />
                          <Bar dataKey="liquid" name="سائل" stackId="a" fill={WASTE_COLORS.liquid} />
                          <Bar dataKey="solid" name="جاف" stackId="a" fill={WASTE_COLORS.solid} />
                          <Bar dataKey="unknown" name="غير محدد" stackId="a" fill={WASTE_COLORS.unknown} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardBody>
                  </Card>
                )}
              </div>

              {dumpSiteChart.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><MapPin size={15} /> توزيع وجهات النقل</h2></CardHeader>
                  <CardBody>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={dumpSiteChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="value" name="عدد النقلات" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              )}

              <div className="flex gap-3">
                <Button variant="success" onClick={exportTripsExcel} className="flex-1"><FileSpreadsheet size={16} /> تصدير Excel</Button>
                <Button variant="secondary" onClick={exportTripsPDF} className="flex-1"><FileText size={16} /> تصدير PDF</Button>
              </div>

              {factoryChart.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold text-slate-800 text-sm">ملخص حسب المصنع</h2></CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                          <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">إجمالي</th>
                          <th className="text-center px-4 py-3 text-xs text-blue-500 font-semibold">💧 سائل</th>
                          <th className="text-center px-4 py-3 text-xs text-amber-500 font-semibold">🪨 جاف</th>
                          <th className="text-center px-4 py-3 text-xs text-cyan-600 font-semibold">م³ إجمالي</th>
                          <th className="text-center px-4 py-3 text-xs text-violet-600 font-semibold">م³ سائل</th>
                          <th className="text-center px-4 py-3 text-xs text-amber-600 font-semibold">م³ جاف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {factoryChart.map(f => {
                          const total = f.liquid + f.solid + f.unknown
                          return (
                            <tr key={f.name} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-5 py-3 font-semibold text-slate-800">{f.name}</td>
                              <td className="px-4 py-3 text-center font-bold text-blue-600">{total}</td>
                              <td className="px-4 py-3 text-center">{f.liquid > 0 ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{f.liquid}</span> : <span className="text-slate-300">—</span>}</td>
                              <td className="px-4 py-3 text-center">{f.solid > 0 ? <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{f.solid}</span> : <span className="text-slate-300">—</span>}</td>
                              <td className="px-4 py-3 text-center text-cyan-700 font-medium">{f.volume > 0 ? `${f.volume.toFixed(1)}` : '—'}</td>
                              <td className="px-4 py-3 text-center text-violet-600 text-xs">{liquidVolume > 0 ? `${liquidVolume.toFixed(1)}` : '—'}</td>
                              <td className="px-4 py-3 text-center text-amber-600 text-xs">{solidVolume > 0 ? `${solidVolume.toFixed(1)}` : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                          <td className="px-5 py-3 text-slate-700">الإجمالي</td>
                          <td className="px-4 py-3 text-center text-blue-600">{totalTrips}</td>
                          <td className="px-4 py-3 text-center text-blue-600">{liquidTrips.length}</td>
                          <td className="px-4 py-3 text-center text-amber-600">{solidTrips.length}</td>
                          <td className="px-4 py-3 text-center text-cyan-700">{totalVolume > 0 ? `${totalVolume.toFixed(1)} م³` : '—'}</td>
                          <td className="px-4 py-3 text-center text-violet-600">{liquidVolume > 0 ? `${liquidVolume.toFixed(1)} م³` : '—'}</td>
                          <td className="px-4 py-3 text-center text-amber-600">{solidVolume > 0 ? `${solidVolume.toFixed(1)} م³` : '—'}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              )}

              <Card>
                <CardHeader><h2 className="font-semibold text-slate-800">النقلات التفصيلية ({filtered.length} نقلة)</h2></CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-right px-3 py-3 text-xs text-slate-500 font-semibold">#</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                        <th className="text-center px-3 py-3 text-xs text-violet-600 font-semibold">القسيمة</th>
                        <th className="text-right px-3 py-3 text-xs text-slate-500 font-semibold">السائق</th>
                        <th className="text-center px-3 py-3 text-xs text-slate-500 font-semibold">نوع الربو</th>
                        <th className="text-center px-3 py-3 text-xs text-cyan-600 font-semibold">الحجم</th>
                        <th className="text-center px-3 py-3 text-xs text-orange-500 font-semibold">تكلفة النقلة</th>
                        <th className="text-center px-3 py-3 text-xs text-slate-500 font-semibold">المبلغ</th>
                        <th className="text-center px-3 py-3 text-xs text-slate-500 font-semibold">الحالة</th>
                        <th className="text-center px-3 py-3 text-xs text-purple-600 font-semibold">الوجهة</th>
                        <th className="text-right px-3 py-3 text-xs text-slate-500 font-semibold">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={11} className="text-center py-10 text-slate-400">لا توجد بيانات في هذه الفترة</td></tr>
                      ) : filtered.map((t: AnyData, i: number) => (
                        <tr key={t.id} className={`border-b border-slate-50 hover:bg-blue-50/20 ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                          <td className="px-3 py-2.5 text-slate-400 text-xs">{i + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-800 text-sm">{t.factories?.name ?? '—'}</td>
                          <td className="px-3 py-2.5 text-center">{t.coupon_number ? <span className="bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full text-xs font-mono font-semibold">{t.coupon_number}</span> : <span className="text-slate-300 text-xs">—</span>}</td>
                          <td className="px-3 py-2.5 text-slate-600 text-xs">{t.driver_name ?? '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            {t.waste_type === 'liquid' ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">💧 سائل</span>
                              : t.waste_type === 'solid' ? <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs font-semibold">🪨 جاف</span>
                                : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center text-cyan-700 font-medium text-xs">{t.volume_m3 ? `${t.volume_m3} م³` : '—'}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-orange-600 text-xs">{t.trip_cost ? `${Number(t.trip_cost).toLocaleString()} ₪` : <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-slate-700">{t.amount} ₪</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {t.payment_status === 'paid' ? 'مدفوع' : 'ذمة'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-purple-700 text-xs font-medium">{getDumpSiteLabel(t)}</td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{t.trip_date ? format(new Date(t.trip_date), 'dd/MM/yyyy') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ TAB 3: التكاليف ══ */}
      {activeTab === 'costs' && (
        <div className="space-y-5">
          <Card>
            <CardHeader><h2 className="font-semibold text-slate-800 flex items-center gap-2"><Filter size={16} /> فلترة الفترة</h2></CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map(m => {
                  const { from: mf, to: mt } = getMonthRange(m)
                  const label = m === 0 ? 'هذا الشهر' : m === 1 ? 'الشهر الماضي' : 'قبل شهرين'
                  return (
                    <button key={m} onClick={() => { setCostFrom(mf); setCostTo(mt) }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${costFrom === mf && costTo === mt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="من تاريخ" type="date" value={costFrom} onChange={e => setCostFrom(e.target.value)} />
                <Input label="إلى تاريخ" type="date" value={costTo} onChange={e => setCostTo(e.target.value)} />
              </div>
              <Button onClick={loadCosts} loading={costsLoading} size="lg"><BarChart2 size={16} /> توليد التقرير</Button>
            </CardBody>
          </Card>

          {costsLoaded && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'إجمالي التكاليف', value: `${totalCost.toLocaleString()} ₪`, color: 'text-red-600', bg: 'bg-red-50 border-red-100', icon: <TrendingUp size={16} className="text-red-600" /> },
                  { label: 'عدد النقلات', value: costTrips.length, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100', icon: <Truck size={16} className="text-blue-600" /> },
                  { label: 'متوسط تكلفة النقلة', value: costTrips.length > 0 ? `${(totalCost / costTrips.length).toFixed(0)} ₪` : '—', color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100', icon: <DollarSign size={16} className="text-violet-600" /> },
                ].map(({ label, value, color, bg, icon }) => (
                  <Card key={label} className={`border ${bg}`}>
                    <CardBody className="flex items-center gap-3 py-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>{icon}</div>
                      <div>
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-slate-500">{label}</p>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>

              {costByMonth.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold text-slate-800 text-sm">اتجاه التكاليف الشهرية</h2></CardHeader>
                  <CardBody>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={costByMonth}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => `${Number(v).toLocaleString()} ₪`} />
                        <Bar dataKey="cost" name="التكلفة (₪)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              )}

              <div className="flex justify-end">
                <Button variant="success" size="sm" onClick={exportCostsExcel}><FileSpreadsheet size={14} /> تصدير Excel</Button>
              </div>

              <Card>
                <CardHeader><h2 className="font-semibold text-slate-800 text-sm">التكاليف حسب المصنع</h2></CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                        <th className="text-center px-4 py-3 text-xs text-blue-600 font-semibold">عدد النقلات</th>
                        <th className="text-center px-4 py-3 text-xs text-red-600 font-semibold">إجمالي التكلفة</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">متوسط النقلة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costByFactory.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-10 text-slate-400">لا توجد بيانات في هذه الفترة</td></tr>
                      ) : costByFactory.map(f => (
                        <tr key={f.name} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-5 py-3 font-semibold text-slate-800">{f.name}</td>
                          <td className="px-4 py-3 text-center font-bold text-blue-600">{f.trips}</td>
                          <td className="px-4 py-3 text-center font-bold text-red-600">{f.cost.toLocaleString()} ₪</td>
                          <td className="px-4 py-3 text-center text-slate-500">{f.trips > 0 ? `${(f.cost / f.trips).toFixed(0)} ₪` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                        <td className="px-5 py-3 text-slate-700">الإجمالي</td>
                        <td className="px-4 py-3 text-center text-blue-600">{costTrips.length}</td>
                        <td className="px-4 py-3 text-center text-red-600">{totalCost.toLocaleString()} ₪</td>
                        <td className="px-4 py-3 text-center text-slate-500">{costTrips.length > 0 ? `${(totalCost / costTrips.length).toFixed(0)} ₪` : '—'}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ TAB 4: المساهمات ══ */}
      {activeTab === 'contributions' && (
        <div className="space-y-5">
          <Card>
            <CardHeader><h2 className="font-semibold text-slate-800 flex items-center gap-2"><Filter size={16} /> فلترة الفترة</h2></CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map(m => {
                  const { from: mf, to: mt } = getMonthRange(m)
                  const label = m === 0 ? 'هذا الشهر' : m === 1 ? 'الشهر الماضي' : 'قبل شهرين'
                  return (
                    <button key={m} onClick={() => { setContFrom(mf); setContTo(mt) }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${contFrom === mf && contTo === mt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="من تاريخ" type="date" value={contFrom} onChange={e => setContFrom(e.target.value)} />
                <Input label="إلى تاريخ" type="date" value={contTo} onChange={e => setContTo(e.target.value)} />
              </div>
              <Button onClick={loadContributions} loading={contLoading} size="lg"><BarChart2 size={16} /> توليد التقرير</Button>
            </CardBody>
          </Card>

          {contLoaded && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'إجمالي المستحق', value: `${contTotals.due.toLocaleString()} ₪`, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200', icon: <Coins size={16} className="text-slate-600" /> },
                  { label: '✅ محصّل', value: `${contTotals.collected.toLocaleString()} ₪`, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', icon: <DollarSign size={16} className="text-emerald-600" /> },
                  { label: '⏳ متبقي', value: `${contTotals.outstanding.toLocaleString()} ₪`, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', icon: <AlertTriangle size={16} className="text-amber-600" /> },
                  { label: 'نسبة التحصيل', value: contTotals.due > 0 ? `${(contTotals.collected / contTotals.due * 100).toFixed(0)}%` : '—', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100', icon: <TrendingUp size={16} className="text-blue-600" /> },
                ].map(({ label, value, color, bg, icon }) => (
                  <Card key={label} className={`border ${bg}`}>
                    <CardBody className="flex items-center gap-3 py-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>{icon}</div>
                      <div>
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-slate-500">{label}</p>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {contPieData.length > 0 && (
                  <Card>
                    <CardHeader><h2 className="font-semibold text-slate-800 text-sm">محصّل مقابل متبقي</h2></CardHeader>
                    <CardBody className="flex justify-center">
                      <PieChart width={200} height={180}>
                        <Pie data={contPieData} cx={100} cy={80} outerRadius={70} dataKey="value"
                          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                          {contPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(v) => `${Number(v).toLocaleString()} ₪`} />
                        <Legend />
                      </PieChart>
                    </CardBody>
                  </Card>
                )}
                {contByFactory.length > 0 && (
                  <Card className="md:col-span-2">
                    <CardHeader><h2 className="font-semibold text-slate-800 text-sm">المساهمات حسب المصنع</h2></CardHeader>
                    <CardBody>
                      <ResponsiveContainer width="100%" height={Math.max(200, Math.min(contByFactory.length, 10) * 36)}>
                        <BarChart data={contByFactory.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={110} />
                          <Tooltip formatter={(v) => `${Number(v).toLocaleString()} ₪`} />
                          <Legend />
                          <Bar dataKey="collected" name="محصّل" stackId="a" fill="#10b981" />
                          <Bar dataKey="outstanding" name="متبقي" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardBody>
                  </Card>
                )}
              </div>

              <div className="flex justify-end">
                <Button variant="success" size="sm" onClick={exportContribExcel}><FileSpreadsheet size={14} /> تصدير Excel</Button>
              </div>

              <Card>
                <CardHeader><h2 className="font-semibold text-slate-800 text-sm">تفاصيل المساهمات حسب المصنع</h2></CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                        <th className="text-center px-4 py-3 text-xs text-blue-600 font-semibold">النقلات</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">المستحق</th>
                        <th className="text-center px-4 py-3 text-xs text-emerald-600 font-semibold">✅ محصّل</th>
                        <th className="text-center px-4 py-3 text-xs text-amber-600 font-semibold">⏳ متبقي</th>
                        <th className="text-center px-4 py-3 text-xs text-blue-600 font-semibold">نسبة %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contByFactory.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-10 text-slate-400">لا توجد بيانات في هذه الفترة</td></tr>
                      ) : contByFactory.map(f => {
                        const pct = f.due > 0 ? Math.round(f.collected / f.due * 100) : 0
                        return (
                          <tr key={f.name} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="px-5 py-3 font-semibold text-slate-800">{f.name}</td>
                            <td className="px-4 py-3 text-center font-bold text-blue-600">{f.trips}</td>
                            <td className="px-4 py-3 text-center text-slate-600">{f.due.toLocaleString()} ₪</td>
                            <td className="px-4 py-3 text-center text-emerald-700 font-semibold">{f.collected.toLocaleString()} ₪</td>
                            <td className="px-4 py-3 text-center">{f.outstanding > 0 ? <span className="text-amber-600 font-semibold">{f.outstanding.toLocaleString()} ₪</span> : <span className="text-emerald-500 text-xs">✅ مسوّى</span>}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center gap-2 justify-center">
                                <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-blue-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-slate-500">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                        <td className="px-5 py-3 text-slate-700">الإجمالي</td>
                        <td className="px-4 py-3 text-center text-blue-600">{contTrips.length}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{contTotals.due.toLocaleString()} ₪</td>
                        <td className="px-4 py-3 text-center text-emerald-700">{contTotals.collected.toLocaleString()} ₪</td>
                        <td className="px-4 py-3 text-center text-amber-600">{contTotals.outstanding.toLocaleString()} ₪</td>
                        <td className="px-4 py-3 text-center text-blue-600">
                          {contTotals.due > 0 ? `${(contTotals.collected / contTotals.due * 100).toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ TAB 5: الذمم ══ */}
      {activeTab === 'overdue' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">المصانع التي لديها رصيد متبقي غير مسوّى – مرتبة من الأعلى ديناً</p>
            <Button onClick={loadFactories} loading={factoriesLoading} size="sm">
              <BarChart2 size={14} /> تحميل البيانات
            </Button>
          </div>
          {factoriesLoaded && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card className="border-red-100">
                  <CardBody className="flex items-center gap-3 py-3">
                    <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center"><AlertTriangle size={16} className="text-red-500" /></div>
                    <div><p className="text-xl font-bold text-red-600">{overdueFactories.length}</p><p className="text-xs text-slate-500">مصنع متأخر</p></div>
                  </CardBody>
                </Card>
                <Card className="border-red-100">
                  <CardBody className="flex items-center gap-3 py-3">
                    <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center"><DollarSign size={16} className="text-red-500" /></div>
                    <div><p className="text-xl font-bold text-red-600">{totalDebt.toLocaleString()} ₪</p><p className="text-xs text-slate-500">إجمالي الذمم</p></div>
                  </CardBody>
                </Card>
                <Card className="border-amber-100">
                  <CardBody className="flex items-center gap-3 py-3">
                    <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center"><Truck size={16} className="text-amber-500" /></div>
                    <div><p className="text-xl font-bold text-amber-600">{overdueFactories.reduce((s: number, f: AnyData) => s + f.creditTrips, 0)}</p><p className="text-xs text-slate-500">نقلة غير مسوّاة</p></div>
                  </CardBody>
                </Card>
              </div>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-red-50 border-b border-red-100">
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">#</th>
                        <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">صاحب المصنع</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">الهاتف</th>
                        <th className="text-center px-4 py-3 text-xs text-amber-600 font-semibold">نقلات الذمة</th>
                        <th className="text-center px-4 py-3 text-xs text-red-600 font-semibold">الرصيد المطلوب</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-400 font-semibold">كشف الحساب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overdueFactories.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-10 text-emerald-600 font-medium">✅ لا توجد ذمم متأخرة</td></tr>
                      ) : overdueFactories.map((f: AnyData, i: number) => (
                        <tr key={f.id} className="border-b border-slate-50 hover:bg-red-50/30">
                          <td className="px-4 py-3 text-slate-400 text-xs font-bold">{i + 1}</td>
                          <td className="px-5 py-3 font-semibold text-slate-800">{f.name}</td>
                          <td className="px-4 py-3 text-slate-500 text-sm">{f.owner_name}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">{f.phone}</td>
                          <td className="px-4 py-3 text-center"><span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">{f.creditTrips} نقلة</span></td>
                          <td className="px-4 py-3 text-center"><span className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-sm font-bold">{f.balance.toLocaleString()} ₪</span></td>
                          <td className="px-4 py-3 text-center"><Link href={`/factories/${f.id}`} className="text-blue-500 text-xs hover:underline">عرض</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ TAB 6: الدفعات ══ */}
      {activeTab === 'payments' && (
        <div className="space-y-5">
          <Card>
            <CardHeader><h2 className="font-semibold text-slate-800 flex items-center gap-2"><Filter size={16} /> فلترة الدفعات</h2></CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map(m => {
                  const { from: mf, to: mt } = getMonthRange(m)
                  const label = m === 0 ? 'هذا الشهر' : m === 1 ? 'الشهر الماضي' : 'قبل شهرين'
                  return (
                    <button key={m} onClick={() => { setPayFrom(mf); setPayTo(mt) }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${payFrom === mf && payTo === mt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="من تاريخ" type="date" value={payFrom} onChange={e => setPayFrom(e.target.value)} />
                <Input label="إلى تاريخ" type="date" value={payTo} onChange={e => setPayTo(e.target.value)} />
              </div>
              <Button onClick={generatePayments} loading={paymentsLoading} size="lg"><BarChart2 size={16} /> توليد التقرير</Button>
            </CardBody>
          </Card>

          {paymentsLoaded && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card className="border-emerald-100"><CardBody className="text-center py-4">
                  <p className="text-2xl font-bold text-emerald-600">{totalPaymentsAmount.toLocaleString()} ₪</p>
                  <p className="text-xs text-slate-500 mt-1">إجمالي المحصّل</p>
                </CardBody></Card>
                <Card className="border-blue-100"><CardBody className="text-center py-4">
                  <p className="text-2xl font-bold text-blue-600">{payments.length}</p>
                  <p className="text-xs text-slate-500 mt-1">عدد الدفعات</p>
                </CardBody></Card>
                <Card className="border-violet-100"><CardBody className="text-center py-4">
                  <p className="text-2xl font-bold text-violet-600">{paymentsByFactory.length}</p>
                  <p className="text-xs text-slate-500 mt-1">مصانع دفعت</p>
                </CardBody></Card>
              </div>

              {paymentsByFactory.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold text-slate-800 text-sm">الدفعات حسب المصنع</h2></CardHeader>
                  <CardBody>
                    <ResponsiveContainer width="100%" height={Math.max(180, paymentsByFactory.slice(0, 12).length * 36)}>
                      <BarChart data={paymentsByFactory.slice(0, 12)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={110} />
                        <Tooltip formatter={(v) => `${Number(v).toLocaleString()} ₪`} />
                        <Bar dataKey="total" name="المبلغ المدفوع" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              )}

              <div className="flex justify-end">
                <Button variant="success" size="sm" onClick={exportPaymentsExcel}><FileSpreadsheet size={14} /> تصدير Excel</Button>
              </div>

              <Card>
                <CardHeader><h2 className="font-semibold text-slate-800 text-sm">ملخص حسب المصنع</h2></CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">عدد الدفعات</th>
                        <th className="text-center px-4 py-3 text-xs text-emerald-600 font-semibold">إجمالي المدفوع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsByFactory.map(f => (
                        <tr key={f.name} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-5 py-3 font-semibold text-slate-800">{f.name}</td>
                          <td className="px-4 py-3 text-center text-blue-600 font-bold">{f.count}</td>
                          <td className="px-4 py-3 text-center text-emerald-700 font-bold">{f.total.toLocaleString()} ₪</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                        <td className="px-5 py-3 text-slate-700">الإجمالي</td>
                        <td className="px-4 py-3 text-center text-blue-600">{payments.length}</td>
                        <td className="px-4 py-3 text-center text-emerald-700">{totalPaymentsAmount.toLocaleString()} ₪</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>

              <Card>
                <CardHeader><h2 className="font-semibold text-slate-800 text-sm">تفاصيل الدفعات</h2></CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">#</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                        <th className="text-center px-4 py-3 text-xs text-emerald-600 font-semibold">المبلغ المدفوع</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">التاريخ</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-10 text-slate-400">لا توجد دفعات في هذه الفترة</td></tr>
                      ) : payments.map((p: AnyData, i: number) => (
                        <tr key={p.id} className={`border-b border-slate-50 hover:bg-emerald-50/20 ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                          <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{p.factories?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-center font-bold text-emerald-700">{Number(p.amount_paid).toLocaleString()} ₪</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{p.date ? format(new Date(p.date), 'dd/MM/yyyy') : '—'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{p.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ TAB 7: التدفق النقدي ══ */}
      {activeTab === 'cashflow' && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Activity size={16} /> تحليل التدفق النقدي والتوقعات</h2>
                {cfLoaded && (
                  <div className="flex gap-2">
                    <Button variant="success" size="sm" onClick={exportCfExcel}><FileSpreadsheet size={14} /> تصدير Excel</Button>
                    <Button variant="secondary" size="sm" onClick={exportCfWord}><FileText size={14} /> تصدير Word</Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-xs text-slate-500 mb-4">يحلل التكاليف التاريخية لكل النقلات ويسقط توقعات الصرف للـ 6 أشهر القادمة بناءً على متوسط آخر 3 أشهر.</p>
              <Button onClick={loadCashFlow} loading={cfLoading} size="lg"><Activity size={16} /> توليد التحليل</Button>
            </CardBody>
          </Card>

          {cfLoaded && (
            <>
              {/* ── بطاقات الميزانية الكلية ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: '\u0627\u0644\u0645\u064a\u0632\u0627\u0646\u064a\u0629 \u0627\u0644\u0643\u0644\u064a\u0629', value: cfBudget > 0 ? `${cfBudget.toLocaleString()} \u20aa` : '\u063a\u064a\u0631 \u0645\u062d\u062f\u062f\u0629', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-100', icon: '\ud83d\udcb0' },
                  { label: '\u062a\u0643\u0644\u0641\u0629 \u0645\u0646\u0641\u0630\u0629 \u062d\u062a\u0649 \u0627\u0644\u0622\u0646', value: `${Math.round(cfTotalCost).toLocaleString()} \u20aa`, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-100', icon: '\ud83d\udcca' },
                  { label: '\u0645\u0635\u0631\u0648\u0641 (\u062f\u0641\u0639\u0627\u062a \u0645\u063a\u0644\u0642\u0629)', value: `${Math.round(cfTotalDisbursed).toLocaleString()} \u20aa`, color: 'text-teal-700', bg: 'bg-teal-50 border-teal-100', icon: '\u2705' },
                  { label: cfGap !== null ? (cfGap >= 0 ? '\u0641\u0627\u0626\u0636 \u0645\u062a\u0648\u0642\u0639' : '\u0639\u062c\u0632 \u0645\u062a\u0648\u0642\u0639') : '\u062a\u0643\u0644\u0641\u0629 \u0645\u062a\u0648\u0642\u0639\u0629 (6 \u0623\u0634\u0647\u0631)', value: cfGap !== null ? `${Math.abs(Math.round(cfGap)).toLocaleString()} \u20aa` : `${Math.round(cfEstimatedTotalCost).toLocaleString()} \u20aa`, color: cfGap !== null ? (cfGap >= 0 ? 'text-emerald-700' : 'text-red-700') : 'text-violet-700', bg: cfGap !== null ? (cfGap >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100') : 'bg-violet-50 border-violet-100', icon: cfGap !== null ? (cfGap >= 0 ? '\ud83d\udfe2' : '\ud83d\udd34') : '\ud83d\udd2e' },
                ].map(({ label, value, color, bg, icon }) => (
                  <Card key={label} className={`border ${bg}`}>
                    <CardBody className="text-center py-4">
                      <p className="text-2xl mb-1">{icon}</p>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-slate-500 mt-1">{label}</p>
                    </CardBody>
                  </Card>
                ))}
              </div>

              {/* ── بطاقات الأداء الشهري ── */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card className="border bg-slate-50 border-slate-100">
                  <CardBody className="py-3 text-center">
                    <p className="text-lg font-bold text-slate-700">{cfMonthlyHistory.length}</p>
                    <p className="text-xs text-slate-500 mt-0.5">أشهر بيانات فعلية</p>
                  </CardBody>
                </Card>
                <Card className="border bg-slate-50 border-slate-100">
                  <CardBody className="py-3 text-center">
                    <p className="text-lg font-bold text-slate-700">{cfAvgMonthly.trips.toLocaleString()} نقلة</p>
                    <p className="text-xs text-slate-500 mt-0.5">متوسط النقلات / الشهر (آخر 3)</p>
                  </CardBody>
                </Card>
                <Card className="border bg-slate-50 border-slate-100">
                  <CardBody className="py-3 text-center">
                    <p className="text-lg font-bold text-slate-700">{Math.round(cfAvgMonthly.cost).toLocaleString()} ₪</p>
                    <p className="text-xs text-slate-500 mt-0.5">متوسط التكلفة / الشهر (آخر 3)</p>
                  </CardBody>
                </Card>
                {cfAvgCostPerTrip > 0 && (
                  <Card className="border bg-slate-50 border-slate-100">
                    <CardBody className="py-3 text-center">
                      <p className="text-lg font-bold text-slate-700">{Math.round(cfAvgCostPerTrip).toLocaleString()} ₪</p>
                      <p className="text-xs text-slate-500 mt-0.5">متوسط تكلفة النقلة الواحدة</p>
                    </CardBody>
                  </Card>
                )}
                {cfRunwayMonths !== null && (
                  <Card className={`border ${cfRunwayMonths <= 2 ? 'bg-red-50 border-red-100' : cfRunwayMonths <= 4 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                    <CardBody className="py-3 text-center">
                      <p className={`text-lg font-bold ${cfRunwayMonths <= 2 ? 'text-red-700' : cfRunwayMonths <= 4 ? 'text-amber-700' : 'text-emerald-700'}`}>{cfRunwayMonths} شهر</p>
                      <p className="text-xs text-slate-500 mt-0.5">رصيد الميزانية المتبقي (runway)</p>
                    </CardBody>
                  </Card>
                )}
                {cfBudget > 0 && cfTotalCost > 0 && (
                  <Card className="border bg-violet-50 border-violet-100">
                    <CardBody className="py-3 text-center">
                      <p className="text-lg font-bold text-violet-700">{Math.min(100, Math.round(cfTotalCost / cfBudget * 100))}%</p>
                      <p className="text-xs text-slate-500 mt-0.5">نسبة الصرف من الميزانية</p>
                    </CardBody>
                  </Card>
                )}
              </div>

              {/* ── محاكاة السيناريو — الوضع الحالي / سعير جزئي / سعير كامل ── */}
              <Card className="border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white">
                <CardHeader>
                  <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                    🎯 سيناريو التوقع المستقبلي
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">اختر الوضع بناءً على خطة تشغيل موقع سعير (أكثر من 7 كم)</p>
                </CardHeader>
                <CardBody>
                  {/* أزرار السيناريو */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {([
                      { key: 'current', label: '📊 الوضع الحالي', desc: 'متوسط آخر 3 أشهر', color: 'blue' },
                      { key: 'partial', label: '🔶 سعير جزئي', desc: 'بعض النقلات بعيدة', color: 'amber' },
                      { key: 'full',    label: '🔴 سعير كامل',  desc: 'كل النقلات لسعير',  color: 'rose' },
                    ] as const).map(s => (
                      <button
                        key={s.key}
                        onClick={() => setCfScenario(s.key)}
                        className={`flex-1 min-w-[120px] rounded-xl px-3 py-2.5 text-left border-2 transition-all ${
                          cfScenario === s.key
                            ? s.color === 'blue'  ? 'border-blue-500  bg-blue-50  text-blue-800'
                            : s.color === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-800'
                            : 'border-rose-500  bg-rose-50  text-rose-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div className="font-semibold text-sm">{s.label}</div>
                        <div className="text-xs opacity-70 mt-0.5">{s.desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* حقول سعير الجزئي */}
                  {cfScenario === 'partial' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1 font-medium">عدد نقلات سعير من الإجمالي شهرياً</label>
                        <input
                          type="number" min={0}
                          value={cfLongTripPerMonth}
                          onChange={e => setCfLongTripPerMonth(Math.max(0, Number(e.target.value)))}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                          placeholder="0"
                        />
                        <p className="text-xs text-slate-400 mt-1">جزء من النقلات الشهرية المعتادة — لا تُضاف فوقها</p>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1 font-medium">تكلفة نقلة سعير (₪)</label>
                        <input
                          type="number" min={0}
                          value={cfLongTripCost}
                          onChange={e => setCfLongTripCost(Math.max(0, Number(e.target.value)))}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                          placeholder="0"
                        />
                      </div>
                      {cfLongTripPerMonth > 0 && cfLongTripCost > 0 && (() => {
                        const baseT = cfAvgMonthly.trips
                        const sa3T = Math.min(cfLongTripPerMonth, baseT)
                        return (
                          <p className="col-span-full text-xs text-amber-700 bg-amber-100 rounded-lg px-3 py-2">
                            📌 {sa3T} نقلة بسعر سعير + {baseT - sa3T} نقلة بالتكلفة المعتادة = {cfAvgMonthly.cost.toLocaleString()} ₪/شهر
                          </p>
                        )
                      })()}
                    </div>
                  )}

                  {/* حقول سعير الكامل */}
                  {cfScenario === 'full' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-rose-50 rounded-xl border border-rose-200">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1 font-medium">عدد نقلات سعير شهرياً</label>
                        <input
                          type="number" min={0}
                          value={cfSa3irTripsPerMonth}
                          onChange={e => setCfSa3irTripsPerMonth(Math.max(0, Number(e.target.value)))}
                          className="w-full border border-rose-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white"
                          placeholder="0"
                        />
                        <p className="text-xs text-slate-400 mt-1">يستبدل المعدل التاريخي كلياً</p>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1 font-medium">تكلفة نقلة سعير (₪)</label>
                        <input
                          type="number" min={0}
                          value={cfSa3irCostPerTrip}
                          onChange={e => setCfSa3irCostPerTrip(Math.max(0, Number(e.target.value)))}
                          className="w-full border border-rose-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white"
                          placeholder="0"
                        />
                      </div>
                      {cfSa3irTripsPerMonth > 0 && cfSa3irCostPerTrip > 0 && (
                        <div className="col-span-full text-xs text-rose-700 bg-rose-100 rounded-lg px-3 py-2 space-y-0.5">
                          <p>🔴 كل التوقعات محسوبة بسعر سعير — التاريخ السابق لا يُؤثر</p>
                          <p>💰 التكلفة الشهرية المتوقعة: {(cfSa3irTripsPerMonth * cfSa3irCostPerTrip).toLocaleString()} ₪</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ملخص السيناريو الحالي */}
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                    <span className="font-medium text-slate-700">المعدل المستخدم في التوقعات:</span>
                    <span className="text-slate-800 font-bold">{cfAvgMonthly.trips} نقلة/شهر</span>
                    <span>·</span>
                    <span className="text-slate-800 font-bold">{cfAvgMonthly.cost.toLocaleString()} ₪/شهر</span>
                  </div>
                </CardBody>
              </Card>

              {/* ── الرسم البياني التاريخي + التوقع ── */}
              {cfChartData.length > 0 && (
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-slate-800 text-sm" ref={cfMainChartRef}>التكلفة الشهرية + التراكمي (تاريخي وتوقع)</h2>
                    <p className="text-xs text-slate-400 mt-0.5">الأعمدة الصلبة = فعلي · الأعمدة المشطبة = توقع · الخط = تراكمي</p>
                  </CardHeader>
                  <CardBody>
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={cfChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value) => [`${Math.round(Number(value ?? 0)).toLocaleString()} ₪`]} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="cost" name="تكلفة فعلية" fill="#f97316" radius={[3,3,0,0]} />
                        <Bar yAxisId="left" dataKey="forecastCost" name="تكلفة متوقعة" fill="#fdba74" radius={[3,3,0,0]} />
                        <Line yAxisId="right" type="monotone" dataKey="cumulative" name="تراكمي فعلي" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="forecastCumulative" name="تراكمي متوقع" stroke="#93c5fd" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        {cfBudget > 0 && (
                          <Line yAxisId="right" type="monotone" dataKey={() => cfBudget} name="الميزانية" stroke="#10b981" strokeWidth={1.5} strokeDasharray="8 4" dot={false} />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              )}

              {/* ── جدول التاريخي ── */}
              {cfMonthlyHistory.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold text-slate-800 text-sm">البيانات الشهرية الفعلية</h2></CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">الشهر</th>
                          <th className="text-center px-4 py-3 text-xs text-blue-600 font-semibold">النقلات</th>
                          <th className="text-center px-4 py-3 text-xs text-blue-400 font-semibold">💧 سائل</th>
                          <th className="text-center px-4 py-3 text-xs text-amber-500 font-semibold">🪨 جاف</th>
                          <th className="text-center px-4 py-3 text-xs text-orange-600 font-semibold">تكلفة الشهر</th>
                          <th className="text-center px-4 py-3 text-xs text-violet-600 font-semibold">تراكمي</th>
                          {cfBudget > 0 && <th className="text-center px-4 py-3 text-xs text-emerald-600 font-semibold">متبقي من الميزانية</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {cfMonthlyHistory.map((m, i) => {
                          const remaining = cfBudget > 0 ? cfBudget - m.cumulative : null
                          const isLow = remaining !== null && remaining < cfAvgMonthly.cost * 2
                          const isCurrentMonth = m.month === cfCurrentYM
                          return (
                            <tr key={m.month} className={`border-b border-slate-50 hover:bg-slate-50 ${isCurrentMonth ? 'bg-amber-50/40' : i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                              <td className="px-4 py-2.5 font-medium text-slate-700">
                                {m.month}
                                {isCurrentMonth && <span className="mr-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-600 text-xs rounded-full">جاري</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center font-bold text-blue-600">{m.trips}</td>
                              <td className="px-4 py-2.5 text-center text-blue-500">{m.liquid || '—'}</td>
                              <td className="px-4 py-2.5 text-center text-amber-600">{m.solid || '—'}</td>
                              <td className="px-4 py-2.5 text-center font-semibold text-orange-600">{Math.round(m.cost).toLocaleString()} ₪</td>
                              <td className="px-4 py-2.5 text-center text-violet-600 font-medium">{m.cumulative.toLocaleString()} ₪</td>
                              {cfBudget > 0 && (
                                <td className={`px-4 py-2.5 text-center font-semibold ${isLow ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {remaining !== null ? `${Math.round(remaining).toLocaleString()} ₪` : '—'}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-bold border-t-2 border-slate-200">
                          <td className="px-4 py-3 text-slate-700">الإجمالي</td>
                          <td className="px-4 py-3 text-center text-blue-600">{cfTrips.length}</td>
                          <td className="px-4 py-3 text-center text-blue-500">{cfTrips.filter((t: AnyData) => t.waste_type === 'liquid').length}</td>
                          <td className="px-4 py-3 text-center text-amber-600">{cfTrips.filter((t: AnyData) => t.waste_type === 'solid').length}</td>
                          <td className="px-4 py-3 text-center text-orange-600">{Math.round(cfTotalCost).toLocaleString()} ₪</td>
                          <td className="px-4 py-3 text-center text-violet-600">{Math.round(cfTotalCost).toLocaleString()} ₪</td>
                          {cfBudget > 0 && <td className="px-4 py-3 text-center text-emerald-600">{Math.round(cfBudget - cfTotalCost).toLocaleString()} ₪</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              )}
              {/* â”€â”€ Ø¬Ø¯ÙˆÙ„ Ù…Ù‚Ø§Ø±Ù†Ø© Ø´Ø§Ù…Ù„ Ù„Ù„Ø«Ù„Ø§Ø« Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆÙ‡Ø§Øª â”€â”€ */}

              {cfLoaded && (cfAllScenarios.partialReady || cfAllScenarios.fullReady) && (

                <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/60 to-white overflow-hidden">

                  <div className="px-4 py-3 border-b border-violet-100 bg-violet-50">

                    <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">âš–ï¸ Ù…Ù‚Ø§Ø±Ù†Ø© Ø´Ø§Ù…Ù„Ø© â€” Ø§Ù„Ø«Ù„Ø§Ø« Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆÙ‡Ø§Øª</h2>

                    <p className="text-xs text-slate-400 mt-0.5">Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø±Ù‚Ø§Ù… Ù…Ø­Ø³ÙˆØ¨Ø© Ø¨Ø´ÙƒÙ„ Ù…Ø³ØªÙ‚Ù„ Ø¨ØºØ¶ Ø§Ù„Ù†Ø¸Ø± Ø¹Ù† Ø§Ù„Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆ Ø§Ù„Ù…Ø®ØªØ§Ø± Ø­Ø§Ù„ÙŠØ§Ù‹</p>

                  </div>

                  <div className="overflow-x-auto">

                    <table className="w-full text-xs">

                      <thead>

                        <tr>

                          <th className="text-right px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold w-40">Ø§Ù„Ù…Ù‚ÙŠØ§Ø³</th>

                          <th className="text-center px-3 py-2.5 bg-blue-50 border-b border-blue-100 text-blue-700 font-bold">ðŸ“Š Ø§Ù„ÙˆØ¶Ø¹ Ø§Ù„Ø­Ø§Ù„ÙŠ</th>

                          <th className={`text-center px-3 py-2.5 border-b font-bold ${cfAllScenarios.partialReady ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>

                            ðŸ”¶ Ø³Ø¹ÙŠØ± Ø¬Ø²Ø¦ÙŠ

                            {!cfAllScenarios.partialReady && <div className="text-xs font-normal opacity-60">Ø£Ø¯Ø®Ù„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª</div>}

                          </th>

                          <th className={`text-center px-3 py-2.5 border-b font-bold ${cfAllScenarios.fullReady ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>

                            ðŸ”´ Ø³Ø¹ÙŠØ± ÙƒØ§Ù…Ù„

                            {!cfAllScenarios.fullReady && <div className="text-xs font-normal opacity-60">Ø£Ø¯Ø®Ù„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª</div>}

                          </th>

                        </tr>

                      </thead>

                      <tbody className="divide-y divide-slate-100">

                        {/* Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„Ø´Ù‡Ø±ÙŠØ© */}

                        <tr className="hover:bg-slate-50/60">

                          <td className="px-4 py-2.5 text-slate-600 font-medium">Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„Ø´Ù‡Ø±ÙŠØ©</td>

                          <td className="text-center px-3 py-2.5 font-bold text-blue-800">{cfAllScenarios.current.monthly.cost.toLocaleString()} â‚ª</td>

                          <td className={`text-center px-3 py-2.5 font-bold ${cfAllScenarios.partialReady ? (cfAllScenarios.partial.monthly.cost > cfAllScenarios.current.monthly.cost ? 'text-amber-700' : 'text-green-600') : 'text-slate-300'}`}>

                            {cfAllScenarios.partialReady ? `${cfAllScenarios.partial.monthly.cost.toLocaleString()} â‚ª` : 'â€”'}

                            {cfAllScenarios.partialReady && cfAllScenarios.partial.monthly.cost !== cfAllScenarios.current.monthly.cost && (

                              <div className="text-xs font-normal opacity-70">{cfAllScenarios.partial.monthly.cost > cfAllScenarios.current.monthly.cost ? '+' : ''}{(cfAllScenarios.partial.monthly.cost - cfAllScenarios.current.monthly.cost).toLocaleString()}</div>

                            )}

                          </td>

                          <td className={`text-center px-3 py-2.5 font-bold ${cfAllScenarios.fullReady ? (cfAllScenarios.full.monthly.cost > cfAllScenarios.current.monthly.cost ? 'text-rose-700' : 'text-green-600') : 'text-slate-300'}`}>

                            {cfAllScenarios.fullReady ? `${cfAllScenarios.full.monthly.cost.toLocaleString()} â‚ª` : 'â€”'}

                            {cfAllScenarios.fullReady && cfAllScenarios.full.monthly.cost !== cfAllScenarios.current.monthly.cost && (

                              <div className="text-xs font-normal opacity-70">{cfAllScenarios.full.monthly.cost > cfAllScenarios.current.monthly.cost ? '+' : ''}{(cfAllScenarios.full.monthly.cost - cfAllScenarios.current.monthly.cost).toLocaleString()}</div>

                            )}

                          </td>

                        </tr>

                        {/* Ù†Ù‚Ù„Ø§Øª Ø´Ù‡Ø±ÙŠØ§Ù‹ */}

                        <tr className="hover:bg-slate-50/60 bg-slate-50/30">

                          <td className="px-4 py-2.5 text-slate-600 font-medium">Ù†Ù‚Ù„Ø§Øª Ø´Ù‡Ø±ÙŠØ§Ù‹</td>

                          <td className="text-center px-3 py-2.5 font-bold text-blue-800">{cfAllScenarios.current.monthly.trips}</td>

                          <td className="text-center px-3 py-2.5 font-bold text-amber-700">

                            {cfAllScenarios.partialReady ? cfAllScenarios.partial.monthly.trips : 'â€”'}

                            {cfAllScenarios.partialReady && cfLongTripPerMonth > 0 && (

                              <div className="text-xs font-normal text-slate-400">({Math.min(cfLongTripPerMonth, cfAllScenarios.current.monthly.trips)} Ø³Ø¹ÙŠØ± + {cfAllScenarios.current.monthly.trips - Math.min(cfLongTripPerMonth, cfAllScenarios.current.monthly.trips)} Ø¹Ø§Ø¯ÙŠ)</div>

                            )}

                          </td>

                          <td className="text-center px-3 py-2.5 font-bold text-rose-700">{cfAllScenarios.fullReady ? cfAllScenarios.full.monthly.trips : 'â€”'}</td>

                        </tr>

                        {/* Ù…ØªÙˆØ³Ø· ØªÙƒÙ„ÙØ© Ø§Ù„Ù†Ù‚Ù„Ø© */}

                        <tr className="hover:bg-slate-50/60">

                          <td className="px-4 py-2.5 text-slate-600 font-medium">Ù…ØªÙˆØ³Ø· ØªÙƒÙ„ÙØ© Ø§Ù„Ù†Ù‚Ù„Ø©</td>

                          <td className="text-center px-3 py-2.5 font-bold text-blue-800">{cfAllScenarios.current.costPerTrip.toLocaleString()} â‚ª</td>

                          <td className="text-center px-3 py-2.5 font-bold text-amber-700">{cfAllScenarios.partialReady ? `${cfAllScenarios.partial.costPerTrip.toLocaleString()} â‚ª` : 'â€”'}</td>

                          <td className="text-center px-3 py-2.5 font-bold text-rose-700">{cfAllScenarios.fullReady ? `${cfAllScenarios.full.costPerTrip.toLocaleString()} â‚ª` : 'â€”'}</td>

                        </tr>

                        {/* Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø­ØªÙ‰ Ø¯ÙŠØ³Ù…Ø¨Ø± 2027 */}

                        <tr className="hover:bg-slate-50/60 bg-slate-50/30">

                          <td className="px-4 py-2.5 text-slate-600 font-medium">Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø­ØªÙ‰ Ø¯ÙŠØ³Ù…Ø¨Ø± 2027</td>

                          <td className="text-center px-3 py-2.5 font-bold text-blue-800">{cfAllScenarios.current.estimatedTotal.toLocaleString()} â‚ª</td>

                          <td className="text-center px-3 py-2.5 font-bold text-amber-700">{cfAllScenarios.partialReady ? `${cfAllScenarios.partial.estimatedTotal.toLocaleString()} â‚ª` : 'â€”'}</td>

                          <td className="text-center px-3 py-2.5 font-bold text-rose-700">{cfAllScenarios.fullReady ? `${cfAllScenarios.full.estimatedTotal.toLocaleString()} â‚ª` : 'â€”'}</td>

                        </tr>

                        {/* Ù…ØªØ¨Ù‚ÙŠ Ø§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ù†Ù‡Ø§ÙŠØ© 2027 */}

                        {cfBudget > 0 && (

                          <tr className="hover:bg-slate-50/60">

                            <td className="px-4 py-2.5 text-slate-600 font-medium">Ù…ØªØ¨Ù‚ÙŠ Ø§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ù†Ù‡Ø§ÙŠØ© 2027</td>

                            <td className={`text-center px-3 py-2.5 font-bold ${(cfAllScenarios.current.budgetRemaining2027 ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>

                              {cfAllScenarios.current.budgetRemaining2027 !== null ? `${cfAllScenarios.current.budgetRemaining2027.toLocaleString()} â‚ª` : 'â€”'}

                            </td>

                            <td className={`text-center px-3 py-2.5 font-bold ${!cfAllScenarios.partialReady ? 'text-slate-300' : (cfAllScenarios.partial.budgetRemaining2027 ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>

                              {cfAllScenarios.partialReady && cfAllScenarios.partial.budgetRemaining2027 !== null ? `${cfAllScenarios.partial.budgetRemaining2027.toLocaleString()} â‚ª` : 'â€”'}

                            </td>

                            <td className={`text-center px-3 py-2.5 font-bold ${!cfAllScenarios.fullReady ? 'text-slate-300' : (cfAllScenarios.full.budgetRemaining2027 ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>

                              {cfAllScenarios.fullReady && cfAllScenarios.full.budgetRemaining2027 !== null ? `${cfAllScenarios.full.budgetRemaining2027.toLocaleString()} â‚ª` : 'â€”'}

                            </td>

                          </tr>

                        )}

                        {/* ØªØ§Ø±ÙŠØ® Ù†ÙØ§Ø¯ Ø§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ© */}

                        {cfBudget > 0 && (

                          <tr className="hover:bg-slate-50/60 bg-slate-50/30">

                            <td className="px-4 py-2.5 text-slate-600 font-medium">ØªØ§Ø±ÙŠØ® Ù†ÙØ§Ø¯ Ø§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ©</td>

                            <td className="text-center px-3 py-2.5 font-bold text-blue-700">{cfAllScenarios.current.exhaustionDate ?? 'Ø¨Ø¹Ø¯ 2027'}</td>

                            <td className="text-center px-3 py-2.5 font-bold text-amber-700">{cfAllScenarios.partialReady ? (cfAllScenarios.partial.exhaustionDate ?? 'Ø¨Ø¹Ø¯ 2027') : 'â€”'}</td>

                            <td className="text-center px-3 py-2.5 font-bold text-rose-700">{cfAllScenarios.fullReady ? (cfAllScenarios.full.exhaustionDate ?? 'Ø¨Ø¹Ø¯ 2027') : 'â€”'}</td>

                          </tr>

                        )}

                        {/* Ù†Ù‚Ù„Ø§Øª Ø­ØªÙ‰ Ù†ÙØ§Ø¯ Ø§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ© */}

                        {cfBudget > 0 && (

                          <tr className="hover:bg-slate-50/60">

                            <td className="px-4 py-2.5 text-slate-600 font-medium">Ù†Ù‚Ù„Ø§Øª Ø­ØªÙ‰ Ù†ÙØ§Ø¯ Ø§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ©</td>

                            <td className="text-center px-3 py-2.5 font-bold text-blue-800">{cfAllScenarios.current.tripsToExhaust?.toLocaleString() ?? 'â€”'}</td>

                            <td className="text-center px-3 py-2.5 font-bold text-amber-700">{cfAllScenarios.partialReady ? (cfAllScenarios.partial.tripsToExhaust?.toLocaleString() ?? 'â€”') : 'â€”'}</td>

                            <td className="text-center px-3 py-2.5 font-bold text-rose-700">{cfAllScenarios.fullReady ? (cfAllScenarios.full.tripsToExhaust?.toLocaleString() ?? 'â€”') : 'â€”'}</td>

                          </tr>

                        )}

                        {/* Ø§Ù„ÙØ±Ù‚ Ø§Ù„Ø´Ù‡Ø±ÙŠ Ø¹Ù† Ø§Ù„Ø­Ø§Ù„ÙŠ */}

                        <tr className="bg-amber-50/40 hover:bg-amber-50/60">

                          <td className="px-4 py-2.5 text-slate-600 font-medium">Ø§Ù„ÙØ±Ù‚ Ø¹Ù† Ø§Ù„ÙˆØ¶Ø¹ Ø§Ù„Ø­Ø§Ù„ÙŠ</td>

                          <td className="text-center px-3 py-2.5 text-slate-400">â€”</td>

                          <td className="text-center px-3 py-2.5 font-bold">

                            {cfAllScenarios.partialReady ? (() => {

                              const d = cfAllScenarios.partial.monthly.cost - cfAllScenarios.current.monthly.cost

                              const pc = cfAllScenarios.current.monthly.cost > 0 ? Math.round(Math.abs(d) / cfAllScenarios.current.monthly.cost * 100) : 0

                              return <span className={d > 0 ? 'text-amber-700' : 'text-green-600'}>{d > 0 ? '+' : ''}{d.toLocaleString()} â‚ª ({pc}%)</span>

                            })() : 'â€”'}

                          </td>

                          <td className="text-center px-3 py-2.5 font-bold">

                            {cfAllScenarios.fullReady ? (() => {

                              const d = cfAllScenarios.full.monthly.cost - cfAllScenarios.current.monthly.cost

                              const pc = cfAllScenarios.current.monthly.cost > 0 ? Math.round(Math.abs(d) / cfAllScenarios.current.monthly.cost * 100) : 0

                              return <span className={d > 0 ? 'text-rose-700' : 'text-green-600'}>{d > 0 ? '+' : ''}{d.toLocaleString()} â‚ª ({pc}%)</span>

                            })() : 'â€”'}

                          </td>

                        </tr>

                      </tbody>

                    </table>

                  </div>

                  {(!cfAllScenarios.partialReady || !cfAllScenarios.fullReady) && (

                    <div className="px-4 py-2 text-xs text-slate-400 border-t border-violet-100 bg-violet-50/40 flex items-center gap-2">

                      â„¹ï¸ <span>

                        {!cfAllScenarios.partialReady && <span>Ø£Ø¯Ø®Ù„ Ø¨ÙŠØ§Ù†Ø§Øª <strong>Ø³Ø¹ÙŠØ± Ø¬Ø²Ø¦ÙŠ</strong> Ù„Ù…Ù„Ø¡ Ø¹Ù…ÙˆØ¯Ù‡</span>}

                        {!cfAllScenarios.partialReady && !cfAllScenarios.fullReady && ' Â· '}

                        {!cfAllScenarios.fullReady && <span>Ø£Ø¯Ø®Ù„ Ø¨ÙŠØ§Ù†Ø§Øª <strong>Ø³Ø¹ÙŠØ± ÙƒØ§Ù…Ù„</strong> Ù„Ù…Ù„Ø¡ Ø¹Ù…ÙˆØ¯Ù‡</span>}

                      </span>

                    </div>

                  )}

                </div>

              )}


              {/* ── تنبيه عند تفعيل سيناريو سعير ── */}
              {cfScenario !== 'current' && (
                <div className={`rounded-xl px-4 py-2.5 text-xs flex items-center gap-2 ${
                  cfScenario === 'full'
                    ? 'bg-rose-100 border border-rose-300 text-rose-800'
                    : 'bg-amber-100 border border-amber-300 text-amber-800'
                }`}>
                  {cfScenario === 'full' ? '🔴' : '🔶'}
                  <span>
                    {cfScenario === 'full'
                      ? 'التوقعات أدناه محسوبة بسيناريو سعير الكامل — التاريخ السابق لا يُؤثر في الحساب'
                      : 'التوقعات أدناه تتضمن نقلات سعير الإضافية فوق المعدل التاريخي'}
                  </span>
                </div>
              )}

              {/* ── جدول التوقعات ── */}
              {cfForecast.length > 0 && (
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                      <TrendingDown size={15} className="text-violet-600" /> توقعات الصرف — 6 أشهر قادمة
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">مبني على متوسط آخر 3 أشهر كاملة: {Math.round(cfAvgMonthly.trips)} نقلة/شهر · {Math.round(cfAvgMonthly.cost).toLocaleString()} ₪/شهر{cfLongTripPerMonth > 0 ? ` (منها ${cfLongTripPerMonth} نقلة > 7 كم · +${(cfLongTripPerMonth * cfLongTripCost).toLocaleString()} ₪)` : ''}</p>
                  </CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-violet-50 border-b border-violet-100">
                          <th className="text-right px-4 py-3 text-xs text-violet-600 font-semibold">الشهر</th>
                          <th className="text-center px-4 py-3 text-xs text-violet-600 font-semibold">نقلات متوقعة</th>
                          <th className="text-center px-4 py-3 text-xs text-orange-500 font-semibold">تكلفة متوقعة</th>
                          <th className="text-center px-4 py-3 text-xs text-violet-600 font-semibold">تراكمي متوقع</th>
                          {cfBudget > 0 && <th className="text-center px-4 py-3 text-xs text-emerald-600 font-semibold">ميزانية متبقية</th>}
                          {cfBudget > 0 && <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">الحالة</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {cfForecast.map((m, i) => {
                          const isDeficit = cfBudget > 0 && m.cumulative > cfBudget
                          const isWarning = cfBudget > 0 && !isDeficit && m.budgetRemaining < cfAvgMonthly.cost * 2
                          return (
                            <tr key={m.month} className={`border-b border-slate-50 ${isDeficit ? 'bg-red-50/60' : isWarning ? 'bg-amber-50/40' : i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                              <td className="px-4 py-2.5 font-medium text-slate-600">{m.month}</td>
                              <td className="px-4 py-2.5 text-center text-blue-600 font-semibold">{m.trips}</td>
                              <td className="px-4 py-2.5 text-center text-orange-600 font-semibold">{Math.round(m.cost).toLocaleString()} ₪</td>
                              <td className="px-4 py-2.5 text-center text-violet-600 font-medium">{m.cumulative.toLocaleString()} ₪</td>
                              {cfBudget > 0 && (
                                <td className={`px-4 py-2.5 text-center font-semibold ${isDeficit ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {isDeficit ? `−${Math.round(m.cumulative - cfBudget).toLocaleString()} ₪` : `${Math.round(m.budgetRemaining).toLocaleString()} ₪`}
                                </td>
                              )}
                              {cfBudget > 0 && (
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isDeficit ? 'bg-red-100 text-red-700' : isWarning ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {isDeficit ? '🔴 عجز' : isWarning ? '🟡 تحذير' : '🟢 كافية'}
                                  </span>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {cfBudget === 0 && (
                    <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-700 flex items-center gap-2">
                      ⚠️ لم يتم تحديد ميزانية المشروع في الإعدادات — لا يمكن حساب الفجوة التمويلية.
                      <Link href="/settings" className="font-semibold underline">تعديل الإعدادات</Link>
                    </div>
                  )}
                </Card>
              )}

              {/* ── توقع حتى نهاية 2027 ── */}
              <Card className="border border-blue-100">
                <CardHeader>
                  <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                    <TrendingDown size={15} className="text-blue-600" /> توقع الاستنفاد حتى نهاية عام 2027
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {cfProjection2027.monthsRemaining} شهراً متبقية · متوسط شهري حالي {Math.round(cfAvgMonthly.cost).toLocaleString()} ₪
                  </p>
                </CardHeader>
                <CardBody>
                  {cfBudget > 0 ? (
                    <>
                      {/* بانر الحالة */}
                      {cfProjection2027.exhaustionDate && (
                        <div className={`rounded-xl px-4 py-3 mb-4 flex items-start gap-3 ${
                          cfProjection2027.exhaustionIsBeforeEnd2027
                            ? 'bg-red-50 border border-red-200'
                            : 'bg-emerald-50 border border-emerald-200'
                        }`}>
                          <span className="text-xl mt-0.5">{cfProjection2027.exhaustionIsBeforeEnd2027 ? '⚠️' : '✅'}</span>
                          <div>
                            <p className={`font-bold text-sm ${
                              cfProjection2027.exhaustionIsBeforeEnd2027 ? 'text-red-700' : 'text-emerald-700'
                            }`}>
                              {cfProjection2027.exhaustionIsBeforeEnd2027
                                ? `بالمعدل الحالي، سينفد التمويل في ${cfProjection2027.exhaustionDate}`
                                : `بالمعدل الحالي، التمويل كافٍ حتى ${cfProjection2027.exhaustionDate}`}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {cfProjection2027.exhaustionIsBeforeEnd2027
                                ? `قبل نهاية 2027 بـ ${cfProjection2027.monthsBefore2027End} شهراً — لازم رفع معدل الصرف`
                                : `سيتبقى ${cfProjection2027.budgetRemaining2027 !== null ? Math.abs(Math.round(cfProjection2027.budgetRemaining2027)).toLocaleString() : '—'} ₪ فائض بنهاية ديسمبر 2027`}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* شبكة الأرقام المفتاحية */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                          <p className="text-xs text-slate-500 mb-1">تاريخ نفاد التمويل</p>
                          <p className={`text-base font-bold ${
                            cfProjection2027.exhaustionIsBeforeEnd2027 ? 'text-red-600' : 'text-emerald-600'
                          }`}>{cfProjection2027.exhaustionDate ?? '—'}</p>
                          <p className="text-xs text-slate-400">بالمعدل الحالي</p>
                        </div>
                        {cfProjection2027.requiredMonthlyCost !== null && (
                          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                            <p className="text-xs text-slate-500 mb-1">المعدل الشهري المطلوب</p>
                            <p className="text-base font-bold text-blue-700">{cfProjection2027.requiredMonthlyCost.toLocaleString()} ₪</p>
                            {cfProjection2027.requiredMonthlyTrips !== null && (
                              <p className="text-xs text-blue-500">{cfProjection2027.requiredMonthlyTrips} نقلة/شهر</p>
                            )}
                          </div>
                        )}
                        {cfProjection2027.costDiff !== null && (
                          <div className={`border rounded-xl p-3 text-center ${
                            cfProjection2027.costDiff > 0 ? 'bg-amber-50 border-amber-100' : 'bg-violet-50 border-violet-100'
                          }`}>
                            <p className="text-xs text-slate-500 mb-1">الفارق عن المعدل الحالي</p>
                            <p className={`text-base font-bold ${
                              cfProjection2027.costDiff > 0 ? 'text-amber-700' : 'text-violet-700'
                            }`}>
                              {cfProjection2027.costDiff > 0 ? '▲' : '▼'} {Math.abs(cfProjection2027.costDiff).toLocaleString()} ₪/شهر
                            </p>
                            {cfProjection2027.tripsDiff !== null && (
                              <p className={`text-xs ${
                                cfProjection2027.costDiff > 0 ? 'text-amber-600' : 'text-violet-600'
                              }`}>
                                {cfProjection2027.costDiff > 0
                                  ? `+${cfProjection2027.tripsDiff} نقلة/شهر للاستنفاد`
                                  : `${cfProjection2027.tripsDiff} نقلة/شهر أقل كافية`}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* شارت: أعمدة شهرية + خط الميزانية المتبقية */}
                      {cf2027ChartData.length > 0 && (
                        <div className="mb-4" ref={cf2027ChartRef}>
                          <p className="text-xs text-slate-400 mb-2">🟠 تكلفة فعلية · 🟡 تكلفة متوقعة · خط أزرق: ميزانية متبقية</p>
                          <ResponsiveContainer width="100%" height={220}>
                            <ComposedChart data={cf2027ChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                              <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                              <Tooltip formatter={(value) => [`${Math.round(Number(value ?? 0)).toLocaleString()} ₪`]} />
                              <Legend />
                              <Bar yAxisId="left" dataKey="cost" name="تكلفة فعلية" fill="#f97316" radius={[2,2,0,0]} />
                              <Bar yAxisId="left" dataKey="forecastCost" name="تكلفة متوقعة" fill="#fbbf24" radius={[2,2,0,0]} />
                              <Line yAxisId="right" type="monotone" dataKey="remaining" name="ميزانية متبقية" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* النقلات والحجم */}
                      {cfProjection2027.tripsToExhaust !== null && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                          <div className="text-center bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <p className="text-xs text-slate-500 mb-1">عدد النقلات التي يكفّيها التمويل المتبقي</p>
                            <p className="text-xl font-bold text-slate-700">{cfProjection2027.tripsToExhaust.toLocaleString()} نقلة</p>
                            {cfProjection2027.tripsPerMonthNeeded !== null && (
                              <p className="text-xs text-slate-400 mt-0.5">أي {cfProjection2027.tripsPerMonthNeeded} نقلة/شهر لاستنفادها بنهاية 2027</p>
                            )}
                          </div>
                          {cfProjection2027.volumeToExhaust !== null && cfProjection2027.volumeToExhaust > 0 && cfProjection2027.tripsToExhaust !== null && (
                            <div className="text-center bg-slate-50 border border-slate-100 rounded-xl p-3">
                              <p className="text-xs text-slate-500 mb-1">كمية الربو التي يكفّيها التمويل المتبقي</p>
                              <p className="text-xl font-bold text-slate-700">{cfProjection2027.volumeToExhaust.toLocaleString()} م³</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                عبر {cfProjection2027.tripsToExhaust.toLocaleString()} نقلة إضافية · {(cfProjection2027.volumeToExhaust / cfProjection2027.tripsToExhaust).toFixed(1)} م³/نقلة
                              </p>
                            </div>
                          )}
                          <div className="text-center bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <p className="text-xs text-slate-500 mb-1">الميزانية المتبقية الآن</p>
                            <p className="text-xl font-bold text-slate-700">{Math.round(cfProjection2027.remainingBudgetNow).toLocaleString()} ₪</p>
                            {cfBudget > 0 && (
                              <p className="text-xs text-slate-400 mt-0.5">{Math.round((cfProjection2027.remainingBudgetNow / cfBudget) * 100)}% من الميزانية الكلية</p>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                      ⚠️ حدد ميزانية المشروع في{' '}
                      <Link href="/settings" className="font-semibold underline">الإعدادات</Link>{' '}
                      لتفعيل توقعات 2027
                    </p>
                  )}
                </CardBody>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  )
}
