import { createClient } from '@/lib/supabase/client'
import type { Factory, FactoryInsert, FactoryUpdate, Trip, TripInsert, Payment, PaymentInsert, Disbursement } from '@/lib/supabase/database.types'

// ─── FACTORIES ───────────────────────────────────────────────

export async function getFactories() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('factories').select('*').order('name')
  if (error) throw error
  return data as Factory[]
}

// جلب ملخص مالي شامل لكل المصانع (للتقارير)
export async function getFactoriesSummary() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [factoriesRes, tripsRes, paymentsRes] = await Promise.all([
    (supabase as any).from('factories').select('id, name, owner_name, phone, region'),
    (supabase as any).from('trips').select('id, factory_id, payment_status, payment_method, amount'),
    (supabase as any).from('payments').select('factory_id, amount_paid'),
  ])
  if (factoriesRes.error) throw factoriesRes.error
  if (tripsRes.error) throw tripsRes.error
  if (paymentsRes.error) throw paymentsRes.error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (factoriesRes.data as any[]).map((f: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trips = (tripsRes.data as any[]).filter((t: any) => t.factory_id === f.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payments = (paymentsRes.data as any[]).filter((p: any) => p.factory_id === f.id)
    const totalTrips = trips.length
    const cashTrips = trips.filter((t: any) => t.payment_method === 'cash').length
    const laterTrips = trips.filter((t: any) => t.payment_status === 'paid' && t.payment_method === 'later').length
    const creditTrips = trips.filter((t: any) => t.payment_status === 'credit').length
    const totalAmount = totalTrips * 50
    const paymentsTotal = payments.reduce((s: number, p: any) => s + Number(p.amount_paid), 0)
    const totalPaid = cashTrips * 50 + paymentsTotal
    const balance = creditTrips * 50
    return { ...f, totalTrips, cashTrips, laterTrips, creditTrips, totalAmount, totalPaid, balance }
  })
}

export async function getFactoriesWithTripCount() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('factories')
    .select('*, trips(count)')
    .order('name')
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((f: any) => ({
    ...f,
    trip_count: f.trips?.[0]?.count ?? 0,
  }))
}

export async function getFactory(id: string) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('factories').select('*').eq('id', id).single()
  if (error) throw error
  return data as Factory
}

export async function createFactory(factory: FactoryInsert) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('factories').insert(factory).select().single()
  if (error) throw error
  return data as Factory
}

export async function updateFactory(id: string, updates: FactoryUpdate) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('factories')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Factory
}

// ─── TRIPS ───────────────────────────────────────────────────

export async function getTrips(filters?: {
  factory_id?: string
  from?: string
  to?: string
  payment_status?: 'paid' | 'credit'
  approval_status?: 'draft' | 'pending_approval' | 'approved' | 'rejected'
  coupon_number?: string
  search?: string // بحث بالاسم (factory name)
  unpriced?: boolean // نقلات بدون تسعيرة فقط
}) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any)
    .from('trips')
    .select('*, factories(name, region)')
    .order('trip_date', { ascending: false })

  if (filters?.factory_id) query = query.eq('factory_id', filters.factory_id)
  if (filters?.payment_status) query = query.eq('payment_status', filters.payment_status)
  if (filters?.approval_status) query = query.eq('approval_status', filters.approval_status)
  if (filters?.from) query = query.gte('trip_date', filters.from.substring(0, 10))
  if (filters?.to) query = query.lte('trip_date', filters.to.substring(0, 10))
  if (filters?.coupon_number) query = query.ilike('coupon_number', `%${filters.coupon_number}%`)
  if (filters?.unpriced) query = query.is('trip_cost', null)

  const { data, error } = await query
  if (error) throw error

  // فلتر اسم المصنع (client-side لأن Supabase لا يدعم filter على join مباشرة)
  if (filters?.search) {
    const s = filters.search.toLowerCase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).filter((t: any) =>
      t.factories?.name?.toLowerCase().includes(s) ||
      t.factories?.region?.toLowerCase().includes(s)
    )
  }

  return data
}

// ─── IMPORT ──────────────────────────────────────────────────

export interface ImportTripRow {
  factory_id: string
  trip_date: string         // YYYY-MM-DD
  payment_status: 'paid' | 'credit'
  coupon_number?: string | null
  driver_name?: string | null
  vehicle_type?: 'tank' | 'truck' | null
  distance_km?: number | null
  volume_m3?: number | null
  waste_type?: 'liquid' | 'solid' | null
  dump_site?: string | null
  transfer_zone?: string | null
  notes?: string | null
  trip_cost?: number | null
  factory_contribution?: number | null
  subsidy_amount?: number | null
}

export interface ImportResult {
  inserted: number
  skipped: number
  errors: { row: number; reason: string }[]
}

export async function importTrips(rows: ImportTripRow[]): Promise<ImportResult> {
  const supabase = createClient()
  const result: ImportResult = { inserted: 0, skipped: 0, errors: [] }

  // Check existing coupon numbers in one query
  const couponNumbers = rows.map(r => r.coupon_number).filter(Boolean) as string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let existingCoupons: string[] = []
  if (couponNumbers.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('trips')
      .select('coupon_number')
      .in('coupon_number', couponNumbers)
    existingCoupons = (data ?? []).map((r: any) => r.coupon_number)
  }

  const toInsert: TripInsert[] = []
  const seenCoupons = new Set<string>()

  // ── جلب الفترات المقفلة مرة واحدة ──────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: closedDisb } = await (supabase as any)
    .from('disbursements')
    .select('period_from, period_to')
    .eq('status', 'closed')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const closedPeriods: { period_from: string; period_to: string }[] = closedDisb ?? []

  function isInLockedPeriod(date: string): boolean {
    return closedPeriods.some(p => date >= p.period_from && date <= p.period_to)
  }

  rows.forEach((row, i) => {
    const rowNum = i + 2 // Excel row number (1=header)

    // فحص الفترة المقفلة
    if (isInLockedPeriod(row.trip_date)) {
      result.errors.push({ row: rowNum, reason: `التاريخ ${row.trip_date} ضمن فترة مقفلة — تم صرف دفعتها` })
      result.skipped++
      return
    }

    if (row.coupon_number) {
      if (existingCoupons.includes(row.coupon_number)) {
        result.errors.push({ row: rowNum, reason: `رقم الكوبون "${row.coupon_number}" موجود مسبقاً` })
        result.skipped++
        return
      }
      if (seenCoupons.has(row.coupon_number)) {
        result.errors.push({ row: rowNum, reason: `رقم الكوبون "${row.coupon_number}" مكرر في الملف` })
        result.skipped++
        return
      }
      seenCoupons.add(row.coupon_number)
    }
    toInsert.push({
      factory_id: row.factory_id,
      trip_date: row.trip_date,
      amount: 50,
      payment_status: row.payment_status,
      payment_method: row.payment_status === 'paid' ? 'cash' : null,
      coupon_number: row.coupon_number ?? null,
      driver_name: row.driver_name ?? null,
      vehicle_type: row.vehicle_type ?? null,
      distance_km: row.distance_km ?? null,
      volume_m3: row.volume_m3 ?? null,
      waste_type: row.waste_type ?? null,
      dump_site: row.dump_site ?? null,
      transfer_zone: row.transfer_zone ?? null,
      notes: row.notes ?? null,
      trip_cost: row.trip_cost ?? null,
      factory_contribution: row.factory_contribution ?? null,
      subsidy_amount: row.subsidy_amount ?? null,
    })
  })

  if (toInsert.length > 0) {
    // Insert in batches of 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('trips').insert(batch)
      if (error) throw new Error(translateTripError(error))
      result.inserted += batch.length
    }
  }

  return result
}

export async function checkCouponExists(couponNumber: string, excludeId?: string): Promise<boolean> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('trips')
    .select('id')
    .eq('coupon_number', couponNumber)
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query
  return Array.isArray(data) && data.length > 0
}

