import { createClient } from '@/lib/supabase/client'
import type { Factory, FactoryInsert, FactoryUpdate, Trip, TripInsert, Payment, PaymentInsert } from '@/lib/supabase/database.types'

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
}) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any)
    .from('trips')
    .select('*, factories(name, region)')
    .order('created_at', { ascending: false })

  if (filters?.factory_id) query = query.eq('factory_id', filters.factory_id)
  if (filters?.payment_status) query = query.eq('payment_status', filters.payment_status)
  if (filters?.from) query = query.gte('created_at', filters.from)
  if (filters?.to) query = query.lte('created_at', filters.to)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createTrip(trip: TripInsert) {
  const supabase = createClient()
  const payment_method = trip.payment_status === 'paid' ? 'cash' : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('trips')
    .insert({
      ...trip,
      amount: 50,
      payment_method,
      coupon_number: trip.coupon_number ?? null,
      driver_name: trip.driver_name ?? null,
      vehicle_type: trip.vehicle_type ?? null,
      distance_km: trip.distance_km ?? null,
      dump_site: trip.dump_site ?? null,
      transfer_zone: trip.transfer_zone ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Trip
}

export async function updateTrip(id: string, updates: { volume_m3?: number | null; waste_type?: 'liquid' | 'solid' | null; notes?: string | null; payment_status?: 'paid' | 'credit'; trip_date?: string }) {
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

export async function deletePayment(id: string) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('payments').delete().eq('id', id)
  if (error) throw error
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
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('trips').insert(trips).select()
  if (error) throw error
  return data as Trip[]
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

  // Auto-settle oldest credit trips for this factory based on amount paid
  // Each trip costs 50₪ — settle as many as the payment covers
  if (payment.factory_id && payment.amount_paid) {
    const tripsToSettle = Math.floor(Number(payment.amount_paid) / 50)
    if (tripsToSettle > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: creditTrips } = await (supabase as any)
        .from('trips')
        .select('id')
        .eq('factory_id', payment.factory_id)
        .eq('payment_status', 'credit')
        .order('trip_date', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(tripsToSettle)

      if (creditTrips && creditTrips.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids = (creditTrips as any[]).map((t: any) => t.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('trips')
          .update({ payment_status: 'paid', payment_method: 'later' })
          .in('id', ids)
      }
    }
  }

  return data as Payment
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
  const [tripsRes, paymentsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('*').eq('factory_id', factory_id).order('created_at'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('payments').select('*').eq('factory_id', factory_id).order('date'),
  ])
  if (tripsRes.error) throw tripsRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const totalTrips = tripsRes.data?.length ?? 0
  const totalAmount = totalTrips * 50
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPaid = (paymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount_paid), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creditTripsCount = (tripsRes.data || []).filter((t: any) => t.payment_status === 'credit').length
  const balance = creditTripsCount * 50

  return { trips: tripsRes.data, payments: paymentsRes.data, totalTrips, totalAmount, totalPaid, balance }
}

// ─── DASHBOARD STATS ─────────────────────────────────────────

export async function getLoginStats() {
  const supabase = createClient()
  const [tripsRes, factoriesRes, paymentsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('*', { count: 'exact', head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('factories').select('*', { count: 'exact', head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('payments').select('amount_paid'),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalCollection = (paymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount_paid), 0)
  return {
    totalTrips: tripsRes.count ?? 0,
    totalFactories: factoriesRes.count ?? 0,
    totalCollection,
  }
}

export async function getDashboardStats() {
  const supabase = createClient()

  const [allTrips, totalFactories, overdueFactories, allPayments] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('trips').select('*', { count: 'exact', head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('factories').select('*', { count: 'exact', head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('factories').select('*', { count: 'exact', head: true }).gt('balance', 0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('payments').select('amount_paid'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalCollection = (allPayments.data || []).reduce((s: number, p: any) => s + Number(p.amount_paid), 0)

  return {
    todayTripsCount: allTrips.count ?? 0,
    totalFactories: totalFactories.count ?? 0,
    overdueFactories: overdueFactories.count ?? 0,
    todayCollection: totalCollection,
  }
}
