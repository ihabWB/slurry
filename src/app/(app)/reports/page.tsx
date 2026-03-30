'use client'
import { useState, useCallback, useMemo } from 'react'
import {
  FileText, FileSpreadsheet, Filter, BarChart2, Droplets, Package,
  Building2, AlertTriangle, DollarSign, TrendingUp, Truck, Users
} from 'lucide-react'
import { getTrips, getFactoriesSummary, getPayments } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, Input } from '@/components/ui/Input'
import { format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend
} from 'recharts'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import Link from 'next/link'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any

const WASTE_LABEL: Record<string, string> = { liquid: 'سائل', solid: 'جاف' }
const WASTE_COLORS: Record<string, string> = { liquid: '#3b82f6', solid: '#f59e0b', unknown: '#94a3b8' }

type Tab = 'factories' | 'overdue' | 'trips' | 'payments' | 'performance'

export default function ReportsPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [activeTab, setActiveTab] = useState<Tab>('factories')

  // ── Factories Summary state ──
  const [factoriesSummary, setFactoriesSummary] = useState<AnyData[]>([])
  const [factoriesLoading, setFactoriesLoading] = useState(false)
  const [factoriesLoaded, setFactoriesLoaded] = useState(false)

  // ── Trips report state ──
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'credit'>('all')
  const [wasteFilter, setWasteFilter] = useState<'all' | 'liquid' | 'solid'>('all')
  const [factoryFilter, setFactoryFilter] = useState<string>('all')
  const [trips, setTrips] = useState<AnyData[]>([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [tripsLoaded, setTripsLoaded] = useState(false)

  // ── Payments report state ──
  const [payFrom, setPayFrom] = useState(format(new Date(new Date().setDate(1)), 'yyyy-MM-dd'))
  const [payTo, setPayTo] = useState(today)
  const [payments, setPayments] = useState<AnyData[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentsLoaded, setPaymentsLoaded] = useState(false)

  // ── Load factories summary ──
  const loadFactories = useCallback(async () => {
    setFactoriesLoading(true)
    try {
      const data = await getFactoriesSummary()
      setFactoriesSummary(data)
      setFactoriesLoaded(true)
    } catch (e) { console.error(e) }
    finally { setFactoriesLoading(false) }
  }, [])

  // ── Load trips ──
  const applyPeriod = (p: 'today' | 'week' | 'month' | 'custom') => {
    setPeriod(p)
    const now = new Date()
    if (p === 'today') {
      setFrom(format(now, 'yyyy-MM-dd')); setTo(format(now, 'yyyy-MM-dd'))
    } else if (p === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7)
      setFrom(format(d, 'yyyy-MM-dd')); setTo(format(now, 'yyyy-MM-dd'))
    } else if (p === 'month') {
      const d = new Date(now); d.setDate(1)
      setFrom(format(d, 'yyyy-MM-dd')); setTo(format(now, 'yyyy-MM-dd'))
    }
  }

  const generateTrips = useCallback(async () => {
    setTripsLoading(true)
    try {
      const filters: AnyData = {
        from,
        to,
      }
      if (statusFilter !== 'all') filters.payment_status = statusFilter
      const data = await getTrips(filters)
      setTrips(data || [])
      setTripsLoaded(true)
    } catch (e) { console.error(e) }
    finally { setTripsLoading(false) }
  }, [from, to, statusFilter])

  // ── Load payments ──
  const generatePayments = useCallback(async () => {
    setPaymentsLoading(true)
    try {
      const data = await getPayments({ from: payFrom, to: payTo })
      setPayments(data || [])
      setPaymentsLoaded(true)
    } catch (e) { console.error(e) }
    finally { setPaymentsLoading(false) }
  }, [payFrom, payTo])

  // ── Derived: trips ──
  const filtered = useMemo(() => trips.filter(t => {
    if (wasteFilter !== 'all' && t.waste_type !== wasteFilter) return false
    if (factoryFilter !== 'all' && t.factory_id !== factoryFilter) return false
    return true
  }), [trips, wasteFilter, factoryFilter])

  const tripFactories = useMemo(() => {
    const map = new Map<string, string>()
    trips.forEach(t => { if (t.factory_id && t.factories?.name) map.set(t.factory_id, t.factories.name) })
    return Array.from(map.entries())
  }, [trips])

  const totalTrips = filtered.length
  const totalAmount = filtered.reduce((s: number, t: AnyData) => s + Number(t.amount), 0)
  const totalVolume = filtered.reduce((s: number, t: AnyData) => s + (t.volume_m3 ? Number(t.volume_m3) : 0), 0)
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

  const pieData = [
    { name: 'سائل', value: liquidTrips.length, color: WASTE_COLORS.liquid },
    { name: 'جاف', value: solidTrips.length, color: WASTE_COLORS.solid },
    { name: 'غير محدد', value: filtered.filter((t: AnyData) => !t.waste_type).length, color: WASTE_COLORS.unknown },
  ].filter(d => d.value > 0)

  // ── Derived: factories ──
  const overdueFactories = useMemo(() =>
    factoriesSummary.filter(f => f.balance > 0).sort((a: AnyData, b: AnyData) => b.balance - a.balance),
    [factoriesSummary])

  const totalDebt = useMemo(() =>
    factoriesSummary.reduce((s: number, f: AnyData) => s + f.balance, 0), [factoriesSummary])

  const totalCollected = useMemo(() =>
    factoriesSummary.reduce((s: number, f: AnyData) => s + f.totalPaid, 0), [factoriesSummary])

  const performanceChart = useMemo(() =>
    [...factoriesSummary].filter(f => f.totalTrips > 0)
      .sort((a: AnyData, b: AnyData) => b.totalTrips - a.totalTrips).slice(0, 15),
    [factoriesSummary])

  // ── Derived: payments ──
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

  // ── Exports ──
  const exportFactoriesExcel = () => {
    const rows = factoriesSummary.map((f: AnyData) => ({
      'المصنع': f.name, 'صاحب المصنع': f.owner_name, 'الهاتف': f.phone, 'المنطقة': f.region ?? '',
      'إجمالي النقلات': f.totalTrips, 'نقداً': f.cashTrips,
      'مسوّاة لاحقاً': f.laterTrips, 'ذمة': f.creditTrips,
      'إجمالي المستحق (₪)': f.totalAmount, 'إجمالي المدفوع (₪)': f.totalPaid, 'الرصيد (₪)': f.balance,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'ملخص المصانع')
    XLSX.writeFile(wb, `factories-summary-${today}.xlsx`)
  }

  const exportTripsExcel = () => {
    const tripsRows = filtered.map((t: AnyData, i: number) => ({
      '#': i + 1, 'المصنع': t.factories?.name ?? '', 'المنطقة': t.factories?.region ?? '',
      'رقم القسيمة': t.coupon_number ?? '',
      'اسم السائق': t.driver_name ?? '',
      'نوع المركبة': t.vehicle_type === 'tank' ? 'صهريج' : t.vehicle_type === 'truck' ? 'شاحنة' : '',
      'نوع الربو': t.waste_type ? WASTE_LABEL[t.waste_type] : 'غير محدد',
      'الحجم (م³)': t.volume_m3 ?? '', 'المبلغ (₪)': t.amount,
      'حالة الدفع': t.payment_status === 'paid' ? 'مدفوع' : 'ذمة',
      'موقع التفريغ': t.dump_site ?? '',
      'منطقة النقل': t.transfer_zone ?? '',
      'تاريخ النقلة': t.trip_date ?? '', 'ملاحظات': t.notes ?? '',
    }))
    const factoryRows = factoryChart.map(f => ({
      'المصنع': f.name, 'إجمالي النقلات': f.liquid + f.solid + f.unknown,
      'نقلات سائل': f.liquid, 'نقلات جاف': f.solid, 'غير محدد': f.unknown,
      'إجمالي الحجم (م³)': +f.volume.toFixed(2), 'المبلغ (₪)': (f.liquid + f.solid + f.unknown) * 50,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tripsRows), 'النقلات التفصيلية')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(factoryRows), 'ملخص المصانع')
    XLSX.writeFile(wb, `trips-${from}-to-${to}.xlsx`)
  }

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

  const exportTripesPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFontSize(14)
    doc.text(`Waste Trips Report: ${from} to ${to}`, 14, 15)
    doc.setFontSize(9)
    doc.text(`Total: ${totalTrips} | Amount: ${totalAmount} ILS | Liquid: ${liquidTrips.length} | Solid: ${solidTrips.length} | Paid: ${paidTrips.length} | Credit: ${creditTripsFiltered.length}`, 14, 22)
    doc.line(14, 25, 280, 25)
    const cols: [string, number][] = [['#', 12], ['Factory', 55], ['Type', 20], ['Vol m3', 20], ['Amount', 22], ['Status', 20], ['Date', 28]]
    let x = 14; let y = 32
    doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    cols.forEach(([h, w]) => { doc.text(h, x, y); x += w })
    doc.setFont('helvetica', 'normal'); y += 5
    filtered.forEach((t: AnyData, i: number) => {
      if (y > 185) { doc.addPage(); y = 20 }
      x = 14
      const row = [
        String(i + 1), (t.factories?.name ?? '').slice(0, 20),
        t.waste_type === 'liquid' ? 'Liquid' : t.waste_type === 'solid' ? 'Solid' : '-',
        t.volume_m3 ? String(t.volume_m3) : '-', `${t.amount} ILS`,
        t.payment_status === 'paid' ? 'Paid' : 'Credit', t.trip_date ?? '',
      ]
      row.forEach((cell, ci) => { doc.text(cell, x, y); x += cols[ci][1] })
      y += 6
    })
    doc.save(`trips-${from}-to-${to}.pdf`)
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'factories', label: 'ملخص المصانع', icon: <Building2 size={15} /> },
    { id: 'overdue', label: 'المتأخرون', icon: <AlertTriangle size={15} /> },
    { id: 'trips', label: 'تقرير النقلات', icon: <Truck size={15} /> },
    { id: 'payments', label: 'تقرير الدفعات', icon: <DollarSign size={15} /> },
    { id: 'performance', label: 'أداء المصانع', icon: <TrendingUp size={15} /> },
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

      {/* ══ TAB 1: ملخص المصانع ══ */}
      {activeTab === 'factories' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">ملخص مالي شامل لجميع المصانع – النقلات والمستحقات والذمم</p>
            <Button onClick={loadFactories} loading={factoriesLoading} size="sm">
              <BarChart2 size={14} /> تحميل البيانات
            </Button>
          </div>
          {factoriesLoaded && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'إجمالي المصانع', value: factoriesSummary.length, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100', icon: <Building2 size={16} className="text-blue-600" /> },
                  { label: 'إجمالي النقلات', value: factoriesSummary.reduce((s: number, f: AnyData) => s + f.totalTrips, 0), color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100', icon: <Truck size={16} className="text-violet-600" /> },
                  { label: 'إجمالي المحصّل', value: `${totalCollected.toLocaleString()} ₪`, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', icon: <DollarSign size={16} className="text-emerald-600" /> },
                  { label: 'إجمالي الذمم', value: `${totalDebt.toLocaleString()} ₪`, color: 'text-red-600', bg: 'bg-red-50 border-red-100', icon: <AlertTriangle size={16} className="text-red-600" /> },
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
              <div className="flex justify-end">
                <Button variant="success" size="sm" onClick={exportFactoriesExcel}>
                  <FileSpreadsheet size={14} /> تصدير Excel
                </Button>
              </div>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">صاحب المصنع</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">النقلات</th>
                        <th className="text-center px-4 py-3 text-xs text-green-600 font-semibold">💵 نقداً</th>
                        <th className="text-center px-4 py-3 text-xs text-blue-600 font-semibold">🏦 مسوّاة</th>
                        <th className="text-center px-4 py-3 text-xs text-amber-600 font-semibold">⏳ ذمة</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">المستحق</th>
                        <th className="text-center px-4 py-3 text-xs text-emerald-600 font-semibold">المدفوع</th>
                        <th className="text-center px-4 py-3 text-xs text-red-500 font-semibold">الرصيد</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-400 font-semibold">كشف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...factoriesSummary].sort((a: AnyData, b: AnyData) => b.balance - a.balance).map((f: AnyData) => (
                        <tr key={f.id} className={`border-b border-slate-50 hover:bg-slate-50 ${f.balance > 0 ? 'bg-red-50/20' : ''}`}>
                          <td className="px-5 py-3 font-semibold text-slate-800">{f.name}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{f.owner_name}</td>
                          <td className="px-4 py-3 text-center font-bold text-blue-600">{f.totalTrips}</td>
                          <td className="px-4 py-3 text-center">{f.cashTrips > 0 ? <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{f.cashTrips}</span> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-center">{f.laterTrips > 0 ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{f.laterTrips}</span> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-center">{f.creditTrips > 0 ? <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{f.creditTrips}</span> : <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-center text-slate-600 font-medium">{f.totalAmount.toLocaleString()} ₪</td>
                          <td className="px-4 py-3 text-center text-emerald-700 font-semibold">{f.totalPaid.toLocaleString()} ₪</td>
                          <td className="px-4 py-3 text-center"><span className={`font-bold ${f.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{f.balance.toLocaleString()} ₪</span></td>
                          <td className="px-4 py-3 text-center"><Link href={`/factories/${f.id}`} className="text-blue-500 text-xs hover:underline">عرض</Link></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                        <td colSpan={2} className="px-5 py-3 text-slate-700">الإجمالي</td>
                        <td className="px-4 py-3 text-center text-blue-600">{factoriesSummary.reduce((s: number, f: AnyData) => s + f.totalTrips, 0)}</td>
                        <td className="px-4 py-3 text-center text-green-600">{factoriesSummary.reduce((s: number, f: AnyData) => s + f.cashTrips, 0)}</td>
                        <td className="px-4 py-3 text-center text-blue-600">{factoriesSummary.reduce((s: number, f: AnyData) => s + f.laterTrips, 0)}</td>
                        <td className="px-4 py-3 text-center text-amber-600">{factoriesSummary.reduce((s: number, f: AnyData) => s + f.creditTrips, 0)}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{factoriesSummary.reduce((s: number, f: AnyData) => s + f.totalAmount, 0).toLocaleString()} ₪</td>
                        <td className="px-4 py-3 text-center text-emerald-700">{totalCollected.toLocaleString()} ₪</td>
                        <td className="px-4 py-3 text-center text-red-600">{totalDebt.toLocaleString()} ₪</td>
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

      {/* ══ TAB 2: المتأخرون ══ */}
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

      {/* ══ TAB 3: تقرير النقلات ══ */}
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input label="من تاريخ" type="date" value={from} onChange={e => setFrom(e.target.value)} />
                <Input label="إلى تاريخ" type="date" value={to} onChange={e => setTo(e.target.value)} />
                <Select label="حالة الدفع" value={statusFilter} onChange={e => setStatusFilter(e.target.value as AnyData)}>
                  <option value="all">كل الحالات</option><option value="paid">مدفوع</option><option value="credit">ذمة</option>
                </Select>
                <Select label="نوع الربو" value={wasteFilter} onChange={e => setWasteFilter(e.target.value as AnyData)}>
                  <option value="all">كل الأنواع</option><option value="liquid">💧 سائل</option><option value="solid">🪨 جاف</option>
                </Select>
              </div>
              {tripsLoaded && tripFactories.length > 0 && (
                <Select label="فلتر حسب مصنع" value={factoryFilter} onChange={e => setFactoryFilter(e.target.value)}>
                  <option value="all">كل المصانع</option>
                  {tripFactories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </Select>
              )}
              <Button onClick={generateTrips} loading={tripsLoading} size="lg"><BarChart2 size={16} /> توليد التقرير</Button>
            </CardBody>
          </Card>

          {tripsLoaded && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'إجمالي النقلات', value: totalTrips, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
                  { label: 'إجمالي المبلغ', value: `${totalAmount.toLocaleString()} ₪`, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
                  { label: 'إجمالي الحجم', value: `${totalVolume.toFixed(1)} م³`, color: 'text-cyan-600', bg: 'bg-cyan-50 border-cyan-100' },
                  { label: 'مصانع', value: factoryChart.length, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' },
                ].map(({ label, value, color, bg }) => (
                  <Card key={label} className={`border ${bg}`}><CardBody className="text-center py-4">
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-slate-500 mt-1">{label}</p>
                  </CardBody></Card>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-blue-100"><CardBody className="flex items-center gap-4 py-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0"><Droplets size={22} className="text-blue-600" /></div>
                  <div><p className="text-2xl font-bold text-blue-600">{liquidTrips.length}</p><p className="text-xs text-slate-500">نقلة سائل</p>{liquidVolume > 0 && <p className="text-xs text-blue-500 font-medium mt-0.5">{liquidVolume.toFixed(1)} م³</p>}</div>
                </CardBody></Card>
                <Card className="border-amber-100"><CardBody className="flex items-center gap-4 py-4">
                  <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0"><Package size={22} className="text-amber-600" /></div>
                  <div><p className="text-2xl font-bold text-amber-600">{solidTrips.length}</p><p className="text-xs text-slate-500">نقلة جاف</p>{solidVolume > 0 && <p className="text-xs text-amber-500 font-medium mt-0.5">{solidVolume.toFixed(1)} م³</p>}</div>
                </CardBody></Card>
                <Card><CardBody className="flex items-center gap-4 py-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0"><Building2 size={22} className="text-emerald-600" /></div>
                  <div><p className="text-2xl font-bold text-emerald-600">{paidTrips.length}</p><p className="text-xs text-slate-500">مدفوع <span className="text-amber-500 mr-2">/ {creditTripsFiltered.length} ذمة</span></p></div>
                </CardBody></Card>
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
              {factoryChart.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold text-slate-800 text-sm">ملخص النقلات حسب المصنع</h2></CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                          <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">إجمالي</th>
                          <th className="text-center px-4 py-3 text-xs text-blue-500 font-semibold">💧 سائل</th>
                          <th className="text-center px-4 py-3 text-xs text-amber-500 font-semibold">🪨 جاف</th>
                          <th className="text-center px-4 py-3 text-xs text-cyan-600 font-semibold">الحجم (م³)</th>
                          <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">المبلغ (₪)</th>
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
                              <td className="px-4 py-3 text-center text-cyan-700 font-medium">{f.volume > 0 ? `${f.volume.toFixed(1)} م³` : '—'}</td>
                              <td className="px-4 py-3 text-center font-semibold text-slate-700">{(total * 50).toLocaleString()} ₪</td>
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
                          <td className="px-4 py-3 text-center text-slate-700">{totalAmount.toLocaleString()} ₪</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              )}
              <div className="flex gap-3">
                <Button variant="success" onClick={exportTripsExcel} className="flex-1"><FileSpreadsheet size={16} /> تصدير Excel</Button>
                <Button variant="secondary" onClick={exportTripesPDF} className="flex-1"><FileText size={16} /> تصدير PDF</Button>
              </div>
              <Card>
                <CardHeader><h2 className="font-semibold text-slate-800">النقلات التفصيلية ({filtered.length} نقلة)</h2></CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">#</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">المنطقة</th>
                        <th className="text-center px-4 py-3 text-xs text-violet-600 font-semibold">رقم القسيمة</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">السائق</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">نوع الربو</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">الحجم</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">المبلغ</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">الحالة</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">التاريخ</th>
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={11} className="text-center py-10 text-slate-400">لا توجد بيانات في هذه الفترة</td></tr>
                      ) : filtered.map((t: AnyData, i: number) => (
                        <tr key={t.id} className={`border-b border-slate-50 hover:bg-blue-50/20 ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                          <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{t.factories?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{t.factories?.region ?? '—'}</td>
                          <td className="px-4 py-3 text-center">{t.coupon_number ? <span className="bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full text-xs font-mono font-semibold">{t.coupon_number}</span> : <span className="text-slate-300 text-xs">—</span>}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{t.driver_name ?? '—'}</td>
                          <td className="px-4 py-3 text-center">
                            {t.waste_type === 'liquid' ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">💧 سائل</span>
                              : t.waste_type === 'solid' ? <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs font-semibold">🪨 جاف</span>
                                : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-cyan-700 font-medium text-xs">{t.volume_m3 ? `${t.volume_m3} م³` : '—'}</td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-700">{t.amount} ₪</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {t.payment_status === 'paid' ? 'مدفوع' : 'ذمة'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{t.trip_date ? format(new Date(t.trip_date), 'dd/MM/yyyy') : '—'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs max-w-[120px] truncate">{t.notes ?? '—'}</td>
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

      {/* ══ TAB 4: تقرير الدفعات ══ */}
      {activeTab === 'payments' && (
        <div className="space-y-5">
          <Card>
            <CardHeader><h2 className="font-semibold text-slate-800 flex items-center gap-2"><Filter size={16} /> فلترة الدفعات</h2></CardHeader>
            <CardBody className="space-y-4">
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
                        <Tooltip formatter={(v) => `${v} ₪`} />
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
                <CardHeader><h2 className="font-semibold text-slate-800 text-sm">تفاصيل جميع الدفعات</h2></CardHeader>
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

      {/* ══ TAB 5: أداء المصانع ══ */}
      {activeTab === 'performance' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">ترتيب المصانع حسب النشاط – الأكثر نقلات في الأعلى</p>
            <Button onClick={loadFactories} loading={factoriesLoading} size="sm"><BarChart2 size={14} /> تحميل البيانات</Button>
          </div>
          {factoriesLoaded && (
            <>
              {performanceChart.length > 0 && (
                <Card>
                  <CardHeader><h2 className="font-semibold text-slate-800 text-sm">أعلى 15 مصنع نشاطاً</h2></CardHeader>
                  <CardBody>
                    <ResponsiveContainer width="100%" height={Math.max(250, performanceChart.length * 36)}>
                      <BarChart data={performanceChart} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip /><Legend />
                        <Bar dataKey="cashTrips" name="نقداً" stackId="a" fill="#10b981" />
                        <Bar dataKey="laterTrips" name="مسوّاة" stackId="a" fill="#3b82f6" />
                        <Bar dataKey="creditTrips" name="ذمة" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Users size={16} />
                    ترتيب المصانع ({factoriesSummary.filter((f: AnyData) => f.totalTrips > 0).length} مصنع نشط)
                  </h2>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">#</th>
                        <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">إجمالي النقلات</th>
                        <th className="text-center px-4 py-3 text-xs text-emerald-600 font-semibold">نقداً</th>
                        <th className="text-center px-4 py-3 text-xs text-blue-600 font-semibold">مسوّاة</th>
                        <th className="text-center px-4 py-3 text-xs text-amber-600 font-semibold">ذمة</th>
                        <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">نسبة الدفع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...factoriesSummary].sort((a: AnyData, b: AnyData) => b.totalTrips - a.totalTrips).map((f: AnyData, i: number) => {
                        const paidPct = f.totalTrips > 0 ? Math.round(((f.cashTrips + f.laterTrips) / f.totalTrips) * 100) : 0
                        return (
                          <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-400 font-bold text-sm">{i + 1}</td>
                            <td className="px-5 py-3 font-semibold text-slate-800">{f.name}</td>
                            <td className="px-4 py-3 text-center font-bold text-blue-600 text-lg">{f.totalTrips}</td>
                            <td className="px-4 py-3 text-center">{f.cashTrips > 0 ? <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{f.cashTrips}</span> : <span className="text-slate-300">—</span>}</td>
                            <td className="px-4 py-3 text-center">{f.laterTrips > 0 ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{f.laterTrips}</span> : <span className="text-slate-300">—</span>}</td>
                            <td className="px-4 py-3 text-center">{f.creditTrips > 0 ? <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{f.creditTrips}</span> : <span className="text-slate-300">—</span>}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center gap-2 justify-center">
                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${paidPct === 100 ? 'bg-emerald-500' : paidPct > 50 ? 'bg-blue-500' : 'bg-amber-400'}`} style={{ width: `${paidPct}%` }} />
                                </div>
                                <span className="text-xs text-slate-500">{paidPct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  )
}
