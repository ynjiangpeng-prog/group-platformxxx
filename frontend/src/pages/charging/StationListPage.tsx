import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Loader2, Search, Wand } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { listStations, createStation, updateStation, deleteStation, getStationAutoCreateSuggestions, confirmStationAutoCreate } from "@/api/charging"
import { listProjects } from "@/api/project"
import BatchToolbar from "@/components/batch/BatchToolbar"
import type { Station } from "@/api/types"

const STATUS_LABELS: Record<string, string> = { draft: "筹建中", building: "建设中", operating: "运营中", suspended: "已停运", closed: "已关闭" }
const STATION_TYPE_LABELS: Record<string, string> = { public: "公共站", private: "专用站", public_with_operator: "代运营站", highway: "高速服务区站", logistics: "物流园站", heavy_truck: "重卡站" }
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = { operating: "default", building: "secondary", draft: "outline", suspended: "destructive", closed: "destructive" }

const formatCNY = (v?: number | null) => v != null ? `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"

const EMPTY_FORM = { station_code: "", name: "", station_type: "public", status: "draft", province: "", city: "", district: "", address: "", longitude: "", latitude: "", total_parking: "", construction_cost: "", operation_start_date: "", landlord: "", lease_start: "", lease_end: "", monthly_rent: "", power_capacity: "", opening_hours: "", project_id: "", electricity_payee: "" }

export default function StationListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Station | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Station | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [keyword, setKeyword] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterCity, setFilterCity] = useState("")
  const [filterType, setFilterType] = useState("")
  const [autoCreateOpen, setAutoCreateOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<{ station_name: string; order_count: number; similar_stations: { id: string; name: string; code: string }[]; action: "create" | "merge"; merge_to_id?: string }[]>([])

  const autoCreateFetchMut = useMutation({
    mutationFn: getStationAutoCreateSuggestions,
    onSuccess: (res) => {
      setSuggestions(res.suggestions.map((s) => ({ ...s, action: "create" as const, merge_to_id: s.similar_stations?.[0]?.id })))
      setAutoCreateOpen(true)
    },
    onError: () => toast.error("获取建议失败"),
  })

  const autoCreateConfirmMut = useMutation({
    mutationFn: () => confirmStationAutoCreate(suggestions.map((s) => ({ station_name: s.station_name, action: s.action, merge_to_id: s.action === "merge" ? s.merge_to_id : undefined }))),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["charging-stations"] })
      toast.success(`新建 ${res.created} 个站点，合并 ${res.merged} 个，关联 ${res.linked_orders} 笔订单`)
      setAutoCreateOpen(false)
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ["charging-stations", page, keyword, filterStatus, filterCity, filterType],
    queryFn: () => listStations({ page, page_size: 20, keyword: keyword || undefined, status: filterStatus || undefined, city: filterCity || undefined, station_type: filterType || undefined }),
  })

  const { data: projectsData } = useQuery({ queryKey: ["projects-select"], queryFn: () => listProjects({ page: 1, page_size: 200 }) })

  const stations = data?.items ?? []
  const totalPages = Math.ceil((data?.total ?? 0) / 20)

  const buildPayload = () => ({
    station_code: form.station_code,
    name: form.name,
    station_type: form.station_type,
    status: form.status,
    province: form.province || undefined,
    city: form.city || undefined,
    district: form.district || undefined,
    address: form.address || undefined,
    longitude: form.longitude ? Number(form.longitude) : undefined,
    latitude: form.latitude ? Number(form.latitude) : undefined,
    total_parking: form.total_parking ? Number(form.total_parking) : undefined,
    construction_cost: form.construction_cost ? Number(form.construction_cost) : undefined,
    operation_start_date: form.operation_start_date || undefined,
    landlord: form.landlord || undefined,
    lease_start: form.lease_start || undefined,
    lease_end: form.lease_end || undefined,
    monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : undefined,
    power_capacity: form.power_capacity ? Number(form.power_capacity) : undefined,
    opening_hours: form.opening_hours || undefined,
    project_id: form.project_id || undefined,
    electricity_payee: form.electricity_payee || undefined,
  } as Partial<Station>)

  const createMut = useMutation({
    mutationFn: (d: Partial<Station>) => createStation(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["charging-stations"] }); toast.success("创建成功"); setDialogOpen(false) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Partial<Station> }) => updateStation(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["charging-stations"] }); toast.success("更新成功"); setDialogOpen(false) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteStation(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["charging-stations"] }); toast.success("删除成功"); setDeleteTarget(null) },
  })

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setDialogOpen(true) }
  const openEdit = (item: Station) => {
    setForm({
      station_code: item.station_code ?? "", name: item.name ?? "", station_type: item.station_type ?? "", status: item.status ?? "",
      province: item.province ?? "", city: item.city ?? "", district: item.district ?? "", address: item.address ?? "",
      longitude: item.longitude?.toString() ?? "", latitude: item.latitude?.toString() ?? "", total_parking: item.total_parking?.toString() ?? "",
      construction_cost: item.construction_cost?.toString() ?? "", operation_start_date: item.operation_start_date ?? "",
      landlord: item.landlord ?? "", lease_start: item.lease_start ?? "", lease_end: item.lease_end ?? "",
      monthly_rent: item.monthly_rent?.toString() ?? "", power_capacity: item.power_capacity?.toString() ?? "", opening_hours: item.opening_hours ?? "",
      project_id: (item as any).project_id ?? "", electricity_payee: (item as any).electricity_payee ?? "",
    })
    setEditing(item); setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = buildPayload()
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value }))
  const toggleSelect = (id: string) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">站点管理</h1>
        <Button onClick={openCreate}><Plus className="size-4" />新增站点</Button>
        <Button variant="outline" onClick={() => autoCreateFetchMut.mutate()} disabled={autoCreateFetchMut.isPending}>
          {autoCreateFetchMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand className="size-4" />}从订单自动创建
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <BatchToolbar entityType="stations" selectedIds={selectedIds} templateType="station" onImportComplete={() => qc.invalidateQueries({ queryKey: ["charging-stations"] })} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input placeholder="搜索站点名称/编码" className="pl-9" value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1) }} />
            </div>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === "__all__" ? "" : v ?? ""); setPage(1) }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="全部状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部状态</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="城市" className="w-[120px]" value={filterCity} onChange={(e) => { setFilterCity(e.target.value); setPage(1) }} />
            <Select value={filterType} onValueChange={(v) => { setFilterType(v === "__all__" ? "" : v ?? ""); setPage(1) }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="全部类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部类型</SelectItem>
                {Object.entries(STATION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? stations.map((s) => s.id) : [])} /></TableHead>
                  <TableHead>编码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>地区</TableHead>
                  <TableHead>车位</TableHead>
                  <TableHead>功率(kW)</TableHead>
                  <TableHead>设备数</TableHead>
                  <TableHead>月租金</TableHead>
                  <TableHead>建设成本</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stations.length === 0 && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>}
                {stations.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/50">
                    <TableCell onClick={(e) => e.stopPropagation()}><Input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggleSelect(s.id)} /></TableCell>
                    <TableCell className="font-mono text-xs">{s.station_code}</TableCell>
                    <TableCell className="font-medium max-w-[160px] truncate">{s.name}</TableCell>
                    <TableCell><Badge variant="outline">{STATION_TYPE_LABELS[s.station_type] ?? s.station_type}</Badge></TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[s.status] ?? "secondary"}>{STATUS_LABELS[s.status] ?? s.status}</Badge></TableCell>
                    <TableCell>{[s.province, s.city, s.district].filter(Boolean).join(" ")}</TableCell>
                    <TableCell>{s.total_parking ?? "-"}</TableCell>
                    <TableCell>{s.power_capacity ?? "-"}</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>{formatCNY(s.monthly_rent)}</TableCell>
                    <TableCell>{formatCNY(s.construction_cost)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(s)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(s)}><Trash2 className="size-4" /></Button>
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm">{page} / {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "编辑站点" : "新增站点"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">基本信息</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2"><Label>站点编码</Label><Input value={form.station_code} onChange={set("station_code")} required /></div>
                <div className="space-y-2"><Label>名称</Label><Input value={form.name} onChange={set("name")} required /></div>
                 <div className="space-y-2"><Label>站点类型</Label><Select value={form.station_type || ""} onValueChange={(v) => setForm((prev) => ({ ...prev, station_type: v || "" }))} required>
                   <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">公共站</SelectItem>
                      <SelectItem value="private">专用站</SelectItem>
                      <SelectItem value="public_with_operator">代运营站</SelectItem>
                      <SelectItem value="highway">高速服务区站</SelectItem>
                      <SelectItem value="logistics">物流园站</SelectItem>
                      <SelectItem value="heavy_truck">重卡站</SelectItem>
                    </SelectContent>
                 </Select></div>
                 <div className="space-y-2"><Label>状态</Label><Select value={form.status} onValueChange={(v) => setForm((prev) => ({ ...prev, status: v as string }))} required>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="draft">筹建中</SelectItem>
                     <SelectItem value="building">建设中</SelectItem>
                     <SelectItem value="operating">运营中</SelectItem>
                     <SelectItem value="suspended">已停运</SelectItem>
                     <SelectItem value="closed">已关闭</SelectItem>
                   </SelectContent>
                 </Select></div>
                 <div className="space-y-2"><Label>关联项目</Label><Select value={form.project_id || "__none__"} onValueChange={(v) => { const val = v === "__none__" ? "" : v; setForm((prev) => ({ ...prev, project_id: val as string })) }}>
                   <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="__none__">不关联</SelectItem>
                     {projectsData?.items?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                   </SelectContent>
                 </Select></div>
               </div>
             </div>
             <div>
               <h3 className="text-sm font-medium mb-3 text-muted-foreground">地址信息</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2"><Label>省份</Label><Input value={form.province} onChange={set("province")} /></div>
                <div className="space-y-2"><Label>城市</Label><Input value={form.city} onChange={set("city")} /></div>
                <div className="space-y-2"><Label>区县</Label><Input value={form.district} onChange={set("district")} /></div>
                <div className="space-y-2"><Label>详细地址</Label><Input value={form.address} onChange={set("address")} /></div>
                <div className="space-y-2"><Label>经度</Label><Input type="number" step="0.000001" value={form.longitude} onChange={set("longitude")} /></div>
                <div className="space-y-2"><Label>纬度</Label><Input type="number" step="0.000001" value={form.latitude} onChange={set("latitude")} /></div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">站点配置</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2"><Label>总车位</Label><Input type="number" value={form.total_parking} onChange={set("total_parking")} /></div>
                <div className="space-y-2"><Label>功率容量(kW)</Label><Input type="number" step="0.01" value={form.power_capacity} onChange={set("power_capacity")} /></div>
                <div className="space-y-2"><Label>营业时间</Label><Input value={form.opening_hours} placeholder="09:00-22:00" onChange={set("opening_hours")} /></div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">财务信息</h3>
              <div className="grid grid-cols-4 gap-4 [&>*]:min-w-0">
                <div className="space-y-2"><Label>建设成本(元)</Label><Input type="number" step="0.01" value={form.construction_cost} onChange={set("construction_cost")} /></div>
                <div className="space-y-2"><Label>月租金(元)</Label><Input type="number" step="0.01" value={form.monthly_rent} onChange={set("monthly_rent")} /></div>
                <div className="space-y-2 col-span-2"><Label>电费户名/收款人</Label><Input value={form.electricity_payee} onChange={set("electricity_payee")} placeholder="供电局户名，用于银行流水自动匹配" /></div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">租赁信息</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2"><Label>房东</Label><Input value={form.landlord} onChange={set("landlord")} /></div>
                <div className="space-y-2"><Label>租赁起始日期</Label><Input type="date" value={form.lease_start} onChange={set("lease_start")} /></div>
                <div className="space-y-2"><Label>租赁结束日期</Label><Input type="date" value={form.lease_end} onChange={set("lease_end")} /></div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">运营信息</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2"><Label>运营开始日期</Label><Input type="date" value={form.operation_start_date} onChange={set("operation_start_date")} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="size-4 animate-spin" />}确定
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
            <AlertDialogAction onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}>
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto-create from orders dialog */}
      <Dialog open={autoCreateOpen} onOpenChange={setAutoCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>从充电订单自动创建站点</DialogTitle></DialogHeader>
          {suggestions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">所有订单站名均已匹配，无需创建</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>站名</TableHead>
                  <TableHead>订单数</TableHead>
                  <TableHead>相似站点</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.station_name}</TableCell>
                    <TableCell>{s.order_count}</TableCell>
                    <TableCell>
                      {s.similar_stations.length > 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {s.similar_stations.map((ss) => `${ss.name} (${ss.code})`).join(", ")}
                        </span>
                      ) : <span className="text-sm text-muted-foreground">无</span>}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={s.action}
                        onValueChange={(v) => {
                          if (v === "create" || v === "merge") {
                            setSuggestions((prev) => prev.map((item, idx) => idx === i ? { ...item, action: v } : item))
                          }
                        }}
                      >
                        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="create">新建站点</SelectItem>
                          {s.similar_stations.length > 0 && <SelectItem value="merge">合并到已有</SelectItem>}
                        </SelectContent>
                      </Select>
                      {s.action === "merge" && s.similar_stations.length > 0 && (
                        <Select
                          value={s.merge_to_id ?? s.similar_stations[0].id}
                          onValueChange={(v) => {
                            if (v) setSuggestions((prev) => prev.map((item, idx) => idx === i ? { ...item, merge_to_id: v } : item))
                          }}
                        >
                          <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {s.similar_stations.map((ss) => <SelectItem key={ss.id} value={ss.id}>{ss.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAutoCreateOpen(false)}>取消</Button>
            <Button onClick={() => autoCreateConfirmMut.mutate()} disabled={autoCreateConfirmMut.isPending || suggestions.length === 0}>
              {autoCreateConfirmMut.isPending && <Loader2 className="size-4 animate-spin" />}
              确认执行 ({suggestions.length} 个)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
