export interface PricingRule {
  id: string
  waste_type: 'liquid' | 'solid'
  volume_m3: number
  max_distance_km: number   // 7 = "≤7 كم"، 9999 = ">7 كم"
  dump_site: 'municipal_dump' | 'central_press'
  unit_price: number
  label: string | null
}

/** المسافة ≤ 7 كم → نطاق 7، غير هيك → نطاق 9999 (نفس القاعدة المستخدمة بكل مكان بالتطبيق) */
export function distanceBand(distanceKm: number): 7 | 9999 {
  return distanceKm <= 7 ? 7 : 9999
}

export interface PricingMatchInput {
  waste_type: string | null | undefined
  volume_m3: number | string | null | undefined
  distance_km: number | string | null | undefined
  dump_site: string | null | undefined
}

/** يلاقي قاعدة التسعيرة المطابقة لنقلة حسب نوع الربو + الحجم + نطاق المسافة + المكب */
export function matchPricingRule(rules: PricingRule[], input: PricingMatchInput): PricingRule | null {
  const { waste_type, dump_site } = input
  const volume_m3   = typeof input.volume_m3   === 'string' ? parseFloat(input.volume_m3)   : input.volume_m3
  const distance_km = typeof input.distance_km === 'string' ? parseFloat(input.distance_km) : input.distance_km

  if (!waste_type || !dump_site || volume_m3 == null || distance_km == null ||
      Number.isNaN(volume_m3) || Number.isNaN(distance_km)) {
    return null
  }

  const maxDist = distanceBand(distance_km)
  return rules.find(r =>
    r.waste_type === waste_type &&
    r.volume_m3 === volume_m3 &&
    r.max_distance_km === maxDist &&
    r.dump_site === dump_site
  ) ?? null
}

export interface TripPricing {
  trip_cost: number
  factory_contribution: number
  subsidy_amount: number
}

/** تكلفة النقلة + مساهمة المصنع + دعم المشروع بناءً على قاعدة تسعيرة مطابقة */
export function computeTripPricing(rule: PricingRule, factoryContribution: number): TripPricing {
  return {
    trip_cost: rule.unit_price,
    factory_contribution: factoryContribution,
    subsidy_amount: rule.unit_price - factoryContribution,
  }
}

/** اسم المكب المعروض حسب نوعه ومسافته */
export function getDumpSiteLabel(t: { dump_site?: string | null; distance_km?: number | string | null }): string {
  if (t.dump_site === 'central_press') return 'عصارة الربو'
  if (t.dump_site === 'municipal_dump') {
    const km = Number(t.distance_km ?? 0)
    return km <= 7 ? 'خلة الشرباتي' : 'سعير'
  }
  return t.dump_site ?? '—'
}
