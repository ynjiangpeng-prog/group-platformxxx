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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listStations } from "@/api/charging"
import { listDevices, createDevice, updateDevice, deleteDevice } from "@/api/charging"
import type { Device } from "@/api/types"

const EMPTY_FORM = {
  station_id: "",
  device_code: "",
  model: "",
  device_type: "",
  rated_power: "",
}

const PAGE_SIZE = 20

export default function DevicePage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [stationFilter, setStationFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Device | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const { data: stationsData } = useQuery({
    queryKey: ["charging-stations-all"],
    queryFn: () => listStations({ page: 1, page_size: 500 }),
  })

  const stationNameMap = new Map(stationsData?.items?.map((s) => [s.id, s.name]) ?? [])

  const { data, isLoading } = useQuery({
    queryKey: ["charging-devices", page, stationFilter],
    queryFn: () =>
      listDevices({
        page,
        page_size: PAGE_SIZE,
        ...(stationFilter !== "all" && { station_id: stationFilter }),
      }),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const createMut = useMutation({
    mutationFn: (data: Partial<Device>) => createDevice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-devices"] })
      toast.success("创建成功")
      setDialogOpen(false)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Device> }) => updateDevice(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-devices"] })
      toast.success("更新成功")
      setDialogOpen(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-devices"] })
      toast.success("删除成功")
      setDeleteTarget(null)
    },
  })

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (item: Device) => {
    setForm({
      station_id: item.station_id ?? "",
      device_code: item.device_code ?? "",
      model: item.model ?? "",
      device_type: item.device_type ?? "",
      rated_power: item.rated_power?.toString() ?? "",
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Partial<Device> = {
      station_id: form.station_id,
      device_code: form.device_code,
      model: form.model,
      device_type: form.device_type,
      rated_power: form.rated_power ? Number(form.rated_power) : undefined,
    }
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
        <h1 className="text-2xl font-bold">充电设备管理</h1>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          新增
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 p-4 border-b">
            <Label className="shrink-0">站点筛选</Label>
            <select
              className="border rounded-md px-3 py-1.5 text-sm bg-background"
              value={stationFilter}
              onChange={(e) => {
                setStationFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="all">全部站点</option>
              {stationsData?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>设备编码</TableHead>
                  <TableHead>设备名称</TableHead>
                  <TableHead>设备类型</TableHead>
                  <TableHead>所属站点</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>功率(kW)</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
                {data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono">{item.device_code}</TableCell>
                    <TableCell>{item.model}</TableCell>
                    <TableCell>{item.device_type}</TableCell>
                    <TableCell>{stationNameMap.get(item.station_id) ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === "online" ? "default" : "secondary"}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.rated_power ?? "-"}</TableCell>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑设备" : "新增设备"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>所属站点</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.station_id}
                onChange={(e) => setForm((prev) => ({ ...prev, station_id: e.target.value }))}
                required
              >
                <option value="">请选择站点</option>
                {stationsData?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>设备编码</Label>
              <Input value={form.device_code} onChange={set("device_code")} required />
            </div>
            <div className="space-y-2">
              <Label>设备名称</Label>
              <Input value={form.model} onChange={set("model")} required />
            </div>
            <div className="space-y-2">
              <Label>设备类型</Label>
              <Input value={form.device_type} onChange={set("device_type")} required />
            </div>
            <div className="space-y-2">
              <Label>功率(kW)</Label>
              <Input type="number" step="0.01" value={form.rated_power} onChange={set("rated_power")} />
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
            <AlertDialogDescription>此操作不可撤销，确定要删除该设备吗？</AlertDialogDescription>
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
