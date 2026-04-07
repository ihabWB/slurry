'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { Search, X, Truck, Droplets, Package, TrendingUp, Coins, AlertTriangle } from 'lucide-react'
import { getFactoriesWithTripCount, getFactoryTripStats } from '@/lib/api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FactoryWithCount = any

// 5-stop gradient: blue(0) → green → lime → yellow → orange → red
function getTripColor(count: number, max: number): string {
  if (count === 0) return '#3b82f6' // blue — no trips
  if (max === 0) return '#3b82f6'
  const ratio = Math.min(count / max, 1) // 0..1
  // 4 segments between 5 stops
  // stops: green #22c55e → lime #84cc16 → yellow #eab308 → orange #f97316 → red #ef4444
  const stops = [
    [34,  197, 94],   // #22c55e green
    [132, 204, 22],   // #84cc16 lime
    [234, 179, 8],    // #eab308 yellow
    [249, 115, 22],   // #f97316 orange
    [239, 68,  68],   // #ef4444 red
  ]
  const seg = ratio * (stops.length - 1)
  const lo = Math.floor(seg)
  const hi = Math.min(lo + 1, stops.length - 1)
  const t = seg - lo
  const r = Math.round(stops[lo][0] + t * (stops[hi][0] - stops[lo][0]))
  const g = Math.round(stops[lo][1] + t * (stops[hi][1] - stops[lo][1]))
  const b = Math.round(stops[lo][2] + t * (stops[hi][2] - stops[lo][2]))
  return `rgb(${r},${g},${b})`
}