export async function checkTagExists(tagNumber: string, excludeId?: string): Promise<boolean> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('factories')
    .select('id')
    .eq('tag_number', tagNumber)
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query
  return Array.isArray(data) && data.length > 0
}

function translateTripError(error: { code?: string; message?: string }): string {
  if (error.code === '23505' || error.message?.includes('trips_coupon_number_unique')) {
    return 'رقم الكوبون مستخدم مسبقاً — يرجى إدخال رقم آخر'
  }
  return error.message ?? 'حدث خطأ غير متوقع'
}

export async function createTrip(trip: TripInsert) {
  const supabase = createClient()
  const payment_method = trip.payment_status === 'paid' ? 'cash' : null

  // ── حماية: رفض النقلات ضمن فترة مقفلة ──────────────────
  const tripDate = trip.trip_date ?? new Date().toISOString().slice(0, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lockedPeriods } = await (supabase as any)
    .from('disbursements')
    .select('id, period_from, period_to')
    .eq('status', 'closed')
    .lte('period_from', tripDate)
    .gte('period_to', tripDate)
    .limit(1)
  if (lockedPeriods && lockedPeriods.length > 0) {
    throw new Error('الفترة مقفلة — تم صرف الدفعة لهذه الفترة الزمنية ولا يمكن إضافة نقلات إليها')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trips')
    .insert({
      ...trip,
      amount: 50,
      payment_method,
      approval_status: 'draft',
      coupon_number: trip.coupon_number ?? null,
      driver_name: trip.driver_name ?? null,
      vehicle_type: trip.vehicle_type ?? null,
      distance_km: trip.distance_km ?? null,
      dump_site: trip.dump_site ?? null,
      transfer_zone: trip.transfer_zone ?? null,
      trip_cost: trip.trip_cost ?? null,
      factory_contribution: trip.factory_contribution ?? null,
      subsidy_amount: trip.subsidy_amount ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(translateTripError(error))

  // إذا كانت النقلة بحالة credit وللمصنع رصيد دائن → غطّيها تلقائياً
  if (data.payment_status === 'credit' && trip.factory_id) {
    await applyFactoryCreditToNewTrip(data.id, trip.factory_id)
  }

  return data as Trip
}

export async function updateTrip(id: string, updates: {
  volume_m3?: number | null
  waste_type?: 'liquid' | 'solid' | null
  notes?: string | null
  payment_status?: 'paid' | 'credit'
  trip_date?: string
  distance_km?: number | null
  dump_site?: 'municipal_dump' | 'central_press' | null
  transfer_zone?: string | null
  driver_name?: string | null
  vehicle_type?: 'tank' | 'truck' | null
  coupon_number?: string | null
}) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('trips').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data as Trip
}

export async function deleteTrip(id: string) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('trips').delete().eq('id', id)
  if (error) throw error
}

// ─── TRIP APPROVAL ───────────────────────────────────────────

/** المدير: رفع كل النقلات draft للاعتماد دفعة وحدة */
export async function submitAllDraftTrips(): Promise<number> {
  const supabase = createClient()
  const now = new Date().toISOString()
  const { data: { user } } = await supabase.auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trips')
    .update({ approval_status: 'pending_approval', submitted_at: now, submitted_by: user?.id ?? null })
    .eq('approval_status', 'draft')
    .select('id')
  if (error) throw error
  return (data ?? []).length
}

/** رفع نقلة واحدة للاعتماد (بغض النظر عن حالتها الحالية) */
export async function submitTrip(id: string): Promise<void> {
  const supabase = createClient()
  const now = new Date().toISOString()
  const { data: { user } } = await supabase.auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trips')
    .update({ approval_status: 'pending_approval', submitted_at: now, submitted_by: user?.id ?? null })
    .eq('id', id)
  if (error) throw error
}
export async function approveTrip(id: string): Promise<void> {
  const supabase = createClient()
  const now = new Date().toISOString()
  const { data: { user } } = await supabase.auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trips')
    .update({ approval_status: 'approved', approved_at: now, approved_by: user?.id ?? null, rejection_note: null })
    .eq('id', id)
  if (error) throw error
}

/** الأدمن: رفض نقلة مع سبب */
export async function rejectTrip(id: string, note: string): Promise<void> {
  const supabase = createClient()
  const now = new Date().toISOString()
  const { data: { user } } = await supabase.auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trips')
    .update({ approval_status: 'rejected', rejected_at: now, rejected_by: user?.id ?? null, rejection_note: note })
    .eq('id', id)
  if (error) throw error
}

/** الأدمن: اعتماد كل النقلات pending دفعة وحدة */
export async function approveAllPendingTrips(): Promise<number> {
  const supabase = createClient()
  const now = new Date().toISOString()
  const { data: { user } } = await supabase.auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trips')
    .update({ approval_status: 'approved', approved_at: now, approved_by: user?.id ?? null, rejection_note: null })
    .eq('approval_status', 'pending_approval')
    .select('id')
  if (error) throw error
  return (data ?? []).length
}

/** الأدمن: تعديل نقلة pending ثم اعتمادها مباشرة */
export async function editAndApproveTrip(id: string, updates: {
  volume_m3?: number | null
  waste_type?: 'liquid' | 'solid' | null
  notes?: string | null
  payment_status?: 'paid' | 'credit'
  trip_date?: string
  trip_cost?: number | null
  factory_contribution?: number | null
  subsidy_amount?: number | null
  coupon_number?: string | null
  driver_name?: string | null
  distance_km?: number | null
  dump_site?: string | null
  transfer_zone?: string | null
}): Promise<void> {
  const supabase = createClient()
  const now = new Date().toISOString()
  const { data: { user } } = await supabase.auth.getUser()

  // ── إعادة حساب التسعيرة تلقائياً إذا توفرت البيانات ──────────
  let computedCost: number | null = updates.trip_cost ?? null
  let computedContrib: number | null = updates.factory_contribution ?? null
  let computedSubsidy: number | null = updates.subsidy_amount ?? null

  const wt   = updates.waste_type
  const vol  = updates.volume_m3
  const dist = updates.distance_km
  const ds   = updates.dump_site

  if (wt && vol != null && dist != null && ds) {
    // جلب قواعد التسعيرة وإعداد الإعدادات
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [rulesRes, settingsRes] = await Promise.all([
      (supabase as any).from('pricing_rules').select('*'),
      (supabase as any).from('settings').select('key,value').eq('key', 'factory_contribution'),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rules: any[] = rulesRes.data ?? []
    const maxDist = dist <= 7 ? 7 : 9999
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = rules.find((r: any) =>
      r.waste_type === wt &&
      r.volume_m3 === vol &&
      r.max_distance_km === maxDist &&
      r.dump_site === ds
    )
    if (match) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contrib = Number((settingsRes.data ?? []).find((s: any) => s.key === 'factory_contribution')?.value ?? 50)
      computedCost    = match.unit_price
      computedContrib = contrib
      computedSubsidy = match.unit_price - contrib
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trips')
    .update({
      ...updates,
      trip_cost:            computedCost,
      factory_contribution: computedContrib,
      subsidy_amount:       computedSubsidy,
      approval_status: 'approved',
      approved_at:     now,
      approved_by:     user?.id ?? null,
      rejection_note:  null,
    })
    .eq('id', id)
  if (error) throw error
}

/** الأدمن: إلغاء اعتماد نقلة معتمدة → ترجع لحالة pending_approval */
export async function revokeApproval(id: string): Promise<void> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trips')
    .update({
      approval_status: 'pending_approval',
      approved_at: null,
      approved_by: null,
      rejection_note: null,
    })
    .eq('id', id)
  if (error) throw error
}

/** إحصائيات الاعتماد للشريط العلوي */
export async function getTripApprovalStats(): Promise<{
  draft: number
  pending_approval: number
  approved: number
  rejected: number
}> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trips')
    .select('approval_status')
  if (error) throw error
  const stats = { draft: 0, pending_approval: 0, approved: 0, rejected: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(data ?? []).forEach((r: any) => {
    if (r.approval_status in stats) stats[r.approval_status as keyof typeof stats]++
  })
  return stats
}

/** آخر N نقلة معتمدة — للأدمن لمراجعة الاعتماد */
export async function getRecentApprovedTrips(limit = 20, offset = 0): Promise<Trip[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trips')
    .select('*, factories(name, region)')
    .eq('approval_status', 'approved')
    .order('approved_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return (data ?? []) as Trip[]
}

export async function deletePayment(id: string) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('payments').delete().eq('id', id)
  if (error) throw error
}

// ─── خطة vs فعلي ─────────────────────────────────────────────
const PLAN_HOLIDAYS = ['2026-03-19', '2026-03-20', '2026-03-21', '2026-03-22']
const PLAN_LIQUID_PER_DAY = 32   // نقلة/يوم
const PLAN_SOLID_PER_DAY  = 24   // نقلة/يوم
const PLAN_M3_PER_TRIP    = 15   // م³/نقلة

function countWorkingDays(from: Date, to: Date): number {
  let count = 0
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  while (cur <= end) {
    const iso = cur.toISOString().split('T')[0]
    const isFriday = cur.getDay() === 5
    const isHoliday = PLAN_HOLIDAYS.includes(iso)
    if (!isFriday && !isHoliday) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export async function getPlanVsActual(): Promise<{
  startDate: string
  workingDays: number
  liquid: { planned: number; actual: number; plannedM3: number; actualM3: number }
  solid:  { planned: number; actual: number; plannedM3: number; actualM3: number }
}> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trips')
    .select('trip_date, waste_type, volume_m3')
    .order('trip_date', { ascending: true })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trips: any[] = data ?? []
  if (trips.length === 0) {
    return {
      startDate: '',
      workingDays: 0,
      liquid: { planned: 0, actual: 0, plannedM3: 0, actualM3: 0 },
      solid:  { planned: 0, actual: 0, plannedM3: 0, actualM3: 0 },
    }
  }
  const startDate = trips[0].trip_date as string
  const today = new Date()
  const workingDays = countWorkingDays(new Date(startDate), today)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liquidTrips = trips.filter((t: any) => t.waste_type === 'liquid')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const solidTrips  = trips.filter((t: any) => t.waste_type === 'solid')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sumM3 = (arr: any[]) => arr.reduce((s: number, t: any) => s + (Number(t.volume_m3) || PLAN_M3_PER_TRIP), 0)

  return {
    startDate,
    workingDays,
    liquid: {
      planned:   workingDays * PLAN_LIQUID_PER_DAY,
      actual:    liquidTrips.length,
      plannedM3: workingDays * PLAN_LIQUID_PER_DAY * PLAN_M3_PER_TRIP,
      actualM3:  sumM3(liquidTrips),
    },
    solid: {
      planned:   workingDays * PLAN_SOLID_PER_DAY,
      actual:    solidTrips.length,
      plannedM3: workingDays * PLAN_SOLID_PER_DAY * PLAN_M3_PER_TRIP,
      actualM3:  sumM3(solidTrips),
    },
  }
}

export interface BulkTripExtra {
  notes?: string
  volume_m3?: number | null
  waste_type?: 'liquid' | 'solid' | null
  coupon_number?: string | null
  driver_name?: string | null
  vehicle_type?: 'tank' | 'truck' | null
  distance_km?: number | null
  dump_site?: string | null
  transfer_zone?: string | null
  trip_cost?: number | null
  factory_contribution?: number | null
  subsidy_amount?: number | null
}

export async function createBulkTrips(factoryIds: string[], payment_status: 'paid' | 'credit', trip_date: string, extra?: BulkTripExtra) {
  const supabase = createClient()
  const payment_method = payment_status === 'paid' ? 'cash' : null
  const trips: TripInsert[] = factoryIds.map(fid => ({
    factory_id: fid,
    amount: 50,
    payment_status,
    payment_method,
    trip_date,
    notes: extra?.notes || null,
    volume_m3: extra?.volume_m3 ?? null,
    waste_type: extra?.waste_type ?? null,
    coupon_number: extra?.coupon_number ?? null,
    driver_name: extra?.driver_name ?? null,
    vehicle_type: extra?.vehicle_type ?? null,
    distance_km: extra?.distance_km ?? null,
    dump_site: extra?.dump_site ?? null,
    transfer_zone: extra?.transfer_zone ?? null,
    trip_cost: extra?.trip_cost ?? null,
    factory_contribution: extra?.factory_contribution ?? null,
    subsidy_amount: extra?.subsidy_amount ?? null,
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('trips').insert(trips).select()
  if (error) throw new Error(translateTripError(error))
  return data as Trip[]
}

// ─── REPORTS: COSTS ──────────────────────────────────────────

export async function getTripsForCosts(from?: string, to?: string) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any)
    .from('trips')
    .select('id, factory_id, trip_date, trip_cost, waste_type, volume_m3, factories(name)')
    .order('trip_date', { ascending: false })
  if (from) query = query.gte('trip_date', from)
  if (to)   query = query.lte('trip_date', to)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as any[]
}

// ─── REPORTS: CONTRIBUTIONS ──────────────────────────────────

export async function getTripsForContributions(from?: string, to?: string) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any)
    .from('trips')
    .select('id, factory_id, trip_date, payment_status, payment_method, factory_contribution, factories(name)')
    .order('trip_date', { ascending: false })
  if (from) query = query.gte('trip_date', from)
  if (to)   query = query.lte('trip_date', to)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as any[]
}

// ─── FACTORY TRIP STATS (for map panel) ──────────────────────

export async function getFactoryTripStats(factoryId: string) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trips')
    .select('waste_type, volume_m3, trip_cost, factory_contribution, payment_status, amount')
    .eq('factory_id', factoryId)
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trips: any[] = data ?? []

  const liquid = trips.filter(t => t.waste_type === 'liquid')
  const solid  = trips.filter(t => t.waste_type === 'solid')

  const sum = (arr: any[], key: string) => arr.reduce((s, t) => s + Number(t[key] ?? 0), 0)

  const liquidContrib  = sum(liquid, 'factory_contribution')
  const liquidPaid     = liquid.filter(t => t.payment_status === 'paid').reduce((s, t) => s + Number(t.factory_contribution ?? 0), 0)
  const solidContrib   = sum(solid,  'factory_contribution')
  const solidPaid      = solid.filter(t => t.payment_status === 'paid').reduce((s, t) => s + Number(t.factory_contribution ?? 0), 0)
  const totalContrib   = liquidContrib + solidContrib
  const totalPaid      = liquidPaid + solidPaid

  return {
    total:   { trips: trips.length,  cost: sum(trips,  'trip_cost'), contrib: totalContrib,  paid: totalPaid,  debt: totalContrib - totalPaid },
    liquid:  { trips: liquid.length, volume: sum(liquid, 'volume_m3'), cost: sum(liquid, 'trip_cost'), contrib: liquidContrib, paid: liquidPaid, debt: liquidContrib - liquidPaid },
    solid:   { trips: solid.length,  volume: sum(solid,  'volume_m3'), cost: sum(solid,  'trip_cost'), contrib: solidContrib,  paid: solidPaid,  debt: solidContrib  - solidPaid  },
  }
}

// ─── PAYMENTS ────────────────────────────────────────────────

export async function getPayments(filters?: { factory_id?: string; from?: string; to?: string }) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any)
    .from('payments')
    .select('*, factories(name)')
    .order('date', { ascending: false })
  if (filters?.factory_id) query = query.eq('factory_id', filters.factory_id)
  if (filters?.from) query = query.gte('date', filters.from)
  if (filters?.to) query = query.lte('date', filters.to)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createPayment(payment: PaymentInsert) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('payments').insert(payment).select().single()
  if (error) throw error

  // غطّ نقلات الذمة الأقدم أولاً بالمبلغ المدفوع، نقلة نقلة (كل نقلة = 50₪)
  if (payment.factory_id && payment.amount_paid) {
    let remaining = Number(payment.amount_paid)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creditTrips } = await (supabase as any)
      .from('trips')
      .select('id, factory_contribution')
      .eq('factory_id', payment.factory_id)
      .eq('payment_status', 'credit')
      .order('trip_date', { ascending: true })
      .order('created_at', { ascending: true })

    const idsToSettle: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const trip of (creditTrips ?? []) as any[]) {
      const contrib = Number(trip.factory_contribution ?? 50)
      if (remaining >= contrib) {
        idsToSettle.push(trip.id)
        remaining -= contrib
      } else {
        break
      }
    }

    if (idsToSettle.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('trips')
        .update({ payment_status: 'paid', payment_method: 'later' })
        .in('id', idsToSettle)
    }
    // الـ remaining (الرصيد الدائن) يبقى محفوظاً في factories.balance كقيمة سالبة
    // سيُستخدم تلقائياً لتغطية النقلات القادمة عبر applyFactoryCreditToNewTrip
  }

  return data as Payment
}

