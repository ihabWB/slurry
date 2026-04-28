'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Search, MapPin, Phone, User, Edit2, BarChart2, Upload, FileSpreadsheet, Download, X, CheckCircle, AlertCircle } from 'lucide-react'
import { getFactories, createFactory, updateFactory, checkTagExists } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import type { Factory } from '@/lib/supabase/database.types'
import * as XLSX from 'xlsx'

const emptyForm = { name: '', owner_name: '', phone: '', lat: '', lng: '', region: '', tag_number: '', waste_type: '' }

export default function FactoriesPage() {
  const { canEdit } = useAuth()
  const [factories, setFactories] = useState<Factory[]>([])
  const [filtered, setFiltered] = useState<Factory[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Factory | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [tagStatus, setTagStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  const tagTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [regionMode, setRegionMode] = useState<'select' | 'new'>('select')

  // Excel import state
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<{ name: string; owner_name: string; phone: string; region: string; lat: string; lng: string; tag_number: string; waste_type: string; status: 'pending' | 'success' | 'error'; error?: string }[]>([])
  const [importing, setImporting] = useState(false)

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['اسم المصنع *', 'اسم المالك *', 'رقم الجوال *', 'المنطقة', 'خط العرض (lat) *', 'خط الطول (lng) *', 'رقم TAG', 'نوع الربو'],
      ['مصنع الأمل', 'محمد أحمد', '0599123456', 'شمال', '31.52345', '35.12345', 'T-001', 'سائل'],
      ['مصنع النور', 'خالد سعيد', '0598765432', 'جنوب', '31.48000', '35.09000', 'T-002', 'جاف'],
    ])
    ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'المصانع')
    XLSX.writeFile(wb, 'نموذج_استيراد_المصانع.xlsx')
  }

  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][]
        // Skip header row
        const parsed = rows.slice(1).filter(r => r && r[0] && String(r[0]).trim()).map(r => ({
          name: String(r[0] ?? '').trim(),
          owner_name: String(r[1] ?? '').trim(),
          phone: String(r[2] ?? '').trim(),
          region: String(r[3] ?? '').trim(),
          lat: String(r[4] ?? '').trim(),
          lng: String(r[5] ?? '').trim(),
          tag_number: String(r[6] ?? '').trim(),
          waste_type: String(r[7] ?? '').trim(),
          status: 'pending' as const,
        }))
        setImportRows(parsed)
      } catch {
        showToast('error', 'فشل قراءة الملف — تأكد من صيغة Excel')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const runImport = async () => {
    setImporting(true)
    const updated = [...importRows]
    for (let i = 0; i < updated.length; i++) {
      const r = updated[i]
      if (r.status === 'success') continue
      if (!r.name || !r.owner_name || !r.phone) {
        updated[i] = { ...r, status: 'error', error: 'حقول ناقصة (الاسم، المالك، الجوال مطلوبة)' }
        continue
      }
      const latVal = r.lat ? Number(r.lat) : null
      const lngVal = r.lng ? Number(r.lng) : null
      if ((r.lat && isNaN(latVal!)) || (r.lng && isNaN(lngVal!))) {
        updated[i] = { ...r, status: 'error', error: 'إحداثيات غير صحيحة' }
        continue
      }
      try {
        const wtRaw = r.waste_type.toLowerCase()
        const wt = wtRaw === 'سائل' || wtRaw === 'liquid' ? 'liquid' : wtRaw === 'جاف' || wtRaw === 'solid' ? 'solid' : null
        await createFactory({ name: r.name, owner_name: r.owner_name, phone: r.phone, region: r.region || '', lat: latVal, lng: lngVal, tag_number: r.tag_number || null, waste_type: wt })
        updated[i] = { ...r, status: 'success' }
      } catch (e: unknown) {
        updated[i] = { ...r, status: 'error', error: e instanceof Error ? e.message : 'خطأ' }
      }
      setImportRows([...updated])
    }
    setImporting(false)
    const successCount = updated.filter(r => r.status === 'success').length
    if (successCount > 0) { load(); showToast('success', `تم استيراد ${successCount} مصنع بنجاح`) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getFactories()
      setFactories(data)
      setFiltered(data)
    } catch {
      showToast('error', 'فشل تحميل المصانع')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(factories.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.owner_name.toLowerCase().includes(q) ||
      f.region.toLowerCase().includes(q)
    ))
  }, [search, factories])

  const openAdd = () => { setEditTarget(null); setForm(emptyForm); setTagStatus('idle'); setRegionMode('select'); setModalOpen(true) }
  const openEdit = (f: Factory) => {
    setEditTarget(f)
    setForm({ name: f.name, owner_name: f.owner_name, phone: f.phone, lat: String(f.lat), lng: String(f.lng), region: f.region, tag_number: f.tag_number ?? '', waste_type: f.waste_type ?? '' })
    setTagStatus('idle'); setRegionMode('select')
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.owner_name || !form.phone) {
      showToast('warning', 'يرجى ملء الحقول المطلوبة: الاسم، المالك، الجوال')
      return
    }
    if (tagStatus === 'taken') {
      showToast('error', 'رقم TAG مستخدم مسبقاً — يرجى اختيار رقم آخر')
      return
    }
    setSaving(true)
    try {
      const wt = (form.waste_type as 'liquid' | 'solid') || null
      const latNum = form.lat ? Number(form.lat) : null
      const lngNum = form.lng ? Number(form.lng) : null
      if (editTarget) {
        await updateFactory(editTarget.id, { name: form.name, owner_name: form.owner_name, phone: form.phone, lat: latNum, lng: lngNum, region: form.region, tag_number: form.tag_number || null, waste_type: wt })
        showToast('success', 'تم تعديل المصنع بنجاح')
      } else {
        await createFactory({ name: form.name, owner_name: form.owner_name, phone: form.phone, lat: latNum, lng: lngNum, region: form.region, tag_number: form.tag_number || null, waste_type: wt })
        showToast('success', 'تم إضافة المصنع بنجاح')
      }
      setModalOpen(false)
      load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ غير متوقع'
      showToast('error', msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">المصانع</h1>
          <p className="text-sm text-slate-500 mt-0.5">{factories.length} مصنع مسجل</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setImportRows([]); setImportOpen(true) }} size="lg">
              <FileSpreadsheet size={16} /> استيراد Excel
            </Button>
            <Button onClick={openAdd} size="lg">
              <Plus size={16} /> إضافة مصنع
            </Button>
          </div>
        )}
      </div>

      {/* Approximate coordinates warning banner */}
      {(() => { const approxCount = factories.filter(f => f.lat === 31.5 && f.lng === 35.1).length; return approxCount > 0 ? (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">{approxCount} مصنع {approxCount === 1 ? 'يحتاج' : 'يحتاجون'} تحديث الإحداثيات</p>
            <p className="text-xs text-amber-600 mt-0.5">هذه المصانع تستخدم إحداثيات تقريبية (31.5، 35.1) — يرجى تحديثها للظهور بشكل صحيح على الخريطة</p>
          </div>
        </div>
      ) : null })()}

      {/* Search & Filter */}
      <Card>
        <CardBody>
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو المالك أو المنطقة..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </CardBody>
      </Card>

      {/* Factory Cards Grid */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">🏭</p>
          <p>لا توجد مصانع مسجلة بعد</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(f => {
            const isApproxCoords = f.lat === 31.5 && f.lng === 35.1
            return (
            <Card key={f.id} className={`border-2 ${isApproxCoords ? 'border-amber-300' : f.balance > 0 ? 'border-red-100' : f.balance < 0 ? 'border-blue-100' : 'border-emerald-100'}`}>
              <CardBody>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800">{f.name}</h3>
                      {f.tag_number && (
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{f.tag_number}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{f.region || 'غير محدد'}</span>
                      {f.waste_type && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          f.waste_type === 'liquid' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          {f.waste_type === 'liquid' ? '💧 سائل' : '🪨 جاف'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {isApproxCoords && (
                      <span className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        ⚠️ إحداثيات تقريبية
                      </span>
                    )}
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      f.balance > 0 ? 'bg-red-50 text-red-600' : f.balance < 0 ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {f.balance > 0 ? `ذمة: ${f.balance} ₪` : f.balance < 0 ? `💳 رصيد دائن: ${Math.abs(f.balance)} ₪` : 'ملتزم ✓'}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <User size={13} className="text-slate-400" />
                    <span>{f.owner_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone size={13} className="text-slate-400" />
                    <span dir="ltr">{f.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={13} className={isApproxCoords ? 'text-amber-400' : 'text-slate-400'} />
                    <span dir="ltr" className="text-xs">
                      {f.lat != null && f.lng != null
                        ? <span className={isApproxCoords ? 'text-amber-600' : ''}>{f.lat.toFixed(5)}, {f.lng.toFixed(5)}</span>
                        : <span className="text-amber-500">📍 إحداثيات غير محددة</span>
                      }
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => openEdit(f)} className={`flex-1 ${isApproxCoords ? 'ring-1 ring-amber-300' : ''}`}>
                      <Edit2 size={13} /> {isApproxCoords ? 'تحديث الإحداثيات' : 'تعديل'}
                    </Button>
                  )}
                  <Link href={`/factories/${f.id}`} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full">
                      <BarChart2 size={13} /> كشف حساب
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'تعديل مصنع' : 'إضافة مصنع جديد'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="اسم المصنع *"
            placeholder="مثال: مصنع حجر الوادي"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          />
          <Input
            label="اسم المالك *"
            placeholder="الاسم الكامل"
            value={form.owner_name}
            onChange={e => setForm(p => ({ ...p, owner_name: e.target.value }))}
          />
          <Input
            label="رقم الجوال *"
            placeholder="05xxxxxxxx"
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
          />
          {/* المنطقة */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">المنطقة</p>
            {regionMode === 'select' ? (
              <div className="flex gap-2">
                <select
                  value={form.region}
                  onChange={e => setForm(p => ({ ...p, region: e.target.value }))}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="">اختر المنطقة</option>
                  {Array.from(new Set(factories.map(f => f.region).filter(Boolean))).sort().map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => { setRegionMode('new'); setForm(p => ({ ...p, region: '' })) }}
                  className="px-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors whitespace-nowrap"
                >
                  + جديدة
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  placeholder="اكتب اسم المنطقة الجديدة"
                  value={form.region}
                  onChange={e => setForm(p => ({ ...p, region: e.target.value }))}
                  className="flex-1 border-2 border-blue-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={() => { setRegionMode('select'); setForm(p => ({ ...p, region: '' })) }}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors whitespace-nowrap"
                >
                  ← قائمة
                </button>
              </div>
            )}
          </div>

          {/* رقم TAG */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">رقم TAG</p>
            <div className="relative">
              <input
                type="number"
                placeholder="مثال: 101"
                value={form.tag_number}
                onChange={e => {
                  const val = e.target.value.replace(/[^0-9]/g, '')
                  setForm(p => ({ ...p, tag_number: val }))
                  if (tagTimerRef.current) clearTimeout(tagTimerRef.current)
                  if (!val) { setTagStatus('idle'); return }
                  setTagStatus('checking')
                  tagTimerRef.current = setTimeout(async () => {
                    const taken = await checkTagExists(val, editTarget?.id)
                    setTagStatus(taken ? 'taken' : 'ok')
                  }, 500)
                }}
                className={`w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none transition-colors pr-8 ${
                  tagStatus === 'taken' ? 'border-red-400 focus:ring-2 focus:ring-red-300' :
                  tagStatus === 'ok'    ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-300' :
                                         'border-slate-200 focus:ring-2 focus:ring-blue-400'
                }`}
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">
                {tagStatus === 'checking' && <span className="text-slate-400 animate-pulse">...</span>}
                {tagStatus === 'ok'       && <span className="text-emerald-500">✓</span>}
                {tagStatus === 'taken'    && <span className="text-red-500">✗</span>}
              </span>
            </div>
            {tagStatus === 'taken' && (
              <p className="text-xs text-red-500 mt-1">هذا الرقم مستخدم مسبقاً</p>
            )}
            {tagStatus === 'ok' && (
              <p className="text-xs text-emerald-600 mt-1">الرقم متاح ✓</p>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">نوع الربو</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, waste_type: '' }))}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  form.waste_type === '' ? 'border-slate-400 bg-slate-50 text-slate-700' : 'border-slate-200 text-slate-500'
                }`}
              >
                غير محدد
              </button>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, waste_type: 'liquid' }))}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  form.waste_type === 'liquid' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                💧 سائل
              </button>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, waste_type: 'solid' }))}
                className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  form.waste_type === 'solid' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                🪨 جاف
              </button>
            </div>
          </div>
          <Input
            label="خط العرض (Latitude)"
            type="number"
            step="any"
            placeholder="31.12345 — اختياري"
            value={form.lat}
            onChange={e => setForm(p => ({ ...p, lat: e.target.value }))}
          />
          <Input
            label="خط الطول (Longitude)"
            type="number"
            step="any"
            placeholder="35.12345 — اختياري"
            value={form.lng}
            onChange={e => setForm(p => ({ ...p, lng: e.target.value }))}
          />
        </div>
        <div className="flex gap-3 mt-6">
          <Button onClick={handleSave} loading={saving} className="flex-1">
            {editTarget ? 'حفظ التعديلات' : 'إضافة المصنع'}
          </Button>
          <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1">
            إلغاء
          </Button>
        </div>
      </Modal>

      {/* Import Excel Modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="استيراد مصانع من Excel" size="lg">
        <div className="space-y-4">
          {/* Step 1: Download template */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-blue-800">الخطوة 1: تحميل النموذج</p>
              <p className="text-xs text-blue-600 mt-0.5">حمّل ملف Excel الجاهز، أضف المصانع، ثم ارفعه</p>
            </div>
            <Button variant="secondary" size="sm" onClick={downloadTemplate}>
              <Download size={14} /> تحميل النموذج
            </Button>
          </div>

          {/* Step 2: Upload file */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">الخطوة 2: رفع الملف المعبأ</p>
            <label className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
              <Upload size={18} className="text-slate-400" />
              <span className="text-sm text-slate-500">اضغط لاختيار ملف Excel (.xlsx أو .xls)</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelFile} />
            </label>
          </div>

          {/* Preview table */}
          {importRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-700">{importRows.length} مصنع جاهز للاستيراد</p>
                <button onClick={() => setImportRows([])} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
              </div>
              <div className="overflow-x-auto max-h-64 border border-slate-100 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-100">
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">الاسم</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">المالك</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">الجوال</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">المنطقة</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">TAG</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">نوع الربو</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">الإحداثيات</th>
                      <th className="text-center px-3 py-2 text-slate-500 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${
                        r.status === 'success' ? 'bg-emerald-50/40' : r.status === 'error' ? 'bg-red-50/40' : ''
                      }`}>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                        <td className="px-3 py-2 text-slate-600">{r.owner_name}</td>
                        <td className="px-3 py-2 text-slate-600" dir="ltr">{r.phone}</td>
                        <td className="px-3 py-2 text-slate-500">{r.region || '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{r.tag_number || '—'}</td>
                        <td className="px-3 py-2">
                          {r.waste_type ? (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              r.waste_type === 'سائل' || r.waste_type === 'liquid' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                            }`}>{r.waste_type}</span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-400" dir="ltr">{r.lat}, {r.lng}</td>
                        <td className="px-3 py-2 text-center">
                          {r.status === 'success' && <CheckCircle size={14} className="text-emerald-600 inline" />}
                          {r.status === 'error' && <span className="text-red-500 text-xs" title={r.error}><AlertCircle size={14} className="inline" /> {r.error}</span>}
                          {r.status === 'pending' && <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={runImport}
              loading={importing}
              disabled={importRows.filter(r => r.status === 'pending').length === 0}
              className="flex-1"
            >
              <Upload size={16} /> استيراد {importRows.filter(r => r.status === 'pending').length} مصنع
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(false)} className="flex-1">إغلاق</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
