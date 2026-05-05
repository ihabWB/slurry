'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Filter, Download, Pencil, Trash2, Upload, X, Truck, RefreshCw, CheckCircle, Clock, AlertCircle, FileText, ChevronDown, Search, SendHorizonal, ThumbsUp, ThumbsDown, Eye, RotateCcw } from 'lucide-react'
import { getTrips, updateTrip, deleteTrip, createTrip, checkCouponExists, getPricingRules, getSettings, getFactories, submitAllDraftTrips, submitTrip, approveTrip, rejectTrip, approveAllPendingTrips, editAndApproveTrip, getTripApprovalStats, revokeApproval, getRecentApprovedTrips } from '@/lib/api'
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

type ApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected'

const APPROVAL_LABELS: Record<ApprovalStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft:            { label: 'مسودة',              color: 'bg-slate-100 text-slate-600',    icon: <FileText size={11} /> },
  pending_approval: { label: 'بانتظار الاعتماد',  color: 'bg-amber-100 text-amber-700',    icon: <Clock size={11} /> },
  approved:         { label: 'معتمدة',             color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={11} /> },
  rejected:         { label: 'مرفوضة',             color: 'bg-red-100 text-red-700',        icon: <AlertCircle size={11} /> },
}

// ─── Modal تسجيل نقلة جديدة ────────────────────────────────
function NewTripModal({ onClose, onSuccess, isAdmin }: { onClose: () => void; onSuccess: () => void; isAdmin: boolean }) {
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
        approval_status: isAdmin ? 'approved' : 'draft',
      })
      showToast('success', isAdmin ? 'تم تسجيل النقلة واعتمادها ✓' : 'تم تسجيل النقلة — بانتظار الاعتماد')
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
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">المصنع *</label>
            <input placeholder="🔍 بحث باسم المصنع أو المنطقة..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-50">
              {filteredFactories.map(f => (
                <button key={f.id} type="button" onClick={() => { setSelectedFactory(f.id); setSearch(f.name) }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-right text-sm transition-colors ${selectedFactory === f.id ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50 text-slate-700'}`}>
                  <div><p className="font-medium">{f.name}</p><p className="text-xs text-slate-400">{f.region}</p></div>
                  {f.balance > 0 && <span className="text-xs text-red-500">ذمة {f.balance} ₪</span>}
                </button>
              ))}
              {filteredFactories.length === 0 && <p className="text-center text-xs text-slate-400 py-4">لا توجد نتائج</p>}
            </div>
            {selectedFact && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700">
                ✓ <span className="font-semibold">{selectedFact.name}</span> — {selectedFact.region}
              </div>
            )}
          </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">المسافة *</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([['7', '≤ 7 كم'], ['9999', '> 7 كم']] as const).map(([val, lbl]) => (
                  <button key={val} type="button"
                    onClick={() => { setDistanceKm(val); const nd = val === '9999' ? 'municipal_dump' : dumpSite; setDumpSite(nd); calcCost(wasteType, volumeM3, val, nd) }}
                    className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${distanceKm === val ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600'}`}>{lbl}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">وجهة النقل *</label>
              <div className="space-y-1.5">
                <button type="button" onClick={() => { setDumpSite('municipal_dump'); calcCost(wasteType, volumeM3, distanceKm, 'municipal_dump') }}
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">الحجم (م³) *</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['10', '15'] as const).map(v => (
                  <button key={v} type="button" onClick={() => { setVolumeM3(v); calcCost(wasteType, v, distanceKm, dumpSite) }}
                    className={`py-2 rounded-xl border-2 text-sm font-bold transition-all ${volumeM3 === v ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-600'}`}>{v} م³</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">نوع الربو *</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => handleWasteTypeChange('liquid')}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${wasteType === 'liquid' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>💧 سائل</button>
                <button type="button" onClick={() => handleWasteTypeChange('solid')}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${wasteType === 'solid' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>🪨 جاف</button>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">نوع المركبة</label>
              {vehicleAutoSet && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">تلقائي</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([['', 'غير محدد'], ['tank', '🛢️ تنك'], ['truck', '🚚 شاحنة']] as const).map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => { setVehicleType(val as 'tank' | 'truck' | ''); setVehicleAutoSet(false) }}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${vehicleType === val ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-slate-200 text-slate-500'}`}>{lbl}</button>
              ))}
            </div>
          </div>
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
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">حالة الدفع *</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPaymentStatus('paid')}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${paymentStatus === 'paid' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>💵 مدفوع نقداً</button>
              <button type="button" onClick={() => setPaymentStatus('credit')}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${paymentStatus === 'credit' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>📋 على الحساب</button>
            </div>
          </div>
          {selectedFactory && tripCost !== null && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-base font-bold text-violet-700">{tripCost} ₪</p><p className="text-[10px] text-slate-500">سعر الوحدة</p></div>
                <div><p className="text-base font-bold text-emerald-600">{factoryContrib} ₪</p><p className="text-[10px] text-slate-500">مساهمة المصنع</p></div>
                <div><p className="text-base font-bold text-blue-600">{tripCost - factoryContrib} ₪</p><p className="text-[10px] text-slate-500">دعم التمويل</p></div>
              </div>
            </div>
          )}
          {selectedFactory && !tripCost && (wasteType || volumeM3 || distanceKm || dumpSite) && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              أدخل نوع الربو والحجم والمسافة والوجهة لحساب التكلفة تلقائياً
            </p>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={handleSubmit} disabled={loading || !!couponError}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
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
  const { canEdit, isAdmin, canApprove, canApprove } = useAuth()
  const searchParams = useSearchParams()
  const [trips, setTrips]   = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  // ── إحصائيات الاعتماد ───────────────────────────
  const [stats, setStats] = useState({ draft: 0, pending_approval: 0, approved: 0, rejected: 0, unknown: 0 })

  // ── فلاتر ───────────────────────────────────────
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatus | 'all'>('all')
  const [paymentFilter, setPaymentFilter]   = useState<'all' | 'paid' | 'credit'>('all')
  const [searchText, setSearchText]         = useState('')
  const [couponSearch, setCouponSearch]     = useState('')
  const [dateFrom, setDateFrom]             = useState('')
  const [dateTo, setDateTo]                 = useState('')
  const [showFilters, setShowFilters]       = useState(false)
  const [unpricedOnly, setUnpricedOnly]     = useState(() => searchParams.get('unpriced') === '1')

  // ── View modal ───────────────────────────────────
  const [viewTrip, setViewTrip] = useState<Trip | null>(null)

  // ── وضع العمود الأيسر في modal المراجعة ──────────────
  const [reviewMode, setReviewMode] = useState<'approve' | 'edit' | 'reject'>('approve')
  const [inlineRejectNote, setInlineRejectNote] = useState('')

  // ── Edit modal ───────────────────────────────────
  const [editTrip, setEditTrip] = useState<Trip | null>(null)
  const [editForm, setEditForm] = useState({
    trip_date: '', notes: '', payment_status: 'credit',
    waste_type: '', volume_m3: '',
    distance_km: '', dump_site: '', transfer_zone: '',
    driver_name: '', vehicle_type: '', coupon_number: '',
  })
  const [saving, setSaving]     = useState(false)

  // ── قواعد التسعيرة (للمعاينة الفورية) ───────────────────
  const [pricingRules, setPricingRules]   = useState<PricingRule[]>([])
  const [editContribPerTrip, setEditContribPerTrip] = useState(50)

  // ── Delete confirm ───────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null)
  const [deleting, setDeleting]         = useState(false)

  // ── Reject modal ────────────────────────────────
  const [rejectTarget, setRejectTarget]   = useState<Trip | null>(null)
  const [rejectNote, setRejectNote]       = useState('')
  const [rejecting, setRejecting]         = useState(false)

  // ── Revoke confirm ────────────────────────────────
  const [revokeTarget, setRevokeTarget] = useState<Trip | null>(null)
  const [revoking, setRevoking]         = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  // ── مراجعة آخر المعتمدة ────────────────────────────────────
  const [recentOpen,     setRecentOpen]     = useState(false)
  const [recentTrips,    setRecentTrips]    = useState<Trip[]>([])
  const [recentLoading,  setRecentLoading]  = useState(false)
  const [recentOffset,   setRecentOffset]   = useState(0)
  const [recentHasMore,  setRecentHasMore]  = useState(true)
  const [recentRevoking, setRecentRevoking] = useState<string | null>(null)

  const openRecentApproved = async () => {
    setRecentOpen(true)
    setRecentOffset(0)
    setRecentTrips([])
    setRecentLoading(true)
    try {
      const rows = await getRecentApprovedTrips(20, 0)
      setRecentTrips(rows)
      setRecentHasMore(rows.length === 20)
    } catch { showToast('error', 'فشل تحميل النقلات') }
    finally { setRecentLoading(false) }
  }

  const loadMoreRecent = async () => {
    const nextOffset = recentOffset + 20
    setRecentLoading(true)
    try {
      const rows = await getRecentApprovedTrips(20, nextOffset)
      setRecentTrips(prev => [...prev, ...rows])
      setRecentOffset(nextOffset)
      setRecentHasMore(rows.length === 20)
    } catch { showToast('error', 'فشل التحميل') }
    finally { setRecentLoading(false) }
  }

  const handleRecentRevoke = async (id: string) => {
    setRecentRevoking(id)
    try {
      await revokeApproval(id)
      setRecentTrips(prev => prev.filter(t => t.id !== id))
      showToast('success', 'تم إلغاء الاعتماد — أصبحت بانتظار الاعتماد')
      loadStats()
    } catch { showToast('error', 'فشل إلغاء الاعتماد') }
    finally { setRecentRevoking(null) }
  }

  // ── Bulk actions ─────────────────────────────────
  const [submitting, setSubmitting]       = useState(false)
  const [approvingAll, setApprovingAll]   = useState(false)

  const loadStats = useCallback(async () => {
    try { setStats(await getTripApprovalStats()) } catch { /* silent */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTrips({
        approval_status: approvalFilter !== 'all' ? approvalFilter : undefined,
        payment_status: paymentFilter !== 'all' ? paymentFilter : undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        coupon_number: couponSearch || undefined,
        search: searchText || undefined,
        unpriced: unpricedOnly || undefined,
      })
      setTrips(data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [approvalFilter, paymentFilter, dateFrom, dateTo, couponSearch, searchText, unpricedOnly])

  useEffect(() => { load(); loadStats() }, [load, loadStats])

  // جلب قواعد التسعيرة مرة واحدة عند تحميل الصفحة
  useEffect(() => {
    Promise.all([getPricingRules(), getSettings()]).then(([rules, setts]) => {
      setPricingRules(rules)
      const contrib = setts.find((s: {key:string;value:string}) => s.key === 'factory_contribution')
      if (contrib) setEditContribPerTrip(parseFloat(contrib.value) || 50)
    }).catch(console.error)
  }, [])

  const openEdit = (t: Trip) => {
    setEditTrip(t)
    setEditForm({
      trip_date:     t.trip_date ?? '',
      notes:         t.notes ?? '',
      payment_status: t.payment_status ?? 'credit',
      waste_type:    t.waste_type ?? '',
      volume_m3:     t.volume_m3 != null ? String(t.volume_m3) : '',
      distance_km:   t.distance_km != null ? String(t.distance_km) : '',
      dump_site:     t.dump_site ?? '',
      transfer_zone: t.transfer_zone ?? '',
      driver_name:   t.driver_name ?? '',
      vehicle_type:  t.vehicle_type ?? '',
      coupon_number: t.coupon_number ?? '',
    })
    setReviewMode('approve')
    setInlineRejectNote('')
  }

  // ── معاينة التسعيرة الفورية ──────────────────────────────
  const pricingPreview = useMemo(() => {
    const { waste_type: wt, volume_m3: vol, distance_km: dist, dump_site: ds } = editForm
    if (!wt || !vol || !dist || !ds) return null
    const maxDist = parseFloat(dist) <= 7 ? 7 : 9999
    const match = pricingRules.find(r =>
      r.waste_type === wt &&
      r.volume_m3 === parseFloat(vol) &&
      r.max_distance_km === maxDist &&
      r.dump_site === ds
    )
    if (!match) return { found: false as const, wt, vol, dist, ds, maxDist }
    return {
      found: true as const,
      unitPrice:   match.unit_price,
      contrib:     editContribPerTrip,
      subsidy:     match.unit_price - editContribPerTrip,
      label:       match.label,
      wt, vol, dist, ds, maxDist,
    }
  }, [editForm, pricingRules, editContribPerTrip])

  const handleSave = async () => {
    if (!editTrip) return
    setSaving(true)
    try {
      // الأدمن يعدل نقلة pending → تُعتمد تلقائياً
      if (canApproveove && editTrip.approval_status === 'pending_approval') {
        await editAndApproveTrip(editTrip.id, {
          trip_date:     editForm.trip_date || undefined,
          notes:         editForm.notes || null,
          payment_status: editForm.payment_status as 'paid' | 'credit',
          waste_type:    (editForm.waste_type as 'liquid' | 'solid') || null,
          volume_m3:     editForm.volume_m3    ? Number(editForm.volume_m3)    : null,
          distance_km:   editForm.distance_km  ? Number(editForm.distance_km)  : null,
          dump_site:     (editForm.dump_site as 'municipal_dump' | 'central_press') || null,
          transfer_zone: editForm.transfer_zone || null,
          driver_name:   editForm.driver_name   || null,
          vehicle_type:  (editForm.vehicle_type as 'tank' | 'truck') || null,
          coupon_number: editForm.coupon_number || null,
        })
        showToast('success', 'تم التعديل والاعتماد ✓')
      } else {
        await updateTrip(editTrip.id, {
          trip_date:     editForm.trip_date || undefined,
          notes:         editForm.notes || null,
          payment_status: editForm.payment_status as 'paid' | 'credit',
          waste_type:    (editForm.waste_type as 'liquid' | 'solid') || null,
          volume_m3:     editForm.volume_m3     ? Number(editForm.volume_m3)    : null,
          distance_km:   editForm.distance_km   ? Number(editForm.distance_km)  : null,
          dump_site:     (editForm.dump_site as 'municipal_dump' | 'central_press') || null,
          transfer_zone: editForm.transfer_zone || null,
          driver_name:   editForm.driver_name   || null,
          vehicle_type:  (editForm.vehicle_type as 'tank' | 'truck') || null,
          coupon_number: editForm.coupon_number || null,
        })
        showToast('success', 'تم تحديث النقلة ✓')
      }
      setEditTrip(null); load(); loadStats()
    } catch { showToast('error', 'فشل التحديث') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTrip(deleteTarget.id)
      showToast('success', 'تم حذف النقلة')
      setDeleteTarget(null); load(); loadStats()
    } catch { showToast('error', 'فشل الحذف') }
    finally { setDeleting(false) }
  }

  const handleSubmitAll = async () => {
    setSubmitting(true)
    try {
      const n = await submitAllDraftTrips()
      showToast('success', `تم رفع ${n} نقلة للاعتماد`)
      load(); loadStats()
    } catch { showToast('error', 'فشل رفع النقلات') }
    finally { setSubmitting(false) }
  }

  const handleApprove = async (t: Trip) => {
    try {
      await approveTrip(t.id)
      showToast('success', 'تم اعتماد النقلة ✓')
      load(); loadStats()
    } catch { showToast('error', 'فشل الاعتماد') }
  }

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return
    setRejecting(true)
    try {
      await rejectTrip(rejectTarget.id, rejectNote)
      showToast('success', 'تم رفض النقلة')
      setRejectTarget(null); setRejectNote(''); load(); loadStats()
    } catch { showToast('error', 'فشل الرفض') }
    finally { setRejecting(false) }
  }

  const handleInlineReject = async () => {
    if (!editTrip || !inlineRejectNote.trim()) return
    setSaving(true)
    try {
      await rejectTrip(editTrip.id, inlineRejectNote.trim())
      showToast('success', 'تم رفض النقلة — ستظهر الملاحظة لمدير المشروع')
      setEditTrip(null); setInlineRejectNote(''); load(); loadStats()
    } catch { showToast('error', 'فشل الرفض') }
    finally { setSaving(false) }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await revokeApproval(revokeTarget.id)
      showToast('success', 'تم إلغاء الاعتماد — النقلة أصبحت بانتظار الاعتماد')
      setRevokeTarget(null); load(); loadStats()
    } catch { showToast('error', 'فشل إلغاء الاعتماد') }
    finally { setRevoking(false) }
  }

  const handleSubmitTrip = async (id: string) => {
    setSubmittingId(id)
    try {
      await submitTrip(id)
      showToast('success', 'تم رفع النقلة للاعتماد ✓')
      load(); loadStats()
    } catch { showToast('error', 'فشل الرفع للاعتماد') }
    finally { setSubmittingId(null) }
  }

  const handleApproveAll = async () => {
    setApprovingAll(true)
    try {
      const n = await approveAllPendingTrips()
      showToast('success', `تم اعتماد ${n} نقلة ✓`)
      load(); loadStats()
    } catch { showToast('error', 'فشل الاعتماد الجماعي') }
    finally { setApprovingAll(false) }
  }

  const handleExport = () => {
    if (trips.length === 0) { showToast('error', 'لا توجد نقلات للتصدير'); return }
    const headers = ['#', 'المصنع', 'المنطقة', 'نوع الربو', 'الحجم (م³)', 'المبلغ (₪)', 'حالة الدفع', 'حالة الاعتماد', 'تاريخ النقلة', 'رقم الكوبون', 'السائق', 'نوع المركبة', 'موقع التفريغ', 'ملاحظات']
    const rows = trips.map((t: Trip, i: number) => [
      i + 1,
      t.factories?.name ?? '',
      t.factories?.region ?? '',
      t.waste_type === 'liquid' ? 'سائل' : t.waste_type === 'solid' ? 'صلب' : '',
      t.volume_m3 ?? '',
      t.amount ?? '',
      t.payment_status === 'paid' ? 'مدفوع' : 'ذمة',
      APPROVAL_LABELS[t.approval_status as ApprovalStatus]?.label ?? t.approval_status ?? '',
      t.trip_date ?? '',
      t.coupon_number ?? '',
      t.driver_name ?? '',
      t.vehicle_type ?? '',
      t.dump_site ?? '',
      t.notes ?? '',
    ])
    const csv = [headers, ...rows]
      .map(row => row.map((v: unknown) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `نقلات_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('success', `تم تصدير ${trips.length} نقلة`)
  }

  const canEditTrip = (t: Trip) => {
    if (isAdmin) return true
    return t.approval_status === 'draft' || t.approval_status === 'rejected'
  }
  const canDeleteTrip = (t: Trip) => {
    if (isAdmin) return true
    return t.approval_status === 'draft' || t.approval_status === 'rejected'
  }

  const totalAmount = trips.reduce((s: number, t: Trip) => s + Number(t.amount), 0)

  return (
    <div className="space-y-5" dir="rtl">

      {/* ── شريط إحصائيات الاعتماد ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['draft',            stats.draft,            'مسودة',             'bg-slate-50 border-slate-200 text-slate-700',   <FileText size={16} className="text-slate-400" />],
          ['pending_approval', stats.pending_approval, 'بانتظار الاعتماد', 'bg-amber-50 border-amber-200 text-amber-800',   <Clock size={16} className="text-amber-500" />],
          ['approved',         stats.approved,         'معتمدة',            'bg-emerald-50 border-emerald-200 text-emerald-800', <CheckCircle size={16} className="text-emerald-500" />],
          ['rejected',         stats.rejected,         'مرفوضة',            'bg-red-50 border-red-200 text-red-800',         <AlertCircle size={16} className="text-red-500" />],
        ] as const).map(([key, count, label, cls, icon]) => (
          <button key={key} onClick={() => {
            if (isAdmin && key === 'approved') { openRecentApproved(); return }
            setApprovalFilter(approvalFilter === key ? 'all' : key as ApprovalStatus)
          }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-right ${cls} ${approvalFilter === key ? 'ring-2 ring-offset-1 ring-current' : 'opacity-80 hover:opacity-100'}`}>
            {icon}
            <div>
              <p className="text-xl font-bold leading-none">{count}</p>
              <p className="text-xs mt-0.5 opacity-70">{label}</p>
              {isAdmin && key === 'approved' && <p className="text-[10px] opacity-50 mt-0.5">مراجعة →</p>}
            </div>
          </button>
        ))}
      </div>

      {/* تحذير: نقلات بدون approval_status صالح */}
      {stats.unknown > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-300 rounded-xl px-4 py-3">
          <AlertCircle size={18} className="text-orange-500 flex-shrink-0" />
          <p className="text-sm text-orange-800">
            تنبيه: يوجد <strong>{stats.unknown} نقلة</strong> بحالة غير معروفة (لا تظهر في أي تبويب). يُرجى مراجعة قاعدة البيانات وتعيين حالة الاعتماد لها.
          </p>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">النقلات</h1>
          <p className="text-sm text-slate-500 mt-0.5">{trips.length} نقلة في العرض الحالي</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* زر رفع للاعتماد — للمدير فقط */}
          {canEdit && !isAdmin && stats.draft > 0 && (
            <Button variant="secondary" size="lg" onClick={handleSubmitAll} loading={submitting}>
              <SendHorizonal size={15} /> رفع {stats.draft} نقلة للاعتماد
            </Button>
          )}
          {/* زر اعتماد الكل — لمن لديه صلاحية الاعتماد */}
          {canApprove && stats.pending_approval > 0 && (
            <Button variant="secondary" size="lg" onClick={handleApproveAll} loading={approvingAll}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              <ThumbsUp size={15} /> اعتماد الكل ({stats.pending_approval})
            </Button>
          )}
          {canEdit && (
            <>
              <Link href="/trips/import">
                <Button variant="secondary" size="lg"><Upload size={16} /> استيراد Excel</Button>
              </Link>
              <Button size="lg" onClick={() => setShowNew(true)}>
                <Plus size={16} /> تسجيل نقلة
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── شريط الفلاتر ── */}
      <Card>
        <CardBody>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* بحث بالمصنع */}
              <div className="relative flex-1 min-w-[160px]">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="بحث بالمصنع..."
                  className="w-full pr-8 pl-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {/* بحث بالكوبون */}
              <div className="relative min-w-[130px]">
                <input value={couponSearch} onChange={e => setCouponSearch(e.target.value)} placeholder="رقم الكوبون..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {/* فلتر حالة الدفع */}
              <Select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value as 'all' | 'paid' | 'credit')} className="min-w-[130px]">
                <option value="all">كل الحالات</option>
                <option value="paid">مدفوع</option>
                <option value="credit">ذمة</option>
              </Select>
              {/* فلتر بدون تسعيرة */}
              <button onClick={() => setUnpricedOnly(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm border-2 rounded-xl font-medium transition-all ${
                  unpricedOnly
                    ? 'bg-amber-50 border-amber-400 text-amber-700 ring-2 ring-amber-200'
                    : 'border-slate-200 text-slate-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
                }`}>
                ⚠️ بدون تسعيرة
              </button>
              {/* زر الفلاتر التاريخية */}
              <button onClick={() => setShowFilters(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
                <Filter size={14} /> تاريخ <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* فلاتر التاريخ القابلة للطي */}
            {showFilters && (
              <div className="flex items-center gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 whitespace-nowrap">من:</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 whitespace-nowrap">إلى:</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                {/* أزرار شهر سريع */}
                {(['هذا الشهر', 'الشهر الماضي'] as const).map((lbl, i) => (
                  <button key={lbl} onClick={() => {
                    const now = new Date()
                    // حساب أول يوم في الشهر المطلوب
                    const target = new Date(now.getFullYear(), now.getMonth() - i, 1)
                    const fromDate = new Date(target.getFullYear(), target.getMonth(), 1)
                    const toDate   = new Date(target.getFullYear(), target.getMonth() + 1, 0)
                    const fmt = (d: Date) =>
                      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                    setDateFrom(fmt(fromDate))
                    setDateTo(fmt(toDate))
                  }} className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors">{lbl}</button>
                ))}
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-red-500 hover:underline">مسح</button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
              <span>إجمالي المبالغ: <span className="font-bold text-slate-800">{totalAmount.toLocaleString()} ₪</span></span>
              {(approvalFilter !== 'all' || paymentFilter !== 'all' || searchText || couponSearch || dateFrom || dateTo || unpricedOnly) && (
                <button onClick={() => { setApprovalFilter('all'); setPaymentFilter('all'); setSearchText(''); setCouponSearch(''); setDateFrom(''); setDateTo(''); setUnpricedOnly(false) }}
                  className="text-blue-500 hover:underline">إعادة ضبط الفلاتر</button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ── الجدول ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">قائمة النقلات</h2>
            <Button variant="ghost" size="sm" onClick={handleExport}><Download size={14} /> تصدير ({trips.length})</Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">#</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">المصنع</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">نوع الربو</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">الحجم</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">المبلغ</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">الدفع</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">الاعتماد</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">تاريخ النقلة</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">الكوبون</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">ملاحظات</th>
                <th className="px-4 py-3 text-xs text-slate-500 font-medium min-w-[120px]">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-10 text-slate-400">جارٍ التحميل...</td></tr>
              ) : trips.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-10 text-slate-400">لا توجد نقلات بهذه الفلاتر</td></tr>
              ) : (
                trips.map((t: Trip, i: number) => {
                  const apStatus: ApprovalStatus = t.approval_status ?? 'draft'
                  const apInfo = APPROVAL_LABELS[apStatus]
                  const editable = canEditTrip(t)
                  const deletable = canDeleteTrip(t)
                  return (
                    <tr key={t.id} className={`border-b border-slate-50 hover:bg-slate-50/70 ${
                      t.trip_cost == null ? 'bg-amber-50/40' :
                      apStatus === 'rejected' ? 'bg-red-50/30' :
                      apStatus === 'pending_approval' ? 'bg-amber-50/20' : ''}`}>
                      <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 text-sm">{t.factories?.name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{t.factories?.region ?? ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        {t.waste_type === 'liquid' ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">💧 سائل</span>
                          : t.waste_type === 'solid' ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">🪨 جاف</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{t.volume_m3 != null ? `${t.volume_m3} م³` : '—'}</td>
                      <td className="px-4 py-3">
                        {t.trip_cost == null
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-300">⚠️ غير مسعّرة</span>
                          : <span className="font-semibold text-slate-800">{t.amount} ₪</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {t.payment_status === 'paid' ? 'مدفوع' : 'ذمة'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${apInfo.color}`}>
                          {apInfo.icon} {apInfo.label}
                        </span>
                        {apStatus === 'rejected' && t.rejection_note && (
                          <p className="text-[10px] text-red-500 mt-0.5 max-w-[120px] truncate" title={t.rejection_note}>↳ {t.rejection_note}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 text-xs font-medium">{t.trip_date ? format(new Date(t.trip_date), 'dd/MM/yyyy') : '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{t.coupon_number ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[120px] truncate">{t.notes ?? '—'}</td>
                      <td className="px-4 py-3 min-w-[120px]">
                        {canApproveove && apStatus === 'pending_approval' ? (
                          /* للأدمن على pending: صفين من الأزرار */
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setViewTrip(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="عرض التفاصيل">
                                <Eye size={13} />
                              </button>
                              <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="تعديل واعتماد">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="حذف">
                                <Trash2 size={13} />
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleApprove(t)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold transition-colors" title="اعتماد">
                                <ThumbsUp size={11} /> اعتماد
                              </button>
                              <button onClick={() => { setRejectTarget(t); setRejectNote('') }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-semibold transition-colors" title="رفض">
                                <ThumbsDown size={11} /> رفض
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* بقية الحالات: سطر واحد */
                          <div className="flex items-center gap-1">
                            <button onClick={() => setViewTrip(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="عرض التفاصيل">
                              <Eye size={13} />
                            </button>
                            {editable && (
                              <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="تعديل">
                                <Pencil size={13} />
                              </button>
                            )}
                            {/* زر رفع للاعتماد — للمدير على المرفوضات */}
                            {!canApprove && apStatus === 'rejected' && (
                              <button
                                onClick={() => handleSubmitTrip(t.id)}
                                disabled={submittingId === t.id}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-[11px] font-semibold transition-colors disabled:opacity-50"
                                title="رفع للاعتماد">
                                {submittingId === t.id ? '...' : <><SendHorizonal size={11} /> رفع</>}
                              </button>
                            )}
                            {deletable && (
                              <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="حذف">
                                <Trash2 size={13} />
                              </button>
                            )}
                            {canApproveove && apStatus === 'rejected' && (
                              <button onClick={() => handleApprove(t)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="اعتماد">
                                <ThumbsUp size={13} />
                              </button>
                            )}
                            {isAdmin && apStatus === 'approved' && (
                              <button onClick={() => setRevokeTarget(t)}
                                className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-300 hover:text-orange-500 transition-colors" title="إلغاء الاعتماد">
                                <RotateCcw size={13} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── View / Details Modal ── */}
      {viewTrip && (
        <Modal open={!!viewTrip} onClose={() => setViewTrip(null)} title={`تفاصيل النقلة — ${viewTrip.factories?.name ?? ''}`}>
          <div className="space-y-4" dir="rtl">

            {/* تحليل سبب عدم التسعير */}
            {viewTrip.trip_cost == null && (() => {
              const missing: string[] = []
              if (!viewTrip.waste_type)  missing.push('نوع الربو')
              if (!viewTrip.volume_m3)   missing.push('الحجم (م³)')
              if (!viewTrip.distance_km) missing.push('المسافة (كم)')
              if (!viewTrip.dump_site)   missing.push('موقع التفريغ')
              return (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-1.5">
                  <p className="text-sm font-bold text-amber-800">⚠️ النقلة غير مسعّرة</p>
                  {missing.length > 0 ? (
                    <>
                      <p className="text-xs text-amber-700">الحقول الناقصة التي تمنع التسعير:</p>
                      <ul className="space-y-0.5">
                        {missing.map(m => (
                          <li key={m} className="text-xs font-semibold text-red-600 flex items-center gap-1">
                            <span className="text-red-400">✗</span> {m}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-amber-700">
                      جميع الحقول موجودة لكن لا توجد قاعدة تسعيرة تطابق:
                      <span className="font-bold"> {viewTrip.waste_type === 'liquid' ? 'سائل' : 'جاف'}</span> ·
                      <span className="font-bold"> {viewTrip.volume_m3} م³</span> ·
                      <span className="font-bold"> {Number(viewTrip.distance_km) <= 7 ? '≤7 كم' : '>7 كم'}</span> ·
                      <span className="font-bold"> {viewTrip.dump_site === 'central_press' ? 'مكبس مركزي' : 'مكب بلدي'}</span>
                    </p>
                  )}
                </div>
              )
            })()}

            {/* شبكة البيانات */}
            <div className="grid grid-cols-2 gap-3">
              {([
                ['المصنع',        viewTrip.factories?.name ?? '—'],
                ['المنطقة',       viewTrip.factories?.region ?? '—'],
                ['تاريخ النقلة',  viewTrip.trip_date ? format(new Date(viewTrip.trip_date), 'dd/MM/yyyy') : '—'],
                ['رقم الكوبون',   viewTrip.coupon_number ?? '—'],
                ['نوع الربو',     viewTrip.waste_type === 'liquid' ? '💧 سائل' : viewTrip.waste_type === 'solid' ? '🪨 جاف' : '—'],
                ['الحجم',         viewTrip.volume_m3 != null ? `${viewTrip.volume_m3} م³` : '—'],
                ['المسافة',       viewTrip.distance_km != null ? `${viewTrip.distance_km} كم` : '—'],
                ['موقع التفريغ',  viewTrip.dump_site === 'central_press' ? 'مكبس مركزي' : viewTrip.dump_site === 'municipal_dump' ? 'مكب بلدي' : viewTrip.dump_site ?? '—'],
                ['منطقة النقل',   viewTrip.transfer_zone ?? '—'],
                ['السائق',        viewTrip.driver_name ?? '—'],
                ['نوع المركبة',   viewTrip.vehicle_type === 'tank' ? '🚛 صهريج' : viewTrip.vehicle_type === 'truck' ? '🚚 شاحنة' : '—'],
                ['حالة الدفع',    viewTrip.payment_status === 'paid' ? '✅ مدفوع' : '⏳ ذمة'],
                ['حالة الاعتماد', APPROVAL_LABELS[viewTrip.approval_status as ApprovalStatus]?.label ?? '—'],
                ['تكلفة النقلة',  viewTrip.trip_cost != null ? `${viewTrip.trip_cost} ₪` : '—'],
                ['مساهمة المصنع', viewTrip.factory_contribution != null ? `${viewTrip.factory_contribution} ₪` : '—'],
                ['دعم المشروع',   viewTrip.subsidy_amount != null ? `${viewTrip.subsidy_amount} ₪` : '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="bg-slate-50 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-slate-400 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-slate-700">{value}</p>
                </div>
              ))}
            </div>

            {/* ملاحظات */}
            {viewTrip.notes && (
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] text-slate-400 mb-0.5">ملاحظات</p>
                <p className="text-sm text-slate-600">{viewTrip.notes}</p>
              </div>
            )}

            {/* سبب الرفض */}
            {viewTrip.approval_status === 'rejected' && viewTrip.rejection_note && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <p className="text-[10px] text-red-400 mb-0.5">سبب الرفض</p>
                <p className="text-sm text-red-700 font-medium">{viewTrip.rejection_note}</p>
              </div>
            )}

            <Button variant="ghost" className="w-full" onClick={() => setViewTrip(null)}>إغلاق</Button>
          </div>
        </Modal>
      )}

      {/* ── Edit Modal ── */}
      {editTrip && (
        <Modal
          open={!!editTrip}
          onClose={() => setEditTrip(null)}
          title={`${canApproveove && editTrip.approval_status === 'pending_approval' ? 'مراجعة واعتماد' : 'تعديل'} نقلة — ${editTrip.factories?.name ?? ''}`}
          size={canApprove && editTrip.approval_status === 'pending_approval' ? '2xl' : !canApprovepprove && editTrip.approval_status === 'rejected' ? 'lg' : 'md'}
        >
          {/* للأدمن على pending: عمودان (تفاصيل + تعديل) */}
          {canApproveove && editTrip.approval_status === 'pending_approval' ? (
            <div className="flex gap-6" dir="rtl">

              {/* ── العمود الأيمن: عرض كامل للبيانات ── */}
              <div className="flex-1 space-y-3 min-w-0">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">بيانات النقلة</p>

                {/* تحذير غير مسعّرة */}
                {editTrip.trip_cost == null && (() => {
                  const missing: string[] = []
                  if (!editTrip.waste_type)  missing.push('نوع الربو')
                  if (!editTrip.volume_m3)   missing.push('الحجم (م³)')
                  if (!editTrip.distance_km) missing.push('المسافة (كم)')
                  if (!editTrip.dump_site)   missing.push('موقع التفريغ')
                  return (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 space-y-1">
                      <p className="text-xs font-bold text-amber-800">⚠️ غير مسعّرة</p>
                      {missing.length > 0
                        ? <ul className="space-y-0.5">{missing.map(m => <li key={m} className="text-xs text-red-600 flex items-center gap-1"><span>✗</span>{m}</li>)}</ul>
                        : <p className="text-xs text-amber-700">لا توجد قاعدة تسعيرة مطابقة للبيانات المدخلة</p>
                      }
                    </div>
                  )
                })()}

                {/* شبكة البيانات */}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['المصنع',        editTrip.factories?.name ?? '—'],
                    ['المنطقة',       editTrip.factories?.region ?? '—'],
                    ['تاريخ النقلة',  editTrip.trip_date ? format(new Date(editTrip.trip_date), 'dd/MM/yyyy') : '—'],
                    ['رقم الكوبون',   editTrip.coupon_number ?? '—'],
                    ['نوع الربو',     editTrip.waste_type === 'liquid' ? '💧 سائل' : editTrip.waste_type === 'solid' ? '🪨 جاف' : '—'],
                    ['الحجم',         editTrip.volume_m3 != null ? `${editTrip.volume_m3} م³` : '—'],
                    ['المسافة',       editTrip.distance_km != null ? `${editTrip.distance_km} كم` : '—'],
                    ['موقع التفريغ',  editTrip.dump_site === 'central_press' ? 'مكبس مركزي' : editTrip.dump_site === 'municipal_dump' ? 'مكب بلدي' : editTrip.dump_site ?? '—'],
                    ['منطقة النقل',   editTrip.transfer_zone ?? '—'],
                    ['السائق',        editTrip.driver_name ?? '—'],
                    ['نوع المركبة',   editTrip.vehicle_type === 'tank' ? '🚛 صهريج' : editTrip.vehicle_type === 'truck' ? '🚚 شاحنة' : '—'],
                    ['حالة الدفع',    editTrip.payment_status === 'paid' ? '✅ مدفوع' : '⏳ ذمة'],
                    ['تكلفة النقلة',  editTrip.trip_cost != null ? `${editTrip.trip_cost} ₪` : '—'],
                    ['مساهمة المصنع', editTrip.factory_contribution != null ? `${editTrip.factory_contribution} ₪` : '—'],
                    ['دعم المشروع',   editTrip.subsidy_amount != null ? `${editTrip.subsidy_amount} ₪` : '—'],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                      <p className="text-[10px] text-slate-400">{label}</p>
                      <p className="text-xs font-semibold text-slate-700">{value}</p>
                    </div>
                  ))}
                </div>

                {editTrip.notes && (
                  <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-slate-400">ملاحظات</p>
                    <p className="text-xs text-slate-600">{editTrip.notes}</p>
                  </div>
                )}
              </div>

              {/* فاصل عمودي */}
              <div className="w-px bg-slate-100 self-stretch" />

              {/* ── العمود الأيسر: لوحة القرار ── */}
              <div className="w-72 shrink-0 flex flex-col gap-3" dir="rtl">

                {/* أزرار اختيار الوضع */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {([
                    ['approve', '✓ اعتماد', 'text-emerald-700'],
                    ['edit',    '✏️ تعديل',   'text-blue-700'],
                    ['reject',  '✗ رفض',    'text-red-700'],
                  ] as ['approve'|'edit'|'reject', string, string][]).map(([mode, label, color]) => (
                    <button key={mode} onClick={() => setReviewMode(mode)}
                      className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        reviewMode === mode
                          ? `bg-white shadow-sm ${color}`
                          : 'text-slate-400 hover:text-slate-600'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── وضع اعتماد ── */}
                {reviewMode === 'approve' && (
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1">
                      <p className="text-xs font-bold text-emerald-800">✓ اعتماد مباشر</p>
                      <p className="text-[11px] text-emerald-700">سيتم اعتماد النقلة كما هي دون أي تعديل</p>
                    </div>
                    <div className="flex-1" />
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" loading={saving}
                      onClick={async () => { setSaving(true); try { await approveTrip(editTrip.id); showToast('success', 'تم اعتماد النقلة ✓'); setEditTrip(null); load(); loadStats() } catch { showToast('error', 'فشل الاعتماد') } finally { setSaving(false) } }}>
                      ✓ اعتماد النقلة
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setEditTrip(null)}>إلغاء</Button>
                  </div>
                )}

                {/* ── وضع تعديل واعتماد ── */}
                {reviewMode === 'edit' && (
                  <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto">

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">بيانات أساسية</p>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">تاريخ النقلة</label>
                      <Input type="date" value={editForm.trip_date} onChange={e => setEditForm(f => ({ ...f, trip_date: e.target.value }))} /></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">حالة الدفع</label>
                      <Select value={editForm.payment_status} onChange={e => setEditForm(f => ({ ...f, payment_status: e.target.value }))}>
                        <option value="credit">⏳ ذمة</option>
                        <option value="paid">✅ مدفوع</option>
                      </Select></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">رقم الكوبون</label>
                      <Input value={editForm.coupon_number} onChange={e => setEditForm(f => ({ ...f, coupon_number: e.target.value }))} placeholder="مثال: K-001" /></div>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide pt-1">بيانات التسعيرة</p>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">نوع الربو</label>
                      <Select value={editForm.waste_type} onChange={e => setEditForm(f => ({ ...f, waste_type: e.target.value }))}>
                        <option value="">غير محدد</option>
                        <option value="liquid">💧 سائل</option>
                        <option value="solid">🪨 جاف</option>
                      </Select></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">الحجم (م³)</label>
                      <Input type="number" placeholder="0.00" value={editForm.volume_m3} onChange={e => setEditForm(f => ({ ...f, volume_m3: e.target.value }))} /></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">المسافة (كم)</label>
                      <Input type="number" placeholder="مثال: 5" value={editForm.distance_km} onChange={e => setEditForm(f => ({ ...f, distance_km: e.target.value }))} /></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">موقع التفريغ</label>
                      <Select value={editForm.dump_site} onChange={e => setEditForm(f => ({ ...f, dump_site: e.target.value }))}>
                        <option value="">غير محدد</option>
                        <option value="municipal_dump">🗻 مكب بلدي</option>
                        <option value="central_press">🏭 مكبس مركزي</option>
                      </Select></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">منطقة النقل</label>
                      <Input value={editForm.transfer_zone} onChange={e => setEditForm(f => ({ ...f, transfer_zone: e.target.value }))} placeholder="مثال: حزام A" /></div>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide pt-1">بيانات السائق</p>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">اسم السائق</label>
                      <Input value={editForm.driver_name} onChange={e => setEditForm(f => ({ ...f, driver_name: e.target.value }))} placeholder="اسم السائق" /></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">نوع المركبة</label>
                      <Select value={editForm.vehicle_type} onChange={e => setEditForm(f => ({ ...f, vehicle_type: e.target.value }))}>
                        <option value="">غير محدد</option>
                        <option value="tank">🚛 صهريج</option>
                        <option value="truck">🚚 شاحنة</option>
                      </Select></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label>
                      <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات..." /></div>

                    {/* ── معاينة التسعيرة ── */}
                    {pricingPreview === null ? (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                        <p className="text-[11px] text-slate-400 text-center">أدخل نوع الربو + الحجم + المسافة + الموقع لرؤية التسعيرة</p>
                      </div>
                    ) : pricingPreview.found ? (
                      <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-emerald-800">✓ تم إيجاد قاعدة تسعيرة مطابقة</p>
                        <div className="text-[10px] text-emerald-700 bg-emerald-100 rounded-lg px-2 py-1 font-mono">
                          {pricingPreview.wt === 'liquid' ? '💧 سائل' : '🪨 جاف'}
                          {' · '}{pricingPreview.vol} م³
                          {' · '}{pricingPreview.maxDist === 7 ? '≤7 كم' : '>7 كم'}
                          {' · '}{pricingPreview.ds === 'central_press' ? 'مكبس مركزي' : 'مكب بلدي'}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="bg-white rounded-lg px-2 py-1.5 text-center">
                            <p className="text-[9px] text-slate-400">التكلفة الكلية</p>
                            <p className="text-sm font-bold text-slate-800">{pricingPreview.unitPrice} ₪</p>
                          </div>
                          <div className="bg-white rounded-lg px-2 py-1.5 text-center">
                            <p className="text-[9px] text-slate-400">مساهمة المصنع</p>
                            <p className="text-sm font-bold text-blue-700">{pricingPreview.contrib} ₪</p>
                          </div>
                          <div className="bg-white rounded-lg px-2 py-1.5 text-center">
                            <p className="text-[9px] text-slate-400">دعم المشروع</p>
                            <p className="text-sm font-bold text-violet-700">{pricingPreview.subsidy} ₪</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5 space-y-1">
                        <p className="text-xs font-bold text-amber-800">⚠️ لا توجد قاعدة تسعيرة مطابقة</p>
                        <p className="text-[10px] text-amber-700 bg-amber-100 rounded px-2 py-1 font-mono">
                          {pricingPreview.wt === 'liquid' ? '💧 سائل' : '🪨 جاف'}
                          {' · '}{pricingPreview.vol} م³
                          {' · '}{pricingPreview.maxDist === 7 ? '≤7 كم' : '>7 كم'}
                          {' · '}{pricingPreview.ds === 'central_press' ? 'مكبس مركزي' : 'مكب بلدي'}
                        </p>
                        <p className="text-[10px] text-amber-600">لن تتغير التكلفة عند الحفظ — أضف القاعدة من صفحة الإعدادات أولاً</p>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mt-1">
                      <p className="text-[11px] text-blue-700">✏️ سيتم حفظ التعديلات واعتماد النقلة تلقائياً</p>
                    </div>
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} loading={saving}>
                      ✓ حفظ واعتماد
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setEditTrip(null)}>إلغاء</Button>
                  </div>
                )}

                {/* ── وضع الرفض ── */}
                {reviewMode === 'reject' && (
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                      <p className="text-xs font-bold text-red-700">✗ رفض وإعادة للمدير</p>
                      <p className="text-[11px] text-red-600">ستظهر سبب الرفض لمدير المشروع ليعدل ويرفع مرة ثانية</p>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">سبب الرفض <span className="text-red-500">*</span></label>
                      <textarea
                        value={inlineRejectNote}
                        onChange={e => setInlineRejectNote(e.target.value)}
                        rows={5}
                        placeholder="اكتب سبب الرفض بوضوح..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                      />
                    </div>
                    <Button
                      variant="danger"
                      className="w-full"
                      onClick={handleInlineReject}
                      loading={saving}
                      disabled={!inlineRejectNote.trim()}
                    >
                      ✗ تأكيد الرفض
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setEditTrip(null)}>إلغاء</Button>
                  </div>
                )}

              </div>
            </div>

          ) : !canApproveove && editTrip.approval_status === 'rejected' ? (
            /* مدير المشروع يعدل نقلة مرفوضة — نموذج كامل */
            <div className="space-y-3 overflow-y-auto max-h-[75dvh]" dir="rtl">

              {/* سبب الرفض */}
              {editTrip.rejection_note && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-red-700 mb-0.5">سبب الرفض من الأدمن</p>
                  <p className="text-xs text-red-600">{editTrip.rejection_note}</p>
                </div>
              )}

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">بيانات أساسية</p>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-slate-600 mb-1">تاريخ النقلة</label>
                  <Input type="date" value={editForm.trip_date} onChange={e => setEditForm(f => ({ ...f, trip_date: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">حالة الدفع</label>
                  <Select value={editForm.payment_status} onChange={e => setEditForm(f => ({ ...f, payment_status: e.target.value }))}>
                    <option value="credit">⏳ ذمة</option>
                    <option value="paid">✅ مدفوع</option>
                  </Select></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">رقم الكوبون</label>
                  <Input value={editForm.coupon_number} onChange={e => setEditForm(f => ({ ...f, coupon_number: e.target.value }))} placeholder="مثال: K-001" /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">اسم السائق</label>
                  <Input value={editForm.driver_name} onChange={e => setEditForm(f => ({ ...f, driver_name: e.target.value }))} placeholder="اسم السائق" /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">نوع المركبة</label>
                  <Select value={editForm.vehicle_type} onChange={e => setEditForm(f => ({ ...f, vehicle_type: e.target.value }))}>
                    <option value="">غير محدد</option>
                    <option value="tank">🚛 صهريج</option>
                    <option value="truck">🚚 شاحنة</option>
                  </Select></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">منطقة النقل</label>
                  <Input value={editForm.transfer_zone} onChange={e => setEditForm(f => ({ ...f, transfer_zone: e.target.value }))} placeholder="مثال: حزام A" /></div>
              </div>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide pt-1">بيانات التسعيرة</p>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-slate-600 mb-1">نوع الربو</label>
                  <Select value={editForm.waste_type} onChange={e => setEditForm(f => ({ ...f, waste_type: e.target.value }))}>
                    <option value="">غير محدد</option>
                    <option value="liquid">💧 سائل</option>
                    <option value="solid">🪨 جاف</option>
                  </Select></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">الحجم (م³)</label>
                  <Input type="number" placeholder="0.00" value={editForm.volume_m3} onChange={e => setEditForm(f => ({ ...f, volume_m3: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">المسافة (كم)</label>
                  <Input type="number" placeholder="مثال: 5" value={editForm.distance_km} onChange={e => setEditForm(f => ({ ...f, distance_km: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">موقع التفريغ</label>
                  <Select value={editForm.dump_site} onChange={e => setEditForm(f => ({ ...f, dump_site: e.target.value }))}>
                    <option value="">غير محدد</option>
                    <option value="municipal_dump">🗻 مكب بلدي</option>
                    <option value="central_press">🏭 مكبس مركزي</option>
                  </Select></div>
              </div>

              <div><label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label>
                <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات..." /></div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <p className="text-[11px] text-amber-700">💡 بعد الحفظ ستبقى النقلة مرفوضة — ارفعها للاعتماد مرة ثانية من زر &quot;رفع للاعتماد&quot;</p>
              </div>

              <div className="flex gap-2 pt-1">
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} loading={saving}>💾 حفظ التغييرات</Button>
                <Button variant="ghost" className="flex-1" onClick={() => setEditTrip(null)}>إلغاء</Button>
              </div>
            </div>
          ) : (
            /* للحالات الأخرى (draft): modal بسيط */
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">تاريخ النقلة</label>
                <Input type="date" value={editForm.trip_date} onChange={e => setEditForm(f => ({ ...f, trip_date: e.target.value }))} /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">حالة الدفع</label>
                <Select value={editForm.payment_status} onChange={e => setEditForm(f => ({ ...f, payment_status: e.target.value }))}>
                  <option value="credit">ذمة</option><option value="paid">مدفوع</option>
                </Select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">نوع الربو</label>
                <Select value={editForm.waste_type} onChange={e => setEditForm(f => ({ ...f, waste_type: e.target.value }))}>
                  <option value="">غير محدد</option><option value="liquid">💧 سائل</option><option value="solid">🪨 جاف</option>
                </Select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">الحجم (م³)</label>
                <Input type="number" placeholder="0.00" value={editForm.volume_m3} onChange={e => setEditForm(f => ({ ...f, volume_m3: e.target.value }))} /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
                <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات..." /></div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={handleSave} loading={saving}>حفظ التغييرات</Button>
                <Button variant="ghost" className="flex-1" onClick={() => setEditTrip(null)}>إلغاء</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Reject Modal ── */}
      {rejectTarget && (
        <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title={`رفض نقلة — ${rejectTarget.factories?.name ?? ''}`}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">سبب الرفض (سيظهر لمدير المشروع):</p>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              rows={3} placeholder="اكتب سبب الرفض..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={handleRejectConfirm} loading={rejecting} disabled={!rejectNote.trim()}>تأكيد الرفض</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setRejectTarget(null)}>إلغاء</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Revoke Modal ── */}
      {revokeTarget && (
        <Modal open={!!revokeTarget} onClose={() => setRevokeTarget(null)} title="إلغاء اعتماد النقلة">
          <div className="space-y-4" dir="rtl">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-1">
              <p className="text-sm font-bold text-orange-800">⚠️ تأكيد إلغاء الاعتماد</p>
              <p className="text-xs text-orange-700">ستعود نقلة <span className="font-bold">{revokeTarget.factories?.name}</span> إلى حالة بانتظار الاعتماد ويمكن مراجعتها من قائمة الاعتماد مباشرة.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-slate-400">المصنع</p>
                <p className="font-semibold text-slate-700">{revokeTarget.factories?.name ?? '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-slate-400">تاريخ النقلة</p>
                <p className="font-semibold text-slate-700">{revokeTarget.trip_date ? format(new Date(revokeTarget.trip_date), 'dd/MM/yyyy') : '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-slate-400">رقم الكوبون</p>
                <p className="font-semibold text-slate-700">{revokeTarget.coupon_number ?? '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-slate-400">التكلفة</p>
                <p className="font-semibold text-slate-700">{revokeTarget.trip_cost != null ? `${revokeTarget.trip_cost} ₪` : '—'}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1 border-2 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={handleRevoke} loading={revoking}>
                <RotateCcw size={14} /> نعم، إلغاء الاعتماد
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setRevokeTarget(null)}>تراجع</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Modal ── */}
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

      {/* ── New Trip Modal ── */}
      {showNew && (
        <NewTripModal onClose={() => setShowNew(false)} onSuccess={() => { setShowNew(false); load(); loadStats() }} isAdmin={isAdmin} />
      )}

      {/* ── مراجعة آخر المعتمدة ── */}
      {recentOpen && (
        <Modal open={recentOpen} onClose={() => setRecentOpen(false)} title="مراجعة آخر النقلات المعتمدة" size="2xl">
          <div className="space-y-3" dir="rtl">

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <p className="text-xs text-amber-800">⚠️ إلغاء الاعتماد سيُعيد النقلة إلى قائمة <span className="font-bold">بانتظار الاعتماد</span> — يمكن مراجعتها واعتمادها مرة ثانية.</p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">#</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">المصنع</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">تاريخ النقلة</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">وقت الاعتماد</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">الكوبون</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">التكلفة</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">نوع الربو</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoading && recentTrips.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-slate-400">جارٍ التحميل...</td></tr>
                  ) : recentTrips.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-slate-400">لا توجد نقلات معتمدة</td></tr>
                  ) : (
                    recentTrips.map((t: Trip, i: number) => (
                      <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 text-slate-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-800 text-xs">{t.factories?.name ?? '—'}</p>
                          <p className="text-[10px] text-slate-400">{t.factories?.region ?? ''}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                          {t.trip_date ? format(new Date(t.trip_date), 'dd/MM/yyyy') : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {t.approved_at ? format(new Date(t.approved_at), 'dd/MM/yyyy HH:mm') : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{t.coupon_number ?? '—'}</td>
                        <td className="px-3 py-2.5 text-xs font-semibold text-slate-700">
                          {t.trip_cost != null ? `${t.trip_cost} ₪` : <span className="text-amber-500">غير مسعّرة</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {t.waste_type === 'liquid'
                            ? <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">💧 سائل</span>
                            : t.waste_type === 'solid'
                            ? <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">🪨 جاف</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => handleRecentRevoke(t.id)}
                            disabled={recentRevoking === t.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 text-[11px] font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                            title="إلغاء الاعتماد">
                            {recentRevoking === t.id
                              ? <span className="text-slate-400">...</span>
                              : <><RotateCcw size={11} /> إلغاء الاعتماد</>}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* تحميل المزيد */}
            {recentHasMore && !recentLoading && recentTrips.length > 0 && (
              <button
                onClick={loadMoreRecent}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">
                تحميل 20 نقلة إضافية ↓
              </button>
            )}
            {recentLoading && recentTrips.length > 0 && (
              <p className="text-center text-xs text-slate-400 py-2">جارٍ التحميل...</p>
            )}

            <div className="flex justify-end pt-1">
              <Button variant="ghost" onClick={() => setRecentOpen(false)}>إغلاق</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
