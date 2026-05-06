import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { listStations, createStation, updateStation, deleteStation } from "@/api/charging"
import type { Station } from "@/api/types"

const EMPTY_FORM = {
  station_code: "",
  name: "",
  station_type: "",
  province: "",
  city: "",
  district: "",
  address: "",
  longitude: "",
  latitude: "",
  total_parking: "",
  monthly_rent: "",
  power_capacity: "",
}

const PAGE_SIZE = 20

export default function StationPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Station | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Station | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const { data, isLoading } = useQuery({
    queryKey: ["charging-stations", page],
    queryFn: () => listStations({ page, page_size: PAGE_SIZE }),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const buildPayload = () => ({
    station_code: form.station_code,
    name: form.name,
    station_type: form.station_type,
    province: form.province || undefined,
    city: form.city || undefined,
    district: form.district || undefined,
    address: form.address || undefined,
    total_parking: form.total_parking ? Number(form.total_parking) : undefined,
    monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : undefined,
    power_capacity: form.power_capacity ? Number(form.power_capacity) : undefined,
  } as Partial<Station> & Record<string, unknown>)

  const createMut = useMutation({
    mutationFn: (data: Partial<Station>) => createStation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-stations"] })
      toast.success("创建成功")
      setDialogOpen(false)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Station> }) => updateStation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-stations"] })
      toast.success("更新成功")
      setDialogOpen(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteStation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-stations"] })
      toast.success("删除成功")
      setDeleteTarget(null)
    },
  })

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (item: Station) => {
    setForm({
      station_code: item.station_code ?? "",
      name: item.name ?? "",
      station_type: item.station_type ?? "",
      province: item.province ?? "",
      city: item.city ?? "",
      district: item.district ?? "",
      address: item.address ?? "",
      longitude: "",
      latitude: "",
      total_parking: item.total_parking?.toString() ?? "",
      monthly_rent: item.monthly_rent?.toString() ?? "",
      power_capacity: item.power_capacity?.toString() ?? "",
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = buildPayload()
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">充电站管理</h1>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          新增
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>站点编码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>地区</TableHead>
                  <TableHead>车位</TableHead>
                  <TableHead>功率(kW)</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
                {data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">{item.station_code}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.station_type}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === "active" ? "default" : "secondary"}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{[item.province, item.city].filter(Boolean).join(" / ")}</TableCell>
                    <TableCell>{item.total_parking ?? "-"}</TableCell>
                    <TableCell>{item.power_capacity ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">共 {data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <span className="text-sm">{page} / {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑站点" : "新增站点"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>站点编码</Label>
                <Input value={form.station_code} onChange={set("station_code")} required />
              </div>
              <div className="space-y-2">
                <Label>名称</Label>
                <Input value={form.name} onChange={set("name")} required />
              </div>
              <div className="space-y-2">
                <Label>站点类型</Label>
                <Input value={form.station_type} onChange={set("station_type")} required />
              </div>
              <div className="space-y-2">
                <Label>省份</Label>
                <Input value={form.province} onChange={set("province")} />
              </div>
              <div className="space-y-2">
                <Label>城市</Label>
                <Input value={form.city} onChange={set("city")} />
              </div>
              <div className="space-y-2">
                <Label>区县</Label>
                <Input value={form.district} onChange={set("district")} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>地址</Label>
                <Input value={form.address} onChange={set("address")} />
              </div>
              <div className="space-y-2">
                <Label>经度</Label>
                <Input type="number" step="any" value={form.longitude} onChange={set("longitude")} />
              </div>
              <div className="space-y-2">
                <Label>纬度</Label>
                <Input type="number" step="any" value={form.latitude} onChange={set("latitude")} />
              </div>
              <div className="space-y-2">
                <Label>总车位</Label>
                <Input type="number" value={form.total_parking} onChange={set("total_parking")} />
              </div>
              <div className="space-y-2">
                <Label>月租金</Label>
                <Input type="number" step="0.01" value={form.monthly_rent} onChange={set("monthly_rent")} />
              </div>
              <div className="space-y-2">
                <Label>功率容量(kW)</Label>
                <Input type="number" step="0.01" value={form.power_capacity} onChange={set("power_capacity")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="size-4 animate-spin" />}
                确定
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，确定要删除该站点吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
