'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  getDisbursements,
  createDisbursement,
  recalcDisbursement,
  deleteDisbursement,
  updateDisbursement,
  getSettings,
  submitDisbursement,
  approveDisbursement,
  returnDisbursement,
  getUncoveredTripsInfo,
  getTripsForDisbursement,
  setTripDisbursementExclusion,
} from '@/lib/api'
import type { Disbursement } from '@/lib/supabase/database.types'
import {
  Plus, RefreshCw, Lock, Trash2, RotateCcw, AlertTriangle, CheckCircle,
  Calendar, Banknote, FileText, X, ShieldCheck, Eye,
  Send, ThumbsUp, ThumbsDown, MessageSquare, Clock, CornerDownLeft, Pencil, Zap, TrendingUp,
} from 'lucide-react'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { useAuth } from '@/context/AuthContext'

// ─── أدوات مساعدة ────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₪'
}
function fmtDate(d: string) {
  try { return format(new Date(d), 'dd/MM/yyyy', { locale: arSA }) } catch { return d }
}
function fmtDateTime(d: string) {
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: arSA }) } catch { return d }
}

// ─── ترتيب الحالات ───────────────────────────────────────────
const statusOrder: Record<string, number> = { returned: 0, pending: 1, draft: 2, closed: 3 }

// ─── شارة الحالة ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'closed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Lock size={10} /> مُعتمدة ومقفلة
        </span>
      )
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          بانتظار الاعتماد
        </span>
      )
    case 'returned':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
          <CornerDownLeft size={10} /> مُرجعة للتعديل
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <FileText size={10} /> مسودة
        </span>
      )
  }
}

