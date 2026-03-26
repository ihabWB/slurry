'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, DollarSign, Download, Trash2 } from 'lucide-react'
import { getPayments, deletePayment } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Link from 'next/link'
import { format } from 'date-fns'
import { useAuth } from '@/context/AuthContext'
import { showToast } from '@/components/ui/Toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payment = any

export default function PaymentsPage() {
  const { canEdit } = useAuth()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPayments()
      setPayments(data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDeletePayment = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deletePayment(deleteTarget.id)
      showToast('success', 'تم حذف الدفعة')
      setDeleteTarget(null)
      load()
    } catch { showToast('error', 'فشل الحذف') }
    finally { setDeleting(false) }
  }

  const totalPaid = payments.reduce((s: number, p: Payment) => s + Number(p.amount_paid), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">المدفوعات</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {payments.length} دفعة · إجمالي: {totalPaid.toLocaleString()} ₪
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link href="/payments/new">
              <Button size="lg"><Plus size={16} /> تسجيل دفعة</Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardBody className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
            <DollarSign size={22} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">إجمالي المبالغ المحصلة</p>
            <p className="text-2xl font-bold text-emerald-600">{totalPaid.toLocaleString()} ₪</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">سجل الدفعات</h2>
            <Button variant="ghost" size="sm"><Download size={14} /> تصدير</Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المصنع</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">التاريخ</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المبلغ</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">ملاحظات</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">وصل القبض</th>
                {canEdit && <th className="px-6 py-3 text-xs text-slate-500 font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">جارٍ التحميل...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">لا توجد دفعات بعد</td></tr>
              ) : (
                payments.map((p: Payment) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-800">{p.factories?.name ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-600">{format(new Date(p.date), 'dd/MM/yyyy')}</td>
                    <td className="px-6 py-3 font-semibold text-emerald-700">{Number(p.amount_paid).toLocaleString()} ₪</td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{p.notes ?? '—'}</td>
                    <td className="px-6 py-3">
                      {p.receipt_image_url ? (
                        <a href={p.receipt_image_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:underline">عرض</a>
                      ) : '—'}
                    </td>
                    {canEdit && (
                      <td className="px-6 py-3">
                        <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="تأكيد حذف الدفعة">
          <div className="space-y-4">
            <p className="text-slate-600">هل أنت متأكد من حذف دفعة <span className="font-bold text-slate-800">{deleteTarget.factories?.name}</span> بقيمة <span className="font-bold text-emerald-700">{Number(deleteTarget.amount_paid).toLocaleString()} ₪</span>؟</p>
            <p className="text-xs text-red-500">⚠️ لا يمكن التراجع عن هذا الإجراء</p>
            <div className="flex gap-2 pt-2">
              <Button variant="danger" className="flex-1" onClick={handleDeletePayment} loading={deleting}>نعم، احذف</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
