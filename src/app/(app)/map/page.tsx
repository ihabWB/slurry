'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { getFactoriesWithTripCount } from '@/lib/api'

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
  const mapRef = useRef<HTMLDivElement>(null)
  const [factories, setFactories] = useState<FactoryWithCount[]>([])
  const [selected, setSelected] = useState<FactoryWithCount | null>(null)
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

  const flyTo = (f: FactoryWithCount) => {
    setSelected(f)
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

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

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

        marker.on('click', () => setSelected(f))
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

      <div
        ref={mapRef}
        className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm w-full"
        style={{ height: '720px' }}
      />

      {selected && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">{selected.name}</h3>
              <p className="text-sm text-slate-500">{selected.owner_name} · {selected.phone} · {selected.region || ''}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">🚛 {selected.trip_count ?? 0} نقلة</span>
              <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${selected.balance > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {selected.balance > 0 ? `ذمة: ${selected.balance} ₪` : 'ملتزم ✓'}
              </span>
              <button onClick={() => { setSelected(null); setSearch('') }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
