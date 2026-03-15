'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowRight, Truck, DollarSign, AlertTriangle, Printer } from 'lucide-react'
import Link from 'next/link'
import { getFactory, getFactoryStatement } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { format } from 'date-fns'
import { jsPDF } from 'jspdf'
import type { Factory } from '@/lib/supabase/database.types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Statement = any

export default function FactoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [factory, setFactory] = useState<Factory | null>(null)
  const [statement, setStatement] = useState<Statement>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([getFactory(id), getFactoryStatement(id)])
      .then(([f, s]) => { setFactory(f); setStatement(s) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const exportPDF = () => {
    if (!factory || !statement) return
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    doc.setFont('helvetica')
    doc.setFontSize(16)
    doc.text(`Factory Statement: ${factory.name}`, 20, 20)
    doc.setFontSize(11)
    doc.text(`Owner: ${factory.owner_name}  |  Phone: ${factory.phone}`, 20, 30)
    doc.text(`Total Trips: ${statement.totalTrips}  |  Total Amount: ${statement.totalAmount} ILS`, 20, 38)
    doc.text(`Total Paid: ${statement.totalPaid} ILS  |  Balance: ${statement.balance} ILS`, 20, 46)
    doc.line(20, 50, 190, 50)
    doc.text('Trips:', 20, 58)
    let y = 65
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statement.trips?.forEach((t: any, i: number) => {
      doc.setFontSize(9)
      doc.text(`${i + 1}. ${format(new Date(t.created_at), 'dd/MM/yyyy HH:mm')}  |  ${t.payment_status === 'paid' ? 'Paid' : 'Credit'}  |  ${t.amount} ILS`, 20, y)
      y += 6
      if (y > 270) { doc.addPage(); y = 20 }
    })
    doc.save(`statement-${factory.name}.pdf`)
  }

  if (loading) return <div className="text-center py-16 text-slate-400">جارٍ التحميل...</div>
  if (!factory) return <div className="text-center py-16 text-red-500">المصنع غير موجود</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/factories">
          <Button variant="ghost" size="sm"><ArrowRight size={16} /> رجوع</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">{factory.name}</h1>
          <p className="text-sm text-slate-500">{factory.owner_name} · {factory.phone}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportPDF}>
          <Printer size={14} /> تصدير PDF
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي النقلات', value: statement?.totalTrips ?? 0, icon: Truck, color: 'text-blue-600 bg-blue-50', suffix: 'نقلة' },
          { label: 'إجمالي المستحق', value: statement?.totalAmount ?? 0, icon: DollarSign, color: 'text-violet-600 bg-violet-50', suffix: '₪' },
          { label: 'إجمالي المدفوع', value: statement?.totalPaid ?? 0, icon: DollarSign, color: 'text-emerald-600 bg-emerald-50', suffix: '₪' },
          { label: 'الرصيد المتبقي', value: statement?.balance ?? 0, icon: AlertTriangle, color: statement?.balance > 0 ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50', suffix: '₪' },
        ].map(({ label, value, icon: Icon, color, suffix }) => (
          <Card key={label}>
            <CardBody className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="font-bold text-slate-800">{Number(value).toLocaleString()} <span className="text-xs font-normal text-slate-500">{suffix}</span></p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Trips Table */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Truck size={16} /> سجل النقلات</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">#</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">تاريخ النقلة</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المبلغ</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">الحالة</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">طريقة الدفع</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {statement?.trips?.map((t: any, i: number) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-6 py-3 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-6 py-3 text-slate-700 font-medium">{t.trip_date ? format(new Date(t.trip_date), 'dd/MM/yyyy') : format(new Date(t.created_at), 'dd/MM/yyyy')}</td>
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
                  <td className="px-6 py-3 text-slate-500 text-xs">{t.notes ?? '—'}</td>
                </tr>
              ))}
              {(!statement?.trips || statement.trips.length === 0) && (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">لا توجد نقلات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-800 flex items-center gap-2"><DollarSign size={16} /> سجل الدفعات</h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">التاريخ</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المبلغ المدفوع</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">ملاحظات</th>
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">وصل القبض</th>
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {statement?.payments?.map((p: any) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-6 py-3 text-slate-600">{format(new Date(p.date), 'dd/MM/yyyy')}</td>
                  <td className="px-6 py-3 font-semibold text-emerald-700">{p.amount_paid} ₪</td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{p.notes ?? '—'}</td>
                  <td className="px-6 py-3">
                    {p.receipt_image_url ? (
                      <a href={p.receipt_image_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:underline">عرض الوصل</a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {(!statement?.payments || statement.payments.length === 0) && (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400">لا توجد دفعات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
