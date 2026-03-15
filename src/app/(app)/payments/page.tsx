'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, DollarSign, Download, RefreshCw } from 'lucide-react'
import { getPayments, syncTripPaymentStatus } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { format } from 'date-fns'
import { useAuth } from '@/context/AuthContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payment = any

export default function PaymentsPage() {
  const { canEdit } = useAuth()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const updated = await syncTripPaymentStatus()
      setSyncMsg(`✅ تم تحديث ${updated} نقلة بنجاح`)
      await load()
    } catch (e) {
      setSyncMsg('❌ حدث خطأ أثناء المزامنة')
      console.error(e)
    } finally {
      setSyncing(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPayments()
      setPayments(data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

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
          <Button variant="ghost" size="sm" onClick={handleSync} loading={syncing}>
            <RefreshCw size={14} /> مزامنة الدفعات
          </Button>
          {canEdit && (
            <Link href="/payments/new">
              <Button size="lg"><Plus size={16} /> تسجيل دفعة</Button>
            </Link>
          )}
        </div>
      </div>

      {syncMsg && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700">{syncMsg}</div>
      )}

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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
