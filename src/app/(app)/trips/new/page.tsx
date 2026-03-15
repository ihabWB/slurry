'use client'
import { useEffect, useState } from 'react'
import { ArrowRight, CheckSquare, Truck } from 'lucide-react'
import Link from 'next/link'
import { getFactories, createTrip, createBulkTrips } from '@/lib/api'
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

  useEffect(() => {
    getFactories().then(setFactories).catch(console.error)
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

  const handleSubmit = async () => {
    if (mode === 'single' && !selectedFactory) {
      showToast('warning', 'يرجى اختيار مصنع')
      return
    }
    if (mode === 'bulk' && selectedFactories.length === 0) {
      showToast('warning', 'يرجى اختيار مصنع واحد على الأقل')
      return
    }

    setLoading(true)
    try {
      if (mode === 'single') {
        await createTrip({ factory_id: selectedFactory, payment_status: paymentStatus, trip_date: tripDate, notes: notes || null, volume_m3: volumeM3 ? Number(volumeM3) : null, waste_type: wasteType || null })
        showToast('success', 'تم تسجيل النقلة بنجاح')
      } else {
        await createBulkTrips(selectedFactories, paymentStatus, tripDate, notes || undefined, volumeM3 ? Number(volumeM3) : null, wasteType || null)
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
          <Input
            label="حجم النقلة (م³) — اختياري"
            type="number"
            min="0"
            step="0.5"
            placeholder="مثال: 5"
            value={volumeM3}
            onChange={e => setVolumeM3(e.target.value)}
          />
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">نوع الربو</p>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setWasteType('')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  wasteType === '' ? 'border-slate-500 bg-slate-50 text-slate-700' : 'border-slate-200 text-slate-500'
                }`}
              >
                غير محدد
              </button>
              <button
                onClick={() => setWasteType('liquid')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  wasteType === 'liquid' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                💧 سائل
              </button>
              <button
                onClick={() => setWasteType('solid')}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  wasteType === 'solid' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                🪨 جاف
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
        <Card className="border-blue-200 bg-blue-50">
          <CardBody>
            <p className="text-sm font-medium text-blue-800">
              {mode === 'single' ? '1 نقلة' : `${selectedFactories.length} نقلة`} × 50 ₪ ={' '}
              <span className="text-lg font-bold">
                {mode === 'single' ? 50 : selectedFactories.length * 50} ₪
              </span>
            </p>
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
