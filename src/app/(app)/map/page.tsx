'use client'
import { useEffect, useRef, useState } from 'react'
import { getFactories } from '@/lib/api'
import type { Factory } from '@/lib/supabase/database.types'

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [factories, setFactories] = useState<Factory[]>([])
  const [selected, setSelected] = useState<Factory | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    getFactories().then(setFactories).catch(console.error)
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

      // Center on first factory or default Palestine center
      const center: [number, number] = factories[0]
        ? [factories[0].lat, factories[0].lng]
        : [31.5, 35.1]

      const map = L.map(mapRef.current!).setView(center, 11)
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      factories.forEach(f => {
        const isOverdue = f.balance > 0
        const color = isOverdue ? '#ef4444' : '#22c55e'

        const icon = L.divIcon({
          html: `<div style="
            background: ${color};
            width: 32px;
            height: 32px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          "></div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          className: '',
        })

        const marker = L.marker([f.lat, f.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: Arial, sans-serif; direction: rtl; min-width: 160px;">
              <strong style="font-size: 14px">${f.name}</strong><br/>
              <span style="color: #64748b; font-size: 12px">${f.region || ''}</span><br/>
              <span style="font-size: 12px">👤 ${f.owner_name}</span><br/>
              <span style="font-size: 12px">📞 ${f.phone}</span><br/>
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
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-slate-600">ملتزم</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-slate-600">متأخر</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Map */}
        <div className="lg:col-span-3">
          <div
            ref={mapRef}
            className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm"
            style={{ height: '600px' }}
          />
        </div>

        {/* Factory list sidebar */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {factories.map(f => (
            <div
              key={f.id}
              onClick={() => setSelected(f)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selected?.id === f.id
                  ? 'border-blue-400 bg-blue-50'
                  : f.balance > 0
                    ? 'border-red-100 bg-red-50 hover:border-red-300'
                    : 'border-emerald-100 bg-emerald-50 hover:border-emerald-300'
              }`}
            >
              <p className="font-medium text-slate-800 text-sm truncate">{f.name}</p>
              <p className="text-xs text-slate-500">{f.region || 'غير محدد'}</p>
              <p className={`text-xs font-semibold mt-1 ${f.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {f.balance > 0 ? `ذمة: ${f.balance} ₪` : 'ملتزم ✓'}
              </p>
            </div>
          ))}
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