/**
 * معاينة: كيف سيُوزَّع المبلغ على نقلات الذمة قبل تسجيل الدفعة.
 * تُعيد: عدد النقلات التي ستُغطى + المبلغ الدائن المتبقي.
 */
export async function previewPayment(factoryId: string, amountPaid: number): Promise<{
  tripsCount: number
  totalCovered: number
  remainingCredit: number
  existingCredit: number
}> {
  const supabase = createClient()

  const [factoryRes, tripsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('factories').select('balance').eq('id', factoryId).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('trips').select('id, factory_contribution')
      .eq('factory_id', factoryId).eq('payment_status', 'credit')
      .order('trip_date', { ascending: true }).order('created_at', { ascending: true }),
  ])

  // الرصيد الدائن الحالي (balance سالب = رصيد للمصنع)
  const existingCredit = Math.max(0, -Number(factoryRes.data?.balance ?? 0))

  let remaining = amountPaid + existingCredit
  let tripsCount = 0
  let totalCovered = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const trip of (tripsRes.data ?? []) as any[]) {
    const contrib = Number(trip.factory_contribution ?? 50)
    if (remaining >= contrib) {
      tripsCount++
      totalCovered += contrib
      remaining -= contrib
    } else break
  }

  return {
    tripsCount,
    totalCovered,
    remainingCredit: remaining,
    existingCredit,
  }
}

