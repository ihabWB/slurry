'use client'
import { useState, useCallback, useRef } from 'react'
import { ArrowRight, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Download } from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { getFactories, importTrips, getPricingRules, getSettings } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { useRouter } from 'next/navigation'
import type { Factory } from '@/lib/supabase/database.types'
import type { ImportTripRow, PricingRule } from '@/lib/api'

// ────────────────────────────────────────────────────────────
// Column aliases — maps any header name to our internal key
// ────────────────────────────────────────────────────────────
const COLUMN_MAP: Record<string, string> = {
  // factory (by tag, name, or uuid)
  'factory_id': 'factory_id', 'معرف المصنع': 'factory_id', 'id المصنع': 'factory_id',
  'اسم المصنع': 'factory_id', 'المصنع': 'factory_id', 'factory_name': 'factory_id', 'factory': 'factory_id',
  // tag
  'tag': 'tag_number', 'tag_number': 'tag_number', 'TAG': 'tag_number', 'TAG NUMBER': 'tag_number',
  'رقم tag': 'tag_number', 'رقم الـ tag': 'tag_number', 'الـ tag': 'tag_number', 'رمز المصنع': 'tag_number',
  'رقم TAG': 'tag_number', 'رقم الTAG': 'tag_number', 'الTAG': 'tag_number', 'tag number': 'tag_number',
  // date
  'trip_date': 'trip_date', 'تاريخ النقلة': 'trip_date', 'التاريخ': 'trip_date', 'date': 'trip_date',
  // payment_status
  'payment_status': 'payment_status', 'حالة الدفع': 'payment_status', 'الدفع': 'payment_status',
  // coupon
  'coupon_number': 'coupon_number', 'رقم الكوبون': 'coupon_number', 'الكوبون': 'coupon_number', 'رقم الوصل': 'coupon_number',
  // driver
  'driver_name': 'driver_name', 'اسم السائق': 'driver_name', 'السائق': 'driver_name',
  // vehicle
  'vehicle_type': 'vehicle_type', 'نوع المركبة': 'vehicle_type', 'المركبة': 'vehicle_type',
  // distance
  'distance_km': 'distance_km', 'المسافة': 'distance_km', 'المسافة كم': 'distance_km', 'distance': 'distance_km',
  'المسافة (≤7 / >7)': 'distance_km',
  // volume
  'volume_m3': 'volume_m3', 'حجم النقلة': 'volume_m3', 'الحجم': 'volume_m3', 'volume': 'volume_m3',
  'حجم النقلة (م³)': 'volume_m3',
  // waste type
  'waste_type': 'waste_type', 'نوع الربو': 'waste_type', 'نوع النفايات': 'waste_type',
  // dump site
  'dump_site': 'dump_site', 'اسم المكب': 'dump_site', 'المكب': 'dump_site',
  'وجهة النقل': 'dump_site', 'الوجهة': 'dump_site',
  // transfer zone
  'transfer_zone': 'transfer_zone', 'منطقة النقل': 'transfer_zone', 'المنطقة': 'transfer_zone',
  // notes
  'notes': 'notes', 'ملاحظات': 'notes',
}

function normalizeHeader(h: string): string {
  const clean = h.trim()
  // exact match first
  if (COLUMN_MAP[clean]) return COLUMN_MAP[clean]
  // case-insensitive match
  const lower = clean.toLowerCase()
  const found = Object.keys(COLUMN_MAP).find(k => k.toLowerCase() === lower)
  return found ? COLUMN_MAP[found] : ''
}

