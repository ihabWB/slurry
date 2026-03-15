'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Filter, Download } from 'lucide-react'
import { getTrips } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import Link from 'next/link'
import { format } from 'date-fns'
import { useAuth } from '@/context/AuthContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Trip = any

export default function TripsPage() {
  const { canEdit } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'paid' | 'credit'>('all')

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
          <Link href="/trips/new">
            <Button size="lg"><Plus size={16} /> تسجيل نقلة</Button>
          </Link>
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