// ─── مودال تقديم للاعتماد ────────────────────────────────────
function SubmitConfirmModal({
  disb,
  onConfirm,
  onCancel,
  loading,
}: {
  disb: Disbursement
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Send size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">تقديم للاعتماد</h2>
              <p className="text-sm text-slate-500">سيتم إرسال المطالبة لمراجعة المدير</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">الفترة</span>
            <span className="font-semibold">{fmtDate(disb.period_from)} — {fmtDate(disb.period_to)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">صافي الدفعة</span>
            <span className="font-bold text-emerald-700">{fmt(disb.net_payment)}</span>
          </div>
        </div>

        <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
          بعد التقديم، لن تستطيع تعديل المطالبة حتى يراجعها المدير. إذا أُرجعت، يمكنك إعادة تقديمها.
        </p>

        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50">
            إلغاء
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            تقديم للاعتماد
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── مودال تعديل المطالبة ───────────────────────────────────
function EditDisbursementModal({
  disb,
  onSave,
  onCancel,
  loading,
}: {
  disb: Disbursement
  onSave: (fields: { period_from: string; period_to: string; notes: string; retention_pct: number; retention_amount_override?: number }) => void
  onCancel: () => void
  loading: boolean
}) {
  const [from, setFrom] = useState(disb.period_from)
  const [to, setTo] = useState(disb.period_to)
  const [notes, setNotes] = useState(disb.notes ?? '')
  const [retentionPct, setRetentionPct] = useState(String(disb.retention_pct ?? 10))
  const [retentionAmountManual, setRetentionAmountManual] = useState('')
  const [manualMode, setManualMode] = useState(false)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!from || !to) return
    if (from > to) { alert('تاريخ البداية يجب أن يكون قبل تاريخ النهاية'); return }
    const pct = parseFloat(retentionPct)
    if (isNaN(pct) || pct < 0 || pct > 100) { alert('نسبة الحجز يجب أن تكون بين 0 و 100'); return }
    const override = manualMode && retentionAmountManual !== '' ? parseFloat(retentionAmountManual) : undefined
    onSave({ period_from: from, period_to: to, notes, retention_pct: pct, retention_amount_override: override })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Pencil size={20} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">تعديل المطالبة</h2>
              <p className="text-sm text-slate-500">سيتم إعادة حساب المبالغ تلقائياً</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {disb.status === 'closed' && (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 text-sm">
            <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-800">⚠️ مطالبة مغلقة ومُعتمدة رسمياً</p>
              <p className="text-red-700 text-xs mt-0.5">تعديلها سيغيّر البيانات المالية المعتمدة. تأكد من ضرورة هذا التعديل قبل المتابعة.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          {/* التواريخ */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">من تاريخ</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} required
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">إلى تاريخ</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} required
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>

          {/* حجز التأمينات */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-orange-800 flex items-center gap-1.5">
                <ShieldCheck size={14} /> حجز التأمينات
              </label>
              <button type="button"
                onClick={() => { setManualMode(!manualMode); setRetentionAmountManual('') }}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  manualMode ? 'bg-orange-200 text-orange-800 border-orange-300' : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-100'
                }`}>
                {manualMode ? '● مبلغ يدوي' : 'إدخال مبلغ يدوياً'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-orange-700">النسبة (%)</label>
                <input type="number" min={0} max={100} step={0.5}
                  value={retentionPct} onChange={e => setRetentionPct(e.target.value)}
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" dir="ltr" />
              </div>
              {manualMode && (
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-orange-700">مبلغ الحجز (₪) — يدوي</label>
                  <input type="number" min={0} step={0.01}
                    value={retentionAmountManual} onChange={e => setRetentionAmountManual(e.target.value)}
                    placeholder="سيحسب تلقائياً..."
                    className="w-full px-3 py-2 border border-orange-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" dir="ltr" />
                </div>
              )}
            </div>
          </div>

          {/* ملاحظات */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">ملاحظات (اختياري)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel} disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50">
              إلغاء
            </button>
            <button type="submit" disabled={loading || !from || !to}
              className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Pencil size={14} />}
              حفظ التعديلات
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── مودال مراجعة الادمن ─────────────────────────────────────
function AdminReviewModal({
  disb,
  onApprove,
  onReturn,
  onCancel,
  loading,
}: {
  disb: Disbursement
  onApprove: () => void
  onReturn: (notes: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [returnNotes, setReturnNotes] = useState('')
  const [mode, setMode] = useState<'choose' | 'return'>('choose')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={20} className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">مراجعة المطالبة</h2>
              <p className="text-sm text-slate-500">اعتمد أو أرجع للتعديل</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ملخص */}
        <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">الفترة</span>
            <span className="font-semibold">{fmtDate(disb.period_from)} — {fmtDate(disb.period_to)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">عدد النقلات</span>
            <span className="font-semibold">{disb.trips_count.toLocaleString('ar-SA')} نقلة</span>
          </div>
          <div className="flex justify-between text-violet-700">
            <span>بلدية 14%</span>
            <span className="font-semibold">+ {fmt(disb.municipality_amount)}</span>
          </div>
          <div className="flex justify-between text-orange-700">
            <span>حجز {disb.retention_pct}%</span>
            <span className="font-semibold">− {fmt(disb.retention_amount)}</span>
          </div>
          <div className="border-t border-slate-200 pt-2 flex justify-between">
            <span className="font-semibold text-emerald-800">صافي الدفعة</span>
            <span className="font-bold text-emerald-700">{fmt(disb.net_payment)}</span>
          </div>
        </div>

        {mode === 'choose' ? (
          <div className="flex gap-3">
            <button onClick={onCancel} disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50">
              إلغاء
            </button>
            <button onClick={() => setMode('return')} disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <ThumbsDown size={14} /> إرجاع للتعديل
            </button>
            <button onClick={onApprove} disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
              اعتماد
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                <MessageSquare size={14} /> سبب الإرجاع (مطلوب)
              </label>
              <textarea
                value={returnNotes}
                onChange={e => setReturnNotes(e.target.value)}
                placeholder="اكتب ملاحظاتك وسبب إرجاع المطالبة..."
                rows={3}
                className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setMode('choose')} disabled={loading}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50">
                رجوع
              </button>
              <button
                onClick={() => { if (returnNotes.trim()) onReturn(returnNotes) }}
                disabled={loading || !returnNotes.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <CornerDownLeft size={14} />}
                إرجاع المطالبة
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── مودال دفعة جديدة (خطوتان) ──────────────────────────────
function NewDisbursementModal({
  onSubmit,
  onCancel,
  loading,
  defaultRetentionPct,
  suggestedFrom,
  suggestedTo,
  uncoveredCount,
}: {
  onSubmit: (from: string, to: string, notes: string, retentionPct: number, retentionAmountOverride?: number, carryoverTripIds?: string[]) => void
  onCancel: () => void
  loading: boolean
  defaultRetentionPct: number
  suggestedFrom?: string
  suggestedTo?: string
  uncoveredCount?: number
}) {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 7) + '-01'
  const [step, setStep] = useState<1 | 2>(1)
  const [from, setFrom] = useState(suggestedFrom ?? firstOfMonth)
  const [to, setTo] = useState(suggestedTo ?? today)
  const [notes, setNotes] = useState('')
  const [retentionPct, setRetentionPct] = useState(String(defaultRetentionPct))
  const [retentionAmountManual, setRetentionAmountManual] = useState('')
  const [manualMode, setManualMode] = useState(false)

  // الخطوة 2: النقلات
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [periodTrips, setPeriodTrips] = useState<any[]>([])
  const [tripsLoading, setTripsLoading] = useState(false)
  // النقلات المستثناة — Set من IDs
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [toggling, setToggling] = useState<string | null>(null)

  async function goToStep2() {
    if (!from || !to || from > to) { alert('تاريخ البداية يجب أن يكون قبل تاريخ النهاية'); return }
    const pct = parseFloat(retentionPct)
    if (isNaN(pct) || pct < 0 || pct > 100) { alert('نسبة الحجز يجب أن تكون بين 0 و 100'); return }
    setTripsLoading(true)
    try {
      const data = await getTripsForDisbursement(from, to, 'wizard')
      // النقلات المستثناة داخل الفترة (ليست محمولة)
      const alreadyExcluded = new Set<string>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.filter((t: any) => t.disbursement_excluded && !t.is_carryover).map((t: any) => t.id as string)
      )
      setPeriodTrips(data)
      setExcluded(alreadyExcluded)
      setStep(2)
    } catch { alert('فشل تحميل النقلات') }
    finally { setTripsLoading(false) }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function toggleExclude(trip: any, currentlyExcluded: boolean) {
    setToggling(trip.id)
    try {
      const newExcluded = !currentlyExcluded
      const periodTo = newExcluded
        ? to                        // عند الاستثناء: سجّل نهاية الفترة الحالية
        : trip.is_carryover
          ? to                      // نقلة محمولة تُدرج: اربطها بالفترة الحالية
          : null                    // نقلة عادية تُعاد: امسح علامة الاستثناء
      await setTripDisbursementExclusion(trip.id, newExcluded, periodTo)
      setExcluded(prev => {
        const next = new Set(prev)
        if (newExcluded) next.add(trip.id)
        else next.delete(trip.id)
        return next
      })
    } catch { alert('فشل تحديث حالة النقلة') }
    finally { setToggling(null) }
  }

  function handleSubmit() {
    const pct = parseFloat(retentionPct)
    const override = manualMode && retentionAmountManual !== ''
      ? parseFloat(retentionAmountManual)
      : undefined
    // معرّفات النقلات المحمولة التي لم يستثنِها المستخدم (يجب إدراجها)
    const carryoverTripIds = periodTrips
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((t: any) => t.is_carryover && !excluded.has(t.id))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((t: any) => t.id as string)
    onSubmit(from, to, notes, pct, override, carryoverTripIds.length > 0 ? carryoverTripIds : undefined)
  }

  const includedCount = periodTrips.filter(t => !excluded.has(t.id)).length
  const excludedCount = excluded.size
  const fmt = (n: number) => n.toLocaleString('ar-SA')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full p-6 space-y-5 ${
        step === 2 ? 'max-w-2xl' : 'max-w-lg'
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Plus size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">مطالبة مالية جديدة</h2>
              <p className="text-sm text-slate-500">
                {step === 1 ? 'الخطوة 1 من 2 — حدد الفترة ونسبة الحجز' : 'الخطوة 2 من 2 — راجع النقلات وحدد المستثناة'}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          <div className={`flex-1 h-1.5 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-slate-200'}`} />
          <div className={`flex-1 h-1.5 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-slate-200'}`} />
        </div>

        {/* ══ STEP 1 ══ */}
        {step === 1 && (
          <div className="space-y-4">
            {suggestedFrom && uncoveredCount && uncoveredCount > 0 && (
              <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-3 text-sm">
                <Zap size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-blue-800">{uncoveredCount.toLocaleString('ar-SA')} نقلة غير مشمولة</p>
                  <p className="text-blue-600 text-xs mt-0.5">أقدم نقلة بتاريخ {fmtDate(suggestedFrom)} — تم تعبئة الفترة تلقائياً</p>
                </div>
                <button type="button" onClick={() => { setFrom(suggestedFrom); setTo(suggestedTo ?? today) }}
                  className="text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0">
                  تطبيق
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">من تاريخ</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">إلى تاريخ</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-orange-800 flex items-center gap-1.5">
                  <ShieldCheck size={14} /> حجز التأمينات
                </label>
                <button type="button"
                  onClick={() => { setManualMode(!manualMode); setRetentionAmountManual('') }}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    manualMode ? 'bg-orange-200 text-orange-800 border-orange-300' : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-100'
                  }`}>
                  {manualMode ? '● مبلغ يدوي' : 'إدخال مبلغ يدوياً'}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-orange-700">النسبة (%)</label>
                  <input type="number" min={0} max={100} step={0.5} value={retentionPct}
                    onChange={e => setRetentionPct(e.target.value)}
                    className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" dir="ltr" />
                </div>
                {manualMode && (
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-orange-700">مبلغ الحجز (₪) — يدوي</label>
                    <input type="number" min={0} step={0.01} value={retentionAmountManual}
                      onChange={e => setRetentionAmountManual(e.target.value)}
                      placeholder="سيحسب تلقائياً..."
                      className="w-full px-3 py-2 border border-orange-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" dir="ltr" />
                  </div>
                )}
              </div>
              <p className="text-xs text-orange-600">
                سيتم حجز {retentionPct || 0}%
                {manualMode && retentionAmountManual ? ` (مبلغ يدوي: ${parseFloat(retentionAmountManual).toLocaleString()} ₪)` : ''}
                {' '}من مبلغ دعم التمويل بعد حساب النقلات.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">ملاحظات (اختياري)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="أي ملاحظات إضافية..." rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onCancel}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors">
                إلغاء
              </button>
              <button type="button" onClick={goToStep2} disabled={tripsLoading || !from || !to}
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {tripsLoading ? <RefreshCw size={14} className="animate-spin" /> : null}
                التالي — مراجعة النقلات
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP 2 ══ */}
        {step === 2 && (
          <div className="space-y-4">
            {/* ملخص الفترة */}
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm">
              <Calendar size={15} className="text-slate-500 flex-shrink-0" />
              <span className="text-slate-600">الفترة: <strong className="text-slate-800">{fmtDate(from)} — {fmtDate(to)}</strong></span>
              <span className="mr-auto text-slate-500">
                <span className="font-bold text-emerald-700">{fmt(includedCount)}</span> نقلة مشمولة
                {excludedCount > 0 && <span className="mr-2 text-amber-600 font-bold">· {fmt(excludedCount)} مستثناة</span>}
              </span>
            </div>

            {/* بانر النقلات المحمولة */}
            {(() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const carryoverCount = periodTrips.filter((t: any) => t.is_carryover && !excluded.has(t.id)).length
              if (carryoverCount === 0) return null
              return (
                <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3.5 py-2.5 text-xs text-orange-800">
                  <span className="flex-shrink-0 mt-0.5">📦</span>
                  <span>
                    يوجد <strong>{fmt(carryoverCount)} نقلة محمولة</strong> من فترات سابقة — ستُشمل تلقائياً في هذه المطالبة. يمكنك استثناءها إن أردت.
                  </span>
                </div>
              )
            })()}

            {/* تعليمات */}
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs text-amber-800">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              <span>النقلات المستثناة <strong>لن تُحسب</strong> في هذه المطالبة وستبقى متاحة للمطالبات القادمة. التغييرات تُحفظ فوراً.</span>
            </div>

            {/* قائمة النقلات */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500">
                <div className="col-span-1 text-center">شمل</div>
                <div className="col-span-2">المصنع</div>
                <div className="col-span-2 text-center">التاريخ</div>
                <div className="col-span-2 text-center">الكوبون</div>
                <div className="col-span-2 text-center">النوع</div>
                <div className="col-span-2 text-center">التكلفة</div>
                <div className="col-span-1 text-center">الحالة</div>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {periodTrips.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-sm">لا توجد نقلات في هذه الفترة</div>
                )}
                {periodTrips.map((t) => {
                  const isExcluded = excluded.has(t.id)
                  const isToggling = toggling === t.id
                  return (
                    <div key={t.id}
                      className={`px-4 py-2.5 grid grid-cols-12 gap-2 items-center text-sm transition-colors ${
                        isExcluded ? 'bg-amber-50/60 opacity-60' : t.is_carryover ? 'bg-orange-50/40 hover:bg-orange-50' : 'hover:bg-slate-50'
                      }`}>
                      <div className="col-span-1 flex justify-center">
                        <button
                          onClick={() => toggleExclude(t, isExcluded)}
                          disabled={isToggling}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            isToggling ? 'opacity-50 cursor-wait' :
                            isExcluded
                              ? 'border-amber-400 bg-amber-50 hover:bg-amber-100'
                              : 'border-emerald-500 bg-emerald-500 hover:bg-emerald-600'
                          }`}
                          title={isExcluded ? 'انقر لإعادة الإدراج' : 'انقر للاستثناء'}
                        >
                          {!isExcluded && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="col-span-2 font-medium text-slate-700 truncate text-xs">
                        {t.is_carryover && <span className="text-orange-500 mr-1" title="محمول من فترة سابقة">📦</span>}
                        {t.factories?.name ?? '—'}
                      </div>
                      <div className="col-span-2 text-center text-xs text-slate-500">{t.trip_date ? fmtDate(t.trip_date) : '—'}</div>
                      <div className="col-span-2 text-center text-xs font-mono text-slate-600">{t.coupon_number ?? <span className="text-slate-300">—</span>}</div>
                      <div className="col-span-2 text-center">
                        {t.waste_type === 'liquid'
                          ? <span className="bg-blue-50 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">💧 سائل</span>
                          : t.waste_type === 'solid'
                          ? <span className="bg-amber-50 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">🪨 جاف</span>
                          : <span className="text-slate-400 text-xs">—</span>}
                      </div>
                      <div className="col-span-2 text-center text-xs font-mono text-slate-700">{t.trip_cost ? `${Number(t.trip_cost).toLocaleString()} ₪` : '—'}</div>
                      <div className="col-span-1 text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          t.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>{t.payment_status === 'paid' ? '✓' : 'ذمة'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors">
                رجوع
              </button>
              <button type="button" onClick={handleSubmit} disabled={loading || includedCount === 0}
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                إنشاء مطالبة ({fmt(includedCount)} نقلة)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── بطاقة دفعة ──────────────────────────────────────────────
function DisbursementCard({
  disb,
  onRecalc,
  onSubmit,
  onReview,
  onEdit,
  onDelete,
  onViewTrips,
  isAdmin,
  isManager,
}: {
  disb: Disbursement
  onRecalc: (id: string) => void
  onSubmit: (disb: Disbursement) => void
  onReview: (disb: Disbursement) => void
  onEdit: (disb: Disbursement) => void
  onDelete: (id: string, isClosed?: boolean) => void
  onViewTrips: (disb: Disbursement) => void
  isAdmin: boolean
  isManager: boolean
}) {
  const canAct = isAdmin || isManager

  const cardClass: Record<string, string> = {
    closed: 'border-emerald-200 bg-emerald-50/20',
    pending: 'border-blue-200 bg-blue-50/20',
    returned: 'border-red-200 bg-red-50/20',
    draft: 'border-slate-200',
  }

  const iconMap: Record<string, React.ReactNode> = {
    closed: <Lock size={18} className="text-emerald-700" />,
    pending: <Clock size={18} className="text-blue-600" />,
    returned: <CornerDownLeft size={18} className="text-red-600" />,
    draft: <FileText size={18} className="text-amber-700" />,
  }

  const iconBgMap: Record<string, string> = {
    closed: 'bg-emerald-100',
    pending: 'bg-blue-100',
    returned: 'bg-red-100',
    draft: 'bg-amber-100',
  }

  return (
    <div className={`bg-white rounded-2xl border p-5 space-y-4 hover:shadow-md transition-shadow ${cardClass[disb.status] ?? 'border-slate-200'}`}>
      {/* رأس البطاقة */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBgMap[disb.status] ?? 'bg-amber-100'}`}>
            {iconMap[disb.status] ?? <FileText size={18} className="text-amber-700" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 text-sm">
                {fmtDate(disb.period_from)} — {fmtDate(disb.period_to)}
              </span>
              <StatusBadge status={disb.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Calendar size={11} />
              أُنشئت {fmtDateTime(disb.created_at)}
              {disb.status === 'closed' && disb.closed_at && (
                <> · اعتُمدت {fmtDateTime(disb.closed_at)}</>
              )}
              {disb.status === 'pending' && disb.submitted_at && (
                <> · قُدِّمت {fmtDateTime(disb.submitted_at)}</>
              )}
            </p>
          </div>
        </div>

        {/* أزرار الإجراءات */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* زر عرض النقلات — دائماً ظاهر */}
          <button onClick={() => onViewTrips(disb)} title="عرض نقلات المطالبة"
            className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors">
            <Eye size={15} />
          </button>
          {(disb.status === 'draft' || disb.status === 'returned') && canAct && (
            <>
              <button onClick={() => onRecalc(disb.id)} title="إعادة الحساب"
                className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <RotateCcw size={15} />
              </button>
              <button onClick={() => onEdit(disb)} title="تعديل"
                className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                <Pencil size={15} />
              </button>
              <button onClick={() => onSubmit(disb)} title="تقديم للاعتماد"
                className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Send size={15} />
              </button>
              {(isAdmin || isManager) && (
                <button onClick={() => onDelete(disb.id)} title="حذف"
                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}

          {disb.status === 'pending' && isAdmin && (
            <button onClick={() => onReview(disb)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors">
              <ShieldCheck size={13} /> مراجعة
            </button>
          )}

          {disb.status === 'pending' && !isAdmin && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
              في انتظار الاعتماد
            </span>
          )}

          {disb.status === 'closed' && isAdmin && (
            <>
              <button onClick={() => onEdit(disb)} title="تعديل مطالبة مغلقة"
                className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                <Pencil size={15} />
              </button>
              <button onClick={() => onDelete(disb.id, true)} title="حذف مطالبة مغلقة"
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ملاحظة الإرجاع */}
      {disb.status === 'returned' && disb.review_notes && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-800">
          <MessageSquare size={14} className="flex-shrink-0 mt-0.5 text-red-500" />
          <div>
            <p className="font-semibold text-xs text-red-600 mb-0.5">ملاحظة الإرجاع:</p>
            <p>{disb.review_notes}</p>
          </div>
        </div>
      )}

      {/* ملاحظات */}
      {disb.notes && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
          {disb.notes}
        </p>
      )}

      {/* أرقام */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500 mb-1">عدد النقلات</p>
          <p className="text-lg font-bold text-slate-800">{disb.trips_count.toLocaleString('ar-SA')}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500 mb-1">إجمالي التكلفة</p>
          <p className="text-sm font-bold text-slate-800">{fmt(disb.total_trips_cost)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center col-span-2">
          <p className="text-[11px] text-emerald-600 mb-1 font-medium">إيرادات المصانع 🏭</p>
          {/* شريط محصّل / غير محصّل */}
          {(() => {
            const total = Number(disb.total_factory_share)
            const collected = Number(disb.factory_share_collected)
            const uncollected = total - collected
            const pct = total > 0 ? Math.round(collected / total * 100) : 0
            return (
              <>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-2 mx-1">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="text-center">
                    <p className="text-[10px] text-emerald-500">✅ محصّل</p>
                    <p className="text-sm font-bold text-emerald-700">{fmt(collected)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-amber-500">⏳ ذمة</p>
                    <p className="text-sm font-bold text-amber-600">{fmt(uncollected)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-emerald-400 mt-1">إجمالي: {fmt(total)} — رصيد مستقل</p>
              </>
            )
          })()}
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500 mb-1">المطالبة من التمويل</p>
          <p className="text-sm font-bold text-blue-700">{fmt(disb.disbursed_amount)}</p>
          <p className="text-[10px] text-blue-400 mt-0.5">= إجمالي التكلفة</p>
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
          <p className="text-[11px] text-violet-600 mb-1 flex items-center justify-center gap-0.5">
            <Banknote size={10} /> بلدية 14%
          </p>
          <p className="text-sm font-bold text-violet-700">+ {fmt(disb.municipality_amount)}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
          <p className="text-[11px] text-orange-600 mb-1 flex items-center justify-center gap-0.5">
            <ShieldCheck size={10} /> حجز {disb.retention_pct}%
          </p>
          <p className="text-sm font-bold text-orange-700">− {fmt(disb.retention_amount)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center sm:col-span-2">
          <p className="text-[11px] text-emerald-700 mb-1 font-semibold">صافي الدفعة</p>
          <p className="text-base font-bold text-emerald-700">{fmt(disb.net_payment)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── الصفحة الرئيسية ─────────────────────────────────────────
export default function DisbursementsPage() {
  const { isAdmin, isManager } = useAuth()

  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [submitTarget, setSubmitTarget] = useState<Disbursement | null>(null)
  const [reviewTarget, setReviewTarget] = useState<Disbursement | null>(null)
  const [editTarget, setEditTarget] = useState<Disbursement | null>(null)
  const [viewTripsTarget, setViewTripsTarget] = useState<Disbursement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewTripsList, setViewTripsList]   = useState<any[]>([])
  const [viewTripsLoading, setViewTripsLoading] = useState(false)
  const [viewTripsSearch, setViewTripsSearch]   = useState('')
  const [defaultRetentionPct, setDefaultRetentionPct] = useState(10)
  const [uncoveredInfo, setUncoveredInfo] = useState<{ earliestDate: string | null; latestDate: string | null; count: number } | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [data, settingsData, uncovered] = await Promise.all([getDisbursements(), getSettings(), getUncoveredTripsInfo()])
      setDisbursements(data)
      setUncoveredInfo(uncovered)
      const retPct = settingsData.find(s => s.key === 'retention_pct')?.value
      if (retPct) setDefaultRetentionPct(parseFloat(retPct))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ أثناء التحميل')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function showSuccessMsg(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 4000)
  }

  async function handleCreate(from: string, to: string, notes: string, retentionPct: number, retentionAmountOverride?: number, carryoverTripIds?: string[]) {
    try {
      setActionLoading(true)
      setError(null)
      await createDisbursement(from, to, notes || undefined, retentionPct, retentionAmountOverride, carryoverTripIds)
      setShowNew(false)
      showSuccessMsg('تم إنشاء المطالبة (مسودة) بنجاح')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRecalc(id: string) {
    try {
      setActionLoading(true)
      setError(null)
      await recalcDisbursement(id)
      showSuccessMsg('تم إعادة الحساب بنجاح')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUpdate(fields: { period_from: string; period_to: string; notes: string; retention_pct: number; retention_amount_override?: number }) {
    if (!editTarget) return
    try {
      setActionLoading(true)
      setError(null)
      await updateDisbursement(editTarget.id, fields)
      setEditTarget(null)
      showSuccessMsg('تم تعديل المطالبة بنجاح ✏️')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleConfirmSubmit() {
    if (!submitTarget) return
    try {
      setActionLoading(true)
      setError(null)
      await submitDisbursement(submitTarget.id)
      setSubmitTarget(null)
      showSuccessMsg('تم تقديم المطالبة للاعتماد ✈️')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleApprove() {
    if (!reviewTarget) return
    try {
      setActionLoading(true)
      setError(null)
      await approveDisbursement(reviewTarget.id)
      setReviewTarget(null)
      showSuccessMsg('تم اعتماد المطالبة المالية بنجاح ✅')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReturn(notes: string) {
    if (!reviewTarget) return
    try {
      setActionLoading(true)
      setError(null)
      await returnDisbursement(reviewTarget.id, notes)
      setReviewTarget(null)
      showSuccessMsg('تم إرجاع المطالبة للتعديل')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete(id: string, isClosed = false) {
    if (isClosed) {
      const confirmed = confirm(
        '⚠️ تحذير خطير\n\n'
        + 'هذه المطالبة مغلقة ومُعتمدة رسمياً.\n'
        + 'حذفها سيحذف جميع بياناتها بشكل نهائي ولا يمكن التراجع.\n\n'
        + 'اكتب كلمة حذف للتأكيد:'
      )
      if (!confirmed) return
      const word = prompt('اكتب كلمة "حذف" للتأكيد:')
      if (word?.trim() !== 'حذف') { alert('تم إلغاء العملية'); return }
    } else {
      if (!confirm('هل أنت متأكد من حذف هذه المطالبة؟')) return
    }
    try {
      setActionLoading(true)
      setError(null)
      await deleteDisbursement(id, isClosed)
      showSuccessMsg('تم حذف المطالبة')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setActionLoading(false)
    }
  }

  // ── ترتيب وتصنيف ──
  const sorted = [...disbursements].sort((a, b) =>
    (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
  )

  const closed   = disbursements.filter(d => d.status === 'closed')
  const pending  = disbursements.filter(d => d.status === 'pending')
  const drafts   = disbursements.filter(d => d.status === 'draft')
  const returned = disbursements.filter(d => d.status === 'returned')

  const totalNetPaid      = closed.reduce((s, d) => s + Number(d.net_payment), 0)
  const totalRetained     = closed.reduce((s, d) => s + Number(d.retention_amount), 0)
  const totalMunicipality = closed.reduce((s, d) => s + Number(d.municipality_amount), 0)

  return (
    <div className="space-y-6" dir="rtl">
      {/* رأس الصفحة */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">المطالبات المالية</h1>
          <p className="text-sm text-slate-500 mt-1">إدارة صرف الدفعات والتمويل الحكومي للفترات الزمنية المختلفة</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading || actionLoading}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {(isAdmin || isManager) && (
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <Plus size={16} /> مطالبة جديدة
            </button>
          )}
        </div>
      </div>

      {/* رسائل */}
      {success && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm">
          <CheckCircle size={16} className="flex-shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={16} className="flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="mr-auto p-0.5 hover:bg-red-100 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* بانر النقلات غير المشمولة */}
      {!loading && (isAdmin || isManager) && uncoveredInfo && uncoveredInfo.count > 0 && (
        <div className="flex items-center gap-3 bg-gradient-to-l from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl px-4 py-3.5">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <TrendingUp size={18} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-blue-900 text-sm">
              {uncoveredInfo.count.toLocaleString('ar-SA')} نقلة غير مشمولة بأي مطالبة
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              من {fmtDate(uncoveredInfo.earliestDate!)} حتى {fmtDate(uncoveredInfo.latestDate!)}
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors flex-shrink-0"
          >
            <Zap size={13} /> إنشاء مطالبة لهذه الفترة
          </button>
        </div>
      )}

      {/* بطاقات الملخص */}
      {!loading && disbursements.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Banknote size={18} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500">صافي المصروف</p>
              <p className="text-lg font-bold text-slate-900">{fmt(totalNetPaid)}</p>
            </div>
          </div>
          <div className="bg-white border border-violet-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Banknote size={18} className="text-violet-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500">بلدية الخليل (14%)</p>
              <p className="text-lg font-bold text-violet-700">{fmt(totalMunicipality)}</p>
            </div>
          </div>
          <div className="bg-white border border-orange-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={18} className="text-orange-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500">إجمالي المحجوز</p>
              <p className="text-lg font-bold text-orange-700">{fmt(totalRetained)}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Lock size={18} className="text-slate-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500">مُعتمدة / انتظار / مسودة</p>
              <p className="text-base font-bold text-slate-900">
                {closed.length}
                {pending.length > 0 && <span className="text-blue-600"> / {pending.length}</span>}
                {' '}/ {drafts.length + returned.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* قائمة */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 animate-pulse">
              <div className="flex gap-3 mb-4">
                <div className="w-10 h-10 bg-slate-100 rounded-xl" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3.5 bg-slate-100 rounded w-1/2" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[1,2,3,4].map(j => <div key={j} className="h-14 bg-slate-50 rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      ) : disbursements.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Banknote size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-700 font-semibold mb-1">لا توجد مطالبات مالية بعد</p>
          <p className="text-sm text-slate-400 mb-5">أنشئ مطالبة جديدة لتتبع صرف الدفعات والتمويل</p>
          {(isAdmin || isManager) && (
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <Plus size={15} /> إنشاء أول مطالبة
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map(disb => (
            <DisbursementCard
              key={disb.id}
              disb={disb}
              onRecalc={handleRecalc}
              onSubmit={setSubmitTarget}
              onReview={setReviewTarget}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onViewTrips={async (disb) => {
                setViewTripsTarget(disb)
                setViewTripsList([])
                setViewTripsSearch('')
                setViewTripsLoading(true)
                try {
                  const rows = await getTripsForDisbursement(disb.period_from, disb.period_to)
                  setViewTripsList(rows)
                } catch { /* silent */ }
                finally { setViewTripsLoading(false) }
              }}
              isAdmin={isAdmin}
              isManager={isManager}
            />
          ))}
        </div>
      )}

      {/* مودالات */}
      {showNew && (
        <NewDisbursementModal
          onSubmit={handleCreate}
          onCancel={() => setShowNew(false)}
          loading={actionLoading}
          defaultRetentionPct={defaultRetentionPct}
          suggestedFrom={uncoveredInfo?.earliestDate ?? undefined}
          suggestedTo={uncoveredInfo?.latestDate ?? undefined}
          uncoveredCount={uncoveredInfo?.count}
        />
      )}
      {editTarget && (
        <EditDisbursementModal
          disb={editTarget}
          onSave={handleUpdate}
          onCancel={() => setEditTarget(null)}
          loading={actionLoading}
        />
      )}
      {submitTarget && (
        <SubmitConfirmModal
          disb={submitTarget}
          onConfirm={handleConfirmSubmit}
          onCancel={() => setSubmitTarget(null)}
          loading={actionLoading}
        />
      )}
      {reviewTarget && (
        <AdminReviewModal
          disb={reviewTarget}
          onApprove={handleApprove}
          onReturn={handleReturn}
          onCancel={() => setReviewTarget(null)}
          loading={actionLoading}
        />
      )}

      {/* ── Modal: نقلات المطالبة ── */}
      {viewTripsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setViewTripsTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90dvh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900">📋 نقلات المطالبة</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  الفترة: {fmtDate(viewTripsTarget.period_from)} — {fmtDate(viewTripsTarget.period_to)}
                </p>
                {!viewTripsLoading && viewTripsList.length > 0 && (() => {
                  const includedTrips = viewTripsList.filter(t => !t.disbursement_excluded)
                  const excludedTrips = viewTripsList.filter(t => t.disbursement_excluded)
                  return (
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                        إجمالي الفترة: <strong>{viewTripsList.length}</strong>
                      </span>
                      <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                        ✅ مشمولة: <strong>{includedTrips.length}</strong>
                      </span>
                      {excludedTrips.length > 0 && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                          ⬜ مستثناة: <strong>{excludedTrips.length}</strong>
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>
              <button onClick={() => setViewTripsTarget(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* شريط البحث */}
            <div className="px-5 py-2.5 border-b border-slate-100 flex-shrink-0">
              <input
                type="text"
                value={viewTripsSearch}
                onChange={e => setViewTripsSearch(e.target.value)}
                placeholder="🔍 بحث برقم الكوبون أو اسم المصنع..."
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>

            {/* Body */}
            <div className="overflow-auto flex-1 px-5 py-4">
              {viewTripsLoading ? (
                <p className="text-center text-slate-400 py-10">جارٍّ التحميل...</p>
              ) : viewTripsList.length === 0 ? (
                <p className="text-center text-slate-400 py-10">لا توجد نقلات في هذه الفترة</p>
              ) : (() => {
                const filtered = viewTripsSearch.trim()
                  ? viewTripsList.filter(t =>
                      (t.coupon_number ?? '').toLowerCase().includes(viewTripsSearch.toLowerCase()) ||
                      (t.factories?.name ?? '').toLowerCase().includes(viewTripsSearch.toLowerCase())
                    )
                  : viewTripsList
                if (filtered.length === 0) return (
                  <p className="text-center text-slate-400 py-10">لا توجد نتائج للبحث</p>
                )
                return (
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">#</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">رقم الكوبون</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">المصنع</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">تاريخ النقلة</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">نوع الربو</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">التكلفة</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">مساهمة المصنع</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">حالة الدفع</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">حالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t, i) => (
                      <tr key={t.id}
                        className={`border-b border-slate-50 ${
                          t.disbursement_excluded
                            ? 'opacity-40 bg-slate-50'
                            : 'hover:bg-slate-50/60'
                        }`}>
                        <td className="px-3 py-2.5 text-slate-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-xs font-semibold text-slate-700">{t.coupon_number ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-700">{t.factories?.name ?? '—'}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {t.trip_date ? fmtDate(t.trip_date) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {t.waste_type === 'liquid'
                            ? <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">💧 سائل</span>
                            : t.waste_type === 'solid'
                            ? <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">🪨 جاف</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-semibold text-slate-800 whitespace-nowrap">
                          {t.trip_cost != null ? `${t.trip_cost} ₪` : <span className="text-amber-500">غير مسعّرة</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-blue-700 whitespace-nowrap">
                          {t.factory_contribution != null ? `${t.factory_contribution} ₪` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className={`px-1.5 py-0.5 rounded-full ${
                            t.payment_status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {t.payment_status === 'paid' ? '✅ مدفوع' : '⏳ ذمة'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {t.disbursement_excluded
                            ? <span className="px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500">مستثنى</span>
                            : t.is_carryover
                              ? <span className="px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700">📦 محمول</span>
                              : <span className="px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700">مشمول</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={5} className="px-3 py-2.5 text-xs font-bold text-slate-600">
                        المجموع ({filtered.filter(t => !t.disbursement_excluded).length} نقلة)
                      </td>
                      <td className="px-3 py-2.5 text-sm font-bold text-slate-800">
                        {filtered.filter(t => !t.disbursement_excluded).reduce((s, t) => s + (t.trip_cost ?? 0), 0)} ₪
                      </td>
                      <td className="px-3 py-2.5 text-sm font-bold text-blue-700">
                        {filtered.filter(t => !t.disbursement_excluded).reduce((s, t) => s + (t.factory_contribution ?? 0), 0)} ₪
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
                )
              })()}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex justify-end flex-shrink-0">
              <button onClick={() => setViewTripsTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}