import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { listDevices, createDevice, updateDevice, deleteDevice, listStations } from "@/api/charging"
import type { Device } from "@/api/types"
import BatchToolbar from "@/components/batch/BatchToolbar"

const DEVICE_TYPE_LABELS: Record<string, string> = {
  dc_fast: "直流快充",
  ac_slow: "交流慢充",
  super_dc: "超充",
  dc_ac_combo: "交直流一体",
}

const STATUS_LABELS: Record<string, string> = {
  online: "在线",
  offline: "离线",
  fault: "故障",
  maintenance: "维护中",
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  online: "default",
  offline: "secondary",
  fault: "destructive",
  maintenance: "outline",
}

const STATUS_CLASS: Record<string, string> = {
  maintenance: "border-yellow-500 text-yellow-700 bg-yellow-50",
}

const EMPTY_FORM = {
  device_code: "",
  model: "",
  device_type: "dc_fast",
  station_id: "",
  rated_power: "",
  manufacturer: "",
}

export default function DeviceListPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [stationFilter, setStationFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [keyword, setKeyword] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { data: stationsData } = useQuery({
    queryKey: ["stations-for-filter"],
    queryFn: () => listStations({ page: 1, page_size: 200 }),
  })
  const stations = stationsData?.items ?? []

  const { data, isLoading } = useQuery({
    queryKey: ["charging-devices", page, stationFilter, statusFilter, typeFilter, keyword],
    queryFn: () =>
      listDevices({
        page,
        page_size: 20,
        station_id: stationFilter !== "all" ? stationFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        device_type: typeFilter !== "all" ? typeFilter : undefined,
        keyword: keyword || undefined,
      }),
  })

  const devices = data?.items ?? []

  const openCreate = () => {
    setEditingDevice(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (d: Device) => {
    setEditingDevice(d)
    setForm({
      device_code: d.device_code,
      model: d.model ?? "",
      device_type: d.device_type,
      station_id: d.station_id ?? "",
      rated_power: d.rated_power != null ? String(d.rated_power) : "",
      manufacturer: d.manufacturer ?? "",
    })
    setDialogOpen(true)
  }

  const createMut = useMutation({
    mutationFn: () =>
      createDevice({
        device_code: form.device_code,
        model: form.model,
        device_type: form.device_type,
        station_id: form.station_id || undefined,
        rated_power: form.rated_power ? Number(form.rated_power) : undefined,
        manufacturer: form.manufacturer || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charging-devices"] })
      toast.success("设备已创建")
      setDialogOpen(false)
      setForm(EMPTY_FORM)
    },
    onError: () => toast.error("创建失败"),
  })

  const updateMut = useMutation({
    mutationFn: () =>
      updateDevice(editingDevice!.id, {
        device_code: form.device_code,
        model: form.model,
        device_type: form.device_type,
        station_id: form.station_id || undefined,
        rated_power: form.rated_power ? Number(form.rated_power) : undefined,
        manufacturer: form.manufacturer || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charging-devices"] })
      toast.success("设备已更新")
      setDialogOpen(false)
      setEditingDevice(null)
    },
    onError: () => toast.error("更新失败"),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteDevice(deleteTarget!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charging-devices"] })
      toast.success("设备已删除")
      setDeleteTarget(null)
    },
    onError: () => toast.error("删除失败"),
  })

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleFilterChange = (setter: (v: string) => void) => (v: string | null) => {
    setter(v ?? "all")
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">设备管理</h1>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          新增设备
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="搜索设备编码/名称..."
          className="w-56"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            setPage(1)
          }}
        />
        <Select value={stationFilter} onValueChange={handleFilterChange(setStationFilter)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="筛选站点" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部站点</SelectItem>
            {stations.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="设备状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={handleFilterChange(setTypeFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="设备类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {Object.entries(DEVICE_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <BatchToolbar
          entityType="devices"
          selectedIds={selectedIds}
          templateType="device"
          onImportComplete={() => qc.invalidateQueries({ queryKey: ["charging-devices"] })}
        />
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
                  <TableHead className="w-10">
                    <Input
                      type="checkbox"
                      onChange={(e) => setSelectedIds(e.target.checked ? devices.map((d) => d.id) : [])}
                    />
                  </TableHead>
                  <TableHead>设备编码</TableHead>
                  <TableHead>设备名称</TableHead>
                  <TableHead>设备类型</TableHead>
                  <TableHead>厂商</TableHead>
                  <TableHead>型号</TableHead>
                  <TableHead>额定功率</TableHead>
                  <TableHead>所属站点</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
                {devices.map((d) => {
                  const station = stations.find((s) => s.id === d.station_id)
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => toggleSelect(d.id)} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{d.device_code}</TableCell>
                      <TableCell className="font-medium max-w-[120px] truncate">{d.model ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{DEVICE_TYPE_LABELS[d.device_type] ?? d.device_type}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate">{d.manufacturer ?? "-"}</TableCell>
                      <TableCell>{d.model ?? "-"}</TableCell>
                      <TableCell>{d.rated_power != null ? `${d.rated_power} kW` : "-"}</TableCell>
                      <TableCell>{station?.name ?? d.station_id}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[d.status] ?? "secondary"} className={STATUS_CLASS[d.status] ?? ""}>
                          {STATUS_LABELS[d.status] ?? d.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(d)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setDeleteTarget(d)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
          <span className="text-sm">{page}</span>
          <Button variant="outline" size="sm" disabled={(data?.items?.length ?? 0) < 20} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDevice ? "编辑设备" : "新增设备"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
              <div className="grid gap-2">
                <Label>设备编码 *</Label>
                <Input value={form.device_code} onChange={(e) => setForm((f) => ({ ...f, device_code: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>设备名称 *</Label>
                <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>设备类型</Label>
                <Select value={form.device_type} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, device_type: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEVICE_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>厂商</Label>
                <Input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>额定功率(kW)</Label>
                <Input type="number" value={form.rated_power} onChange={(e) => setForm((f) => ({ ...f, rated_power: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>所属站点</Label>
                <Select value={form.station_id} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, station_id: v })) }}>
                  <SelectTrigger><SelectValue placeholder="选择站点" /></SelectTrigger>
                  <SelectContent>
                    {stations.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              disabled={createMut.isPending || updateMut.isPending || !form.device_code || !form.model}
              onClick={() => (editingDevice ? updateMut.mutate() : createMut.mutate())}
            >
              {(createMut.isPending || updateMut.isPending) && <Loader2 className="size-4 animate-spin" />}
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除设备「{deleteTarget?.device_code}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