export default function MapPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Stats = any

  const mapRef = useRef<HTMLDivElement>(null)
  const [factories, setFactories] = useState<FactoryWithCount[]>([])
  const [selected, setSelected] = useState<FactoryWithCount | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    getFactoriesWithTripCount().then(setFactories).catch(console.error)
  }, [])

  const suggestions = useMemo(() => {
    if (!search.trim()) return []
    const q = search.trim().toLowerCase()
    return factories.filter((f: FactoryWithCount) =>
      f.name.toLowerCase().includes(q) ||
      (f.region || '').toLowerCase().includes(q) ||
      (f.owner_name || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [search, factories])

  const selectFactory = (f: FactoryWithCount) => {
    setSelected(f)
    setStats(null)
    setStatsLoading(true)
    getFactoryTripStats(f.id)
      .then(s => setStats(s))
      .catch(console.error)
      .finally(() => setStatsLoading(false))
  }

  const flyTo = (f: FactoryWithCount) => {
    selectFactory(f)
    setSearch(f.name)
    setShowSuggestions(false)
    if (mapInstanceRef.current && f.lat && f.lng) {
      mapInstanceRef.current.flyTo([f.lat, f.lng], 16, { duration: 1.2 })
      setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mapInstanceRef.current?.eachLayer((layer: any) => {
          if (layer.getLatLng && layer.getLatLng().lat.toFixed(5) === f.lat.toFixed(5)) {
            layer.openPopup()
          }
        })
      }, 1300)
    }
  }

  useEffect(() => {
    if (!mapRef.current || factories.length === 0) return
    import('leaflet').then(L => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
      }

      const bounds: [[number, number], [number, number]] = [
        [31.488633, 35.0687],
        [31.5569, 35.143297],
      ]

      const map = L.map(mapRef.current!).fitBounds(bounds)
      mapInstanceRef.current = map

      // Satellite base layer (ESRI World Imagery)
      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community' }
      )

      // Labels overlay (OpenStreetMap streets/names on top)
      const labels = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { attribution: '© OpenStreetMap contributors', opacity: 0.6 }
      )

      satellite.addTo(map)
      labels.addTo(map)

      const maxTrips = Math.max(...(factories as FactoryWithCount[]).map((f: FactoryWithCount) => f.trip_count ?? 0), 1)

      factories.forEach((f: FactoryWithCount) => {
        if (f.lat == null || f.lng == null) return  // skip factories without coordinates
        const count = f.trip_count ?? 0
        const color = getTripColor(count, maxTrips)
        const isOverdue = f.balance > 0

        const icon = L.divIcon({
          html: `<div style="width:18px;height:18px;transform:rotate(45deg);background:${color};border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.4);"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          className: '',
        })

        const marker = L.marker([f.lat, f.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:Arial,sans-serif;direction:rtl;min-width:170px;padding:2px 0;">
              <strong style="font-size:13px;color:#1e293b">${f.name}</strong><br/>
              <span style="color:#64748b;font-size:11px">${f.region || ''}</span><br/>
              <div style="margin-top:5px;display:flex;flex-direction:column;gap:2px;">
                <span style="font-size:11px">👤 ${f.owner_name}</span>
                <span style="font-size:11px">📞 ${f.phone}</span>
                <span style="font-size:11px">🚛 عدد النقلات: <strong>${count}</strong></span>
              </div>
              <span style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold;background:${isOverdue ? '#fef2f2' : '#f0fdf4'};color:${isOverdue ? '#dc2626' : '#16a34a'};">
                ${isOverdue ? `ذمة: ${f.balance} ₪` : 'ملتزم ✓'}
              </span>
            </div>
          `)

        marker.on('click', () => selectFactory(f))
      })
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factories])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">خريطة المصانع</h1>
          <p className="text-sm text-slate-500 mt-0.5">{factories.length} مصنع على الخريطة</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm w-72">
              <Search size={15} className="text-slate-400 flex-shrink-0" />
              <input
                type="text"
                placeholder="ابحث عن مصنع..."
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                className="flex-1 text-sm outline-none bg-transparent text-slate-800 placeholder-slate-400"
              />
              {search && (
                <button onClick={() => { setSearch(''); setSelected(null) }} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full mt-1 right-0 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-[9999] overflow-hidden">
                {suggestions.map((f: FactoryWithCount) => (
                  <button
                    key={f.id}
                    onMouseDown={() => flyTo(f)}
                    className="w-full text-right px-4 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex items-center gap-2"
                  >
                    <div className="w-2.5 h-2.5 flex-shrink-0" style={{ background: getTripColor(f.trip_count ?? 0, Math.max(...factories.map((x: FactoryWithCount) => x.trip_count ?? 0), 1)), transform: 'rotate(45deg)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                      <p className="text-xs text-slate-400 truncate">{f.region || ''} · {f.trip_count ?? 0} نقلة</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: '#3b82f6' }}></div>
              <span>لا توجد نقلات</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-2.5 rounded-full" style={{ background: 'linear-gradient(to right, #22c55e, #84cc16, #eab308, #f97316, #ef4444)' }}></div>
              <span>قليل → كثير</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Map */}
        <div
          ref={mapRef}
          className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex-1 min-w-0"
          style={{ height: '720px' }}
        />

        {/* Side Panel */}
        {selected && (
          <div className="w-72 flex-shrink-0 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-y-auto" style={{ height: '720px' }}>
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-slate-100">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-800 text-base leading-tight">{selected.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selected.region || ''}</p>
                <p className="text-xs text-slate-500 mt-0.5">👤 {selected.owner_name}</p>
                <p className="text-xs text-slate-500">📞 {selected.phone}</p>
              </div>
              <button
                onClick={() => { setSelected(null); setStats(null); setSearch('') }}
                className="text-slate-400 hover:text-slate-600 flex-shrink-0 mt-0.5"
              >
                <X size={15} />
              </button>
            </div>

            {statsLoading && (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin ml-2" />
                جاري التحميل...
              </div>
            )}

            {!statsLoading && stats && (() => {
              const fmt = (n: number) => n.toLocaleString()
              const Row = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-slate-500">{label}</span>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-slate-700">{value}</span>
                    {sub && <p className="text-xs text-slate-400">{sub}</p>}
                  </div>
                </div>
              )

              return (
                <div className="divide-y divide-slate-100">

                  {/* ── الإجمالي ── */}
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Truck size={13} className="text-blue-500" />
                      <span className="text-xs font-bold text-blue-600">إجمالي النقلات</span>
                    </div>
                    <Row label="عدد النقلات" value={`${stats.total.trips} نقلة`} />
                    <Row label="إجمالي التكاليف" value={`${fmt(stats.total.cost)} ₪`} />
                  </div>

                  {/* ── سائل ── */}
                  {stats.liquid.trips > 0 && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Droplets size={13} className="text-blue-500" />
                        <span className="text-xs font-bold text-blue-600">النقلات السائلة</span>
                      </div>
                      <Row label="عدد النقلات" value={`${stats.liquid.trips} نقلة`} />
                      <Row label="إجمالي الحجم" value={`${stats.liquid.volume.toFixed(1)} م³`} />
                      <Row label="التكاليف" value={`${fmt(stats.liquid.cost)} ₪`} />
                      <div className="mt-2 pt-2 border-t border-slate-50">
                        <div className="flex items-center gap-1 mb-1.5">
                          <Coins size={12} className="text-violet-400" />
                          <span className="text-xs text-violet-600 font-medium">المساهمات</span>
                        </div>
                        <Row label="المطلوب" value={`${fmt(stats.liquid.contrib)} ₪`} />
                        <Row label="✅ محصّل" value={`${fmt(stats.liquid.paid)} ₪`} />
                        <Row
                          label="⏳ ذمة"
                          value={stats.liquid.debt > 0 ? `${fmt(stats.liquid.debt)} ₪` : '—'}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── جاف ── */}
                  {stats.solid.trips > 0 && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Package size={13} className="text-amber-500" />
                        <span className="text-xs font-bold text-amber-600">النقلات الجافة</span>
                      </div>
                      <Row label="عدد النقلات" value={`${stats.solid.trips} نقلة`} />
                      <Row label="إجمالي الحجم" value={`${stats.solid.volume.toFixed(1)} م³`} />
                      <Row label="التكاليف" value={`${fmt(stats.solid.cost)} ₪`} />
                      <div className="mt-2 pt-2 border-t border-slate-50">
                        <div className="flex items-center gap-1 mb-1.5">
                          <Coins size={12} className="text-violet-400" />
                          <span className="text-xs text-violet-600 font-medium">المساهمات</span>
                        </div>
                        <Row label="المطلوب" value={`${fmt(stats.solid.contrib)} ₪`} />
                        <Row label="✅ محصّل" value={`${fmt(stats.solid.paid)} ₪`} />
                        <Row
                          label="⏳ ذمة"
                          value={stats.solid.debt > 0 ? `${fmt(stats.solid.debt)} ₪` : '—'}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── الملخص الكلي ── */}
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp size={13} className="text-slate-500" />
                      <span className="text-xs font-bold text-slate-600">الملخص الكلي</span>
                    </div>
                    <Row label="إجمالي التكاليف" value={`${fmt(stats.total.cost)} ₪`} />
                    <Row label="إجمالي المساهمات" value={`${fmt(stats.total.contrib)} ₪`} />
                    <Row label="✅ إجمالي المحصّل" value={`${fmt(stats.total.paid)} ₪`} />
                    <div className="flex items-center justify-between py-1.5 mt-1 bg-red-50 rounded-xl px-2">
                      <div className="flex items-center gap-1">
                        <AlertTriangle size={12} className="text-red-500" />
                        <span className="text-xs text-red-600">إجمالي الذمم</span>
                      </div>
                      <span className={`text-sm font-bold ${stats.total.debt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {stats.total.debt > 0 ? `${fmt(stats.total.debt)} ₪` : 'ملتزم ✓'}
                      </span>
                    </div>
                  </div>

                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
