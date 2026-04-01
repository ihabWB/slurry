'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Filter, Download, Pencil, Trash2, Upload, X, Truck, RefreshCw } from 'lucide-react'
import { getTrips, updateTrip, deleteTrip, createTrip, checkCouponExists, getPricingRules, getSettings, getFactories } from '@/lib/api'
import type { PricingRule } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, Input } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Link from 'next/link'
import { format } from 'date-fns'
import { useAuth } from '@/context/AuthContext'
import { showToast } from '@/components/ui/Toast'
import type { Factory } from '@/lib/supabase/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Trip = any

// ─── Modal تسجيل نقلة جديدة ────────────────────────────────
function NewTripModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [factories, setFactories]         = useState<Factory[]>([])
  const [selectedFactory, setSelectedFactory] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'credit'>('credit')
  const [tripDate, setTripDate]           = useState(() => new Date().toISOString().split('T')[0])
  const [volumeM3, setVolumeM3]           = useState('')
  const [wasteType, setWasteType]         = useState<'liquid' | 'solid' | ''>('')
  const [notes, setNotes]                 = useState('')
  const [loading, setLoading]             = useState(false)
  const [search, setSearch]               = useState('')

  const [couponNumber, setCouponNumber]   = useState('')
  const [couponError, setCouponError]     = useState('')
  const [couponChecking, setCouponChecking] = useState(false)
  const [driverName, setDriverName]       = useState('')
  const [vehicleType, setVehicleType]     = useState<'tank' | 'truck' | ''>('')
  const [vehicleAutoSet, setVehicleAutoSet] = useState(false)
  const [distanceKm, setDistanceKm]       = useState('')
  const [dumpSite, setDumpSite]           = useState<'municipal_dump' | 'central_press' | ''>('')
  const [transferZone, setTransferZone]   = useState('')

  const [pricingRules, setPricingRules]   = useState<PricingRule[]>([])
  const [factoryContrib, setFactoryContrib] = useState(50)
  const [tripCost, setTripCost]           = useState<number | null>(null)

  useEffect(() => {
    getFactories().then(setFactories).catch(console.error)
    Promise.all([getPricingRules(), getSettings()]).then(([rules, setts]) => {
      setPricingRules(rules)
      const contrib = setts.find(s => s.key === 'factory_contribution')
      if (contrib) setFactoryContrib(parseFloat(contrib.value) || 50)
    }).catch(console.error)
  }, [])

  const filteredFactories = factories.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.region.toLowerCase().includes(search.toLowerCase())
  )

  const calcCost = (wt: string, vol: string, dist: string, ds: string) => {
    if (!wt || !vol || !dist || !ds) { setTripCost(null); return }
    const maxDist = parseFloat(dist) <= 7 ? 7 : 9999
    const match = pricingRules.find(r =>
      r.waste_type === wt && r.volume_m3 === parseFloat(vol) &&
      r.max_distance_km === maxDist && r.dump_site === ds
    )
    setTripCost(match ? match.unit_price : null)
  }

  const handleWasteTypeChange = (type: 'liquid' | 'solid' | '') => {
    setWasteType(type)
    if (type === 'liquid') { setVehicleType('tank'); setVehicleAutoSet(true) }
    else if (type === 'solid') { setVehicleType('truck'); setVehicleAutoSet(true) }
    else { setVehicleAutoSet(false) }
    calcCost(type, volumeM3, distanceKm, dumpSite)
  }

  const handleCouponBlur = async () => {
    const val = couponNumber.trim()
    if (!val) { setCouponError(''); return }
    setCouponChecking(true); setCouponError('')
    try {
      const exists = await checkCouponExists(val)
      if (exists) setCouponError('رقم الكوبون مستخدم مسبقاً')
    } finally { setCouponChecking(false) }
  }

  const handleSubmit = async () => {
    if (!selectedFactory) { showToast('warning', 'يرجى اختيار مصنع'); return }
    if (!couponNumber.trim()) { showToast('warning', 'يرجى إدخال رقم الكوبون'); return }
    if (couponError) { showToast('error', 'رقم الكوبون مستخدم مسبقاً'); return }
    if (!distanceKm) { showToast('warning', 'يرجى تحديد المسافة'); return }
    setLoading(true)
    try {
      await createTrip({
        factory_id: selectedFactory,
        payment_status: paymentStatus,
        trip_date: tripDate,
        notes: notes || undefined,
        volume_m3: volumeM3 ? Number(volumeM3) : null,
        waste_type: wasteType || null,
        coupon_number: couponNumber || null,
        driver_name: driverName || null,
        vehicle_type: (vehicleType || null) as 'tank' | 'truck' | null,
        distance_km: distanceKm ? Number(distanceKm) : null,
        dump_site: dumpSite || null,
        transfer_zone: transferZone || null,
        trip_cost: tripCost ?? null,
        factory_contribution: tripCost !== null ? factoryContrib : null,
        subsidy_amount: tripCost !== null ? tripCost - factoryContrib : null,
      })
      showToast('success', 'تم تسجيل النقلة بنجاح ✓')
      onSuccess()
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'حدث خطأ')
    } finally { setLoading(false) }
  }

  const selectedFact = factories.find(f => f.id === selectedFactory)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[96dvh] rounded-t-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Truck size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">تسجيل نقلة جديدة</h2>
              <p className="text-xs text-slate-500">{factoryContrib} ₪ مساهمة المصنع</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* اختيار المصنع */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">المصنع *</label>
            <input
              placeholder="🔍 بحث باسم المصنع أو المنطقة..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-50">
              {filteredFactories.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setSelectedFactory(f.id); setSearch(f.name) }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-right text-sm transition-colors ${
                    selectedFactory === f.id ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div>
                    <p className="font-medium">{f.name}</p>
                    <p className="text-xs text-slate-400">{f.region}</p>
                  </div>
                  {f.balance > 0 && (
                    <span className="text-xs text-red-500">ذمة {f.balance} ₪</span>
                  )}
                </button>
              ))}
              {filteredFactories.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-4">لا توجد نتائج</p>
              )}
            </div>
            {selectedFact && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700">
                ✓ <span className="font-semibold">{selectedFact.name}</span> — {selectedFact.region}
              </div>
            )}
          </div>

          {/* التاريخ والكوبون والسائق */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">تاريخ النقلة *</label>
              <input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">رقم الكوبون *</label>
              <input placeholder="رقم الوصل" value={couponNumber}
                onChange={e => { setCouponNumber(e.target.value); setCouponError('') }}
                onBlur={handleCouponBlur}
                className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 ${couponError ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-blue-500'}`} />
              {couponChecking && <p className="text-[10px] text-slate-400">جارٍ التحقق...</p>}
              {couponError && <p className="text-[10px] text-red-500">⚠ {couponError}</p>}
              {!couponError && !couponChecking && couponNumber.trim() && <p className="text-[10px] text-emerald-500">✔ متاح</p>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">اسم السائق</label>
            <input placeholder="اسم السائق" value={driverName} onChange={e => setDriverName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* المسافة + الوجهة */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">المسافة *</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([['7', '≤ 7 كم'], ['9999', '> 7 كم']] as const).map(([val, lbl]) => (
                  <button key={val} type="button"
                    onClick={() => {
                      setDistanceKm(val)
                      const nd = val === '9999' ? 'municipal_dump' : dumpSite
                      setDumpSite(nd); calcCost(wasteType, volumeM3, val, nd)
                    }}
                    className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${distanceKm === val ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">وجهة النقل *</label>
              <div className="space-y-1.5">
                <button type="button"
                  onClick={() => { setDumpSite('municipal_dump'); calcCost(wasteType, volumeM3, distanceKm, 'municipal_dump') }}
                  className={`w-full py-2 px-2 rounded-xl border-2 text-[11px] font-medium text-right transition-all ${dumpSite === 'municipal_dump' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                  {distanceKm === '9999' ? 'مكب سعير' : distanceKm === '7' ? 'مكب خلة الشرباتي' : 'مكب البلدية'}
                </button>
                <button type="button" disabled={distanceKm === '9999'}
                  onClick={() => { setDumpSite('central_press'); calcCost(wasteType, volumeM3, distanceKm, 'central_press') }}
                  className={`w-full py-2 px-2 rounded-xl border-2 text-[11px] font-medium text-right transition-all ${distanceKm === '9999' ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed' : dumpSite === 'central_press' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                  عصارة الربو المركزية
                </button>
              </div>
            </div>
          </div>

          {/* الحجم + نوع الربو + المركبة */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">الحجم (م³) *</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['10', '15'] as const).map(v => (
                  <button key={v} type="button"
                    onClick={() => { setVolumeM3(v); calcCost(wasteType, v, distanceKm, dumpSite) }}
                    className={`py-2 rounded-xl border-2 text-sm font-bold transition-all ${volumeM3 === v ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-600'}`}>
                    {v} م³
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">نوع الربو *</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => handleWasteTypeChange('liquid')}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${wasteType === 'liquid' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                  💧 سائل
                </button>
                <button type="button" onClick={() => handleWasteTypeChange('solid')}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${wasteType === 'solid' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>
                  🪨 جاف
                </button>
              </div>
            </div>
          </div>

          {/* نوع المركبة */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">نوع المركبة</label>
              {vehicleAutoSet && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">تلقائي</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([['', 'غير محدد'], ['tank', '🛢️ تنك'], ['truck', '🚚 شاحنة']] as const).map(([val, lbl]) => (
                <button key={val} type="button"
                  onClick={() => { setVehicleType(val as 'tank' | 'truck' | ''); setVehicleAutoSet(false) }}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${vehicleType === val ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-slate-200 text-slate-500'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* منطقة النقل + ملاحظات */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">منطقة النقل</label>
              <input placeholder="المنطقة الجغرافية" value={transferZone} onChange={e => setTransferZone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">ملاحظات</label>
              <input placeholder="اختياري" value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* حالة الدفع */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">حالة الدفع *</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPaymentStatus('paid')}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${paymentStatus === 'paid' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>
                💵 مدفوع نقداً
              </button>
              <button type="button" onClick={() => setPaymentStatus('credit')}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${paymentStatus === 'credit' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>
                📋 على الحساب
              </button>
            </div>
          </div>

          {/* ملخص التكلفة */}
          {selectedFactory && tripCost !== null && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-base font-bold text-violet-700">{tripCost} ₪</p>
                  <p className="text-[10px] text-slate-500">سعر الوحدة</p>
                </div>
                <div>
                  <p className="text-base font-bold text-emerald-600">{factoryContrib} ₪</p>
                  <p className="text-[10px] text-slate-500">مساهمة المصنع</p>
                </div>
                <div>
                  <p className="text-base font-bold text-blue-600">{tripCost - factoryContrib} ₪</p>
                  <p className="text-[10px] text-slate-500">دعم التمويل</p>
                </div>
              </div>
            </div>
          )}
          {selectedFactory && !tripCost && (wasteType || volumeM3 || distanceKm || dumpSite) && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              أدخل نوع الربو والحجم والمسافة والوجهة لحساب التكلفة تلقائياً
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={handleSubmit}
            disabled={loading || !!couponError}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <Truck size={15} />}
            تسجيل النقلة
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── الصفحة الرئيسية ─────────────────────────────────────────
export default function TripsPage() {
  const { canEdit } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'paid' | 'credit'>('all')
  const [showNew, setShowNew] = useState(false)

  // Edit modal
  const [editTrip, setEditTrip] = useState<Trip | null>(null)
  const [editForm, setEditForm] = useState({ trip_date: '', notes: '', payment_status: 'credit', waste_type: '', volume_m3: '' })
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTrips(filter !== 'all' ? { payment_status: filter } : undefined)
      setTrips(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const openEdit = (t: Trip) => {
    setEditTrip(t)
    setEditForm({
      trip_date: t.trip_date ?? '',
      notes: t.notes ?? '',
      payment_status: t.payment_status ?? 'credit',
      waste_type: t.waste_type ?? '',
      volume_m3: t.volume_m3 != null ? String(t.volume_m3) : '',
    })
  }

  const handleSave = async () => {
    if (!editTrip) return
    setSaving(true)
    try {
      await updateTrip(editTrip.id, {
        trip_date: editForm.trip_date || undefined,
        notes: editForm.notes || null,
        payment_status: editForm.payment_status as 'paid' | 'credit',
        waste_type: (editForm.waste_type as 'liquid' | 'solid') || null,
        volume_m3: editForm.volume_m3 ? Number(editForm.volume_m3) : null,
      })
      showToast('success', 'تم تحديث النقلة')
      setEditTrip(null)
      load()
    } catch { showToast('error', 'فشل التحديث') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTrip(deleteTarget.id)
      showToast('success', 'تم حذف النقلة')
      setDeleteTarget(null)
      load()
    } catch { showToast('error', 'فشل الحذف') }
    finally { setDeleting(false) }
  }

  const totalAmount = trips.reduce((s: number, t: Trip) => s + Number(t.amount), 0)
  const paidCount = trips.filter((t: Trip) => t.payment_status === 'paid').length
  const creditCount = trips.filter((t: Trip) => t.payment_status === 'credit').length

  return (
    <div className="space-y-6">
      {showNew && (
        <NewTripModal
          onClose={() => setShowNew(false)}
          onSuccess={() => { setShowNew(false); load() }}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">النقلات</h1>
          <p className="text-sm text-slate-500 mt-0.5">{trips.length} نقلة إجمالية</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link href="/trips/import">
              <Button variant="secondary" size="lg"><Upload size={16} /> استيراد Excel</Button>
            </Link>
            <Button size="lg" onClick={() => setShowNew(true)}>
              <Plus size={16} /> تسجيل نقلة
            </Button>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-blue-100">
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-blue-600">{trips.length}</p>
            <p className="text-xs text-slate-500 mt-1">إجمالي النقلات</p>
          </CardBody>
        </Card>
        <Card className="border-emerald-100">
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{paidCount}</p>
            <p className="text-xs text-slate-500 mt-1">مدفوع</p>
          </CardBody>
        </Card>
        <Card className="border-amber-100">
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-amber-600">{creditCount}</p>
            <p className="text-xs text-slate-500 mt-1">ذمة</p>
          </CardBody>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-3">
            <Filter size={16} className="text-slate-400" />
            <Select
              value={filter}
              onChange={e => setFilter(e.target.value as 'all' | 'paid' | 'credit')}
              className="w-48"
            >
              <option value="all">كل النقلات</option>
              <option value="paid">مدفوع فقط</option>
              <option value="credit">ذمة فقط</option>
            </Select>
            <span className="text-sm text-slate-500">
              إجمالي المبالغ: <span className="font-bold text-slate-800">{totalAmount.toLocaleString()} ₪</span>
            </span>
          </div>
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">قائمة النقلات</h2>
            <Button variant="ghost" size="sm">
              <Download size={14} /> تصدير
            </Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">#</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المصنع</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المنطقة</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">نوع الربو</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">الحجم (م³)</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المبلغ</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">الحالة</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">طريقة الدفع</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">تاريخ النقلة</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">وقت الإدخال</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">ملاحظات</th>
                {canEdit && <th className="px-6 py-3 text-xs text-slate-500 font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-8 text-slate-400">جارٍ التحميل...</td></tr>
              ) : trips.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-slate-400">لا توجد نقلات</td></tr>
              ) : (
                trips.map((t: Trip, i: number) => (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-400 text-xs">{i + 1}</td>
                    <td className="px-6 py-3 font-medium text-slate-800">{t.factories?.name ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{t.factories?.region ?? '—'}</td>
                    <td className="px-6 py-3">
                      {t.waste_type === 'liquid' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">💧 سائل</span>
                      ) : t.waste_type === 'solid' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">🪨 جاف</span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-700 text-xs">{t.volume_m3 != null ? `${t.volume_m3} م³` : '—'}</td>
                    <td className="px-6 py-3 font-semibold">{t.amount} ₪</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {t.payment_status === 'paid' ? 'مدفوع' : 'ذمة'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {t.payment_method === 'cash'
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">💵 نقداً</span>
                        : t.payment_method === 'later'
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">🏦 لاحقاً</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-6 py-3 text-slate-700 text-xs font-medium">{t.trip_date ? format(new Date(t.trip_date), 'dd/MM/yyyy') : '—'}</td>
                    <td className="px-6 py-3 text-slate-400 text-xs">{format(new Date(t.created_at), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="px-6 py-3 text-slate-400 text-xs max-w-[150px] truncate">{t.notes ?? '—'}</td>
                    {canEdit && (
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"><Pencil size={14} /></button>
                          <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Modal */}
      {editTrip && (
        <Modal open={!!editTrip} onClose={() => setEditTrip(null)} title={`تعديل نقلة — ${editTrip.factories?.name ?? ''}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">تاريخ النقلة</label>
              <Input type="date" value={editForm.trip_date} onChange={e => setEditForm(f => ({ ...f, trip_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">حالة الدفع</label>
              <Select value={editForm.payment_status} onChange={e => setEditForm(f => ({ ...f, payment_status: e.target.value }))}>
                <option value="credit">ذمة</option>
                <option value="paid">مدفوع</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">نوع الربو</label>
              <Select value={editForm.waste_type} onChange={e => setEditForm(f => ({ ...f, waste_type: e.target.value }))}>
                <option value="">غير محدد</option>
                <option value="liquid">💧 سائل</option>
                <option value="solid">🪨 جاف</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الحجم (م³)</label>
              <Input type="number" placeholder="0.00" value={editForm.volume_m3} onChange={e => setEditForm(f => ({ ...f, volume_m3: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
              <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات..." />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} loading={saving}>حفظ التغييرات</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setEditTrip(null)}>إلغاء</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="تأكيد الحذف">
          <div className="space-y-4">
            <p className="text-slate-600">هل أنت متأكد من حذف نقلة <span className="font-bold text-slate-800">{deleteTarget.factories?.name}</span>؟</p>
            <p className="text-xs text-red-500">⚠️ لا يمكن التراجع عن هذا الإجراء</p>
            <div className="flex gap-2 pt-2">
              <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleting}>نعم، احذف</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

  const { canEdit } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'paid' | 'credit'>('all')

  // Edit modal
  const [editTrip, setEditTrip] = useState<Trip | null>(null)
  const [editForm, setEditForm] = useState({ trip_date: '', notes: '', payment_status: 'credit', waste_type: '', volume_m3: '' })
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTrips(filter !== 'all' ? { payment_status: filter } : undefined)
      setTrips(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const openEdit = (t: Trip) => {
    setEditTrip(t)
    setEditForm({
      trip_date: t.trip_date ?? '',
      notes: t.notes ?? '',
      payment_status: t.payment_status ?? 'credit',
      waste_type: t.waste_type ?? '',
      volume_m3: t.volume_m3 != null ? String(t.volume_m3) : '',
    })
  }

  const handleSave = async () => {
    if (!editTrip) return
    setSaving(true)
    try {
      await updateTrip(editTrip.id, {
        trip_date: editForm.trip_date || undefined,
        notes: editForm.notes || null,
        payment_status: editForm.payment_status as 'paid' | 'credit',
        waste_type: (editForm.waste_type as 'liquid' | 'solid') || null,
        volume_m3: editForm.volume_m3 ? Number(editForm.volume_m3) : null,
      })
      showToast('success', 'تم تحديث النقلة')
      setEditTrip(null)
      load()
    } catch { showToast('error', 'فشل التحديث') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTrip(deleteTarget.id)
      showToast('success', 'تم حذف النقلة')
      setDeleteTarget(null)
      load()
    } catch { showToast('error', 'فشل الحذف') }
    finally { setDeleting(false) }
  }

  const totalAmount = trips.reduce((s: number, t: Trip) => s + Number(t.amount), 0)
  const paidCount = trips.filter((t: Trip) => t.payment_status === 'paid').length
  const creditCount = trips.filter((t: Trip) => t.payment_status === 'credit').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">النقلات</h1>
          <p className="text-sm text-slate-500 mt-0.5">{trips.length} نقلة إجمالية</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link href="/trips/import">
              <Button variant="secondary" size="lg"><Upload size={16} /> استيراد Excel</Button>
            </Link>
            <Link href="/trips/new">
              <Button size="lg"><Plus size={16} /> تسجيل نقلة</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-blue-100">
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-blue-600">{trips.length}</p>
            <p className="text-xs text-slate-500 mt-1">إجمالي النقلات</p>
          </CardBody>
        </Card>
        <Card className="border-emerald-100">
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{paidCount}</p>
            <p className="text-xs text-slate-500 mt-1">مدفوع</p>
          </CardBody>
        </Card>
        <Card className="border-amber-100">
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-amber-600">{creditCount}</p>
            <p className="text-xs text-slate-500 mt-1">ذمة</p>
          </CardBody>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-3">
            <Filter size={16} className="text-slate-400" />
            <Select
              value={filter}
              onChange={e => setFilter(e.target.value as 'all' | 'paid' | 'credit')}
              className="w-48"
            >
              <option value="all">كل النقلات</option>
              <option value="paid">مدفوع فقط</option>
              <option value="credit">ذمة فقط</option>
            </Select>
            <span className="text-sm text-slate-500">
              إجمالي المبالغ: <span className="font-bold text-slate-800">{totalAmount.toLocaleString()} ₪</span>
            </span>
          </div>
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">قائمة النقلات</h2>
            <Button variant="ghost" size="sm">
              <Download size={14} /> تصدير
            </Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">#</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المصنع</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المنطقة</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">نوع الربو</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">الحجم (م³)</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المبلغ</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">الحالة</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">طريقة الدفع</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">تاريخ النقلة</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">وقت الإدخال</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">ملاحظات</th>
                    {canEdit && <th className="px-6 py-3 text-xs text-slate-500 font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-8 text-slate-400">جارٍ التحميل...</td></tr>
              ) : trips.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-slate-400">لا توجد نقلات</td></tr>
              ) : (
                trips.map((t: Trip, i: number) => (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-400 text-xs">{i + 1}</td>
                    <td className="px-6 py-3 font-medium text-slate-800">{t.factories?.name ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{t.factories?.region ?? '—'}</td>
                    <td className="px-6 py-3">
                      {t.waste_type === 'liquid' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">💧 سائل</span>
                      ) : t.waste_type === 'solid' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">🪨 جاف</span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-700 text-xs">{t.volume_m3 != null ? `${t.volume_m3} م³` : '—'}</td>
                    <td className="px-6 py-3 font-semibold">{t.amount} ₪</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {t.payment_status === 'paid' ? 'مدفوع' : 'ذمة'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {t.payment_method === 'cash'
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">💵 نقداً</span>
                        : t.payment_method === 'later'
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">🏦 لاحقاً</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-6 py-3 text-slate-700 text-xs font-medium">{t.trip_date ? format(new Date(t.trip_date), 'dd/MM/yyyy') : '—'}</td>
                    <td className="px-6 py-3 text-slate-400 text-xs">{format(new Date(t.created_at), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="px-6 py-3 text-slate-400 text-xs max-w-[150px] truncate">{t.notes ?? '—'}</td>
                    {canEdit && (
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"><Pencil size={14} /></button>
                          <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Modal */}
      {editTrip && (
        <Modal open={!!editTrip} onClose={() => setEditTrip(null)} title={`تعديل نقلة — ${editTrip.factories?.name ?? ''}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">تاريخ النقلة</label>
              <Input type="date" value={editForm.trip_date} onChange={e => setEditForm(f => ({ ...f, trip_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">حالة الدفع</label>
              <Select value={editForm.payment_status} onChange={e => setEditForm(f => ({ ...f, payment_status: e.target.value }))}>
                <option value="credit">ذمة</option>
                <option value="paid">مدفوع</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">نوع الربو</label>
              <Select value={editForm.waste_type} onChange={e => setEditForm(f => ({ ...f, waste_type: e.target.value }))}>
                <option value="">غير محدد</option>
                <option value="liquid">💧 سائل</option>
                <option value="solid">🪨 جاف</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الحجم (م³)</label>
              <Input type="number" placeholder="0.00" value={editForm.volume_m3} onChange={e => setEditForm(f => ({ ...f, volume_m3: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
              <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات..." />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} loading={saving}>حفظ التغييرات</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setEditTrip(null)}>إلغاء</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="تأكيد الحذف">
          <div className="space-y-4">
            <p className="text-slate-600">هل أنت متأكد من حذف نقلة <span className="font-bold text-slate-800">{deleteTarget.factories?.name}</span>؟</p>
            <p className="text-xs text-red-500">⚠️ لا يمكن التراجع عن هذا الإجراء</p>
            <div className="flex gap-2 pt-2">
              <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleting}>نعم، احذف</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
