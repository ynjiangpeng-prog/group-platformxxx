import { useEffect, useRef, useCallback, useState } from "react"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import AMapLoader from "@amap/amap-jsapi-loader"

interface GaodeMapProps {
  value?: { lng: number; lat: number; address?: string }
  onChange: (location: { lng: number; lat: number; address?: string }) => void
}

const DEFAULT_LNG = 102.7123
const DEFAULT_LAT = 25.0406

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || "b23a71f6a0c9e6f67c3f9a8e2d1b5c4a"

export default function GaodeMap({ value, onChange }: GaodeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const geocoderRef = useRef<any>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lng = value?.lng ?? DEFAULT_LNG
  const lat = value?.lat ?? DEFAULT_LAT

  const initMap = useCallback(async () => {
    if (!containerRef.current) return

    try {
      const AMap = await AMapLoader.load({
        key: AMAP_KEY,
        version: "2.0",
        plugins: ["AMap.Geocoder", "AMap.AutoComplete"],
      })

      if (!containerRef.current) return

      const map = new AMap.Map(containerRef.current, {
        center: [lng, lat],
        zoom: 14,
      })
      mapRef.current = map

      const marker = new AMap.Marker({
        map,
        position: [lng, lat],
        draggable: true,
      })
      markerRef.current = marker

      marker.on("dragend", () => {
        const mPos = marker.getPosition()
        if (geocoderRef.current) {
          geocoderRef.current.getAddress([mPos.lng, mPos.lat], (status: string, result: any) => {
            const address = status === "complete" ? result?.regeocode?.formattedAddress : undefined
            onChange({ lng: mPos.lng, lat: mPos.lat, address })
          })
        } else {
          onChange({ lng: mPos.lng, lat: mPos.lat })
        }
      })

      map.on("click", (e: any) => {
        const pos = { lng: e.lnglat.lng, lat: e.lnglat.lat }
        marker.setPosition([pos.lng, pos.lat])
        map.setCenter([pos.lng, pos.lat])

        if (geocoderRef.current) {
          geocoderRef.current.getAddress([pos.lng, pos.lat], (status: string, result: any) => {
            const address = status === "complete" ? result?.regeocode?.formattedAddress : undefined
            onChange({ ...pos, address })
          })
        } else {
          onChange(pos)
        }
      })

      const geocoder = new AMap.Geocoder()
      geocoderRef.current = geocoder

      if (searchRef.current) {
        const autocomplete = new AMap.AutoComplete({
          input: searchRef.current,
          city: "全国",
        })
        autocomplete.on("select", (e: any) => {
          const pos = { lng: e.poi.location.lng, lat: e.poi.location.lat }
          marker.setPosition([pos.lng, pos.lat])
          map.setCenter([pos.lng, pos.lat])
          onChange({ ...pos, address: e.poi.name })
        })
      }

      setLoading(false)
    } catch (err: any) {
      console.error("Map init error:", err)
      setError("地图加载失败，请检查网络或联系管理员配置地图密钥")
      setLoading(false)
    }
  }, [lng, lat, onChange])

  useEffect(() => {
    initMap()

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
        markerRef.current = null
        geocoderRef.current = null
      }
    }
  }, [initMap])

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        style={{ height: 400, width: "100%" }}
        className="rounded-md border relative"
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <span className="text-sm text-muted-foreground">{error}</span>
          </div>
        )}
      </div>
      <Input ref={searchRef} placeholder="搜索地址..." className="h-9" />
      <div className="grid grid-cols-3 gap-2">
        <Input value={value?.lng ?? ""} readOnly placeholder="经度" className="h-8 text-sm" />
        <Input value={value?.lat ?? ""} readOnly placeholder="纬度" className="h-8 text-sm" />
        <Input value={value?.address ?? ""} readOnly placeholder="地址" className="h-8 text-sm" />
      </div>
    </div>
  )
}
