'use client'
import { useEffect, useRef, useState } from 'react'
import { getFactoriesWithTripCount } from '@/lib/api'

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
            position: relative;
            width: 20px;
            height: 20px;
          ">
            <div style="
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: ${color};
              border: 2.5px solid white;
              box-shadow: 0 1px 5px rgba(0,0,0,0.35);
            "></div>
          </div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Map */}
        <div className="lg:col-span-3">
          <div
            ref={mapRef}
            className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
            style={{ height: '720px' }}
          />
        </div>

        {/* Factory list sidebar */}
        <div className="space-y-1.5 max-h-[720px] overflow-y-auto pr-1">
          {(() => {
            const maxT = Math.max(...factories.map((f: FactoryWithCount) => f.trip_count ?? 0), 1)
            return factories.map((f: FactoryWithCount) => (
              <div
                key={f.id}
                onClick={() => setSelected(f)}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                  selected?.id === f.id
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: getTripColor(f.trip_count ?? 0, maxT) }}></div>
                  <p className="font-medium text-slate-800 text-xs truncate flex-1">{f.name}</p>
                  <span className="text-xs font-bold text-slate-500 flex-shrink-0">{f.trip_count ?? 0}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 mr-5">{f.region || 'غير محدد'}</p>
              </div>
            ))
          })()}
          {factories.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">
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
