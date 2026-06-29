'use client'
import { useEffect, useState, useCallback } from 'react'
import { use } from 'react'
import { ArrowRight, Edit2, MapPin, Phone, User, Plus, Trash2, Hash, Droplets } from 'lucide-react'
import Link from 'next/link'
import { getFactory, getTrips, getPayments, deletePayment, reconcileFactory } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { format } from 'date-fns'
import type { Factory } from '@/lib/supabase/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Trip = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payment = any

const approvalBadge = (s: string) => {
  if (s === 'approved')         return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">معتمدة ✓</span>
  if (s === 'pending_approval') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">بانتظار الاعتماد</span>
  if (s === 'rejected')         return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">مرفوضة</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">مسودة</span>
}

const payStatusBadge = (s: string, m: string | null) => {
  if (s === 'paid' && m === 'cash')  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">💵 دفع نقدي</span>
  if (s === 'paid' && m === 'later') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">🏦 دُفعت لاحقاً</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">⏳ ذمة</span>
}

function fmt(d: string) {
  try { return format(new Date(d), 'yyyy/MM/dd') } catch { return d }
}

export default function FactoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { canEdit } = useAuth()
  const [factory, setFactory]   = useState<Factory | null>(null)
  const [trips,   setTrips]     = useState<Trip[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'trips' | 'payments'>('trips')
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fac, tripsData, paymentsData] = await Promise.all([
        getFactory(id),
        getTrips({ factory_id: id }),
        getPayments({ factory_id: id }),
      ])
      setFactory(fac)
      setPayments(paymentsData ?? [])

      // مزامنة تلقائية: تغطية نقلات الذمة إذا كان الرصيد الدائن يكفيها
      const reconciled = await reconcileFactory(id)
      if (reconciled > 0) {
        const updatedTrips = await getTrips({ factory_id: id })
        setTrips(updatedTrips ?? [])
      } else {
        setTrips(tripsData ?? [])
      }
    } catch {
      showToast('error', 'فشل تحميل بيانات المصنع')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const handleDeletePayment = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deletePayment(deleteTarget.id)
      showToast('success', 'تم حذف الدفعة')
      setDeleteTarget(null)
      load()
    } catch { showToast('error', 'فشل حذف الدفعة') }
    finally { setDeleting(false) }
  }

  // ── Derived financials ──────────────────────────────────────
  const approvedTrips   = trips.filter((t: Trip) => t.approval_status === 'approved')
  const totalTrips      = approvedTrips.length
  const creditTrips     = approvedTrips.filter((t: Trip) => t.payment_status === 'credit')
  const totalObligation = approvedTrips.reduce((s: number, t: Trip) => s + Number(t.factory_contribution ?? 50), 0)
  const totalPaidCash   = approvedTrips
    .filter((t: Trip) => t.payment_status === 'paid' && t.payment_method === 'cash')
    .reduce((s: number, t: Trip) => s + Number(t.factory_contribution ?? 50), 0)
  const paymentsTotal   = payments.reduce((s: number, p: Payment) => s + Number(p.amount_paid), 0)
  const totalIn         = totalPaidCash + paymentsTotal
  // الرصيد = ما على المصنع − ما دفعه المصنع (بسيط وصحيح في كل الحالات)
  const balance         = totalObligation - totalIn
  const isDebt          = balance > 0
  const isCreditBal     = balance < 0
  // النقلات المعلقة (draft / pending_approval) بحالة paid/later → ستستهلك من الرصيد عند اعتمادها
  const pendingLaterTrips = trips.filter(
    (t: Trip) => t.approval_status !== 'approved' && t.approval_status !== 'rejected'
      && t.payment_status === 'paid' && t.payment_method === 'later'
  )
  const pendingLaterValue   = pendingLaterTrips.reduce((s: number, t: Trip) => s + Number(t.factory_contribution ?? 50), 0)
  const futureBalance       = balance + pendingLaterValue  // الرصيد بعد اعتماد كل النقلات المعلقة

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-slate-100 rounded-xl w-64" />
        <div className="h-24 bg-slate-100 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl" />)}
        </div>
        <div className="h-64 bg-slate-100 rounded-xl" />
      </div>
    )
  }

  if (!factory) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-3">🏭</p>
        <p className="text-slate-500">المصنع غير موجود</p>
        <Link href="/factories" className="mt-4 inline-block">
          <Button variant="secondary" size="sm"><ArrowRight size={14} /> عودة للمصانع</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/factories">
            <Button variant="ghost" size="sm"><ArrowRight size={16} /> المصانع</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{factory.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">كشف حساب شامل</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Link href={`/payments/new?factory_id=${factory.id}`}>
              <Button size="sm"><Plus size={14} /> تسجيل دفعة</Button>
            </Link>
          )}
          {canEdit && (
            <Link href={`/factories?edit=${factory.id}`}>
              <Button variant="secondary" size="sm"><Edit2 size={14} /> تعديل المصنع</Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Factory info card ── */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <User size={14} className="text-slate-400 flex-shrink-0" />
              <span>{factory.owner_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-slate-400 flex-shrink-0" />
              <span dir="ltr">{factory.phone}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-slate-400 flex-shrink-0" />
              <span>{factory.region || 'غير محدد'}</span>
            </div>
            {factory.tag_number && (
              <div className="flex items-center gap-2">
                <Hash size={14} className="text-slate-400 flex-shrink-0" />
                <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">TAG: {factory.tag_number}</span>
              </div>
            )}
            {factory.waste_type && (
              <div className="flex items-center gap-2">
                <Droplets size={14} className="text-slate-400 flex-shrink-0" />
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  factory.waste_type === 'liquid' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {factory.waste_type === 'liquid' ? '💧 سائل' : '🪨 جاف'}
                </span>
              </div>
            )}
            {factory.lat != null && factory.lng != null && (
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                <span dir="ltr" className="text-xs text-slate-400">{Number(factory.lat).toFixed(5)}, {Number(factory.lng).toFixed(5)}</span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="text-center py-4">
            <p className="text-3xl font-bold text-slate-800">{totalTrips}</p>
            <p className="text-xs text-slate-500 mt-1">النقلات المعتمدة</p>
          </CardBody>
        </Card>
        <Card className={isDebt && creditTrips.length > 0 ? 'border-red-200' : ''}>
          <CardBody className="text-center py-4">
            <p className={`text-3xl font-bold ${isDebt && creditTrips.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {creditTrips.length}
            </p>
            <p className="text-xs text-slate-500 mt-1">نقلات الذمة غير المسواة</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <p className="text-3xl font-bold text-slate-700">{totalObligation.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">ما على المصنع (₪)</p>
          </CardBody>
        </Card>
        <Card className={isDebt ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}>
          <CardBody className="text-center py-4 space-y-1">
            {isDebt ? (
              <>
                <p className="text-3xl font-bold text-red-600">{balance.toLocaleString()}</p>
                <p className="text-xs text-red-500">متبقٍ للتسديد (₪)</p>
                {pendingLaterValue > 0 && (
                  <p className="text-xs text-amber-600 pt-1 border-t border-red-100">
                    ⚠️ {pendingLaterTrips.length} نقلة معلقة ستزيد الذمة بـ {pendingLaterValue.toLocaleString()}₪
                  </p>
                )}
              </>
            ) : isCreditBal ? (
              <>
                <p className="text-3xl font-bold text-emerald-600">{Math.abs(balance).toLocaleString()}</p>
                <p className="text-xs text-emerald-600">💳 رصيد دائن حالي (₪)</p>
                {pendingLaterValue > 0 && (
                  <div className="pt-1 border-t border-emerald-100 space-y-0.5">
                    <p className="text-xs text-amber-600">
                      ⚠️ {pendingLaterTrips.length} نقلة معلقة بـ {pendingLaterValue.toLocaleString()}₪
                    </p>
                    <p className={`text-xs font-medium ${
                      futureBalance > 0 ? 'text-red-500'
                      : futureBalance < 0 ? 'text-emerald-600'
                      : 'text-slate-500'
                    }`}>
                      {futureBalance > 0
                        ? `المتوقع: ذمة ${futureBalance.toLocaleString()}₪`
                        : futureBalance < 0
                        ? `المتوقع: رصيد ${Math.abs(futureBalance).toLocaleString()}₪`
                        : 'المتوقع: ملتزم ✓'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-3xl font-bold text-emerald-600">ملتزم</p>
                <p className="text-xs text-emerald-600">✓ حساب مُسوًّى</p>
                {pendingLaterValue > 0 && (
                  <p className="text-xs text-amber-600 pt-1 border-t border-emerald-100">
                    ⚠️ {pendingLaterTrips.length} نقلة معلقة ستضيف {pendingLaterValue.toLocaleString()}₪ بعد الاعتماد
                  </p>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── شريط المعادلة المرئية ── */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-sm flex-wrap">
        <span className="text-slate-500">ما على المصنع</span>
        <span className="font-bold text-slate-800">{totalObligation.toLocaleString()} ₪</span>
        <span className="text-slate-400">−</span>
        <span className="text-slate-500">ما دفعه</span>
        <span className="font-bold text-slate-800">{totalIn.toLocaleString()} ₪</span>
        <span className="text-slate-400">=</span>
        <span className={`font-bold text-base ${
          isDebt ? 'text-red-600' : isCreditBal ? 'text-emerald-600' : 'text-slate-600'
        }`}>
          {isDebt
            ? `${balance.toLocaleString()} ₪ متبقٍ للتسديد`
            : isCreditBal
            ? `${Math.abs(balance).toLocaleString()} ₪ رصيد دائن`
            : 'حساب مُسوًّى ✓'}
        </span>
        <span className="mr-auto text-xs text-slate-400">
          (نقدي: {totalPaidCash.toLocaleString()} ₪ + دفعات: {paymentsTotal.toLocaleString()} ₪)
        </span>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-slate-200">
        <div className="flex">
          <button
            onClick={() => setTab('trips')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'trips'
                ? 'border-blue-500 text-blue-700 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            النقلات ({trips.length})
          </button>
          <button
            onClick={() => setTab('payments')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'payments'
                ? 'border-blue-500 text-blue-700 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            الدفعات ({payments.length})
          </button>
        </div>
      </div>

      {/* ── Trips Tab ── */}
      {tab === 'trips' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">سجل النقلات</h2>
              {canEdit && (
                <Link href={`/trips/new?factory_id=${factory.id}`}>
                  <Button size="sm" variant="secondary"><Plus size={14} /> نقلة جديدة</Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {trips.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-3xl mb-2">🚛</p>
                <p className="text-sm">لا توجد نقلات مسجلة لهذا المصنع</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">التاريخ</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">رقم الكوبون</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">نوع الربو</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">الحجم</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">المساهمة (₪)</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">الدفع</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">الاعتماد</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {trips.map((t: Trip) => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap" dir="ltr">{fmt(t.trip_date)}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.coupon_number || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3">
                          {t.waste_type === 'liquid' && <span className="text-blue-600 text-xs">💧 سائل</span>}
                          {t.waste_type === 'solid'  && <span className="text-amber-600 text-xs">🪨 جاف</span>}
                          {!t.waste_type             && <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {t.volume_m3 != null ? `${t.volume_m3} م³` : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {Number(t.factory_contribution ?? 50).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">{payStatusBadge(t.payment_status, t.payment_method)}</td>
                        <td className="px-4 py-3">{approvalBadge(t.approval_status)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{t.notes || <span className="text-slate-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-slate-600">
                        الإجمالي — {approvedTrips.length} نقلة معتمدة / {creditTrips.length} ذمة
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800">{totalObligation.toLocaleString()} ₪</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── Payments Tab ── */}
      {tab === 'payments' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">سجل الدفعات</h2>
              {canEdit && (
                <Link href={`/payments/new?factory_id=${factory.id}`}>
                  <Button size="sm"><Plus size={14} /> تسجيل دفعة</Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {payments.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-3xl mb-2">💰</p>
                <p className="text-sm">لا توجد دفعات مسجلة لهذا المصنع</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">التاريخ</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">المبلغ (₪)</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">ملاحظات</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">وصل</th>
                      {canEdit && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {payments.map((p: Payment) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap" dir="ltr">{fmt(p.date)}</td>
                        <td className="px-4 py-3 font-bold text-emerald-700">{Number(p.amount_paid).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">{p.notes || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3">
                          {p.receipt_image_url
                            ? <a href={p.receipt_image_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">عرض الوصل</a>
                            : <span className="text-slate-300 text-xs">—</span>
                          }
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setDeleteTarget(p)}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                              title="حذف الدفعة"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">الإجمالي</td>
                      <td className="px-4 py-3 font-bold text-emerald-700">{paymentsTotal.toLocaleString()} ₪</td>
                      <td colSpan={canEdit ? 3 : 2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── Delete Payment Confirm Modal ── */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="حذف الدفعة"
        size="sm"
      >
        <p className="text-sm text-slate-600 mb-4">
          هل أنت متأكد من حذف هذه الدفعة؟ ({Number(deleteTarget?.amount_paid ?? 0).toLocaleString()} ₪ — {deleteTarget?.date})
        </p>
        <div className="flex gap-3">
          <Button variant="danger" onClick={handleDeletePayment} loading={deleting} className="flex-1">حذف</Button>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} className="flex-1">إلغاء</Button>
        </div>
      </Modal>
    </div>
  )
}
