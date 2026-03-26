'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { getFactoriesWithTripCount } from '@/lib/api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FactoryWithCount = any

function getTripColor(count: number, max: number): string {
  if (max === 0) return '#22c55e'
  const ratio = Math.min(count / max, 1)
  let r, g, b
  if (ratio < 0.5) {
    const t = ratio * 2
    r = Math.round(34 + t * (251 - 34))
    g = Math.round(197 + t * (191 - 197))
    b = Math.round(94 + t * (36 - 94))
  } else {
    const t = (ratio - 0.5) * 2
    r = Math.round(251 + t * (220 - 251))
    g = Math.round(191 + t * (38 - 191))
    b = Math.round(36 + t * (38 - 36))
  }
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
      f.name.toLowerCase().includes(q) || (f.region || '').toLowerCase().includes(q) || (f.owner_name || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [search, factories])

  const flyTo = (f: FactoryWithCount) => {
    setSelected(f)
    setSearch(f.name)
    setShowSuggestions(false)
    if (mapInstanceRef.current && f.lat && f.lng) {
      mapInstanceRef.current.flyTo([f.lat, f.lng], 16, { duration: 1.2 })
      // Open popup after fly
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
        [31.5569,   35.143297],
      ]

      const map = L.map(mapRef.current!).fitBounds(bounds)
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      const maxTrips = Math.max(...(factories as FactoryWithCount[]).map((f: FactoryWithCount) => f.trip_count ?? 0), 1)

      factories.forEach((f: FactoryWithCount) => {
        const count = f.trip_count ?? 0
        const color = getTripColor(count, maxTrips)
        const isOverdue = f.balance > 0

        const icon = L.divIcon({
          html: `<div style="
            width: 18px;
            height: 18px;
            transform: rotate(45deg);
            background: ${color};
            border: 2px solid white;
            box-shadow: 0 1px 6px rgba(0,0,0,0.4);
          "></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          className: '',
        })

        const marker = L.marker([f.lat, f.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: Arial, sans-serif; direction: rtl; min-width: 170px; padding: 2px 0;">
              <strong style="font-size: 13px; color: #1e293b">${f.name}</strong><br/>
              <span style="color: #64748b; font-size: 11px">${f.region || ''}</span><br/>
              <div style="margin-top: 5px; display: flex; flex-direction: column; gap: 2px;">
                <span style="font-size: 11px">👤 ${f.owner_name}</span>
                <span style="font-size: 11px">📞 ${f.phone}</span>
                <span style="font-size: 11px">🚛 عدد النقلات: <strong>${count}</strong></span>
              </div>
              <span style="
                display: inline-block;
                margin-top: 6px;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: bold;
                background: ${isOverdue ? '#fef2f2' : '#f0fdf4'};
                color: ${isOverdue ? '#dc2626' : '#16a34a'};
              ">
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">خريطة المصانع</h1>
          <p className="text-sm text-slate-500 mt-0.5">{factories.length} مصنع على الخريطة</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search box */}
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
            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full mt-1 right-0 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-[9999] overflow-hidden">
                {suggestions.map((f: FactoryWithCount) => (
                  <button
                    key={f.id}
                    onMouseDown={() => flyTo(f)}
                    className="w-full text-right px-4 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex items-center gap-2"
                  >
                    <div className="w-2.5 h-2.5 flex-shrink-0" style={{
                      background: getTripColor(f.trip_count ?? 0, Math.max(...factories.map((x: FactoryWithCount) => x.trip_count ?? 0), 1)),
                      transform: 'rotate(45deg)'
                    }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                      <p className="text-xs text-slate-400 truncate">{f.region || ''} · {f.trip_count ?? 0} نقلة</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>قليل</span>
            <div className="w-24 h-2.5 rounded-full" style={{ background: 'linear-gradient(to right, #22c55e, #eab308, #dc2626)' }}></div>
            <span>كثير — عدد النقلات</span>
          </div>
        </div>
      </div>

      {/* Map */}
      <div
        ref={mapRef}
        className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm w-full"
        style={{ height: '720px' }}
      />

      {/* Selected factory detail */}
      {selected && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">{selected.name}</h3>
              <p className="text-sm text-slate-500">{selected.owner_name} · {selected.phone} · {selected.region || ''}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">🚛 {selected.trip_count ?? 0} نقلة</span>
              <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                selected.balance > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
              }`}>
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


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FactoryWithCount = any

// Returns a hex color interpolated between green→yellow→orange→red based on trip count
function getTripColor(count: number, max: number): string {
  if (max === 0) return '#22c55e'
  const ratio = Math.min(count / max, 1)
  // green (0,200,100) → yellow (255,200,0) → red (220,38,38)
  let r, g, b
  if (ratio < 0.5) {
    const t = ratio * 2
    r = Math.round(34 + t * (251 - 34))
    g = Math.round(197 + t * (191 - 197))
    b = Math.round(94 + t * (36 - 94))
  } else {
    const t = (ratio - 0.5) * 2
    r = Math.round(251 + t * (220 - 251))
    g = Math.round(191 + t * (38 - 191))
    b = Math.round(36 + t * (38 - 36))
  }
  return `rgb(${r},${g},${b})`
}

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [factories, setFactories] = useState<FactoryWithCount[]>([])
  const [selected, setSelected] = useState<FactoryWithCount | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    getFactoriesWithTripCount().then(setFactories).catch(console.error)
  }, [])

  useEffect(() => {
    if (!mapRef.current || factories.length === 0) return
    // Dynamically import leaflet to avoid SSR issues
    import('leaflet').then(L => {
      // Fix default icons
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

      // Fixed bounds: Hebron industrial area
      const bounds: [[number, number], [number, number]] = [
        [31.488633, 35.0687],   // SW corner
        [31.5569,   35.143297], // NE corner
      ]

      const map = L.map(mapRef.current!).fitBounds(bounds)
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      const maxTrips = Math.max(...(factories as FactoryWithCount[]).map((f: FactoryWithCount) => f.trip_count ?? 0), 1)

      factories.forEach((f: FactoryWithCount) => {
        const count = f.trip_count ?? 0
        const color = getTripColor(count, maxTrips)
        const isOverdue = f.balance > 0

        const icon = L.divIcon({
          html: `<div style="
            width: 18px;
            height: 18px;
            transform: rotate(45deg);
            background: ${color};
            border: 2px solid white;
            box-shadow: 0 1px 6px rgba(0,0,0,0.4);
          "></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          className: '',
        })

        const marker = L.marker([f.lat, f.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: Arial, sans-serif; direction: rtl; min-width: 170px; padding: 2px 0;">
              <strong style="font-size: 13px; color: #1e293b">${f.name}</strong><br/>
              <span style="color: #64748b; font-size: 11px">${f.region || ''}</span><br/>
              <div style="margin-top: 5px; display: flex; flex-direction: column; gap: 2px;">
                <span style="font-size: 11px">👤 ${f.owner_name}</span>
                <span style="font-size: 11px">📞 ${f.phone}</span>
                <span style="font-size: 11px">🚛 عدد النقلات: <strong>${count}</strong></span>
              </div>
              <span style="
                display: inline-block;
                margin-top: 6px;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: bold;
                background: ${isOverdue ? '#fef2f2' : '#f0fdf4'};
                color: ${isOverdue ? '#dc2626' : '#16a34a'};
              ">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">خريطة المصانع</h1>
          <p className="text-sm text-slate-500 mt-0.5">{factories.length} مصنع على الخريطة</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>قليل</span>
          <div className="w-28 h-3 rounded-full" style={{ background: 'linear-gradient(to right, #22c55e, #eab308, #dc2626)' }}></div>
          <span>كثير</span>
          <span className="text-slate-400">← عدد النقلات</span>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Map — full width */}
        <div>
          <div
            ref={mapRef}
            className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm w-full"
            style={{ height: '720px' }}
          />
        </div>

        {/* Factory list — horizontal scrollable row below map */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(() => {
            const maxT = Math.max(...factories.map((f: FactoryWithCount) => f.trip_count ?? 0), 1)
            return factories.map((f: FactoryWithCount) => (
              <div
                key={f.id}
                onClick={() => setSelected(f)}
                className={`flex-shrink-0 p-2.5 rounded-xl border cursor-pointer transition-all w-40 ${
                  selected?.id === f.id
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 flex-shrink-0" style={{ background: getTripColor(f.trip_count ?? 0, maxT), transform: 'rotate(45deg)' }}></div>
                  <p className="font-medium text-slate-800 text-xs truncate flex-1">{f.name}</p>
                  <span className="text-xs font-bold text-slate-500 flex-shrink-0">{f.trip_count ?? 0}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 mr-5 truncate">{f.region || 'غير محدد'}</p>
              </div>
            ))
          })()}
          {factories.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm w-full">
              لا توجد مصانع مسجلة
            </div>
          )}
        </div>
      </div>

      {/* Selected factory detail */}
      {selected && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">{selected.name}</h3>
              <p className="text-sm text-slate-500">{selected.owner_name} · {selected.phone}</p>
            </div>
            <div className="text-left">
              <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                selected.balance > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
              }`}>
                {selected.balance > 0 ? `ذمة: ${selected.balance} ₪` : 'ملتزم ✓'}
              </span>
              <p className="text-xs text-slate-400 mt-1 text-center" dir="ltr">
                {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