function normalizeDate(val: unknown): string {
  if (!val) return ''
  // Excel serial number
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val)
    const y = date.y, m = String(date.m).padStart(2, '0'), d = String(date.d).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val).trim()
  // DD/MM/YYYY or D/M/YYYY
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}`
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

function normalizePayment(val: unknown): 'paid' | 'credit' {
  const s = String(val ?? '').trim().toLowerCase()
  if (['paid', 'مدفوع', 'نقد', 'cash', '1'].includes(s)) return 'paid'
  return 'credit'
}

function normalizeVehicle(val: unknown): 'tank' | 'truck' | null {
  const s = String(val ?? '').trim().toLowerCase()
  if (['tank', 'تنك', 'صهريج'].includes(s)) return 'tank'
  if (['truck', 'شاحنة', 'شاحنه'].includes(s)) return 'truck'
  return null
}

function normalizeWaste(val: unknown): 'liquid' | 'solid' | null {
  const s = String(val ?? '').trim().toLowerCase()
  if (['liquid', 'سائل', 'سائله'].includes(s)) return 'liquid'
  if (['solid', 'جاف', 'صلب'].includes(s)) return 'solid'
  return null
}

// ≤7 كم → '7'  |  >7 كم → '9999'  |  غير معروف → null
function normalizeDistance(val: unknown): string | null {
  if (val === '' || val === undefined || val === null) return null
  const s = String(val).trim()
  // صريح
  if (['≤7', '<=7', '7', 'اقل من 7', 'أقل من 7', 'اقل او تساوي 7', '≤ 7', '≤7 كم', '<=7كم'].includes(s)) return '7'
  if (['>7', '>= 8', 'اكثر من 7', 'أكثر من 7', 'اكثر من 7 كم', '>7 كم', '9999'].includes(s)) return '9999'
  // رقم مباشر
  const n = parseFloat(s)
  if (!isNaN(n)) return n <= 7 ? '7' : '9999'
  return null
}

// يحوّل أي نص لـ dump_site الصحيح
function normalizeDumpSite(val: unknown): 'municipal_dump' | 'central_press' | null {
  const s = String(val ?? '').trim().toLowerCase()
  if (!s) return null
  if (
    s.includes('municipal') || s.includes('municipal_dump') ||
    s.includes('خلة') || s.includes('شرباتي') ||
    s.includes('سعير') || s.includes('بلدي') || s.includes('بلدية')
  ) return 'municipal_dump'
  if (
    s.includes('central') || s.includes('central_press') ||
    s.includes('عصارة') || s.includes('ربو') || s.includes('مركزي')
  ) return 'central_press'
  return null
}

interface PreviewRow extends ImportTripRow {
  _rowNum: number
  _factoryName?: string
  _errors: string[]
}

// ────────────────────────────────────────────────────────────
export default function ImportTripsPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [factories, setFactories] = useState<Factory[]>([])
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([])
  const [factoryContrib, setFactoryContrib] = useState(50)
  const [factoriesLoaded, setFactoriesLoaded] = useState(false)

  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: { row: number; reason: string }[] } | null>(null)

  // Load factories + pricing rules lazily on first file pick
  const ensureFactories = async () => {
    if (factoriesLoaded) return { factories, pricingRules, factoryContrib }
    const [list, rules, setts] = await Promise.all([getFactories(), getPricingRules(), getSettings()])
    setFactories(list)
    setPricingRules(rules)
    const contrib = setts.find(s => s.key === 'factory_contribution')
    const contribVal = contrib ? parseFloat(contrib.value) || 50 : 50
    setFactoryContrib(contribVal)
    setFactoriesLoaded(true)
    return { factories: list, pricingRules: rules, factoryContrib: contribVal }
  }

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name)
    const { factories: flist, pricingRules: rules, factoryContrib: contrib } = await ensureFactories()
    const factoryByName = new Map(flist.map(f => [f.name.trim().toLowerCase(), f]))
    const factoryByTag = new Map(
      flist.filter(f => f.tag_number).map(f => [String(f.tag_number!).trim().toLowerCase(), f])
    )
    showToast('info', `تم تحميل ${flist.length} مصنع — ${rules.length} قاعدة تسعيرة`)

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: false })
    const ws = wb.Sheets[wb.SheetNames[0]]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    if (raw.length < 2) { showToast('warning', 'الملف فارغ أو لا يحتوي بيانات'); return }

    const rawHeaders: string[] = (raw[0] as unknown[]).map(h => String(h))
    const headers: string[] = rawHeaders.map(h => normalizeHeader(h))
    const unknownHeaders = rawHeaders.filter((h, i) => h.trim() !== '' && headers[i] === '')
    if (unknownHeaders.length > 0) {
      showToast('warning', `أعمدة غير معروفة: ${unknownHeaders.join(' | ')}`)
    }
    const dataRows = raw.slice(1).filter(r => r.some((c: unknown) => String(c).trim() !== ''))

    const rows: PreviewRow[] = dataRows.map((r, i) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const get = (key: string): any => {
        const idx = headers.indexOf(key)
        return idx >= 0 ? r[idx] : undefined
      }

      const errors: string[] = []

      // factory — resolve by TAG first, then name, then UUID
      const raw_tag = String(get('tag_number') ?? '').trim()
      const raw_factory = String(get('factory_id') ?? '').trim()
      let factory_id = ''
      let factoryName: string | undefined

      // Priority 1: TAG number
      if (raw_tag) {
        const byTag = factoryByTag.get(raw_tag.toLowerCase())
        if (byTag) {
          factory_id = byTag.id
          factoryName = `${byTag.name} [${byTag.tag_number}]`
        }
        // TAG not found in DB — fall through to name/uuid below
      }

      // Priority 2: factory name (if TAG didn't resolve)
      if (!factory_id && raw_factory) {
        const byName = factoryByName.get(raw_factory.toLowerCase())
        if (byName) {
          factory_id = byName.id
          factoryName = byName.name
        } else {
          // Priority 3: direct UUID
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw_factory)
          if (isUUID) {
            factory_id = raw_factory
            factoryName = flist.find(f => f.id === raw_factory)?.name ?? raw_factory
          }
        }
      }

      // Still not resolved
      if (!factory_id) {
        if (raw_tag && !raw_factory) errors.push(`لم يُعثر على TAG: "${raw_tag}" — تأكد من إضافة TAG للمصانع أولاً`)
        else if (!raw_tag && !raw_factory) errors.push('المصنع مفقود (TAG أو الاسم)')
        else errors.push(`لم يُعثر على المصنع: TAG="${raw_tag}" الاسم="${raw_factory}"`)
        factoryName = raw_tag || raw_factory || '—'
      }

      const trip_date = normalizeDate(get('trip_date'))
      if (!trip_date) errors.push('تاريخ مفقود')

      const coupon_raw = String(get('coupon_number') ?? '').trim()
      if (!coupon_raw) errors.push('رقم الكوبون مفقود')

      // المسافة: ≤7 → '7'  |  >7 → '9999'
      const distance_km = normalizeDistance(get('distance_km'))
      if (!distance_km) errors.push('المسافة مفقودة أو غير صحيحة (القيم المقبولة: ≤7 أو >7)')

      // الحجم: 10 أو 15 فقط
      const vol_raw = get('volume_m3')
      const volume_m3 = vol_raw !== '' && vol_raw !== undefined ? Number(vol_raw) : null
      if (volume_m3 !== null && volume_m3 !== 10 && volume_m3 !== 15) {
        errors.push(`حجم غير صحيح: ${volume_m3} — القيم المقبولة: 10 أو 15`)
      }

      // نوع الربو
      const waste_type = normalizeWaste(get('waste_type'))

      // وجهة النقل
      const dump_site = normalizeDumpSite(get('dump_site'))

      // validation: عصارة الربو لا تُقبل مع >7 كم
      if (distance_km === '9999' && dump_site === 'central_press') {
        errors.push('عصارة الربو المركزية غير متاحة للمسافات > 7 كم')
      }

      // حساب trip_cost من جدول التسعيرة
      let trip_cost: number | null = null
      let factory_contribution: number | null = null
      let subsidy_amount: number | null = null
      if (waste_type && volume_m3 && distance_km && dump_site) {
        const maxDist = parseFloat(distance_km)
        const matched = rules.find(r =>
          r.waste_type === waste_type &&
          r.volume_m3 === volume_m3 &&
          r.max_distance_km === maxDist &&
          r.dump_site === dump_site
        )
        if (matched) {
          trip_cost = matched.unit_price
          factory_contribution = contrib  // من جدول الإعدادات
          subsidy_amount = trip_cost - factory_contribution
        }
      }

      return {
        _rowNum: i + 2,
        _factoryName: factoryName,
        _errors: errors,
        factory_id,
        trip_date,
        payment_status: normalizePayment(get('payment_status')),
        coupon_number: coupon_raw || null,
        driver_name: String(get('driver_name') ?? '').trim() || null,
        vehicle_type: normalizeVehicle(get('vehicle_type')),
        distance_km: distance_km ? parseFloat(distance_km) : null,
        volume_m3,
        waste_type,
        dump_site,
        transfer_zone: String(get('transfer_zone') ?? '').trim() || null,
        notes: String(get('notes') ?? '').trim() || null,
        trip_cost,
        factory_contribution,
        subsidy_amount,
      }
    })

    setPreview(rows)
    setStep('preview')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoriesLoaded])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const validRows = preview.filter(r => r._errors.length === 0)
  const invalidRows = preview.filter(r => r._errors.length > 0)

  const handleImport = async () => {
    if (validRows.length === 0) { showToast('warning', 'لا توجد صفوف صالحة للاستيراد'); return }
    setImporting(true)
    try {
      const res = await importTrips(validRows)
      setResult(res)
      setStep('done')
      showToast('success', `تم استيراد ${res.inserted} نقلة بنجاح`)
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setImporting(false)
    }
  }

  // Download template
  const downloadTemplate = () => {
    const headers = ['رقم TAG', 'رقم الكوبون', 'تاريخ النقلة', 'حالة الدفع', 'المسافة', 'وجهة النقل', 'نوع الربو', 'حجم النقلة (م³)', 'اسم السائق', 'نوع المركبة', 'منطقة النقل', 'ملاحظات']
    const sample1 = ['7',   'K-001', '15/01/2026', 'مدفوع', '≤7', 'مكب خلة الشرباتي',    'سائل', '10', 'أحمد محمود', 'تنك',    'رام الله', '']
    const sample2 = ['13',  'K-002', '16/01/2026', 'ذمة',   '>7', 'مكب سعير',              'جاف',  '15', 'محمد علي',  'شاحنة',  'البيرة',   '']
    const sample3 = ['21',  'K-003', '17/01/2026', 'مدفوع', '≤7', 'عصارة الربو المركزية', 'سائل', '15', 'خالد سعيد', 'تنك',    'بيتونيا',  '']
    const guide   = ['', '', '', 'مدفوع / ذمة', '≤7 أو >7', 'مكب خلة الشرباتي / مكب سعير / عصارة الربو المركزية', 'سائل / جاف', '10 أو 15', '', 'تنك / شاحنة', '', '']
    const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2, sample3, [], guide])
    // تنسيق العناوين
    ws['!cols'] = [14, 14, 14, 12, 10, 26, 10, 16, 16, 12, 14, 14].map(wch => ({ wch }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'النقلات')
    XLSX.writeFile(wb, 'template_trips.xlsx')
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/trips">
          <Button variant="ghost" size="sm"><ArrowRight size={16} /> رجوع</Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800">استيراد نقلات من Excel</h1>
          <p className="text-sm text-slate-500">ارفع ملف Excel للاستيراد الجماعي</p>
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          {/* Template download */}
          <Card className="border-blue-100 bg-blue-50">
            <CardBody className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-800">📋 نموذج Excel جاهز</p>
                <p className="text-xs text-blue-600 mt-0.5">حمّل النموذج وعبّئه بالبيانات — يدعم أسماء الأعمدة بالعربي والإنجليزي</p>
              </div>
              <Button variant="secondary" size="sm" onClick={downloadTemplate}>
                <Download size={14} /> تحميل النموذج
              </Button>
            </CardBody>
          </Card>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors group"
          >
            <div className="w-16 h-16 rounded-2xl bg-slate-100 group-hover:bg-blue-50 flex items-center justify-center transition-colors">
              <FileSpreadsheet size={32} className="text-slate-400 group-hover:text-blue-500" />
            </div>
            <div className="text-center">
              <p className="font-medium text-slate-700">اسحب ملف Excel هنا أو اضغط للاختيار</p>
              <p className="text-sm text-slate-400 mt-1">xlsx, xls — الحجم الأقصى 10MB</p>
            </div>
            <Button variant="secondary" size="sm" onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>
              <Upload size={14} /> اختيار ملف
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />

          {/* Column guide */}
          <Card>
            <CardHeader><h2 className="font-semibold text-slate-700 text-sm">🗂 أعمدة الملف المدعومة</h2></CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-slate-600">
                <div className="flex gap-2"><span className="font-mono bg-blue-50 border border-blue-200 px-1.5 rounded text-blue-800">رقم TAG</span><span className="text-red-500">*الأساسي — رقم TAG المصنع</span></div>
                <div className="flex gap-2"><span className="font-mono bg-slate-100 px-1.5 rounded text-slate-800">رقم الكوبون</span><span className="text-red-500">*إجباري</span></div>
                <div className="flex gap-2"><span className="font-mono bg-slate-100 px-1.5 rounded text-slate-800">تاريخ النقلة</span><span className="text-red-500">*إجباري — DD/MM/YYYY</span></div>
                <div className="flex gap-2"><span className="font-mono bg-slate-100 px-1.5 rounded text-slate-800">المسافة</span><span className="text-red-500">*إجباري — <span className="font-bold">≤7</span> أو <span className="font-bold">&gt;7</span></span></div>
                <div className="flex gap-2"><span className="font-mono bg-slate-100 px-1.5 rounded text-slate-800">وجهة النقل</span><span className="text-slate-500">مكب خلة الشرباتي / مكب سعير / عصارة الربو المركزية</span></div>
                <div className="flex gap-2"><span className="font-mono bg-slate-100 px-1.5 rounded text-slate-800">نوع الربو</span><span className="text-slate-500">سائل / جاف</span></div>
                <div className="flex gap-2"><span className="font-mono bg-slate-100 px-1.5 rounded text-slate-800">حجم النقلة (م³)</span><span className="text-slate-500">10 أو 15 فقط</span></div>
                <div className="flex gap-2"><span className="font-mono bg-slate-100 px-1.5 rounded text-slate-800">حالة الدفع</span><span className="text-slate-500">مدفوع / ذمة</span></div>
                <div className="flex gap-2"><span className="font-mono bg-slate-100 px-1.5 rounded text-slate-800">اسم السائق</span><span className="text-slate-400">اختياري</span></div>
                <div className="flex gap-2"><span className="font-mono bg-slate-100 px-1.5 rounded text-slate-800">نوع المركبة</span><span className="text-slate-400">تنك / شاحنة</span></div>
                <div className="flex gap-2"><span className="font-mono bg-slate-100 px-1.5 rounded text-slate-800">منطقة النقل</span><span className="text-slate-400">اختياري</span></div>
              </div>
              <p className="text-xs text-violet-600 mt-3 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                💡 سعر الوحدة يُحسب تلقائياً من جدول التسعيرة عند تعبئة: المسافة + الوجهة + نوع الربو + الحجم
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-slate-50">
              <CardBody className="text-center py-3">
                <p className="text-2xl font-bold text-slate-800">{preview.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">إجمالي الصفوف</p>
              </CardBody>
            </Card>
            <Card className="bg-emerald-50 border-emerald-200">
              <CardBody className="text-center py-3">
                <p className="text-2xl font-bold text-emerald-700">{validRows.length}</p>
                <p className="text-xs text-emerald-600 mt-0.5">صالح للاستيراد</p>
              </CardBody>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardBody className="text-center py-3">
                <p className="text-2xl font-bold text-red-600">{invalidRows.length}</p>
                <p className="text-xs text-red-500 mt-0.5">يحتوي أخطاء</p>
              </CardBody>
            </Card>
          </div>

          {/* Error list */}
          {invalidRows.length > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-500" />
                  <h2 className="font-semibold text-red-700 text-sm">صفوف بها أخطاء — لن يتم استيرادها</h2>
                </div>
              </CardHeader>
              <CardBody className="space-y-1.5 max-h-40 overflow-y-auto">
                {invalidRows.map(r => (
                  <div key={r._rowNum} className="flex items-start gap-2 text-xs">
                    <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono flex-shrink-0">صف {r._rowNum}</span>
                    <span className="text-red-600">{r._errors.join(' · ')}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {/* Preview table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-700 text-sm">معاينة الصفوف الصالحة — {fileName}</h2>
                <button onClick={() => { setStep('upload'); setPreview([]) }} className="text-xs text-slate-400 hover:text-slate-600">تغيير الملف</button>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">الصف</th>
                      <th className="px-3 py-2 text-right font-medium text-blue-600 whitespace-nowrap">TAG</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">المصنع</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">التاريخ</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">الكوبون</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">المسافة</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">السائق</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">المركبة</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">الدفع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {validRows.map(r => (
                      <tr key={r._rowNum} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-400 font-mono">{r._rowNum}</td>
                        <td className="px-3 py-2 font-mono text-blue-700 font-semibold">{r._factoryName?.match(/\[(.+)\]/)?.[1] ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-700 max-w-[140px] truncate">{r._factoryName?.replace(/\s*\[.+\]$/, '')}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.trip_date}</td>
                        <td className="px-3 py-2 font-mono text-slate-800">{r.coupon_number}</td>
                        <td className="px-3 py-2 text-slate-600">{r.distance_km} كم</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[100px] truncate">{r.driver_name ?? '—'}</td>
                        <td className="px-3 py-2">
                          {r.vehicle_type === 'tank' ? '🛢️ تنك' : r.vehicle_type === 'truck' ? '🚚 شاحنة' : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded-full font-medium ${r.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {r.payment_status === 'paid' ? 'مدفوع' : 'ذمة'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length === 0 && (
                  <div className="text-center py-10 text-slate-400 text-sm">لا توجد صفوف صالحة</div>
                )}
              </div>
            </CardBody>
          </Card>

          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => { setStep('upload'); setPreview([]) }}>رجوع</Button>
            <Button
              onClick={handleImport}
              loading={importing}
              disabled={validRows.length === 0}
              className="flex-1"
              size="lg"
            >
              <Upload size={16} />
              استيراد {validRows.length} نقلة
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 'done' && result && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={32} className="text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-bold text-emerald-800 text-lg">اكتمل الاستيراد</p>
                <p className="text-sm text-emerald-600">تم معالجة الملف بنجاح</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl p-3 text-center border border-emerald-100">
                <p className="text-2xl font-bold text-emerald-700">{result.inserted}</p>
                <p className="text-xs text-slate-500 mt-0.5">نقلة أُضيفت</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center border border-slate-100">
                <p className="text-2xl font-bold text-amber-600">{result.skipped}</p>
                <p className="text-xs text-slate-500 mt-0.5">صف تجاهلت</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center border border-slate-100">
                <p className="text-2xl font-bold text-red-500">{result.errors.length}</p>
                <p className="text-xs text-slate-500 mt-0.5">خطأ</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-white rounded-xl border border-red-100 p-3 space-y-1 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <XCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <span className="text-red-600">صف {e.row}: {e.reason}</span>
                  </div>
                ))}
              </div>
            )}
            <Button onClick={() => router.push('/trips')} className="w-full" size="lg">
              العودة لقائمة النقلات
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
