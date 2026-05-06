import { useEffect, useRef, useCallback, useState } from "react"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"

interface GaodeMapProps {
  value?: { lng: number; lat: number; address?: string }
  onChange: (location: { lng: number; lat: number; address?: string }) => void
}

const DEFAULT_LNG = 102.7123
const DEFAULT_LAT = 25.0406

declare global {
  interface Window {
    AMap: any
  }
}

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

  const initMap = useCallback(() => {
    if (!containerRef.current || !window.AMap) {
      setError("地图加载失败，请刷新页面重试")
      setLoading(false)
      return
    }

    try {
      const AMap = window.AMap

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

      AMap.plugin(["AMap.Geocoder", "AMap.AutoComplete"], () => {
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
      })
    } catch (err) {
      console.error("Map init error:", err)
      setError("地图初始化失败")
      setLoading(false)
    }
  }, [lng, lat, onChange])

  useEffect(() => {
    if (typeof window === "undefined") return

    if (window.AMap) {
      initMap()
    } else {
      const checkInterval = setInterval(() => {
        if (window.AMap) {
          clearInterval(checkInterval)
          initMap()
        }
      }, 500)

      const timeout = setTimeout(() => {
        clearInterval(checkInterval)
        setError("地图加载超时，请检查网络连接")
        setLoading(false)
      }, 10000)

      return () => {
        clearInterval(checkInterval)
        clearTimeout(timeout)
      }
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
        markerRef.current = null
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
