'use client'
import { useEffect, useState, useCallback } from 'react'
import { ArrowRight, Upload, CheckCircle, Info } from 'lucide-react'
import Link from 'next/link'
import { getFactories, createPayment, uploadReceipt, previewPayment } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { showToast } from '@/components/ui/Toast'
import type { Factory } from '@/lib/supabase/database.types'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'

export default function NewPaymentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [factories, setFactories] = useState<Factory[]>([])
  const [factoryId, setFactoryId] = useState(searchParams.get('factory_id') ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<{
    tripsCount: number
    totalCovered: number
    remainingCredit: number
    existingCredit: number
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    getFactories().then(setFactories).catch(console.error)
  }, [])

  const selectedFactory = factories.find(f => f.id === factoryId)

  // معاينة فورية عند تغيير المصنع أو المبلغ
  const refreshPreview = useCallback(async (fId: string, amt: string) => {
    const num = Number(amt)
    if (!fId || !amt || num <= 0) { setPreview(null); return }
    setPreviewLoading(true)
    try {
      const result = await previewPayment(fId, num)
      setPreview(result)
    } catch { setPreview(null) }
    finally { setPreviewLoading(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => refreshPreview(factoryId, amount), 400)
    return () => clearTimeout(t)
  }, [factoryId, amount, refreshPreview])

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
        <h1 className="text-xl font-bold text-slate-800">تسجيل دفعة مصنع جديدة</h1>
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
                {f.name}
                {f.balance > 0 ? ` (ذمة: ${f.balance} ₪)` : ''}
                {f.balance < 0 ? ` ✅ رصيد دائن: ${Math.abs(f.balance)} ₪` : ''}
              </option>
            ))}
          </Select>

          {selectedFactory && selectedFactory.balance > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-sm text-amber-800">
                💰 الذمة المستحقة على <strong>{selectedFactory.name}</strong>: <strong>{selectedFactory.balance} ₪</strong>
              </p>
            </div>
          )}

          {selectedFactory && selectedFactory.balance < 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-sm text-emerald-800">
                ✅ رصيد دائن محفوظ لـ <strong>{selectedFactory.name}</strong>: <strong>{Math.abs(selectedFactory.balance)} ₪</strong> — سيُضاف إلى الدفعة الجديدة تلقائياً
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

      {/* معاينة التغطية */}
      {factoryId && amount && Number(amount) > 0 && (
        <Card className={preview && preview.tripsCount > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}>
          <CardBody className="space-y-2.5">
            {previewLoading ? (
              <p className="text-sm text-slate-500 text-center py-1">جارٍ الحساب...</p>
            ) : preview ? (
              <>
                <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Info size={15} className="text-blue-500" />
                  معاينة توزيع الدفعة
                </p>

                {preview.existingCredit > 0 && (
                  <div className="flex items-center justify-between text-xs bg-white/70 rounded-lg px-3 py-2">
                    <span className="text-emerald-700">رصيد دائن سابق يُضاف</span>
                    <span className="font-bold text-emerald-800">+ {preview.existingCredit} ₪</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs bg-white/70 rounded-lg px-3 py-2">
                  <span className="text-slate-600">المبلغ الجديد</span>
                  <span className="font-bold text-slate-800">{Number(amount).toLocaleString()} ₪</span>
                </div>

                {preview.tripsCount > 0 ? (
                  <div className="flex items-center justify-between text-xs bg-white/70 rounded-lg px-3 py-2">
                    <span className="text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle size={13} /> ستُغطى من نقلات الذمة
                    </span>
                    <span className="font-bold text-emerald-800">
                      {preview.tripsCount} نقلة ({preview.totalCovered} ₪)
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs bg-white/70 rounded-lg px-3 py-2">
                    <span className="text-slate-500">لا توجد نقلات ذمة حالياً</span>
                  </div>
                )}

                <div className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 font-bold ${
                  preview.remainingCredit > 0
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-white/70 text-slate-500'
                }`}>
                  <span>{preview.remainingCredit > 0 ? '💳 رصيد دائن يُحفظ للنقلات القادمة' : 'رصيد دائن متبقٍ'}</span>
                  <span>{preview.remainingCredit} ₪</span>
                </div>
              </>
            ) : null}
          </CardBody>
        </Card>
      )}

      <Button onClick={handleSubmit} loading={loading} size="lg" className="w-full" variant="success">
        تسجيل الدفعة
      </Button>
    </div>
  )
}
