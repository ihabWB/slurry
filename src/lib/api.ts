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
    .insert({ ...trip, amount: 50, payment_method })
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

export async function createBulkTrips(factoryIds: string[], payment_status: 'paid' | 'credit', trip_date: string, notes?: string, volume_m3?: number | null, waste_type?: 'liquid' | 'solid' | null) {
  const supabase = createClient()
  const payment_method = payment_status === 'paid' ? 'cash' : null
  const trips: TripInsert[] = factoryIds.map(fid => ({
    factory_id: fid,
    amount: 50,
    payment_status,
    payment_method,
    trip_date,
    notes: notes || null,
    volume_m3: volume_m3 ?? null,
    waste_type: waste_type ?? null,
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('trips').insert(trips).select()
  if (error) throw error
  return data as Trip[]
}

// ─── PAYMENTS ────────────────────────────────────────────────

export async function getPayments(factory_id?: string) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any)
    .from('payments')
    .select('*, factories(name)')
    .order('date', { ascending: false })
  if (factory_id) query = query.eq('factory_id', factory_id)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createPayment(payment: PaymentInsert) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('payments').insert(payment).select().single()
  if (error) throw error

  // Mark credit trips as paid based on the payment amount
  // Each trip costs 50₪ — mark as many credit trips as the payment covers
  if (payment.factory_id && payment.amount_paid) {
    const tripsToMark = Math.floor(Number(payment.amount_paid) / 50)
    if (tripsToMark > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: creditTrips } = await (supabase as any)
        .from('trips')
        .select('id')
        .eq('factory_id', payment.factory_id)
        .eq('payment_status', 'credit')
        .order('created_at', { ascending: true })
        .limit(tripsToMark)

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
      (supabase as any).from('trips').select('id, payment_status').eq('factory_id', fid).order('created_at', { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('payments').select('amount_paid').eq('factory_id', fid),
    ])

    const trips = tripsRes.data || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalPaidViaPayments = (paymentsRes.data || []).reduce((s: number, p: any) => s + Number(p.amount_paid), 0)

    // How many credit trips does the payments table cover?
    const creditTripsCoverable = Math.floor(totalPaidViaPayments / 50)

    // Get only the credit trips (oldest first)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creditTrips = (trips as any[]).filter((t: any) => t.payment_status === 'credit')

    // Mark oldest credit trips as paid up to what payments cover
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toMarkPaid = creditTrips.slice(0, creditTripsCoverable).map((t: any) => t.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toMarkCredit = creditTrips.slice(creditTripsCoverable).map((t: any) => t.id)

    // Only update trips that need to change — never touch 'paid' trips registered upfront
    if (toMarkPaid.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('trips').update({ payment_status: 'paid', payment_method: 'later' }).in('id', toMarkPaid)
      totalUpdated += toMarkPaid.length
    }
    // Revert any credit trips that were incorrectly marked paid (safety check)
    if (toMarkCredit.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('trips').update({ payment_status: 'credit', payment_method: null }).in('id', toMarkCredit)
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
  const balance = totalAmount - totalPaid

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
