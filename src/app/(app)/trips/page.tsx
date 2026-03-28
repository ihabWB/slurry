'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Filter, Download, Pencil, Trash2, Upload } from 'lucide-react'
import { getTrips, updateTrip, deleteTrip } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, Input } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Link from 'next/link'
import { format } from 'date-fns'
import { useAuth } from '@/context/AuthContext'
import { showToast } from '@/components/ui/Toast'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Trip = any

export default function TripsPage() {
  const { canEdit } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'paid' | 'credit'>('all')

  // Edit modal
  const [editTrip, setEditTrip] = useState<Trip | null>(null)
  const [editForm, setEditForm] = useState({ trip_date: '', notes: '', payment_status: 'credit', waste_type: '', volume_m3: '' })
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTrips(filter !== 'all' ? { payment_status: filter } : undefined)
      setTrips(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const openEdit = (t: Trip) => {
    setEditTrip(t)
    setEditForm({
      trip_date: t.trip_date ?? '',
      notes: t.notes ?? '',
      payment_status: t.payment_status ?? 'credit',
      waste_type: t.waste_type ?? '',
      volume_m3: t.volume_m3 != null ? String(t.volume_m3) : '',
    })
  }

  const handleSave = async () => {
    if (!editTrip) return
    setSaving(true)
    try {
      await updateTrip(editTrip.id, {
        trip_date: editForm.trip_date || undefined,
        notes: editForm.notes || null,
        payment_status: editForm.payment_status as 'paid' | 'credit',
        waste_type: (editForm.waste_type as 'liquid' | 'solid') || null,
        volume_m3: editForm.volume_m3 ? Number(editForm.volume_m3) : null,
      })
      showToast('success', 'تم تحديث النقلة')
      setEditTrip(null)
      load()
    } catch { showToast('error', 'فشل التحديث') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTrip(deleteTarget.id)
      showToast('success', 'تم حذف النقلة')
      setDeleteTarget(null)
      load()
    } catch { showToast('error', 'فشل الحذف') }
    finally { setDeleting(false) }
  }

  const totalAmount = trips.reduce((s: number, t: Trip) => s + Number(t.amount), 0)
  const paidCount = trips.filter((t: Trip) => t.payment_status === 'paid').length
  const creditCount = trips.filter((t: Trip) => t.payment_status === 'credit').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">النقلات</h1>
          <p className="text-sm text-slate-500 mt-0.5">{trips.length} نقلة إجمالية</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link href="/trips/import">
              <Button variant="secondary" size="lg"><Upload size={16} /> استيراد Excel</Button>
            </Link>
            <Link href="/trips/new">
              <Button size="lg"><Plus size={16} /> تسجيل نقلة</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-blue-100">
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-blue-600">{trips.length}</p>
            <p className="text-xs text-slate-500 mt-1">إجمالي النقلات</p>
          </CardBody>
        </Card>
        <Card className="border-emerald-100">
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{paidCount}</p>
            <p className="text-xs text-slate-500 mt-1">مدفوع</p>
          </CardBody>
        </Card>
        <Card className="border-amber-100">
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-amber-600">{creditCount}</p>
            <p className="text-xs text-slate-500 mt-1">ذمة</p>
          </CardBody>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-3">
            <Filter size={16} className="text-slate-400" />
            <Select
              value={filter}
              onChange={e => setFilter(e.target.value as 'all' | 'paid' | 'credit')}
              className="w-48"
            >
              <option value="all">كل النقلات</option>
              <option value="paid">مدفوع فقط</option>
              <option value="credit">ذمة فقط</option>
            </Select>
            <span className="text-sm text-slate-500">
              إجمالي المبالغ: <span className="font-bold text-slate-800">{totalAmount.toLocaleString()} ₪</span>
            </span>
          </div>
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">قائمة النقلات</h2>
            <Button variant="ghost" size="sm">
              <Download size={14} /> تصدير
            </Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">#</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المصنع</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المنطقة</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">نوع الربو</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">الحجم (م³)</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">المبلغ</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">الحالة</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">طريقة الدفع</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">تاريخ النقلة</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">وقت الإدخال</th>
                    <th className="text-right px-6 py-3 text-xs text-slate-500 font-medium">ملاحظات</th>
                    {canEdit && <th className="px-6 py-3 text-xs text-slate-500 font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-8 text-slate-400">جارٍ التحميل...</td></tr>
              ) : trips.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-slate-400">لا توجد نقلات</td></tr>
              ) : (
                trips.map((t: Trip, i: number) => (
                  <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-400 text-xs">{i + 1}</td>
                    <td className="px-6 py-3 font-medium text-slate-800">{t.factories?.name ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{t.factories?.region ?? '—'}</td>
                    <td className="px-6 py-3">
                      {t.waste_type === 'liquid' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">💧 سائل</span>
                      ) : t.waste_type === 'solid' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">🪨 جاف</span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-700 text-xs">{t.volume_m3 != null ? `${t.volume_m3} م³` : '—'}</td>
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
                    <td className="px-6 py-3 text-slate-700 text-xs font-medium">{t.trip_date ? format(new Date(t.trip_date), 'dd/MM/yyyy') : '—'}</td>
                    <td className="px-6 py-3 text-slate-400 text-xs">{format(new Date(t.created_at), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="px-6 py-3 text-slate-400 text-xs max-w-[150px] truncate">{t.notes ?? '—'}</td>
                    {canEdit && (
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"><Pencil size={14} /></button>
                          <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Modal */}
      {editTrip && (
        <Modal open={!!editTrip} onClose={() => setEditTrip(null)} title={`تعديل نقلة — ${editTrip.factories?.name ?? ''}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">تاريخ النقلة</label>
              <Input type="date" value={editForm.trip_date} onChange={e => setEditForm(f => ({ ...f, trip_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">حالة الدفع</label>
              <Select value={editForm.payment_status} onChange={e => setEditForm(f => ({ ...f, payment_status: e.target.value }))}>
                <option value="credit">ذمة</option>
                <option value="paid">مدفوع</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">نوع الربو</label>
              <Select value={editForm.waste_type} onChange={e => setEditForm(f => ({ ...f, waste_type: e.target.value }))}>
                <option value="">غير محدد</option>
                <option value="liquid">💧 سائل</option>
                <option value="solid">🪨 جاف</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الحجم (م³)</label>
              <Input type="number" placeholder="0.00" value={editForm.volume_m3} onChange={e => setEditForm(f => ({ ...f, volume_m3: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
              <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات..." />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} loading={saving}>حفظ التغييرات</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setEditTrip(null)}>إلغاء</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="تأكيد الحذف">
          <div className="space-y-4">
            <p className="text-slate-600">هل أنت متأكد من حذف نقلة <span className="font-bold text-slate-800">{deleteTarget.factories?.name}</span>؟</p>
            <p className="text-xs text-red-500">⚠️ لا يمكن التراجع عن هذا الإجراء</p>
            <div className="flex gap-2 pt-2">
              <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleting}>نعم، احذف</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
