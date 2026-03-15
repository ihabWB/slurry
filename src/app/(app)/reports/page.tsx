'use client'
import { useState, useCallback, useMemo } from 'react'
import { FileText, FileSpreadsheet, Filter, BarChart2, Droplets, Package, Building2 } from 'lucide-react'
import { getTrips } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, Input } from '@/components/ui/Input'
import { format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend
} from 'recharts'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any

const WASTE_LABEL: Record<string, string> = { liquid: 'سائل', solid: 'جاف' }
const WASTE_COLORS: Record<string, string> = { liquid: '#3b82f6', solid: '#f59e0b', unknown: '#94a3b8' }

export default function ReportsPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'credit'>('all')
  const [wasteFilter, setWasteFilter] = useState<'all' | 'liquid' | 'solid'>('all')
  const [factoryFilter, setFactoryFilter] = useState<string>('all')
  const [trips, setTrips] = useState<AnyData[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

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

  const generate = useCallback(async () => {
    setLoading(true)
    try {
      const filters: AnyData = {
        from: new Date(from + 'T00:00:00').toISOString(),
        to: new Date(to + 'T23:59:59').toISOString(),
      }
      if (statusFilter !== 'all') filters.payment_status = statusFilter
      const data = await getTrips(filters)
      setTrips(data || [])
      setLoaded(true)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [from, to, statusFilter])

  // Apply client-side filters
  const filtered = useMemo(() => trips.filter(t => {
    if (wasteFilter !== 'all' && t.waste_type !== wasteFilter) return false
    if (factoryFilter !== 'all' && t.factory_id !== factoryFilter) return false
    return true
  }), [trips, wasteFilter, factoryFilter])

  // Unique factories in results
  const factories = useMemo(() => {
    const map = new Map<string, string>()
    trips.forEach(t => { if (t.factory_id && t.factories?.name) map.set(t.factory_id, t.factories.name) })
    return Array.from(map.entries())
  }, [trips])

  // Summary stats
  const totalTrips = filtered.length
  const totalAmount = filtered.reduce((s: number, t: AnyData) => s + Number(t.amount), 0)
  const totalVolume = filtered.reduce((s: number, t: AnyData) => s + (t.volume_m3 ? Number(t.volume_m3) : 0), 0)
  const liquidTrips = filtered.filter((t: AnyData) => t.waste_type === 'liquid')
  const solidTrips = filtered.filter((t: AnyData) => t.waste_type === 'solid')
  const liquidVolume = liquidTrips.reduce((s: number, t: AnyData) => s + (t.volume_m3 ? Number(t.volume_m3) : 0), 0)
  const solidVolume = solidTrips.reduce((s: number, t: AnyData) => s + (t.volume_m3 ? Number(t.volume_m3) : 0), 0)
  const paidTrips = filtered.filter((t: AnyData) => t.payment_status === 'paid')
  const creditTrips = filtered.filter((t: AnyData) => t.payment_status === 'credit')

  // Chart: trips per day
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

  // Chart: volume per day (m³)
  const volumeChart = useMemo(() => {
    const grouped: Record<string, { liquid: number; solid: number }> = {}
    filtered.forEach((t: AnyData) => {
      if (!t.volume_m3) return
      const d = t.trip_date ? format(new Date(t.trip_date), 'dd/MM') : format(new Date(t.created_at), 'dd/MM')
      if (!grouped[d]) grouped[d] = { liquid: 0, solid: 0 }
      if (t.waste_type === 'liquid') grouped[d].liquid += Number(t.volume_m3)
      else if (t.waste_type === 'solid') grouped[d].solid += Number(t.volume_m3)
    })
    return Object.entries(grouped).map(([date, v]) => ({ date, liquid: +v.liquid.toFixed(2), solid: +v.solid.toFixed(2) }))
  }, [filtered])

  // Chart: per factory breakdown
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

  // Pie data for waste type distribution
  const pieData = [
    { name: 'سائل', value: liquidTrips.length, color: WASTE_COLORS.liquid },
    { name: 'جاف', value: solidTrips.length, color: WASTE_COLORS.solid },
    { name: 'غير محدد', value: filtered.filter((t: AnyData) => !t.waste_type).length, color: WASTE_COLORS.unknown },
  ].filter(d => d.value > 0)

  const exportExcel = () => {
    // Sheet 1: All trips
    const tripsRows = filtered.map((t: AnyData, i: number) => ({
      '#': i + 1,
      'المصنع': t.factories?.name ?? '',
      'المنطقة': t.factories?.region ?? '',
      'نوع الربو': t.waste_type ? WASTE_LABEL[t.waste_type] : 'غير محدد',
      'الحجم (م³)': t.volume_m3 ?? '',
      'المبلغ (₪)': t.amount,
      'حالة الدفع': t.payment_status === 'paid' ? 'مدفوع' : 'ذمة',
      'تاريخ النقلة': t.trip_date ?? '',
      'ملاحظات': t.notes ?? '',
    }))
    // Sheet 2: Per factory summary
    const factoryRows = factoryChart.map(f => ({
      'المصنع': f.name,
      'إجمالي النقلات': f.liquid + f.solid + f.unknown,
      'نقلات سائل': f.liquid,
      'نقلات جاف': f.solid,
      'غير محدد': f.unknown,
      'إجمالي الحجم (م³)': +f.volume.toFixed(2),
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tripsRows), 'النقلات التفصيلية')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(factoryRows), 'ملخص المصانع')
    XLSX.writeFile(wb, `report-${from}-to-${to}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFontSize(14)
    doc.text(`Waste Management Report: ${from} to ${to}`, 14, 15)
    doc.setFontSize(9)
    doc.text(`Total: ${totalTrips} trips | Volume: ${totalVolume.toFixed(1)} m3 | Amount: ${totalAmount} ILS | Liquid: ${liquidTrips.length} | Solid: ${solidTrips.length} | Paid: ${paidTrips.length} | Credit: ${creditTrips.length}`, 14, 22)
    doc.line(14, 25, 280, 25)
    // Header
    const cols = [['#', 15], ['Factory', 55], ['Region', 35], ['Type', 22], ['Vol m3', 22], ['Amount', 22], ['Status', 22], ['Date', 28]] as [string, number][]
    let x = 14; let y = 32
    doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    cols.forEach(([h, w]) => { doc.text(h, x, y); x += w })
    doc.setFont('helvetica', 'normal')
    y += 5
    filtered.forEach((t: AnyData, i: number) => {
      if (y > 185) { doc.addPage(); y = 20 }
      x = 14
      const row = [
        String(i + 1),
        (t.factories?.name ?? '').slice(0, 18),
        (t.factories?.region ?? '').slice(0, 12),
        t.waste_type === 'liquid' ? 'Liquid' : t.waste_type === 'solid' ? 'Solid' : '-',
        t.volume_m3 ? String(t.volume_m3) : '-',
        `${t.amount} ILS`,
        t.payment_status === 'paid' ? 'Paid' : 'Credit',
        t.trip_date ?? '',
      ]
      row.forEach((cell, ci) => { doc.text(cell, x, y); x += cols[ci][1] })
      y += 6
    })
    // Summary page
    doc.addPage()
    doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.text('Factory Summary', 14, 20)
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    y = 30
    factoryChart.forEach(f => {
      doc.text(`${f.name}  — Total: ${f.liquid + f.solid + f.unknown}  | Liquid: ${f.liquid}  | Solid: ${f.solid}  | Volume: ${f.volume.toFixed(1)} m3`, 14, y)
      y += 7
    })
    doc.save(`report-${from}-to-${to}.pdf`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">التقارير</h1>
        <p className="text-sm text-slate-500 mt-0.5">تقارير شاملة للنقلات والكميات ونوع الربو</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Filter size={16} /> فلترة التقرير</h2>
        </CardHeader>
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
            <Select label="حالة الدفع" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'paid' | 'credit')}>
              <option value="all">كل الحالات</option>
              <option value="paid">مدفوع</option>
              <option value="credit">ذمة</option>
            </Select>
            <Select label="نوع الربو" value={wasteFilter} onChange={e => setWasteFilter(e.target.value as 'all' | 'liquid' | 'solid')}>
              <option value="all">كل الأنواع</option>
              <option value="liquid">💧 سائل</option>
              <option value="solid">🪨 جاف</option>
            </Select>
          </div>
          {loaded && factories.length > 0 && (
            <Select label="فلتر حسب مصنع" value={factoryFilter} onChange={e => setFactoryFilter(e.target.value)}>
              <option value="all">كل المصانع</option>
              {factories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </Select>
          )}
          <Button onClick={generate} loading={loading} size="lg">
            <BarChart2 size={16} /> توليد التقرير
          </Button>
        </CardBody>
      </Card>

      {loaded && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'إجمالي النقلات', value: totalTrips, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
              { label: 'إجمالي المبلغ', value: `${totalAmount.toLocaleString()} ₪`, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
              { label: 'إجمالي الحجم', value: `${totalVolume.toFixed(1)} م³`, color: 'text-cyan-600', bg: 'bg-cyan-50 border-cyan-100' },
              { label: 'مصانع', value: factoryChart.length, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' },
            ].map(({ label, value, color, bg }) => (
              <Card key={label} className={`border ${bg}`}>
                <CardBody className="text-center py-4">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-slate-500 mt-1">{label}</p>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Waste Type Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-blue-100">
              <CardBody className="flex items-center gap-4 py-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Droplets size={22} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{liquidTrips.length}</p>
                  <p className="text-xs text-slate-500">نقلة سائل</p>
                  {liquidVolume > 0 && <p className="text-xs text-blue-500 font-medium mt-0.5">{liquidVolume.toFixed(1)} م³</p>}
                </div>
              </CardBody>
            </Card>
            <Card className="border-amber-100">
              <CardBody className="flex items-center gap-4 py-4">
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Package size={22} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{solidTrips.length}</p>
                  <p className="text-xs text-slate-500">نقلة جاف</p>
                  {solidVolume > 0 && <p className="text-xs text-amber-500 font-medium mt-0.5">{solidVolume.toFixed(1)} م³</p>}
                </div>
              </CardBody>
            </Card>
            <Card className="border-emerald-100 md:border-amber-100">
              <CardBody className="flex items-center gap-4 py-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Building2 size={22} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-600">{paidTrips.length}</p>
                  <p className="text-xs text-slate-500">مدفوع <span className="text-amber-500 mr-2">/ {creditTrips.length} ذمة</span></p>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pie: waste type */}
            {pieData.length > 0 && (
              <Card>
                <CardHeader><h2 className="font-semibold text-slate-800 text-sm">توزيع نوع الربو</h2></CardHeader>
                <CardBody className="flex justify-center">
                  <PieChart width={200} height={180}>
                    <Pie data={pieData} cx={100} cy={80} outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </CardBody>
              </Card>
            )}

            {/* Bar: trips per day */}
            {dailyChart.length > 0 && (
              <Card className="md:col-span-2">
                <CardHeader><h2 className="font-semibold text-slate-800 text-sm">النقلات اليومية حسب النوع</h2></CardHeader>
                <CardBody>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={dailyChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="liquid" name="سائل" stackId="a" fill={WASTE_COLORS.liquid} radius={[0,0,0,0]} />
                      <Bar dataKey="solid" name="جاف" stackId="a" fill={WASTE_COLORS.solid} radius={[0,0,0,0]} />
                      <Bar dataKey="unknown" name="غير محدد" stackId="a" fill={WASTE_COLORS.unknown} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardBody>
              </Card>
            )}
          </div>

          {/* Volume chart */}
          {volumeChart.length > 0 && (
            <Card>
              <CardHeader><h2 className="font-semibold text-slate-800 text-sm">الكميات اليومية (م³)</h2></CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={volumeChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => `${v} م³`} />
                    <Legend />
                    <Bar dataKey="liquid" name="سائل (م³)" fill={WASTE_COLORS.liquid} radius={[4,4,0,0]} />
                    <Bar dataKey="solid" name="جاف (م³)" fill={WASTE_COLORS.solid} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          )}

          {/* Per-factory breakdown */}
          {factoryChart.length > 0 && (
            <Card>
              <CardHeader><h2 className="font-semibold text-slate-800 text-sm">ملخص حسب المصنع</h2></CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-right px-5 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                      <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">إجمالي النقلات</th>
                      <th className="text-center px-4 py-3 text-xs text-blue-500 font-semibold">💧 سائل</th>
                      <th className="text-center px-4 py-3 text-xs text-amber-500 font-semibold">🪨 جاف</th>
                      <th className="text-center px-4 py-3 text-xs text-slate-400 font-semibold">غير محدد</th>
                      <th className="text-center px-4 py-3 text-xs text-cyan-600 font-semibold">الحجم الكلي (م³)</th>
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
                          <td className="px-4 py-3 text-center">
                            {f.liquid > 0 ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{f.liquid}</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {f.solid > 0 ? <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg text-xs font-semibold">{f.solid}</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-400 text-xs">{f.unknown > 0 ? f.unknown : '—'}</td>
                          <td className="px-4 py-3 text-center font-semibold text-cyan-700">{f.volume > 0 ? `${f.volume.toFixed(1)} م³` : '—'}</td>
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
                      <td className="px-4 py-3 text-center text-slate-400">{filtered.filter((t: AnyData) => !t.waste_type).length}</td>
                      <td className="px-4 py-3 text-center text-cyan-700">{totalVolume > 0 ? `${totalVolume.toFixed(1)} م³` : '—'}</td>
                      <td className="px-4 py-3 text-center text-slate-700">{totalAmount.toLocaleString()} ₪</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

          {/* Export */}
          <div className="flex gap-3">
            <Button variant="success" onClick={exportExcel} className="flex-1">
              <FileSpreadsheet size={16} /> تصدير Excel (ورقتان)
            </Button>
            <Button variant="secondary" onClick={exportPDF} className="flex-1">
              <FileText size={16} /> تصدير PDF
            </Button>
          </div>

          {/* Detailed Table */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-800">النقلات التفصيلية ({filtered.length} نقلة)</h2>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">#</th>
                    <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">المصنع</th>
                    <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">المنطقة</th>
                    <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">نوع الربو</th>
                    <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">الحجم (م³)</th>
                    <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">المبلغ</th>
                    <th className="text-center px-4 py-3 text-xs text-slate-500 font-semibold">الحالة</th>
                    <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">التاريخ</th>
                    <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-10 text-slate-400">لا توجد بيانات في هذه الفترة</td></tr>
                  ) : filtered.map((t: AnyData, i: number) => (
                    <tr key={t.id} className={`border-b border-slate-50 hover:bg-blue-50/20 ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                      <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{t.factories?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{t.factories?.region ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {t.waste_type === 'liquid'
                          ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">💧 سائل</span>
                          : t.waste_type === 'solid'
                          ? <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs font-semibold">🪨 جاف</span>
                          : <span className="text-slate-300 text-xs">—</span>
                        }
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
  )
}
