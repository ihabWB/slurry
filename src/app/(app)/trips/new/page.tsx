'use client'
import { useEffect, useState } from 'react'
import { ArrowRight, CheckSquare, Truck } from 'lucide-react'
import Link from 'next/link'
import { getFactories, createTrip, createBulkTrips, checkCouponExists, getPricingRules, getSettings } from '@/lib/api'
import type { PricingRule } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { showToast } from '@/components/ui/Toast'
import type { Factory } from '@/lib/supabase/database.types'
import { useRouter } from 'next/navigation'

export default function NewTripPage() {
  const router = useRouter()
  const [factories, setFactories] = useState<Factory[]>([])
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [selectedFactory, setSelectedFactory] = useState('')
  const [selectedFactories, setSelectedFactories] = useState<string[]>([])
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'credit'>('credit')
  const [tripDate, setTripDate] = useState(() => new Date().toISOString().split('T')[0])
  const [volumeM3, setVolumeM3] = useState('')
  const [wasteType, setWasteType] = useState<'liquid' | 'solid' | ''>('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  // New extra fields
  const [couponNumber, setCouponNumber] = useState('')
  const [couponError, setCouponError] = useState('')
  const [couponChecking, setCouponChecking] = useState(false)
  const [driverName, setDriverName] = useState('')
  const [vehicleType, setVehicleType] = useState<'tank' | 'truck' | ''>('')
  const [vehicleAutoSet, setVehicleAutoSet] = useState(false)
  const [distanceKm, setDistanceKm] = useState('')
  const [dumpSite, setDumpSite] = useState<'municipal_dump' | 'central_press' | ''>('')
  const [transferZone, setTransferZone] = useState('')

  // Pricing
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([])
  const [factoryContrib, setFactoryContrib] = useState(50)
  const [tripCost, setTripCost] = useState<number | null>(null)

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

  const toggleBulkFactory = (id: string) => {
    setSelectedFactories(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const selectAll = () => setSelectedFactories(filteredFactories.map(f => f.id))
  const clearAll = () => setSelectedFactories([])

  const handleWasteTypeChange = (type: 'liquid' | 'solid' | '') => {
    setWasteType(type)
    if (type === 'liquid') { setVehicleType('tank'); setVehicleAutoSet(true) }
    else if (type === 'solid') { setVehicleType('truck'); setVehicleAutoSet(true) }
    else { setVehicleAutoSet(false) }
    calcCost(type, volumeM3, distanceKm, dumpSite)
  }
  const calcCost = (wt: string, vol: string, dist: string, ds: string) => {
    if (!wt || !vol || !dist || !ds) { setTripCost(null); return }
    const maxDist = parseFloat(dist) <= 7 ? 7 : 9999
    const match = pricingRules.find(r =>
      r.waste_type === wt &&
      r.volume_m3 === parseFloat(vol) &&
      r.max_distance_km === maxDist &&
      r.dump_site === ds
    )
    setTripCost(match ? match.unit_price : null)
  }

  const handleVehicleTypeChange = (type: 'tank' | 'truck' | '') => {
    setVehicleType(type)
    setVehicleAutoSet(false)
  }

  const handleCouponBlur = async () => {
    const val = couponNumber.trim()
    if (!val) { setCouponError(''); return }
    setCouponChecking(true)
    setCouponError('')
    try {
      const exists = await checkCouponExists(val)
      if (exists) setCouponError('رقم الكوبون مستخدم مسبقاً')
    } finally {
      setCouponChecking(false)
    }
  }

  const handleSubmit = async () => {
    if (mode === 'single' && !selectedFactory) {
      showToast('warning', 'يرجى اختيار مصنع')
      return
    }
    if (mode === 'bulk' && selectedFactories.length === 0) {
      showToast('warning', 'يرجى اختيار مصنع واحد على الأقل')
      return
    }
    if (!couponNumber.trim()) {
      showToast('warning', 'يرجى إدخال رقم الكوبون')
      return
    }
    if (couponError) {
      showToast('error', 'رقم الكوبون مستخدم مسبقاً — يرجى تغييره')
      return
    }
    if (!distanceKm) {
      showToast('warning', 'يرجى إدخال المسافة')
      return
    }

    const extraFields = {
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
    }

    setLoading(true)
    try {
      if (mode === 'single') {
        await createTrip({
          factory_id: selectedFactory,
          payment_status: paymentStatus,
          trip_date: tripDate,
          ...extraFields,
        })
        showToast('success', 'تم تسجيل النقلة بنجاح')
      } else {
        await createBulkTrips(selectedFactories, paymentStatus, tripDate, extraFields)
        showToast('success', `تم تسجيل ${selectedFactories.length} نقلة بنجاح`)
      }
      router.push('/trips')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ'
      showToast('error', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/trips">
          <Button variant="ghost" size="sm"><ArrowRight size={16} /> رجوع</Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800">تسجيل نقلة جديدة</h1>
          <p className="text-sm text-slate-500">50 ₪ لكل نقلة</p>
        </div>
      </div>

      {/* Mode Switch */}
      <div className="flex gap-3">
        <button
          onClick={() => setMode('single')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
            mode === 'single' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Truck size={16} /> تسجيل فردي
        </button>
        <button
          onClick={() => setMode('bulk')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
            mode === 'bulk' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <CheckSquare size={16} /> تسجيل جماعي
        </button>
      </div>

      {/* Factory Selection */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800">
            {mode === 'single' ? 'اختيار المصنع' : `اختيار المصانع (${selectedFactories.length} محدد)`}
          </h2>
        </CardHeader>
        <CardBody className="space-y-3">
          {mode === 'single' ? (
            <Select
              value={selectedFactory}
              onChange={e => setSelectedFactory(e.target.value)}
              label="المصنع"
            >
              <option value="">اختر مصنعاً...</option>
              {factories.map(f => (
                <option key={f.id} value={f.id}>{f.name} — {f.region}</option>
              ))}
            </Select>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  placeholder="بحث عن مصنع..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button variant="secondary" size="sm" onClick={selectAll}>تحديد الكل</Button>
                <Button variant="ghost" size="sm" onClick={clearAll}>إلغاء</Button>
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {filteredFactories.map(f => {
                  const checked = selectedFactories.includes(f.id)
                  return (
                    <label
                      key={f.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBulkFactory(f.id)}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                        <p className="text-xs text-slate-500">{f.region} · {f.owner_name}</p>
                      </div>
                      {f.balance > 0 && (
                        <span className="text-xs text-red-500 flex-shrink-0">ذمة {f.balance} ₪</span>
                      )}
                    </label>
                  )
                })}
                {filteredFactories.length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-sm">لا توجد نتائج</div>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold text-slate-800">تفاصيل النقلة</h2></CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="تاريخ النقلة *"
            type="date"
            value={tripDate}
            onChange={e => setTripDate(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                label="رقم الكوبون *"
                placeholder="رقم وصل الدفع"
                value={couponNumber}
                onChange={e => { setCouponNumber(e.target.value); setCouponError('') }}
                onBlur={handleCouponBlur}
              />
              {couponChecking && (
                <p className="text-xs text-slate-400 mt-1">جاري التحقق...</p>
              )}
              {couponError && (
                <p className="text-xs text-red-500 mt-1">⚠️ {couponError}</p>
              )}
              {!couponError && !couponChecking && couponNumber.trim() && (
                <p className="text-xs text-emerald-500 mt-1">✔ رقم متاح</p>
              )}
            </div>
            <Input
              label="اسم السائق"
              placeholder="اسم السائق"
              value={driverName}
              onChange={e => setDriverName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="المسافة (كم) *"
              type="number"
              min="0"
              step="0.1"
              placeholder="مثال: 12.5"
              value={distanceKm}
              onChange={e => { setDistanceKm(e.target.value); calcCost(wasteType, volumeM3, e.target.value, dumpSite) }}
            />
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">وجهة النقل *</p>
              <div className="space-y-2">
                {([['municipal_dump', 'مكب البلدية المعتمد'], ['central_press', 'عصارة الربو المركزية']] as const).map(([val, lbl]) => (
                  <button key={val}
                    onClick={() => { setDumpSite(val); calcCost(wasteType, volumeM3, distanceKm, val) }}
                    className={`w-full py-2 px-3 rounded-xl border-2 text-xs font-medium text-right transition-all ${
                      dumpSite === val ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                    }`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">حجم وسيلة النقل *</p>
              <div className="grid grid-cols-2 gap-2">
                {(['10', '15'] as const).map(v => (
                  <button key={v}
                    onClick={() => { setVolumeM3(v); calcCost(wasteType, v, distanceKm, dumpSite) }}
                    className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      volumeM3 === v ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-600'
                    }`}>
                    {v} م³
                  </button>
                ))}
              </div>
            </div>
            <Input
              label="منطقة النقل"
              placeholder="المنطقة الجغرافية للنقل"
              value={transferZone}
              onChange={e => setTransferZone(e.target.value)}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">نوع الربو</p>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => handleWasteTypeChange('')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  wasteType === '' ? 'border-slate-500 bg-slate-50 text-slate-700' : 'border-slate-200 text-slate-500'
                }`}
              >
                غير محدد
              </button>
              <button
                onClick={() => handleWasteTypeChange('liquid')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  wasteType === 'liquid' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                💧 سائل
              </button>
              <button
                onClick={() => handleWasteTypeChange('solid')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  wasteType === 'solid' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                🪨 جاف
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-medium text-slate-700">نوع المركبة</p>
              {vehicleAutoSet && (
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">تلقائي</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => handleVehicleTypeChange('')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  vehicleType === '' ? 'border-slate-500 bg-slate-50 text-slate-700' : 'border-slate-200 text-slate-500'
                }`}
              >
                غير محدد
              </button>
              <button
                onClick={() => handleVehicleTypeChange('tank')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  vehicleType === 'tank' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                🛢️ تنك
              </button>
              <button
                onClick={() => handleVehicleTypeChange('truck')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  vehicleType === 'truck' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                🚚 شاحنة
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">حالة الدفع *</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentStatus('paid')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  paymentStatus === 'paid' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                💵 مدفوع نقداً
              </button>
              <button
                onClick={() => setPaymentStatus('credit')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  paymentStatus === 'credit' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                📋 على الحساب (ذمة)
              </button>
            </div>
          </div>

          <Textarea
            label="ملاحظات (اختياري)"
            placeholder="أي ملاحظات إضافية..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </CardBody>
      </Card>

      {/* Summary */}
      {(mode === 'single' && selectedFactory) || (mode === 'bulk' && selectedFactories.length > 0) ? (
        <Card className={`border-2 ${tripCost !== null ? 'border-violet-200 bg-violet-50' : 'border-blue-200 bg-blue-50'}`}>
          <CardBody className="space-y-2">
            <p className="text-sm font-medium text-slate-700">
              {mode === 'single' ? '1 نقلة' : `${selectedFactories.length} نقلة`}
            </p>
            {tripCost !== null ? (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-violet-700">{tripCost} ₪</p>
                  <p className="text-xs text-slate-500">سعر الوحدة</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-600">{factoryContrib} ₪</p>
                  <p className="text-xs text-slate-500">مساهمة المصنع</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-600">{tripCost - factoryContrib} ₪</p>
                  <p className="text-xs text-slate-500">دعم التمويل</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-blue-600">أدخل نوع الربو والحجم والمسافة والوجهة لحساب التكلفة</p>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Button onClick={handleSubmit} loading={loading} size="lg" className="w-full">
        <Truck size={16} />
        {mode === 'single' ? 'تسجيل النقلة' : `تسجيل ${selectedFactories.length || ''} نقلة`}
      </Button>
    </div>
  )
}