/**
 * يُستدعى بعد إنشاء نقلة جديدة بحالة credit —
 * إذا كان للمصنع رصيد دائن (balance < 0) يكفي قيمة النقلة، تُغطى فوراً.
 */
export async function applyFactoryCreditToNewTrip(tripId: string, factoryId: string): Promise<boolean> {
  const supabase = createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: factory } = await (supabase as any)
    .from('factories')
    .select('balance')
    .eq('id', factoryId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: trip } = await (supabase as any)
    .from('trips')
    .select('factory_contribution')
    .eq('id', tripId)
    .single()

  const balance = Number(factory?.balance ?? 0)
  const contrib = Number(trip?.factory_contribution ?? 50)

  // رصيد دائن = balance سالب، وقيمته المطلقة تكفي النقلة
  if (balance < 0 && Math.abs(balance) >= contrib) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('trips')
      .update({ payment_status: 'paid', payment_method: 'later' })
      .eq('id', tripId)
    return true // تمت التغطية التلقائية
  }
  return false
}

export async function uploadReceipt(file: File, paymentId: string): Promise<string> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const path = `receipts/${paymentId}.${ext}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).storage.from('receipts').upload(path, file, { upsert: true })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = (supabase as any).storage.from('receipts').getPublicUrl(path)
  return data.publicUrl
}

// ─── SYNC TRIP PAYMENT STATUS ───────────────────────────────
// Logic: trips registered as 'paid' upfront are already paid (cash on delivery).
// Only 'credit' trips need to be reconciled against payments made later.
// We look at how much has been paid to the factory via the payments table,
// subtract what was already paid via cash trips, then mark oldest credit trips
// as paid to cover the remaining balance.
export async function syncTripPaymentStatus() {
  const supabase = createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: factories, error: fErr } = await (supabase as any).from('factories').select('id')
  if (fErr) throw fErr

  let totalUpdated = 0

  for (const factory of (factories || [])) {
    const fid = factory.id

    const [tripsRes, paymentsRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('trips').select('id, payment_status, payment_method').eq('factory_id', fid).order('created_at', { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('payments').select('amount_paid').eq('factory_id', fid),
    ])

    const trips = tripsRes.data || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalPaidViaPayments = (paymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount_paid), 0)

    // If no payments at all for this factory, revert any wrongly-synced trips back to credit
    if (totalPaidViaPayments === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wronglyPaid = (trips as any[]).filter((t: any) => t.payment_status === 'paid' && t.payment_method === 'later')
      if (wronglyPaid.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('trips').update({ payment_status: 'credit', payment_method: null }).in('id', wronglyPaid.map((t: any) => t.id))
      }
      continue
    }

    // How many trips (paid via 'later') are already marked as covered by payments?
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alreadyCoveredByPayments = (trips as any[]).filter((t: any) => t.payment_status === 'paid' && t.payment_method === 'later').length

    // How many more trips can the remaining payment amount cover?
    const alreadyCoveredAmount = alreadyCoveredByPayments * 50
    const remainingPaymentAmount = totalPaidViaPayments - alreadyCoveredAmount
    const additionalTripsCoverable = Math.floor(remainingPaymentAmount / 50)

    if (additionalTripsCoverable > 0) {
      // Get oldest credit trips not yet covered
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const creditTrips = (trips as any[]).filter((t: any) => t.payment_status === 'credit')
      const toMarkPaid = creditTrips.slice(0, additionalTripsCoverable)

      if (toMarkPaid.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('trips').update({ payment_status: 'paid', payment_method: 'later' }).in('id', toMarkPaid.map((t: any) => t.id))
        totalUpdated += toMarkPaid.length
      }
    } else if (remainingPaymentAmount < 0) {
      // Payments were deleted — revert excess 'later' trips back to credit
      const excessCount = Math.ceil(Math.abs(remainingPaymentAmount) / 50)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const laterTrips = (trips as any[]).filter((t: any) => t.payment_status === 'paid' && t.payment_method === 'later').reverse()
      const toRevert = laterTrips.slice(0, excessCount)
      if (toRevert.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('trips').update({ payment_status: 'credit', payment_method: null }).in('id', toRevert.map((t: any) => t.id))
      }
    }
  }

  return totalUpdated
}

// ─── FACTORY STATEMENT ───────────────────────────────────────

export async function getFactoryStatement(factory_id: string) {
  const supabase = createClient()
  const [tripsRes, paymentsRes, factoryRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('*').eq('factory_id', factory_id).order('created_at'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('payments').select('*').eq('factory_id', factory_id).order('date'),
    // نجلب الرصيد الفعلي من جدول المصانع (موجب = ذمة، سالب = رصيد دائن)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('factories').select('balance').eq('id', factory_id).single(),
  ])
  if (tripsRes.error) throw tripsRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const totalTrips = tripsRes.data?.length ?? 0
  const totalAmount = totalTrips * 50
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPaid = (paymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount_paid), 0)
  // الرصيد من قاعدة البيانات: موجب = ذمة على المصنع، سالب = رصيد دائن للمصنع
  const balance = Number(factoryRes.data?.balance ?? 0)

  return { trips: tripsRes.data, payments: paymentsRes.data, totalTrips, totalAmount, totalPaid, balance }
}

// ─── DASHBOARD STATS ─────────────────────────────────────────

export async function getLoginStats() {
  const supabase = createClient()
  const [tripsRes, factoriesRes, paymentsRes, cashTripsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('*', { count: 'exact', head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('factories').select('*', { count: 'exact', head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('payments').select('amount_paid'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('id', { count: 'exact', head: true }).eq('payment_method', 'cash'),
  ])
  const cashTripsCount = cashTripsRes.count ?? 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentsTotal = (paymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount_paid), 0)
  const totalCollection = cashTripsCount * 50 + paymentsTotal
  return {
    totalTrips: tripsRes.count ?? 0,
    totalFactories: factoriesRes.count ?? 0,
    totalCollection,
  }
}

export async function getDashboardStats() {
  const supabase = createClient()

  const now = new Date()
  const todayStr   = now.toISOString().slice(0, 10)
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [
    allTripsRes,
    totalFactoriesRes,
    overdueFactoriesRes,
    overdueBalancesRes,
    allPaymentsRes,
    paidTripsRes,       // نقلات مدفوعة — نأخذ factory_contribution منها
    creditTripsRes,
    todayTripsRes,
    monthTripsRes,
    costRes,            // كل النقلات: trip_cost + subsidy_amount
    settingsRes,        // الإعدادات: project_budget + factory_contribution
    disbursementsRes,   // الدفعات المقفلة: disbursed_amount
    volumeAllRes,       // كل النقلات: waste_type + volume_m3
    volumeMonthRes,     // نقلات الشهر: waste_type + volume_m3
    activeFactoriesTotalRes, // مصانع نشطة (لها نقلات) إجمالاً
    prevMonthTripsRes,  // نقلات الشهر الماضي (نفس الأيام)
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('*', { count: 'exact', head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('factories').select('*', { count: 'exact', head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('factories').select('*', { count: 'exact', head: true }).gt('balance', 0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('factories').select('balance').gt('balance', 0),
    // كل المدفوعات (تسديد ذمم)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('payments').select('amount_paid'),
    // النقلات المدفوعة — نحتاج factory_contribution لكل منها
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('factory_contribution').eq('payment_status', 'paid'),
    // عدد نقلات الذمة فقط
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('id', { count: 'exact', head: true }).eq('payment_status', 'credit'),
    // نقلات اليوم
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('factory_id, payment_status').eq('trip_date', todayStr),
    // نقلات هذا الشهر
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('factory_id').gte('trip_date', monthStart),
    // كل النقلات: مجاميع التكاليف
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('trip_cost'),
    // الإعدادات العامة
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('settings').select('key, value').in('key', ['project_budget', 'factory_contribution']),
    // الدفعات المقفلة — لمعرفة المبلغ الفعلي المصروف
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('disbursements').select('disbursed_amount, retention_amount, net_payment').eq('status', 'closed'),
    // كل النقلات: waste_type + volume_m3 للإحصاءات
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('waste_type, volume_m3, factory_id, dump_site, distance_km'),
    // نقلات هذا الشهر: waste_type + volume_m3
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('waste_type, volume_m3, factory_id, dump_site, distance_km').gte('trip_date', monthStart),
    // مصانع نشطة إجمالاً (distinct factory_id من trips)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('factory_id'),
    // نقلات الشهر الماضي (نفس عدد الأيام) — لمؤشر الاتجاه
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('id').gte('trip_date', (() => {
      const d = new Date(now); d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    })()).lte('trip_date', (() => {
      const d = new Date(now); d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    })()),
  ])

  // إجمالي تكاليف النقلات من جدول التسعيرة
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const costData: any[] = costRes.data || []
  const tripsWithCost = costData.filter((r: any) => r.trip_cost != null)
  const tripsWithCostCount = tripsWithCost.length
  const totalProjectCost = costData.reduce((s: number, r: any) => s + Number(r.trip_cost ?? 0), 0)

  // رصيد مساهمات المصانع المتراكم (مستقل عن التمويل)
  // يُحسب لاحقاً بعد قراءة settingsMap لمعرفة factory_contribution

  // ── المحصّل = مساهمات النقلات المدفوعة + مدفوعات الذمم المُسجَّلة ─
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paidTripsData: any[] = paidTripsRes.data || []
  // كل نقلة مدفوعة: إن كان لديها factory_contribution نستخدمه، وإلا 50 كقيمة افتراضية
  const collectedFromPaidTrips = paidTripsData.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: number, r: any) => s + Number(r.factory_contribution ?? 50), 0
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentsTotal = (allPaymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount_paid), 0)
  const totalCollected = collectedFromPaidTrips + paymentsTotal

  // ── الذمم ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalDebt = (overdueBalancesRes.data || []).reduce((s: number, f: any) => s + Number(f.balance), 0)

  // ── الدفعات المقفلة ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const disbData: any[] = disbursementsRes.data || []
  const totalDisbursed           = disbData.reduce((s: number, d: any) => s + Number(d.net_payment), 0)
  const totalRetained            = disbData.reduce((s: number, d: any) => s + Number(d.retention_amount), 0)
  const closedDisbursementsCount = disbData.length

  // ── ميزانية التمويل ───────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settingsMap: Record<string, string> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settingsRes.data || []).map((s: any) => [s.key, s.value])
  )
  const projectBudget = Number(settingsMap['project_budget'] ?? 0)
  const contributionPerTrip = Number(settingsMap['factory_contribution'] ?? 50)
  // رصيد مساهمات المصانع المتراكم = عدد جميع النقلات × مساهمة المصنع لكل نقلة
  const totalFactoryShare = costData.length * contributionPerTrip
  // المحصّل من مساهمات المصانع = نقلات مدفوعة × contributionPerTrip
  const factoryShareCollected   = paidTripsData.length * contributionPerTrip
  // غير المحصّل = نقلات ذمة × contributionPerTrip
  const factoryShareUncollected = (creditTripsRes.count ?? 0) * contributionPerTrip
  // الصرف الفعلي من التمويل = مجموع net_payment من الدفعات المُقفلة
  const spentFromBudget = totalDisbursed
  const remainingBudget = Math.max(0, projectBudget - spentFromBudget)
  const budgetSpentPct  = projectBudget > 0
    ? Math.min(Math.round(spentFromBudget / projectBudget * 100), 100) : 0

  // ── اليوم ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayData: any[] = todayTripsRes.data || []
  const todayTripsCount  = todayData.length
  const todayPaidCount   = todayData.filter((t: any) => t.payment_status === 'paid').length
  const todayCreditCount = todayData.filter((t: any) => t.payment_status === 'credit').length

  // ── الشهر ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monthData: any[] = monthTripsRes.data || []
  const monthTripsCount  = monthData.length
  const activeFactoriesThisMonth = new Set(monthData.map((t: any) => t.factory_id)).size
  const avgTripsPerFactory = activeFactoriesThisMonth > 0
    ? Math.round(monthTripsCount / activeFactoriesThisMonth * 10) / 10 : 0

  const totalTrips = allTripsRes.count ?? 0

  // ── أحجام وأنواع النقلات ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeAll: any[]   = volumeAllRes.data   || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeMonth: any[] = volumeMonthRes.data || []

  const liquidAll   = volumeAll.filter((r: any) => r.waste_type === 'liquid')
  const dryAll      = volumeAll.filter((r: any) => r.waste_type === 'solid')
  const liquidMonth = volumeMonth.filter((r: any) => r.waste_type === 'liquid')
  const dryMonth    = volumeMonth.filter((r: any) => r.waste_type === 'solid')

  const totalVolume      = volumeAll.reduce((s: number, r: any) => s + Number(r.volume_m3 ?? 0), 0)
  const monthVolume      = volumeMonth.reduce((s: number, r: any) => s + Number(r.volume_m3 ?? 0), 0)
  const liquidCount      = liquidAll.length
  const liquidVolume     = liquidAll.reduce((s: number, r: any) => s + Number(r.volume_m3 ?? 0), 0)
  const dryCount         = dryAll.length
  const dryVolume        = dryAll.reduce((s: number, r: any) => s + Number(r.volume_m3 ?? 0), 0)
  const liquidCountMonth = liquidMonth.length
  const liquidVolumeMonth= liquidMonth.reduce((s: number, r: any) => s + Number(r.volume_m3 ?? 0), 0)
  const dryCountMonth    = dryMonth.length
  const dryVolumeMonth   = dryMonth.reduce((s: number, r: any) => s + Number(r.volume_m3 ?? 0), 0)

  // مصانع نشطة إجمالاً (لها نقلة واحدة على الأقل)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeFactoriesTotal = new Set((activeFactoriesTotalRes.data || []).map((r: any) => r.factory_id)).size

  // ── إحصاءات وجهات النقل ──────────────────────────────
  const getDumpKey = (r: any): string => {
    if (r.dump_site === 'central_press') return 'central_press'
    if (r.dump_site === 'municipal_dump') {
      // distance_km هو العمود الفعلي في جدول trips
      return Number(r.distance_km ?? 0) <= 7 ? 'khallet_sharbati' : 'sa3ir'
    }
    return 'unknown'
  }

  const dumpGroups: Record<string, { count: number; volume: number; countMonth: number; volumeMonth: number }> = {
    central_press:    { count: 0, volume: 0, countMonth: 0, volumeMonth: 0 },
    khallet_sharbati: { count: 0, volume: 0, countMonth: 0, volumeMonth: 0 },
    sa3ir:            { count: 0, volume: 0, countMonth: 0, volumeMonth: 0 },
  }

  volumeAll.forEach((r: any) => {
    const key = getDumpKey(r)
    if (!dumpGroups[key]) return
    dumpGroups[key].count++
    dumpGroups[key].volume += Number(r.volume_m3 ?? 0)
  })
  volumeMonth.forEach((r: any) => {
    const key = getDumpKey(r)
    if (!dumpGroups[key]) return
    dumpGroups[key].countMonth++
    dumpGroups[key].volumeMonth += Number(r.volume_m3 ?? 0)
  })

  const dumpSiteStats = {
    centralPress:    dumpGroups['central_press'],
    khalletSharbati: dumpGroups['khallet_sharbati'],
    sa3ir:           dumpGroups['sa3ir'],
  }

  return {
    // تشغيلي
    totalTrips,
    todayTripsCount,
    todayPaidCount,
    todayCreditCount,
    paidTripsCount:   paidTripsData.length,
    creditTripsCount: creditTripsRes.count ?? 0,
    totalFactories:   totalFactoriesRes.count ?? 0,
    overdueFactories: overdueFactoriesRes.count ?? 0,
    // مالي — تحصيل
    totalCollected,
    totalDebt,
    // مالي — تمويل المشروع
    totalProjectCost,
    totalFactoryShare,
    factoryShareCollected,
    factoryShareUncollected,
    tripsWithCostCount,
    // ميزانية التمويل
    projectBudget,
    spentFromBudget,
    remainingBudget,
    budgetSpentPct,
    // الدفعات المقفلة
    totalDisbursed,
    totalRetained,
    closedDisbursementsCount,
    // شهري
    monthTripsCount,
    activeFactoriesThisMonth,
    avgTripsPerFactory,
    // أحجام وأنواع
    totalVolume,
    monthVolume,
    liquidCount,
    liquidVolume,
    dryCount,
    dryVolume,
    liquidCountMonth,
    liquidVolumeMonth,
    dryCountMonth,
    dryVolumeMonth,
    // وجهات النقل
    dumpSiteStats,
    // مصانع نشطة إجمالاً
    activeFactoriesTotal,
    // مؤشر الاتجاه الشهري
    prevMonthTripsCount: (prevMonthTripsRes.data || []).length,
    currentMonthDay: now.getDate(),
  }
}

// ─── PRICING RULES ────────────────────────────────────────────

export interface PricingRule {
  id: string
  waste_type: 'liquid' | 'solid'
  volume_m3: number
  max_distance_km: number   // 7 = "≤7 كم"، 9999 = ">7 كم"
  dump_site: 'municipal_dump' | 'central_press'
  unit_price: number
  label: string | null
}

export async function getPricingRules(): Promise<PricingRule[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('pricing_rules')
    .select('*')
    .order('waste_type').order('volume_m3').order('max_distance_km').order('dump_site')
  if (error) throw error
  return data as PricingRule[]
}

export async function updatePricingRule(id: string, unit_price: number): Promise<void> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('pricing_rules')
    .update({ unit_price })
    .eq('id', id)
  if (error) throw error
}

/** حساب سعر النقلة من قاعدة البيانات */
export async function calcTripCost(opts: {
  waste_type: 'liquid' | 'solid'
  volume_m3: number
  distance_km: number
  dump_site: 'municipal_dump' | 'central_press'
}): Promise<number | null> {
  const rules = await getPricingRules()
  const maxDist = opts.distance_km <= 7 ? 7 : 9999
  const match = rules.find(r =>
    r.waste_type === opts.waste_type &&
    r.volume_m3 === opts.volume_m3 &&
    r.max_distance_km === maxDist &&
    r.dump_site === opts.dump_site
  )
  return match ? match.unit_price : null
}

// ─── SETTINGS ─────────────────────────────────────────────────

export interface AppSetting {
  key: string
  value: string
  label: string | null
}

export async function getSettings(): Promise<AppSetting[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('settings').select('*')
  if (error) throw error
  return data as AppSetting[]
}

export async function updateSetting(key: string, value: string): Promise<void> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)
  if (error) throw error
}

// ─── DISBURSEMENTS ────────────────────────────────────────────

/**
 * جلب معلومات النقلات غير المشمولة بأي مطالبة (draft/pending/closed).
 * تُعيد: أقدم تاريخ نقلة غير مشمولة، وأحدث تاريخ، وعدد النقلات.
 */
export async function getUncoveredTripsInfo(): Promise<{
  earliestDate: string | null
  latestDate: string | null
  count: number
}> {
  const supabase = createClient()

  // جلب كل المطالبات (بغض النظر عن الحالة)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: disbursements } = await (supabase as any)
    .from('disbursements')
    .select('period_from, period_to')

  // جلب كل النقلات مع حالة الاستثناء والترحيل
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: trips, error } = await (supabase as any)
    .from('trips')
    .select('trip_date, disbursement_excluded, excluded_until')
    .order('trip_date', { ascending: true })
  if (error) throw error

  const covered = (disbursements ?? []) as { period_from: string; period_to: string }[]

  // نقلة "غير مشمولة" هي:
  // 1. مستثناة صراحةً (disbursement_excluded=true) — استحقاق مالي معلق
  // 2. محمولة وتم إدراجها في مطالبة (excluded_until != null, excluded=false) — مشمولة
  // 3. عادية: غير مشمولة إن كان تاريخها خارج أي فترة مطالبة
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uncovered = ((trips ?? []) as { trip_date: string; disbursement_excluded: boolean; excluded_until: string | null }[]).filter(t => {
    if (t.disbursement_excluded) return true          // مستثناة → غير مشمولة
    if (t.excluded_until !== null) return false       // محمولة ومُدرجة في مطالبة → مشمولة
    return !covered.some(d => t.trip_date >= d.period_from && t.trip_date <= d.period_to)
  })

  if (uncovered.length === 0) return { earliestDate: null, latestDate: null, count: 0 }

  return {
    earliestDate: uncovered[0].trip_date,
    latestDate: uncovered[uncovered.length - 1].trip_date,
    count: uncovered.length,
  }
}

export async function getDisbursements(): Promise<Disbursement[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('disbursements')
    .select('*')
    .order('period_from', { ascending: false })
  if (error) throw error
  return data as Disbursement[]
}

/** حساب مجاميع النقلات لفترة معينة */
/**
 * جلب النقلات في فترة زمنية للعرض في مودال المطالبة الجديدة.
 * تُعيد كل النقلات (المشمولة والمستثناة) مع بيانات المصنع.
 */
/**
 * mode='wizard' → تُعيد نقلات الفترة + النقلات المحمولة من فترات سابقة (للمعالج الجديد)
 * mode='view'   → تُعيد نقلات الفترة + النقلات المحمولة المُدرجة فعلاً (للعرض فقط)
 */
export async function getTripsForDisbursement(from: string, to: string, mode: 'wizard' | 'view' = 'view') {
  const supabase = createClient()
  const sel = 'id, trip_date, trip_cost, payment_status, waste_type, disbursement_excluded, excluded_until, coupon_number, factories(name)'

  // النقلات العادية في نطاق التاريخ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rangeData, error: e1 } = await (supabase as any)
    .from('trips')
    .select(sel)
    .gte('trip_date', from)
    .lte('trip_date', to)
    .order('trip_date', { ascending: true })
  if (e1) throw e1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let carryovers: any[] = []

  if (mode === 'wizard') {
    // مرشحات الترحيل: مستثناة من فترات سابقة (excluded_until < from)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: coData, error: e2 } = await (supabase as any)
      .from('trips')
      .select(sel)
      .eq('disbursement_excluded', true)
      .not('excluded_until', 'is', null)
      .lt('excluded_until', from)
      .order('trip_date', { ascending: true })
    if (e2) throw e2
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    carryovers = (coData ?? []).map((t: any) => ({ ...t, is_carryover: true }))
  } else {
    // نقلات محمولة تم إدراجها فعلاً في هذه الفترة (excluded=false, excluded_until=to, trip_date < from)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: coData, error: e2 } = await (supabase as any)
      .from('trips')
      .select(sel)
      .eq('disbursement_excluded', false)
      .eq('excluded_until', to)
      .lt('trip_date', from)
      .order('trip_date', { ascending: true })
    if (e2) throw e2
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    carryovers = (coData ?? []).map((t: any) => ({ ...t, is_carryover: true }))
  }

  // النقلات المحمولة تظهر في الأعلى
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [...carryovers, ...(rangeData ?? [])] as any[]
}

/**
 * تبديل حالة استثناء نقلة من/إلى المطالبات المالية.
 */
export async function setTripDisbursementExclusion(
  tripId: string,
  excluded: boolean,
  periodTo?: string | null,
): Promise<void> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trips')
    .update({
      disbursement_excluded: excluded,
      excluded_until: periodTo ?? null,
    })
    .eq('id', tripId)
  if (error) throw error
}

async function calcDisbursementAmounts(from: string, to: string) {
  const supabase = createClient()

  // جلب نسبة مساهمة المصانع من الإعدادات
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: setting } = await (supabase as any)
    .from('settings').select('value').eq('key', 'factory_contribution').single()
  const contributionPerTrip = Number(setting?.value ?? 50)

  // النقلات العادية في الفترة — باستثناء المستثناة
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trips')
    .select('trip_cost, payment_status')
    .gte('trip_date', from)
    .lte('trip_date', to)
    .eq('disbursement_excluded', false)
  if (error) throw error

  // النقلات المحمولة المُدرجة في هذه الفترة (excluded=false, excluded_until=to, trip_date < from)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: carryoverData, error: e2 } = await (supabase as any)
    .from('trips')
    .select('trip_cost, payment_status')
    .eq('disbursement_excluded', false)
    .not('excluded_until', 'is', null)
    .eq('excluded_until', to)
    .lt('trip_date', from)
  if (e2) throw e2

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [...(data ?? []), ...(carryoverData ?? [])]
  const trips_count              = rows.length
  const paid_count               = rows.filter((r: any) => r.payment_status === 'paid').length
  // تكلفة النقلات من جدول التسعيرة
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total_trips_cost         = rows.reduce((s: number, r: any) => s + Number(r.trip_cost ?? 0), 0)
  // إجمالي مساهمات المصانع (كل النقلات) — رصيد مستقل للمشروع
  const total_factory_share      = trips_count * contributionPerTrip
  // المحصّل فعلياً (النقلات المدفوعة فقط) — الإيراد الفعلي
  const factory_share_collected  = paid_count  * contributionPerTrip
  // مبلغ التمويل المطلوب = تكلفة النقلات كاملة
  const disbursed_amount         = total_trips_cost
  return { trips_count, total_trips_cost, total_factory_share, factory_share_collected, disbursed_amount }
}

const MUNICIPALITY_PCT = 14 // نسبة ثابتة لبلدية الخليل

/**
 * حساب حقول الدفعة الكاملة:
 *   المبلغ الأساسي (disbursed_amount) = تكلفة النقلات كاملة
 *   municipality_amount = disbursed_amount × 14%  (يُضاف)
 *   retention_amount    = disbursed_amount × retention_pct%  (يُخصم)
 *   net_payment         = disbursed_amount + municipality_amount - retention_amount
 *
 *   total_factory_share = رصيد مستقل للمشروع (لا يدخل في حساب net_payment)
 */
function calcRetention(disbursed_amount: number, retention_pct: number) {
  const municipality_amount = Math.round(disbursed_amount * MUNICIPALITY_PCT / 100 * 100) / 100
  const retention_amount    = Math.round(disbursed_amount * retention_pct / 100 * 100) / 100
  const net_payment         = Math.round((disbursed_amount + municipality_amount - retention_amount) * 100) / 100
  return { municipality_amount, retention_amount, net_payment }
}

/** إنشاء دفعة جديدة (مسودة) وحساب مجاميعها تلقائياً */
export async function createDisbursement(
  period_from: string,
  period_to: string,
  notes?: string,
  retention_pct_override?: number,    // إن أدخلها المستخدم يدوياً
  retention_amount_override?: number, // تجاوز الحساب وتحديد مبلغ مختلف
  carryover_trip_ids?: string[],      // معرفات النقلات المحمولة التي وافق المستخدم على إدراجها
): Promise<Disbursement> {
  const supabase = createClient()

  // ── تحقق من التسلسل: يجب إغلاق كل الفترات السابقة أولاً ──
  // أي دفعة (مسودة أو مقفلة) فترتها تبدأ قبل بداية الفترة الجديدة
  // ولا تزال مسودة → يجب إغلاقها أولاً
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: olderDrafts, error: seqErr } = await (supabase as any)
    .from('disbursements')
    .select('id, period_from, period_to')
    .eq('status', 'draft')
    .lt('period_from', period_from)
    .limit(1)
  if (seqErr) throw seqErr
  if (olderDrafts && olderDrafts.length > 0) {
    const d = olderDrafts[0]
    throw new Error(
      `يوجد مسودة غير مغلقة لفترة سابقة (${d.period_from} → ${d.period_to}) — يجب إغلاقها أولاً قبل إنشاء دفعة جديدة`
    )
  }

  // ── جلب نسبة الحجز من الإعدادات إن لم تدخل يدوياً ──
  let retention_pct = retention_pct_override ?? 10
  if (retention_pct_override === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: setting } = await (supabase as any)
      .from('settings')
      .select('value')
      .eq('key', 'retention_pct')
      .single()
    if (setting?.value) retention_pct = parseFloat(setting.value)
  }

  // ── إدراج النقلات المحمولة التي وافق عليها المستخدم ──
  if (carryover_trip_ids && carryover_trip_ids.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: coErr } = await (supabase as any)
      .from('trips')
      .update({ disbursement_excluded: false, excluded_until: period_to })
      .in('id', carryover_trip_ids)
    if (coErr) throw coErr
  }

  const amounts = await calcDisbursementAmounts(period_from, period_to)

  // ── حساب الحجوزات ──
  const municipality_pct = MUNICIPALITY_PCT
  const { municipality_amount, retention_amount, net_payment } = retention_amount_override !== undefined
    ? {
        municipality_amount: Math.round(amounts.disbursed_amount * MUNICIPALITY_PCT / 100 * 100) / 100,
        retention_amount: retention_amount_override,
        net_payment: Math.round((amounts.disbursed_amount + Math.round(amounts.disbursed_amount * MUNICIPALITY_PCT / 100 * 100) / 100 - retention_amount_override) * 100) / 100,
      }
    : calcRetention(amounts.disbursed_amount, retention_pct)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('disbursements')
    .insert({
      period_from,
      period_to,
      ...amounts,
      retention_pct,
      retention_amount,
      municipality_pct,
      municipality_amount,
      net_payment,
      notes: notes ?? null,
      status: 'draft',
      created_by: user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Disbursement
}

/** إعادة حساب مجاميع دفعة مسودة (إذا تم تعديل نقلات في فترتها) */
export async function recalcDisbursement(id: string): Promise<Disbursement> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: fetchErr } = await (supabase as any)
    .from('disbursements')
    .select('period_from, period_to, status, retention_pct, retention_amount')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (current.status === 'closed') throw new Error('لا يمكن إعادة الحساب — الدفعة مقفلة')

  const amounts = await calcDisbursementAmounts(current.period_from, current.period_to)
  // إعادة حساب الحجوزات بنفس النسبة المحفوظة في السجل
  const { municipality_amount, retention_amount, net_payment } = calcRetention(
    amounts.disbursed_amount,
    Number(current.retention_pct ?? 10)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('disbursements')
    .update({ ...amounts, municipality_amount, retention_amount, net_payment })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Disbursement
}

/** إغلاق دفعة نهائياً (لا رجعة) */
export async function closeDisbursement(id: string): Promise<Disbursement> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: fetchErr } = await (supabase as any)
    .from('disbursements')
    .select('status, period_from, period_to')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (current.status === 'closed') throw new Error('المطالبة مقفلة مسبقاً')
  if (current.status !== 'pending') throw new Error('يجب تقديم المطالبة للاعتماد أولاً قبل الإغلاق')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('disbursements')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: user?.id ?? null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Disbursement
}

/** تعديل بيانات مطالبة (draft أو returned فقط) */
export async function updateDisbursement(
  id: string,
  fields: { period_from?: string; period_to?: string; notes?: string; retention_pct?: number; retention_amount_override?: number }
): Promise<Disbursement> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: fetchErr } = await (supabase as any)
    .from('disbursements')
    .select('status, period_from, period_to, retention_pct, disbursed_amount')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (current.status !== 'draft' && current.status !== 'returned' && current.status !== 'closed')
    throw new Error('لا يمكن تعديل مطالبة مقدمة للاعتماد')

  // إعادة الحساب إذا تغيرت الفترة أو النسبة
  const newFrom = fields.period_from ?? current.period_from
  const newTo   = fields.period_to   ?? current.period_to
  const newPct  = fields.retention_pct ?? Number(current.retention_pct ?? 10)

  // نحسب المبالغ من الفترة الجديدة — باستثناء المستثناة
  const { data: trips } = await (supabase as any)
    .from('trips')
    .select('trip_cost, payment_status')
    .gte('trip_date', newFrom)
    .lte('trip_date', newTo)
    .eq('disbursement_excluded', false)

  // النقلات المحمولة المدرجة في هذه الفترة (excluded=false, excluded_until=newTo, trip_date < newFrom)
  const { data: carryoverTrips } = await (supabase as any)
    .from('trips')
    .select('trip_cost, payment_status')
    .eq('disbursement_excluded', false)
    .not('excluded_until', 'is', null)
    .eq('excluded_until', newTo)
    .lt('trip_date', newFrom)

  // جلب قيمة مساهمة المصنع من الإعدادات
  const { data: contribSetting } = await (supabase as any)
    .from('settings').select('value').eq('key', 'factory_contribution').single()
  const contributionPerTrip = Number(contribSetting?.value ?? 50)

  const tripsList = [...(trips ?? []), ...(carryoverTrips ?? [])] as { trip_cost: number; payment_status: string }[]
  const paid_count              = tripsList.filter(t => t.payment_status === 'paid').length
  const total_trips_cost        = tripsList.reduce((s: number, t) => s + Number(t.trip_cost ?? 0), 0)
  const total_factory_share     = tripsList.length * contributionPerTrip
  const factory_share_collected = paid_count * contributionPerTrip
  // disbursed_amount = تكلفة النقلات كاملة
  const disbursed_amount    = total_trips_cost
  const municipality_amount = disbursed_amount * 0.14
  const retention_amount    = fields.retention_amount_override !== undefined
    ? fields.retention_amount_override
    : disbursed_amount * (newPct / 100)
  const net_payment = disbursed_amount + municipality_amount - retention_amount

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('disbursements')
    .update({
      period_from: newFrom,
      period_to: newTo,
      notes: fields.notes !== undefined ? fields.notes : undefined,
      retention_pct: newPct,
      trips_count: tripsList.length,
      total_trips_cost,
      total_factory_share,
      factory_share_collected,
      disbursed_amount,
      municipality_amount,
      retention_amount,
      net_payment,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Disbursement
}

/** حذف مطالبة (فقط المسودات والمرجعة) */
export async function deleteDisbursement(id: string, force = false): Promise<void> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: fetchErr } = await (supabase as any)
    .from('disbursements')
    .select('status')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  if (current.status === 'closed' && !force) throw new Error('لا يمكن حذف مطالبة مغلقة')
  if (current.status === 'pending') throw new Error('لا يمكن حذف مطالبة مقدمة للاعتماد — اسحبها أولاً')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('disbursements').delete().eq('id', id)
  if (error) throw error
}

/** تقديم مطالبة للاعتماد (من draft إلى pending) */
export async function submitDisbursement(id: string): Promise<Disbursement> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: fetchErr } = await (supabase as any)
    .from('disbursements').select('status').eq('id', id).single()
  if (fetchErr) throw fetchErr
  if (current.status !== 'draft' && current.status !== 'returned')
    throw new Error('يمكن تقديم المسودات فقط')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('disbursements')
    .update({ status: 'pending', submitted_at: new Date().toISOString(), submitted_by: user?.id ?? null, review_notes: null })
    .eq('id', id).select().single()
  if (error) throw error
  return data as Disbursement
}

/** اعتماد المطالبة نهائياً (من طرف الادمن) */
export async function approveDisbursement(id: string): Promise<Disbursement> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: fetchErr } = await (supabase as any)
    .from('disbursements').select('status').eq('id', id).single()
  if (fetchErr) throw fetchErr
  if (current.status !== 'pending') throw new Error('يمكن اعتماد المطالبات المقدمة فقط')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('disbursements')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
    })
    .eq('id', id).select().single()
  if (error) throw error
  return data as Disbursement
}

/** إرجاع المطالبة للتعديل (من طرف الادمن مع ملاحظة) */
export async function returnDisbursement(id: string, review_notes: string): Promise<Disbursement> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!review_notes.trim()) throw new Error('يجب كتابة ملاحظة سبب الإرجاع')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: fetchErr } = await (supabase as any)
    .from('disbursements').select('status').eq('id', id).single()
  if (fetchErr) throw fetchErr
  if (current.status !== 'pending') throw new Error('يمكن إرجاع المطالبات المقدمة فقط')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('disbursements')
    .update({
      status: 'returned',
      review_notes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
    })
    .eq('id', id).select().single()
  if (error) throw error
  return data as Disbursement
}
