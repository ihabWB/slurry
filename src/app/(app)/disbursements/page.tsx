'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  getDisbursements,
  createDisbursement,
  recalcDisbursement,
  closeDisbursement,
  deleteDisbursement,
  getSettings,
} from '@/lib/api'
import type { Disbursement } from '@/lib/supabase/database.types'
import {
  Plus, RefreshCw, Lock, Trash2, RotateCcw, AlertTriangle, CheckCircle,
  ChevronLeft, Calendar, Banknote, FileText, X, ShieldCheck, Percent,
} from 'lucide-react'
import { format } from 'date-fns'
import { arSA } from 'date-fns/locale'

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

// ─── شارة الحالة ─────────────────────────────────────────────
function StatusBadge({ status }: { status: 'draft' | 'closed' }) {
  if (status === 'closed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Lock size={10} /> مقفلة
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <FileText size={10} /> مسودة
    </span>
  )
}

// ─── مودال تأكيد الإغلاق ─────────────────────────────────────
function CloseConfirmModal({
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
        {/* رأس */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Lock size={20} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">تأكيد الإغلاق النهائي</h2>
              <p className="text-sm text-slate-500">هذا الإجراء لا يمكن التراجع عنه</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ملخص */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">الفترة</span>
            <span className="font-semibold text-slate-800">{fmtDate(disb.period_from)} — {fmtDate(disb.period_to)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">عدد النقلات</span>
            <span className="font-semibold text-slate-800">{disb.trips_count.toLocaleString('ar-SA')} نقلة</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">إجمالي تكلفة النقلات</span>
            <span className="font-semibold text-slate-800">{fmt(disb.total_trips_cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">مساهمة المصانع</span>
            <span className="font-semibold text-slate-800">{fmt(disb.total_factory_share)}</span>
          </div>
          <div className="border-t border-slate-200 pt-2.5 flex justify-between">
            <span className="text-slate-600">مبلغ الدفعة قبل التعديلات</span>
            <span className="font-bold text-blue-700">{fmt(disb.disbursed_amount)}</span>
          </div>
          <div className="flex justify-between text-violet-700">
            <span className="flex items-center gap-1">
              <Banknote size={12} />
              بلدية الخليل (14%)
            </span>
            <span className="font-semibold">+ {fmt(disb.municipality_amount)}</span>
          </div>
          <div className="flex justify-between text-orange-700">
            <span className="flex items-center gap-1">
              <ShieldCheck size={12} />
              حجز التأمينات ({disb.retention_pct}%)
            </span>
            <span className="font-semibold">− {fmt(disb.retention_amount)}</span>
          </div>
          <div className="border-t-2 border-emerald-200 pt-2.5 flex justify-between bg-emerald-50 rounded-lg px-3 py-2">
            <span className="text-emerald-800 font-bold">صافي الدفعة (المصروف فعلياً)</span>
            <span className="font-bold text-emerald-700 text-base">{fmt(disb.net_payment)}</span>
          </div>
        </div>

        {/* تحذير */}
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3.5 text-sm text-red-700">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            بعد الإغلاق، لن تتمكن من إضافة أو تعديل نقلات ضمن هذه الفترة. تأكد من مراجعة البيانات قبل المتابعة.
          </span>
        </div>

        {/* أزرار */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
            تأكيد الإغلاق
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── مودال دفعة جديدة ────────────────────────────────────────
function NewDisbursementModal({
  onSubmit,
  onCancel,
  loading,
  defaultRetentionPct,
}: {
  onSubmit: (from: string, to: string, notes: string, retentionPct: number, retentionAmountOverride?: number) => void
  onCancel: () => void
  loading: boolean
  defaultRetentionPct: number
}) {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 7) + '-01'
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today)
  const [notes, setNotes] = useState('')
  const [retentionPct, setRetentionPct] = useState(String(defaultRetentionPct))
  const [retentionAmountManual, setRetentionAmountManual] = useState('')
  const [manualMode, setManualMode] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!from || !to) return
    if (from > to) { alert('تاريخ البداية يجب أن يكون قبل تاريخ النهاية'); return }
    const pct = parseFloat(retentionPct)
    if (isNaN(pct) || pct < 0 || pct > 100) { alert('نسبة الحجز يجب أن تكون بين 0 و 100'); return }
    const override = manualMode && retentionAmountManual !== ''
      ? parseFloat(retentionAmountManual)
      : undefined
    onSubmit(from, to, notes, pct, override)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Plus size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">مطالبة مالية جديدة</h2>
              <p className="text-sm text-slate-500">حدد الفترة ونسبة الحجز لحساب المبالغ تلقائياً</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* التواريخ */}
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

          {/* حجز التأمينات */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-orange-800 flex items-center gap-1.5">
                <ShieldCheck size={14} /> حجز التأمينات
              </label>
              <button
                type="button"
                onClick={() => { setManualMode(!manualMode); setRetentionAmountManual('') }}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  manualMode
                    ? 'bg-orange-200 text-orange-800 border-orange-300'
                    : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-100'
                }`}
              >
                {manualMode ? '● مبلغ يدوي' : 'إدخال مبلغ يدوياً'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-orange-700">النسبة (%)</label>
                <input
                  type="number" min={0} max={100} step={0.5}
                  value={retentionPct}
                  onChange={e => setRetentionPct(e.target.value)}
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                  dir="ltr"
                />
              </div>
              {manualMode && (
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-orange-700">مبلغ الحجز (₪) — يدوي</label>
                  <input
                    type="number" min={0} step={0.01}
                    value={retentionAmountManual}
                    onChange={e => setRetentionAmountManual(e.target.value)}
                    placeholder="سيحسب تلقائياً..."
                    className="w-full px-3 py-2 border border-orange-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-orange-600">
              سيتم حجز {retentionPct || 0}%
              {manualMode && retentionAmountManual ? ` (مبلغ يدوي: ${parseFloat(retentionAmountManual).toLocaleString()} ₪)` : ''}
              {' '}من مبلغ دعم التمويل بعد حساب النقلات.
            </p>
          </div>

          {/* ملاحظات */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">ملاحظات (اختياري)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel} disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50">
              إلغاء
            </button>
            <button type="submit" disabled={loading || !from || !to}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              إنشاء مطالبة (مسودة)
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── بطاقة دفعة ──────────────────────────────────────────────
function DisbursementCard({
  disb,
  onRecalc,
  onClose,
  onDelete,
  isAdmin,
}: {
  disb: Disbursement
  onRecalc: (id: string) => void
  onClose: (disb: Disbursement) => void
  onDelete: (id: string) => void
  isAdmin: boolean
}) {
  return (
    <div className={`bg-white rounded-2xl border p-5 space-y-4 hover:shadow-md transition-shadow ${
      disb.status === 'closed' ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'
    }`}>
      {/* رأس البطاقة */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            disb.status === 'closed' ? 'bg-emerald-100' : 'bg-amber-100'
          }`}>
            {disb.status === 'closed'
              ? <Lock size={18} className="text-emerald-700" />
              : <FileText size={18} className="text-amber-700" />
            }
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
                <> · أُغلقت {fmtDateTime(disb.closed_at)}</>
              )}
            </p>
          </div>
        </div>
        {/* إجراءات */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {disb.status === 'draft' && (
            <>
              <button
                onClick={() => onRecalc(disb.id)}
                title="إعادة الحساب"
                className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <RotateCcw size={15} />
              </button>
              <button
                onClick={() => onClose(disb)}
                title="إغلاق نهائي"
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Lock size={15} />
              </button>
              {isAdmin && (
                <button
                  onClick={() => onDelete(disb.id)}
                  title="حذف"
                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

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
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500 mb-1">مساهمة المصانع</p>
          <p className="text-sm font-bold text-slate-800">{fmt(disb.total_factory_share)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <p className="text-[11px] text-slate-500 mb-1">قبل التعديلات</p>
          <p className="text-sm font-bold text-blue-700">{fmt(disb.disbursed_amount)}</p>
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
  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [closeTarget, setCloseTarget] = useState<Disbursement | null>(null)
  const [defaultRetentionPct, setDefaultRetentionPct] = useState(10)

  const isAdmin = true

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [data, settingsData] = await Promise.all([getDisbursements(), getSettings()])
      setDisbursements(data)
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

  async function handleCreate(from: string, to: string, notes: string, retentionPct: number, retentionAmountOverride?: number) {
    try {
      setActionLoading(true)
      setError(null)
      await createDisbursement(from, to, notes || undefined, retentionPct, retentionAmountOverride)
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

  async function handleConfirmClose() {
    if (!closeTarget) return
    try {
      setActionLoading(true)
      setError(null)
      await closeDisbursement(closeTarget.id)
      setCloseTarget(null)
      showSuccessMsg('تم إغلاق المطالبة المالية بنجاح 🔒')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذه المطالبة (المسودة)؟')) return
    try {
      setActionLoading(true)
      setError(null)
      await deleteDisbursement(id)
      showSuccessMsg('تم حذف المطالبة (المسودة)')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setActionLoading(false)
    }
  }

  // ── ملخص إجمالي ──
  const closed = disbursements.filter(d => d.status === 'closed')
  const drafts  = disbursements.filter(d => d.status === 'draft')
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
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            <Plus size={16} /> مطالبة جديدة
          </button>
        </div>
      </div>

      {/* رسائل النجاح والخطأ */}
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
              <p className="text-[11px] text-slate-500">مقفلة / مسودة</p>
              <p className="text-lg font-bold text-slate-900">{closed.length} / {drafts.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* قائمة الدفعات */}
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
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors"
          >
            <Plus size={15} /> إنشاء أول مطالبة
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* المسودات أولاً ثم المقفلة */}
          {[...drafts, ...closed].map(disb => (
            <DisbursementCard
              key={disb.id}
              disb={disb}
              onRecalc={handleRecalc}
              onClose={setCloseTarget}
              onDelete={handleDelete}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* مودال دفعة جديدة */}
      {showNew && (
        <NewDisbursementModal
          onSubmit={handleCreate}
          onCancel={() => setShowNew(false)}
          loading={actionLoading}
          defaultRetentionPct={defaultRetentionPct}
        />
      )}

      {/* مودال تأكيد الإغلاق */}
      {closeTarget && (
        <CloseConfirmModal
          disb={closeTarget}
          onConfirm={handleConfirmClose}
          onCancel={() => setCloseTarget(null)}
          loading={actionLoading}
        />
      )}
    </div>
  )
}
