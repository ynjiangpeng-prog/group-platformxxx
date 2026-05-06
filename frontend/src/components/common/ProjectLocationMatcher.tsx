import { useState, useEffect, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { MapPin, Loader2, Search, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { matchProjectByLocation, listProjects } from "@/api/project"

interface Props {
  onSelect: (project: { id: string; name: string }) => void
  selectedId?: string
}

export default function ProjectLocationMatcher({ onSelect, selectedId }: Props) {
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "granted" | "denied">("idle")
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [keyword, setKeyword] = useState("")

  const locationQuery = useQuery({
    queryKey: ["match-by-location", coords?.lat, coords?.lng],
    queryFn: () => matchProjectByLocation(coords!.lat, coords!.lng),
    enabled: !!coords,
  })

  const searchQuery = useQuery({
    queryKey: ["projects-search", keyword],
    queryFn: () => listProjects({ keyword, page: 1, page_size: 10 }),
    enabled: geoStatus === "denied" && !!keyword,
  })

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus("denied")
      return
    }
    setGeoStatus("loading")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoStatus("granted")
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [])

  useEffect(() => {
    requestLocation()
  }, [requestLocation])

  useEffect(() => {
    if (locationQuery.data?.length && !selectedId) {
      onSelect({ id: locationQuery.data[0].id, name: locationQuery.data[0].name })
    }
  }, [locationQuery.data, onSelect, selectedId])

  const formatDistance = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`

  if (geoStatus === "idle" || geoStatus === "loading") {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">正在获取位置...</span>
        </CardContent>
      </Card>
    )
  }

  if (geoStatus === "denied") {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <MapPin className="size-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">无法获取位置，请手动搜索项目</span>
            <Button variant="outline" size="sm" onClick={requestLocation}>
              <RefreshCw className="size-3.5" />重试定位
            </Button>
          </CardContent>
        </Card>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="搜索项目名称..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-8"
          />
        </div>
        {searchQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {searchQuery.data?.items.map((p) => (
              <Card
                key={p.id}
                className={`cursor-pointer transition-colors hover:bg-accent ${selectedId === p.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => onSelect({ id: p.id, name: p.name })}
              >
                <CardContent className="flex items-center justify-between p-3">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="outline">{p.project_code}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="size-4" />
        <span>已定位，显示附近项目</span>
        <Button variant="ghost" size="sm" onClick={requestLocation}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      {locationQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !locationQuery.data?.length ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            附近未找到项目
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {locationQuery.data.map((p) => (
            <Card
              key={p.id}
              className={`cursor-pointer transition-colors hover:bg-accent ${selectedId === p.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => onSelect({ id: p.id, name: p.name })}
            >
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex flex-col">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{formatDistance(p.distance_meters)}</Badge>
                  <Badge variant="outline">{p.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
