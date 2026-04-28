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

  const cashTrips = statement?.trips?.filter((t: any) => t.payment_method === 'cash').length ?? 0
  const laterTrips = statement?.trips?.filter((t: any) => t.payment_status === 'paid' && t.payment_method === 'later').length ?? 0
  const creditTrips = statement?.trips?.filter((t: any) => t.payment_status === 'credit').length ?? 0

  if (loading) return <div className="text-center py-16 text-slate-400">جارّي التحميل...</div>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-blue-100">
          <CardBody className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
              <Truck size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">إجمالي النقلات</p>
              <p className="font-bold text-slate-800">{statement?.totalTrips ?? 0} <span className="text-xs font-normal text-slate-500">نقلة</span></p>
            </div>
          </CardBody>
        </Card>
        <Card className="border-green-100">
          <CardBody className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-green-50">
              <span className="text-sm">💵</span>
            </div>
            <div>
              <p className="text-xs text-slate-500">نقداً فور</p>
              <p className="font-bold text-green-700">{cashTrips} <span className="text-xs font-normal text-slate-500">نقلة</span></p>
            </div>
          </CardBody>
        </Card>
        <Card className="border-blue-100">
          <CardBody className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
              <span className="text-sm">🏦</span>
            </div>
            <div>
              <p className="text-xs text-slate-500">مسوّاة لاحقاً</p>
              <p className="font-bold text-blue-700">{laterTrips} <span className="text-xs font-normal text-slate-500">نقلة</span></p>
            </div>
          </CardBody>
        </Card>
        <Card className="border-amber-100">
          <CardBody className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50">
              <AlertTriangle size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">غير مسوّاة</p>
              <p className="font-bold text-amber-700">{creditTrips} <span className="text-xs font-normal text-slate-500">نقلة</span></p>
            </div>
          </CardBody>
        </Card>
        {/* بطاقة الذمم غير المسواة */}
        <Card className={statement?.debt > 0 ? 'border-red-200 bg-red-50/30' : 'border-emerald-100'}>
          <CardBody className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${statement?.debt > 0 ? 'bg-red-100' : 'bg-emerald-50'}`}>
              <DollarSign size={16} className={statement?.debt > 0 ? 'text-red-600' : 'text-emerald-600'} />
            </div>
            <div>
              <p className="text-xs text-slate-500">ذمم غير مسواة</p>
              <p className={`font-bold text-lg ${statement?.debt > 0 ? 'text-red-700' : 'text-emerald-600'}`}>
                {statement?.debt > 0 ? `${Number(statement.debt).toLocaleString()} ₪` : '—'}
              </p>
              {(statement?.debt ?? 0) === 0 && (
                <p className="text-xs text-emerald-500">لا ذمم معلّقة ✓</p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* بطاقة الرصيد الدائن */}
        <Card className={statement?.creditBalance > 0 ? 'border-blue-300 bg-blue-50/40' : 'border-slate-100'}>
          <CardBody className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${statement?.creditBalance > 0 ? 'bg-blue-100' : 'bg-slate-50'}`}>
              <span className="text-base">{statement?.creditBalance > 0 ? '💳' : <DollarSign size={16} className="text-slate-300" />}</span>
            </div>
            <div>
              <p className="text-xs text-slate-500">رصيد دائن للمصنع</p>
              <p className={`font-bold text-lg ${statement?.creditBalance > 0 ? 'text-blue-700' : 'text-slate-400'}`}>
                {statement?.creditBalance > 0 ? `${Number(statement.creditBalance).toLocaleString()} ₪` : '—'}
              </p>
              {(statement?.creditBalance ?? 0) > 0 && (
                <p className="text-xs text-blue-500 mt-0.5">يُغطى تلقائياً للنقلات القادمة</p>
              )}
            </div>
          </CardBody>
        </Card>
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
                    {t.payment_method === 'cash' ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">💵 نقداً</span>
                    ) : t.payment_status === 'paid' && t.payment_method === 'later' ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">🏦 مسوّاة</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">⏳ ذمة</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{t.notes ?? '—'}</td>
                </tr>
              ))}
              {(!statement?.trips || statement.trips.length === 0) && (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">لا توجد نقلات</td></tr>
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
