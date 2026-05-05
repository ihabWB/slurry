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
  draft:            { label: '?????',              color: 'bg-slate-100 text-slate-600',    icon: <FileText size={11} /> },
  pending_approval: { label: '??????? ????????',  color: 'bg-amber-100 text-amber-700',    icon: <Clock size={11} /> },
  approved:         { label: '??????',             color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={11} /> },
  rejected:         { label: '??????',             color: 'bg-red-100 text-red-700',        icon: <AlertCircle size={11} /> },
}

// --- Modal ????? ???? ????? --------------------------------
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
      if (exists) setCouponError('??? ??????? ?????? ??????')
    } finally { setCouponChecking(false) }
  }

  const handleSubmit = async () => {
    if (!selectedFactory) { showToast('warning', '???? ?????? ????'); return }
    if (!couponNumber.trim()) { showToast('warning', '???? ????? ??? ???????'); return }
    if (couponError) { showToast('error', '??? ??????? ?????? ??????'); return }
    if (!distanceKm) { showToast('warning', '???? ????? ???????'); return }
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
      showToast('success', isAdmin ? '?? ????? ?????? ????????? ?' : '?? ????? ?????? — ??????? ????????')
      onSuccess()
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : '??? ???')
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
              <h2 className="text-base font-bold text-slate-900">????? ???? ?????</h2>
              <p className="text-xs text-slate-500">{factoryContrib} ? ?????? ??????</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">?????? *</label>
            <input placeholder="?? ??? ???? ?????? ?? ???????..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-50">
              {filteredFactories.map(f => (
                <button key={f.id} type="button" onClick={() => { setSelectedFactory(f.id); setSearch(f.name) }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-right text-sm transition-colors ${selectedFactory === f.id ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50 text-slate-700'}`}>
                  <div><p className="font-medium">{f.name}</p><p className="text-xs text-slate-400">{f.region}</p></div>
                  {f.balance > 0 && <span className="text-xs text-red-500">??? {f.balance} ?</span>}
                </button>
              ))}
              {filteredFactories.length === 0 && <p className="text-center text-xs text-slate-400 py-4">?? ???? ?????</p>}
            </div>
            {selectedFact && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700">
                ? <span className="font-semibold">{selectedFact.name}</span> — {selectedFact.region}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">????? ?????? *</label>
              <input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">??? ??????? *</label>
              <input placeholder="??? ?????" value={couponNumber}
                onChange={e => { setCouponNumber(e.target.value); setCouponError('') }}
                onBlur={handleCouponBlur}
                className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 ${couponError ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-blue-500'}`} />
              {couponChecking && <p className="text-[10px] text-slate-400">???? ??????...</p>}
              {couponError && <p className="text-[10px] text-red-500">? {couponError}</p>}
              {!couponError && !couponChecking && couponNumber.trim() && <p className="text-[10px] text-emerald-500">? ????</p>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">??? ??????</label>
            <input placeholder="??? ??????" value={driverName} onChange={e => setDriverName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">??????? *</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([['7', '= 7 ??'], ['9999', '> 7 ??']] as const).map(([val, lbl]) => (
                  <button key={val} type="button"
                    onClick={() => { setDistanceKm(val); const nd = val === '9999' ? 'municipal_dump' : dumpSite; setDumpSite(nd); calcCost(wasteType, volumeM3, val, nd) }}
                    className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${distanceKm === val ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600'}`}>{lbl}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">???? ????? *</label>
              <div className="space-y-1.5">
                <button type="button" onClick={() => { setDumpSite('municipal_dump'); calcCost(wasteType, volumeM3, distanceKm, 'municipal_dump') }}
                  className={`w-full py-2 px-2 rounded-xl border-2 text-[11px] font-medium text-right transition-all ${dumpSite === 'municipal_dump' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                  {distanceKm === '9999' ? '??? ????' : distanceKm === '7' ? '??? ??? ????????' : '??? ???????'}
                </button>
                <button type="button" disabled={distanceKm === '9999'}
                  onClick={() => { setDumpSite('central_press'); calcCost(wasteType, volumeM3, distanceKm, 'central_press') }}
                  className={`w-full py-2 px-2 rounded-xl border-2 text-[11px] font-medium text-right transition-all ${distanceKm === '9999' ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed' : dumpSite === 'central_press' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                  ????? ????? ????????
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">????? (?³) *</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['10', '15'] as const).map(v => (
                  <button key={v} type="button" onClick={() => { setVolumeM3(v); calcCost(wasteType, v, distanceKm, dumpSite) }}
                    className={`py-2 rounded-xl border-2 text-sm font-bold transition-all ${volumeM3 === v ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-600'}`}>{v} ?³</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">??? ????? *</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => handleWasteTypeChange('liquid')}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${wasteType === 'liquid' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>?? ????</button>
                <button type="button" onClick={() => handleWasteTypeChange('solid')}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${wasteType === 'solid' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>?? ???</button>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">??? ???????</label>
              {vehicleAutoSet && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">??????</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([['', '??? ????'], ['tank', '??? ???'], ['truck', '?? ?????']] as const).map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => { setVehicleType(val as 'tank' | 'truck' | ''); setVehicleAutoSet(false) }}
                  className={`py-2 rounded-xl border-2 text-xs font-medium transition-all ${vehicleType === val ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-slate-200 text-slate-500'}`}>{lbl}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">????? ?????</label>
              <input placeholder="??????? ?????????" value={transferZone} onChange={e => setTransferZone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">???????</label>
              <input placeholder="???????" value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">???? ????? *</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPaymentStatus('paid')}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${paymentStatus === 'paid' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>?? ????? ?????</button>
              <button type="button" onClick={() => setPaymentStatus('credit')}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${paymentStatus === 'credit' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>?? ??? ??????</button>
            </div>
          </div>
          {selectedFactory && tripCost !== null && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-base font-bold text-violet-700">{tripCost} ?</p><p className="text-[10px] text-slate-500">??? ??????</p></div>
                <div><p className="text-base font-bold text-emerald-600">{factoryContrib} ?</p><p className="text-[10px] text-slate-500">?????? ??????</p></div>
                <div><p className="text-base font-bold text-blue-600">{tripCost - factoryContrib} ?</p><p className="text-[10px] text-slate-500">??? ???????</p></div>
              </div>
            </div>
          )}
          {selectedFactory && !tripCost && (wasteType || volumeM3 || distanceKm || dumpSite) && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              ???? ??? ????? ?????? ???????? ??????? ????? ??????? ????????
            </p>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={handleSubmit} disabled={loading || !!couponError}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <Truck size={15} />}
            ????? ??????
          </button>
        </div>
      </div>
    </div>
  )
}

// --- ?????? ???????? -----------------------------------------
export default function TripsPage() {
  const { canEdit, isAdmin, canApprove } = useAuth()
  const searchParams = useSearchParams()
  const [trips, setTrips]   = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  // -- ???????? ???????? ---------------------------
  const [stats, setStats] = useState({ draft: 0, pending_approval: 0, approved: 0, rejected: 0, unknown: 0 })

  // -- ????? ---------------------------------------
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatus | 'all'>('all')
  const [paymentFilter, setPaymentFilter]   = useState<'all' | 'paid' | 'credit'>('all')
  const [searchText, setSearchText]         = useState('')
  const [couponSearch, setCouponSearch]     = useState('')
  const [dateFrom, setDateFrom]             = useState('')
  const [dateTo, setDateTo]                 = useState('')
  const [showFilters, setShowFilters]       = useState(false)
  const [unpricedOnly, setUnpricedOnly]     = useState(() => searchParams.get('unpriced') === '1')

  // -- View modal -----------------------------------
  const [viewTrip, setViewTrip] = useState<Trip | null>(null)

  // -- ??? ?????? ?????? ?? modal ???????? --------------
  const [reviewMode, setReviewMode] = useState<'approve' | 'edit' | 'reject'>('approve')
  const [inlineRejectNote, setInlineRejectNote] = useState('')

  // -- Edit modal -----------------------------------
  const [editTrip, setEditTrip] = useState<Trip | null>(null)
  const [editForm, setEditForm] = useState({
    trip_date: '', notes: '', payment_status: 'credit',
    waste_type: '', volume_m3: '',
    distance_km: '', dump_site: '', transfer_zone: '',
    driver_name: '', vehicle_type: '', coupon_number: '',
  })
  const [saving, setSaving]     = useState(false)

  // -- ????? ???????? (???????? ???????) -------------------
  const [pricingRules, setPricingRules]   = useState<PricingRule[]>([])
  const [editContribPerTrip, setEditContribPerTrip] = useState(50)

  // -- Delete confirm -------------------------------
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null)
  const [deleting, setDeleting]         = useState(false)

  // -- Reject modal --------------------------------
  const [rejectTarget, setRejectTarget]   = useState<Trip | null>(null)
  const [rejectNote, setRejectNote]       = useState('')
  const [rejecting, setRejecting]         = useState(false)

  // -- Revoke confirm --------------------------------
  const [revokeTarget, setRevokeTarget] = useState<Trip | null>(null)
  const [revoking, setRevoking]         = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  // -- ?????? ??? ???????? ------------------------------------
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
    } catch { showToast('error', '??? ????? ???????') }
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
    } catch { showToast('error', '??? ???????') }
    finally { setRecentLoading(false) }
  }

  const handleRecentRevoke = async (id: string) => {
    setRecentRevoking(id)
    try {
      await revokeApproval(id)
      setRecentTrips(prev => prev.filter(t => t.id !== id))
      showToast('success', '?? ????? ???????? — ????? ??????? ????????')
      loadStats()
    } catch { showToast('error', '??? ????? ????????') }
    finally { setRecentRevoking(null) }
  }

  // -- Bulk actions ---------------------------------
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

  // ??? ????? ???????? ??? ????? ??? ????? ??????
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

  // -- ?????? ???????? ??????? ------------------------------
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
      // ?????? ???? ???? pending ? ?????? ????????
      if (canApprove && editTrip.approval_status === 'pending_approval') {
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
        showToast('success', '?? ??????? ????????? ?')
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
        showToast('success', '?? ????? ?????? ?')
      }
      setEditTrip(null); load(); loadStats()
    } catch { showToast('error', '??? ???????') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTrip(deleteTarget.id)
      showToast('success', '?? ??? ??????')
      setDeleteTarget(null); load(); loadStats()
    } catch { showToast('error', '??? ?????') }
    finally { setDeleting(false) }
  }

  const handleSubmitAll = async () => {
    setSubmitting(true)
    try {
      const n = await submitAllDraftTrips()
      showToast('success', `?? ??? ${n} ???? ????????`)
      load(); loadStats()
    } catch { showToast('error', '??? ??? ???????') }
    finally { setSubmitting(false) }
  }

  const handleApprove = async (t: Trip) => {
    try {
      await approveTrip(t.id)
      showToast('success', '?? ?????? ?????? ?')
      load(); loadStats()
    } catch { showToast('error', '??? ????????') }
  }

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return
    setRejecting(true)
    try {
      await rejectTrip(rejectTarget.id, rejectNote)
      showToast('success', '?? ??? ??????')
      setRejectTarget(null); setRejectNote(''); load(); loadStats()
    } catch { showToast('error', '??? ?????') }
    finally { setRejecting(false) }
  }

  const handleInlineReject = async () => {
    if (!editTrip || !inlineRejectNote.trim()) return
    setSaving(true)
    try {
      await rejectTrip(editTrip.id, inlineRejectNote.trim())
      showToast('success', '?? ??? ?????? — ????? ???????? ????? ???????')
      setEditTrip(null); setInlineRejectNote(''); load(); loadStats()
    } catch { showToast('error', '??? ?????') }
    finally { setSaving(false) }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await revokeApproval(revokeTarget.id)
      showToast('success', '?? ????? ???????? — ?????? ????? ??????? ????????')
      setRevokeTarget(null); load(); loadStats()
    } catch { showToast('error', '??? ????? ????????') }
    finally { setRevoking(false) }
  }

  const handleSubmitTrip = async (id: string) => {
    setSubmittingId(id)
    try {
      await submitTrip(id)
      showToast('success', '?? ??? ?????? ???????? ?')
      load(); loadStats()
    } catch { showToast('error', '??? ????? ????????') }
    finally { setSubmittingId(null) }
  }

  const handleApproveAll = async () => {
    setApprovingAll(true)
    try {
      const n = await approveAllPendingTrips()
      showToast('success', `?? ?????? ${n} ???? ?`)
      load(); loadStats()
    } catch { showToast('error', '??? ???????? ???????') }
    finally { setApprovingAll(false) }
  }

  const handleExport = () => {
    if (trips.length === 0) { showToast('error', '?? ???? ????? ???????'); return }
    const headers = ['#', '??????', '???????', '??? ?????', '????? (?³)', '?????? (?)', '???? ?????', '???? ????????', '????? ??????', '??? ???????', '??????', '??? ???????', '???? ???????', '???????']
    const rows = trips.map((t: Trip, i: number) => [
      i + 1,
      t.factories?.name ?? '',
      t.factories?.region ?? '',
      t.waste_type === 'liquid' ? '????' : t.waste_type === 'solid' ? '???' : '',
      t.volume_m3 ?? '',
      t.amount ?? '',
      t.payment_status === 'paid' ? '?????' : '???',
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
    a.download = `?????_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('success', `?? ????? ${trips.length} ????`)
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

      {/* -- ???? ???????? ???????? -- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['draft',            stats.draft,            '?????',             'bg-slate-50 border-slate-200 text-slate-700',   <FileText size={16} className="text-slate-400" />],
          ['pending_approval', stats.pending_approval, '??????? ????????', 'bg-amber-50 border-amber-200 text-amber-800',   <Clock size={16} className="text-amber-500" />],
          ['approved',         stats.approved,         '??????',            'bg-emerald-50 border-emerald-200 text-emerald-800', <CheckCircle size={16} className="text-emerald-500" />],
          ['rejected',         stats.rejected,         '??????',            'bg-red-50 border-red-200 text-red-800',         <AlertCircle size={16} className="text-red-500" />],
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
              {isAdmin && key === 'approved' && <p className="text-[10px] opacity-50 mt-0.5">?????? ?</p>}
            </div>
          </button>
        ))}
      </div>

      {/* ?????: ????? ???? approval_status ???? */}
      {stats.unknown > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-300 rounded-xl px-4 py-3">
          <AlertCircle size={18} className="text-orange-500 flex-shrink-0" />
          <p className="text-sm text-orange-800">
            ?????: ???? <strong>{stats.unknown} ????</strong> ????? ??? ?????? (?? ???? ?? ?? ?????). ????? ?????? ????? ???????? ?????? ???? ???????? ???.
          </p>
        </div>
      )}

      {/* -- Header -- */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">???????</h1>
          <p className="text-sm text-slate-500 mt-0.5">{trips.length} ???? ?? ????? ??????</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* ?? ??? ???????? — ?????? ??? */}
          {canEdit && !isAdmin && stats.draft > 0 && (
            <Button variant="secondary" size="lg" onClick={handleSubmitAll} loading={submitting}>
              <SendHorizonal size={15} /> ??? {stats.draft} ???? ????????
            </Button>
          )}
          {/* ?? ?????? ???? — ??? ???? ?????? ???????? */}
          {canApprove && stats.pending_approval > 0 && (
            <Button variant="secondary" size="lg" onClick={handleApproveAll} loading={approvingAll}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              <ThumbsUp size={15} /> ?????? ???? ({stats.pending_approval})
            </Button>
          )}
          {canEdit && (
            <>
              <Link href="/trips/import">
                <Button variant="secondary" size="lg"><Upload size={16} /> ??????? Excel</Button>
              </Link>
              <Button size="lg" onClick={() => setShowNew(true)}>
                <Plus size={16} /> ????? ????
              </Button>
            </>
          )}
        </div>
      </div>

      {/* -- ???? ??????? -- */}
      <Card>
        <CardBody>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* ??? ??????? */}
              <div className="relative flex-1 min-w-[160px]">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="??? ???????..."
                  className="w-full pr-8 pl-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {/* ??? ???????? */}
              <div className="relative min-w-[130px]">
                <input value={couponSearch} onChange={e => setCouponSearch(e.target.value)} placeholder="??? ???????..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {/* ???? ???? ????? */}
              <Select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value as 'all' | 'paid' | 'credit')} className="min-w-[130px]">
                <option value="all">?? ???????</option>
                <option value="paid">?????</option>
                <option value="credit">???</option>
              </Select>
              {/* ???? ???? ?????? */}
              <button onClick={() => setUnpricedOnly(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm border-2 rounded-xl font-medium transition-all ${
                  unpricedOnly
                    ? 'bg-amber-50 border-amber-400 text-amber-700 ring-2 ring-amber-200'
                    : 'border-slate-200 text-slate-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
                }`}>
                ?? ???? ??????
              </button>
              {/* ?? ??????? ????????? */}
              <button onClick={() => setShowFilters(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
                <Filter size={14} /> ????? <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* ????? ??????? ??????? ???? */}
            {showFilters && (
              <div className="flex items-center gap-3 flex-wrap pt-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 whitespace-nowrap">??:</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 whitespace-nowrap">???:</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                {/* ????? ??? ???? */}
                {(['??? ?????', '????? ??????'] as const).map((lbl, i) => (
                  <button key={lbl} onClick={() => {
                    const now = new Date()
                    // ???? ??? ??? ?? ????? ???????
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
                  <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-red-500 hover:underline">???</button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
              <span>?????? ???????: <span className="font-bold text-slate-800">{totalAmount.toLocaleString()} ?</span></span>
              {(approvalFilter !== 'all' || paymentFilter !== 'all' || searchText || couponSearch || dateFrom || dateTo || unpricedOnly) && (
                <button onClick={() => { setApprovalFilter('all'); setPaymentFilter('all'); setSearchText(''); setCouponSearch(''); setDateFrom(''); setDateTo(''); setUnpricedOnly(false) }}
                  className="text-blue-500 hover:underline">????? ??? ???????</button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* -- ?????? -- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">????? ???????</h2>
            <Button variant="ghost" size="sm" onClick={handleExport}><Download size={14} /> ????? ({trips.length})</Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">#</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">??????</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">??? ?????</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">?????</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">??????</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">?????</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">????????</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">????? ??????</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">???????</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">???????</th>
                <th className="px-4 py-3 text-xs text-slate-500 font-medium min-w-[120px]">???????</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-10 text-slate-400">???? ???????...</td></tr>
              ) : trips.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-10 text-slate-400">?? ???? ????? ???? ???????</td></tr>
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
                        {t.waste_type === 'liquid' ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">?? ????</span>
                          : t.waste_type === 'solid' ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">?? ???</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{t.volume_m3 != null ? `${t.volume_m3} ?³` : '—'}</td>
                      <td className="px-4 py-3">
                        {t.trip_cost == null
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-300">?? ??? ??????</span>
                          : <span className="font-semibold text-slate-800">{t.amount} ?</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {t.payment_status === 'paid' ? '?????' : '???'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${apInfo.color}`}>
                          {apInfo.icon} {apInfo.label}
                        </span>
                        {apStatus === 'rejected' && t.rejection_note && (
                          <p className="text-[10px] text-red-500 mt-0.5 max-w-[120px] truncate" title={t.rejection_note}>? {t.rejection_note}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 text-xs font-medium">{t.trip_date ? format(new Date(t.trip_date), 'dd/MM/yyyy') : '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{t.coupon_number ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[120px] truncate">{t.notes ?? '—'}</td>
                      <td className="px-4 py-3 min-w-[120px]">
                        {canApprove && apStatus === 'pending_approval' ? (
                          /* ?????? ??? pending: ???? ?? ??????? */
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setViewTrip(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="??? ????????">
                                <Eye size={13} />
                              </button>
                              <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="????? ???????">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="???">
                                <Trash2 size={13} />
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleApprove(t)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold transition-colors" title="??????">
                                <ThumbsUp size={11} /> ??????
                              </button>
                              <button onClick={() => { setRejectTarget(t); setRejectNote('') }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-semibold transition-colors" title="???">
                                <ThumbsDown size={11} /> ???
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ???? ???????: ??? ???? */
                          <div className="flex items-center gap-1">
                            <button onClick={() => setViewTrip(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="??? ????????">
                              <Eye size={13} />
                            </button>
                            {editable && (
                              <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="?????">
                                <Pencil size={13} />
                              </button>
                            )}
                            {/* ?? ??? ???????? — ?????? ??? ????????? */}
                            {!canApprove && apStatus === 'rejected' && (
                              <button
                                onClick={() => handleSubmitTrip(t.id)}
                                disabled={submittingId === t.id}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-[11px] font-semibold transition-colors disabled:opacity-50"
                                title="??? ????????">
                                {submittingId === t.id ? '...' : <><SendHorizonal size={11} /> ???</>}
                              </button>
                            )}
                            {deletable && (
                              <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="???">
                                <Trash2 size={13} />
                              </button>
                            )}
                            {canApprove && apStatus === 'rejected' && (
                              <button onClick={() => handleApprove(t)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="??????">
                                <ThumbsUp size={13} />
                              </button>
                            )}
                            {isAdmin && apStatus === 'approved' && (
                              <button onClick={() => setRevokeTarget(t)}
                                className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-300 hover:text-orange-500 transition-colors" title="????? ????????">
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

      {/* -- View / Details Modal -- */}
      {viewTrip && (
        <Modal open={!!viewTrip} onClose={() => setViewTrip(null)} title={`?????? ?????? — ${viewTrip.factories?.name ?? ''}`}>
          <div className="space-y-4" dir="rtl">

            {/* ????? ??? ??? ??????? */}
            {viewTrip.trip_cost == null && (() => {
              const missing: string[] = []
              if (!viewTrip.waste_type)  missing.push('??? ?????')
              if (!viewTrip.volume_m3)   missing.push('????? (?³)')
              if (!viewTrip.distance_km) missing.push('??????? (??)')
              if (!viewTrip.dump_site)   missing.push('???? ???????')
              return (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-1.5">
                  <p className="text-sm font-bold text-amber-800">?? ?????? ??? ??????</p>
                  {missing.length > 0 ? (
                    <>
                      <p className="text-xs text-amber-700">?????? ??????? ???? ???? ???????:</p>
                      <ul className="space-y-0.5">
                        {missing.map(m => (
                          <li key={m} className="text-xs font-semibold text-red-600 flex items-center gap-1">
                            <span className="text-red-400">?</span> {m}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-amber-700">
                      ???? ?????? ?????? ??? ?? ???? ????? ?????? ?????:
                      <span className="font-bold"> {viewTrip.waste_type === 'liquid' ? '????' : '???'}</span> ·
                      <span className="font-bold"> {viewTrip.volume_m3} ?³</span> ·
                      <span className="font-bold"> {Number(viewTrip.distance_km) <= 7 ? '=7 ??' : '>7 ??'}</span> ·
                      <span className="font-bold"> {viewTrip.dump_site === 'central_press' ? '???? ?????' : '??? ????'}</span>
                    </p>
                  )}
                </div>
              )
            })()}

            {/* ???? ???????? */}
            <div className="grid grid-cols-2 gap-3">
              {([
                ['??????',        viewTrip.factories?.name ?? '—'],
                ['???????',       viewTrip.factories?.region ?? '—'],
                ['????? ??????',  viewTrip.trip_date ? format(new Date(viewTrip.trip_date), 'dd/MM/yyyy') : '—'],
                ['??? ???????',   viewTrip.coupon_number ?? '—'],
                ['??? ?????',     viewTrip.waste_type === 'liquid' ? '?? ????' : viewTrip.waste_type === 'solid' ? '?? ???' : '—'],
                ['?????',         viewTrip.volume_m3 != null ? `${viewTrip.volume_m3} ?³` : '—'],
                ['???????',       viewTrip.distance_km != null ? `${viewTrip.distance_km} ??` : '—'],
                ['???? ???????',  viewTrip.dump_site === 'central_press' ? '???? ?????' : viewTrip.dump_site === 'municipal_dump' ? '??? ????' : viewTrip.dump_site ?? '—'],
                ['????? ?????',   viewTrip.transfer_zone ?? '—'],
                ['??????',        viewTrip.driver_name ?? '—'],
                ['??? ???????',   viewTrip.vehicle_type === 'tank' ? '?? ?????' : viewTrip.vehicle_type === 'truck' ? '?? ?????' : '—'],
                ['???? ?????',    viewTrip.payment_status === 'paid' ? '? ?????' : '? ???'],
                ['???? ????????', APPROVAL_LABELS[viewTrip.approval_status as ApprovalStatus]?.label ?? '—'],
                ['????? ??????',  viewTrip.trip_cost != null ? `${viewTrip.trip_cost} ?` : '—'],
                ['?????? ??????', viewTrip.factory_contribution != null ? `${viewTrip.factory_contribution} ?` : '—'],
                ['??? ???????',   viewTrip.subsidy_amount != null ? `${viewTrip.subsidy_amount} ?` : '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="bg-slate-50 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-slate-400 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-slate-700">{value}</p>
                </div>
              ))}
            </div>

            {/* ??????? */}
            {viewTrip.notes && (
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] text-slate-400 mb-0.5">???????</p>
                <p className="text-sm text-slate-600">{viewTrip.notes}</p>
              </div>
            )}

            {/* ??? ????? */}
            {viewTrip.approval_status === 'rejected' && viewTrip.rejection_note && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <p className="text-[10px] text-red-400 mb-0.5">??? ?????</p>
                <p className="text-sm text-red-700 font-medium">{viewTrip.rejection_note}</p>
              </div>
            )}

            <Button variant="ghost" className="w-full" onClick={() => setViewTrip(null)}>?????</Button>
          </div>
        </Modal>
      )}

      {/* -- Edit Modal -- */}
      {editTrip && (
        <Modal
          open={!!editTrip}
          onClose={() => setEditTrip(null)}
          title={`${canApprove && editTrip.approval_status === 'pending_approval' ? '?????? ???????' : '?????'} ???? — ${editTrip.factories?.name ?? ''}`}
          size={canApprove && editTrip.approval_status === 'pending_approval' ? '2xl' : !canApprovepprove && editTrip.approval_status === 'rejected' ? 'lg' : 'md'}
        >
          {/* ?????? ??? pending: ?????? (?????? + ?????) */}
          {canApprove && editTrip.approval_status === 'pending_approval' ? (
            <div className="flex gap-6" dir="rtl">

              {/* -- ?????? ??????: ??? ???? ???????? -- */}
              <div className="flex-1 space-y-3 min-w-0">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">?????? ??????</p>

                {/* ????? ??? ?????? */}
                {editTrip.trip_cost == null && (() => {
                  const missing: string[] = []
                  if (!editTrip.waste_type)  missing.push('??? ?????')
                  if (!editTrip.volume_m3)   missing.push('????? (?³)')
                  if (!editTrip.distance_km) missing.push('??????? (??)')
                  if (!editTrip.dump_site)   missing.push('???? ???????')
                  return (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 space-y-1">
                      <p className="text-xs font-bold text-amber-800">?? ??? ??????</p>
                      {missing.length > 0
                        ? <ul className="space-y-0.5">{missing.map(m => <li key={m} className="text-xs text-red-600 flex items-center gap-1"><span>?</span>{m}</li>)}</ul>
                        : <p className="text-xs text-amber-700">?? ???? ????? ?????? ?????? ???????? ???????</p>
                      }
                    </div>
                  )
                })()}

                {/* ???? ???????? */}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['??????',        editTrip.factories?.name ?? '—'],
                    ['???????',       editTrip.factories?.region ?? '—'],
                    ['????? ??????',  editTrip.trip_date ? format(new Date(editTrip.trip_date), 'dd/MM/yyyy') : '—'],
                    ['??? ???????',   editTrip.coupon_number ?? '—'],
                    ['??? ?????',     editTrip.waste_type === 'liquid' ? '?? ????' : editTrip.waste_type === 'solid' ? '?? ???' : '—'],
                    ['?????',         editTrip.volume_m3 != null ? `${editTrip.volume_m3} ?³` : '—'],
                    ['???????',       editTrip.distance_km != null ? `${editTrip.distance_km} ??` : '—'],
                    ['???? ???????',  editTrip.dump_site === 'central_press' ? '???? ?????' : editTrip.dump_site === 'municipal_dump' ? '??? ????' : editTrip.dump_site ?? '—'],
                    ['????? ?????',   editTrip.transfer_zone ?? '—'],
                    ['??????',        editTrip.driver_name ?? '—'],
                    ['??? ???????',   editTrip.vehicle_type === 'tank' ? '?? ?????' : editTrip.vehicle_type === 'truck' ? '?? ?????' : '—'],
                    ['???? ?????',    editTrip.payment_status === 'paid' ? '? ?????' : '? ???'],
                    ['????? ??????',  editTrip.trip_cost != null ? `${editTrip.trip_cost} ?` : '—'],
                    ['?????? ??????', editTrip.factory_contribution != null ? `${editTrip.factory_contribution} ?` : '—'],
                    ['??? ???????',   editTrip.subsidy_amount != null ? `${editTrip.subsidy_amount} ?` : '—'],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                      <p className="text-[10px] text-slate-400">{label}</p>
                      <p className="text-xs font-semibold text-slate-700">{value}</p>
                    </div>
                  ))}
                </div>

                {editTrip.notes && (
                  <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                    <p className="text-[10px] text-slate-400">???????</p>
                    <p className="text-xs text-slate-600">{editTrip.notes}</p>
                  </div>
                )}
              </div>

              {/* ???? ????? */}
              <div className="w-px bg-slate-100 self-stretch" />

              {/* -- ?????? ??????: ???? ?????? -- */}
              <div className="w-72 shrink-0 flex flex-col gap-3" dir="rtl">

                {/* ????? ?????? ????? */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {([
                    ['approve', '? ??????', 'text-emerald-700'],
                    ['edit',    '?? ?????',   'text-blue-700'],
                    ['reject',  '? ???',    'text-red-700'],
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

                {/* -- ??? ?????? -- */}
                {reviewMode === 'approve' && (
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1">
                      <p className="text-xs font-bold text-emerald-800">? ?????? ?????</p>
                      <p className="text-[11px] text-emerald-700">???? ?????? ?????? ??? ?? ??? ?? ?????</p>
                    </div>
                    <div className="flex-1" />
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" loading={saving}
                      onClick={async () => { setSaving(true); try { await approveTrip(editTrip.id); showToast('success', '?? ?????? ?????? ?'); setEditTrip(null); load(); loadStats() } catch { showToast('error', '??? ????????') } finally { setSaving(false) } }}>
                      ? ?????? ??????
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setEditTrip(null)}>?????</Button>
                  </div>
                )}

                {/* -- ??? ????? ??????? -- */}
                {reviewMode === 'edit' && (
                  <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto">

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">?????? ??????</p>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">????? ??????</label>
                      <Input type="date" value={editForm.trip_date} onChange={e => setEditForm(f => ({ ...f, trip_date: e.target.value }))} /></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">???? ?????</label>
                      <Select value={editForm.payment_status} onChange={e => setEditForm(f => ({ ...f, payment_status: e.target.value }))}>
                        <option value="credit">? ???</option>
                        <option value="paid">? ?????</option>
                      </Select></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">??? ???????</label>
                      <Input value={editForm.coupon_number} onChange={e => setEditForm(f => ({ ...f, coupon_number: e.target.value }))} placeholder="????: K-001" /></div>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide pt-1">?????? ????????</p>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">??? ?????</label>
                      <Select value={editForm.waste_type} onChange={e => setEditForm(f => ({ ...f, waste_type: e.target.value }))}>
                        <option value="">??? ????</option>
                        <option value="liquid">?? ????</option>
                        <option value="solid">?? ???</option>
                      </Select></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">????? (?³)</label>
                      <Input type="number" placeholder="0.00" value={editForm.volume_m3} onChange={e => setEditForm(f => ({ ...f, volume_m3: e.target.value }))} /></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">??????? (??)</label>
                      <Input type="number" placeholder="????: 5" value={editForm.distance_km} onChange={e => setEditForm(f => ({ ...f, distance_km: e.target.value }))} /></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">???? ???????</label>
                      <Select value={editForm.dump_site} onChange={e => setEditForm(f => ({ ...f, dump_site: e.target.value }))}>
                        <option value="">??? ????</option>
                        <option value="municipal_dump">?? ??? ????</option>
                        <option value="central_press">?? ???? ?????</option>
                      </Select></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">????? ?????</label>
                      <Input value={editForm.transfer_zone} onChange={e => setEditForm(f => ({ ...f, transfer_zone: e.target.value }))} placeholder="????: ???? A" /></div>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide pt-1">?????? ??????</p>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">??? ??????</label>
                      <Input value={editForm.driver_name} onChange={e => setEditForm(f => ({ ...f, driver_name: e.target.value }))} placeholder="??? ??????" /></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">??? ???????</label>
                      <Select value={editForm.vehicle_type} onChange={e => setEditForm(f => ({ ...f, vehicle_type: e.target.value }))}>
                        <option value="">??? ????</option>
                        <option value="tank">?? ?????</option>
                        <option value="truck">?? ?????</option>
                      </Select></div>

                    <div><label className="block text-xs font-medium text-slate-600 mb-1">???????</label>
                      <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="???????..." /></div>

                    {/* -- ?????? ???????? -- */}
                    {pricingPreview === null ? (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                        <p className="text-[11px] text-slate-400 text-center">???? ??? ????? + ????? + ??????? + ?????? ????? ????????</p>
                      </div>
                    ) : pricingPreview.found ? (
                      <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-emerald-800">? ?? ????? ????? ?????? ??????</p>
                        <div className="text-[10px] text-emerald-700 bg-emerald-100 rounded-lg px-2 py-1 font-mono">
                          {pricingPreview.wt === 'liquid' ? '?? ????' : '?? ???'}
                          {' · '}{pricingPreview.vol} ?³
                          {' · '}{pricingPreview.maxDist === 7 ? '=7 ??' : '>7 ??'}
                          {' · '}{pricingPreview.ds === 'central_press' ? '???? ?????' : '??? ????'}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="bg-white rounded-lg px-2 py-1.5 text-center">
                            <p className="text-[9px] text-slate-400">??????? ??????</p>
                            <p className="text-sm font-bold text-slate-800">{pricingPreview.unitPrice} ?</p>
                          </div>
                          <div className="bg-white rounded-lg px-2 py-1.5 text-center">
                            <p className="text-[9px] text-slate-400">?????? ??????</p>
                            <p className="text-sm font-bold text-blue-700">{pricingPreview.contrib} ?</p>
                          </div>
                          <div className="bg-white rounded-lg px-2 py-1.5 text-center">
                            <p className="text-[9px] text-slate-400">??? ???????</p>
                            <p className="text-sm font-bold text-violet-700">{pricingPreview.subsidy} ?</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5 space-y-1">
                        <p className="text-xs font-bold text-amber-800">?? ?? ???? ????? ?????? ??????</p>
                        <p className="text-[10px] text-amber-700 bg-amber-100 rounded px-2 py-1 font-mono">
                          {pricingPreview.wt === 'liquid' ? '?? ????' : '?? ???'}
                          {' · '}{pricingPreview.vol} ?³
                          {' · '}{pricingPreview.maxDist === 7 ? '=7 ??' : '>7 ??'}
                          {' · '}{pricingPreview.ds === 'central_press' ? '???? ?????' : '??? ????'}
                        </p>
                        <p className="text-[10px] text-amber-600">?? ????? ??????? ??? ????? — ??? ??????? ?? ???? ????????? ?????</p>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mt-1">
                      <p className="text-[11px] text-blue-700">?? ???? ??? ????????? ??????? ?????? ????????</p>
                    </div>
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} loading={saving}>
                      ? ??? ???????
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setEditTrip(null)}>?????</Button>
                  </div>
                )}

                {/* -- ??? ????? -- */}
                {reviewMode === 'reject' && (
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                      <p className="text-xs font-bold text-red-700">? ??? ?????? ??????</p>
                      <p className="text-[11px] text-red-600">????? ??? ????? ????? ??????? ????? ????? ??? ?????</p>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">??? ????? <span className="text-red-500">*</span></label>
                      <textarea
                        value={inlineRejectNote}
                        onChange={e => setInlineRejectNote(e.target.value)}
                        rows={5}
                        placeholder="???? ??? ????? ?????..."
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
                      ? ????? ?????
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setEditTrip(null)}>?????</Button>
                  </div>
                )}

              </div>
            </div>

          ) : !canApprove && editTrip.approval_status === 'rejected' ? (
            /* ???? ??????? ???? ???? ?????? — ????? ???? */
            <div className="space-y-3 overflow-y-auto max-h-[75dvh]" dir="rtl">

              {/* ??? ????? */}
              {editTrip.rejection_note && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-red-700 mb-0.5">??? ????? ?? ??????</p>
                  <p className="text-xs text-red-600">{editTrip.rejection_note}</p>
                </div>
              )}

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">?????? ??????</p>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-slate-600 mb-1">????? ??????</label>
                  <Input type="date" value={editForm.trip_date} onChange={e => setEditForm(f => ({ ...f, trip_date: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">???? ?????</label>
                  <Select value={editForm.payment_status} onChange={e => setEditForm(f => ({ ...f, payment_status: e.target.value }))}>
                    <option value="credit">? ???</option>
                    <option value="paid">? ?????</option>
                  </Select></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">??? ???????</label>
                  <Input value={editForm.coupon_number} onChange={e => setEditForm(f => ({ ...f, coupon_number: e.target.value }))} placeholder="????: K-001" /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">??? ??????</label>
                  <Input value={editForm.driver_name} onChange={e => setEditForm(f => ({ ...f, driver_name: e.target.value }))} placeholder="??? ??????" /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">??? ???????</label>
                  <Select value={editForm.vehicle_type} onChange={e => setEditForm(f => ({ ...f, vehicle_type: e.target.value }))}>
                    <option value="">??? ????</option>
                    <option value="tank">?? ?????</option>
                    <option value="truck">?? ?????</option>
                  </Select></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">????? ?????</label>
                  <Input value={editForm.transfer_zone} onChange={e => setEditForm(f => ({ ...f, transfer_zone: e.target.value }))} placeholder="????: ???? A" /></div>
              </div>

              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide pt-1">?????? ????????</p>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-slate-600 mb-1">??? ?????</label>
                  <Select value={editForm.waste_type} onChange={e => setEditForm(f => ({ ...f, waste_type: e.target.value }))}>
                    <option value="">??? ????</option>
                    <option value="liquid">?? ????</option>
                    <option value="solid">?? ???</option>
                  </Select></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">????? (?³)</label>
                  <Input type="number" placeholder="0.00" value={editForm.volume_m3} onChange={e => setEditForm(f => ({ ...f, volume_m3: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">??????? (??)</label>
                  <Input type="number" placeholder="????: 5" value={editForm.distance_km} onChange={e => setEditForm(f => ({ ...f, distance_km: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">???? ???????</label>
                  <Select value={editForm.dump_site} onChange={e => setEditForm(f => ({ ...f, dump_site: e.target.value }))}>
                    <option value="">??? ????</option>
                    <option value="municipal_dump">?? ??? ????</option>
                    <option value="central_press">?? ???? ?????</option>
                  </Select></div>
              </div>

              <div><label className="block text-xs font-medium text-slate-600 mb-1">???????</label>
                <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="???????..." /></div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <p className="text-[11px] text-amber-700">?? ??? ????? ????? ?????? ?????? — ?????? ???????? ??? ????? ?? ?? &quot;??? ????????&quot;</p>
              </div>

              <div className="flex gap-2 pt-1">
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} loading={saving}>?? ??? ?????????</Button>
                <Button variant="ghost" className="flex-1" onClick={() => setEditTrip(null)}>?????</Button>
              </div>
            </div>
          ) : (
            /* ??????? ?????? (draft): modal ???? */
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">????? ??????</label>
                <Input type="date" value={editForm.trip_date} onChange={e => setEditForm(f => ({ ...f, trip_date: e.target.value }))} /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">???? ?????</label>
                <Select value={editForm.payment_status} onChange={e => setEditForm(f => ({ ...f, payment_status: e.target.value }))}>
                  <option value="credit">???</option><option value="paid">?????</option>
                </Select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">??? ?????</label>
                <Select value={editForm.waste_type} onChange={e => setEditForm(f => ({ ...f, waste_type: e.target.value }))}>
                  <option value="">??? ????</option><option value="liquid">?? ????</option><option value="solid">?? ???</option>
                </Select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">????? (?³)</label>
                <Input type="number" placeholder="0.00" value={editForm.volume_m3} onChange={e => setEditForm(f => ({ ...f, volume_m3: e.target.value }))} /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">???????</label>
                <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="???????..." /></div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={handleSave} loading={saving}>??? ?????????</Button>
                <Button variant="ghost" className="flex-1" onClick={() => setEditTrip(null)}>?????</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* -- Reject Modal -- */}
      {rejectTarget && (
        <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title={`??? ???? — ${rejectTarget.factories?.name ?? ''}`}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">??? ????? (????? ????? ???????):</p>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
              rows={3} placeholder="???? ??? ?????..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={handleRejectConfirm} loading={rejecting} disabled={!rejectNote.trim()}>????? ?????</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setRejectTarget(null)}>?????</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* -- Revoke Modal -- */}
      {revokeTarget && (
        <Modal open={!!revokeTarget} onClose={() => setRevokeTarget(null)} title="????? ?????? ??????">
          <div className="space-y-4" dir="rtl">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-1">
              <p className="text-sm font-bold text-orange-800">?? ????? ????? ????????</p>
              <p className="text-xs text-orange-700">????? ???? <span className="font-bold">{revokeTarget.factories?.name}</span> ??? ???? ??????? ???????? ????? ???????? ?? ????? ???????? ??????.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-slate-400">??????</p>
                <p className="font-semibold text-slate-700">{revokeTarget.factories?.name ?? '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-slate-400">????? ??????</p>
                <p className="font-semibold text-slate-700">{revokeTarget.trip_date ? format(new Date(revokeTarget.trip_date), 'dd/MM/yyyy') : '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-slate-400">??? ???????</p>
                <p className="font-semibold text-slate-700">{revokeTarget.coupon_number ?? '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-slate-400">???????</p>
                <p className="font-semibold text-slate-700">{revokeTarget.trip_cost != null ? `${revokeTarget.trip_cost} ?` : '—'}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1 border-2 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={handleRevoke} loading={revoking}>
                <RotateCcw size={14} /> ???? ????? ????????
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setRevokeTarget(null)}>?????</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* -- Delete Modal -- */}
      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="????? ?????">
          <div className="space-y-4">
            <p className="text-slate-600">?? ??? ????? ?? ??? ???? <span className="font-bold text-slate-800">{deleteTarget.factories?.name}</span>?</p>
            <p className="text-xs text-red-500">?? ?? ???? ??????? ?? ??? ???????</p>
            <div className="flex gap-2 pt-2">
              <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleting}>???? ????</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>?????</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* -- New Trip Modal -- */}
      {showNew && (
        <NewTripModal onClose={() => setShowNew(false)} onSuccess={() => { setShowNew(false); load(); loadStats() }} isAdmin={isAdmin} />
      )}

      {/* -- ?????? ??? ???????? -- */}
      {recentOpen && (
        <Modal open={recentOpen} onClose={() => setRecentOpen(false)} title="?????? ??? ??????? ????????" size="2xl">
          <div className="space-y-3" dir="rtl">

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <p className="text-xs text-amber-800">?? ????? ???????? ?????? ?????? ??? ????? <span className="font-bold">??????? ????????</span> — ???? ???????? ????????? ??? ?????.</p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">#</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">??????</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">????? ??????</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">??? ????????</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">???????</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">???????</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">??? ?????</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">?????</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLoading && recentTrips.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-slate-400">???? ???????...</td></tr>
                  ) : recentTrips.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-slate-400">?? ???? ????? ??????</td></tr>
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
                          {t.trip_cost != null ? `${t.trip_cost} ?` : <span className="text-amber-500">??? ??????</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {t.waste_type === 'liquid'
                            ? <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">?? ????</span>
                            : t.waste_type === 'solid'
                            ? <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">?? ???</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => handleRecentRevoke(t.id)}
                            disabled={recentRevoking === t.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 text-[11px] font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                            title="????? ????????">
                            {recentRevoking === t.id
                              ? <span className="text-slate-400">...</span>
                              : <><RotateCcw size={11} /> ????? ????????</>}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ????? ?????? */}
            {recentHasMore && !recentLoading && recentTrips.length > 0 && (
              <button
                onClick={loadMoreRecent}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">
                ????? 20 ???? ?????? ?
              </button>
            )}
            {recentLoading && recentTrips.length > 0 && (
              <p className="text-center text-xs text-slate-400 py-2">???? ???????...</p>
            )}

            <div className="flex justify-end pt-1">
              <Button variant="ghost" onClick={() => setRecentOpen(false)}>?????</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
