'use client'
import { useEffect, useState } from 'react'
import { ArrowRight, Upload } from 'lucide-react'
import Link from 'next/link'
import { getFactories, createPayment, uploadReceipt } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { showToast } from '@/components/ui/Toast'
import type { Factory } from '@/lib/supabase/database.types'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

export default function NewPaymentPage() {
  const router = useRouter()
  const [factories, setFactories] = useState<Factory[]>([])
  const [factoryId, setFactoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getFactories().then(setFactories).catch(console.error)
  }, [])

  const selectedFactory = factories.find(f => f.id === factoryId)

  const handleSubmit = async () => {
    if (!factoryId) { showToast('warning', 'يرجى اختيار المصنع'); return }
    if (!amount || Number(amount) <= 0) { showToast('warning', 'يرجى إدخال مبلغ صحيح'); return }
    setLoading(true)
    try {
      const payment = await createPayment({
        factory_id: factoryId,
        amount_paid: Number(amount),
        date,
        notes: notes || null,
      })
      if (receiptFile) {
        const url = await uploadReceipt(receiptFile, payment.id)
        // Update receipt URL (Supabase trigger already fired, just update the record URL)
        console.log('Receipt uploaded:', url)
      }
      showToast('success', 'تم تسجيل الدفعة بنجاح')
      router.push('/payments')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ'
      showToast('error', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link href="/payments">
          <Button variant="ghost" size="sm"><ArrowRight size={16} /> رجوع</Button>
        </Link>
        <h1 className="text-xl font-bold text-slate-800">تسجيل دفعة جديدة</h1>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold text-slate-800">تفاصيل الدفعة</h2></CardHeader>
        <CardBody className="space-y-4">
          <Select
            label="المصنع *"
            value={factoryId}
            onChange={e => setFactoryId(e.target.value)}
          >
            <option value="">اختر مصنعاً...</option>
            {factories.map(f => (
              <option key={f.id} value={f.id}>
                {f.name} {f.balance > 0 ? `(ذمة: ${f.balance} ₪)` : ''}
              </option>
            ))}
          </Select>

          {selectedFactory && selectedFactory.balance > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-sm text-amber-800">
                💰 الرصيد المستحق لـ <strong>{selectedFactory.name}</strong>: <strong>{selectedFactory.balance} ₪</strong>
              </p>
            </div>
          )}

          <Input
            label="المبلغ المدفوع (₪) *"
            type="number"
            min="1"
            placeholder="أدخل المبلغ"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          <Input
            label="تاريخ الدفع *"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <Textarea
            label="ملاحظات (اختياري)"
            placeholder="أي تفاصيل إضافية..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />

          {/* Receipt Upload */}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">وصل القبض (اختياري)</label>
            <label className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
              <Upload size={18} className="text-slate-400" />
              <span className="text-sm text-slate-500">
                {receiptFile ? receiptFile.name : 'اضغط لرفع صورة الوصل'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </CardBody>
      </Card>

      {factoryId && amount && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardBody>
            <p className="text-sm font-medium text-emerald-800">
              دفعة بمبلغ <span className="text-lg font-bold">{Number(amount).toLocaleString()} ₪</span> لـ {selectedFactory?.name}
            </p>
          </CardBody>
        </Card>
      )}

      <Button onClick={handleSubmit} loading={loading} size="lg" className="w-full" variant="success">
        تسجيل الدفعة
      </Button>
    </div>
  )
}
