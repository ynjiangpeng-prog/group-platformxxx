import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Loader2, Search, MapPin, Star, DollarSign, User, FileText, XCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import { listSiteProspects, createSiteProspect, updateSiteProspect, deleteSiteProspect } from "@/api/charging"
import BatchToolbar from "@/components/batch/BatchToolbar"
import type { SiteProspect } from "@/api/types"

const STATUS_LABELS: Record<string, string> = {
  initial: "新线索",
  investigating: "勘察中",
  evaluating: "评估中",
  negotiating: "谈判中",
  signed: "已签约",
  lost: "已流失",
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  initial: "outline",
  investigating: "secondary",
  evaluating: "default",
  negotiating: "default",
  signed: "default",
  lost: "destructive",
}

const LAND_TYPE_LABELS: Record<string, string> = {
  commercial: "商业用地",
  industrial: "工业用地",
  residential: "住宅配套",
  other: "其他",
}

const SCORE_FIELDS = ["traffic_flow_score", "parking_demand_score", "competition_score", "power_supply_score"] as const

const PAGE_SIZE = 20

const EMPTY_FORM = {
  name: "",
  province: "",
  city: "",
  district: "",
  address: "",
  longitude: "",
  latitude: "",
  area_size: "",
  land_type: "",
  owner_name: "",
  owner_phone: "",
  owner_company: "",
  expected_rent: "",
  lease_term_months: "",
  traffic_flow_score: "",
  parking_demand_score: "",
  competition_score: "",
  power_supply_score: "",
  estimated_investment: "",
  estimated_monthly_revenue: "",
  estimated_roi_months: "",
  status: "initial",
  remark: "",
}

type FormType = typeof EMPTY_FORM

function scoreColor(score: number): string {
  if (score >= 7) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
  if (score >= 4) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
}

function calcOverall(form: FormType): number | null {
  const vals = SCORE_FIELDS.map((k) => Number(form[k])).filter((v) => v > 0 && v <= 10)
  if (vals.length === 0) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

function formatMoney(v?: number | null): string {
  if (v == null) return "-"
  return `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function StatusBadge({ status }: { status: string }) {
  if (status === "signed") {
    return <Badge className="bg-green-600 text-white hover:bg-green-700">{STATUS_LABELS[status] ?? status}</Badge>
  }
  return <Badge variant={STATUS_VARIANTS[status] ?? "secondary"}>{STATUS_LABELS[status] ?? status}</Badge>
}

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-muted-foreground">-</span>
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${scoreColor(score)}`}>{score}</span>
}

export default function LeadPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [cityFilter, setCityFilter] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SiteProspect | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SiteProspect | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { page, page_size: PAGE_SIZE }
    if (keyword) params.keyword = keyword
    if (statusFilter !== "all") params.status = statusFilter
    if (cityFilter) params.city = cityFilter
    return params
  }, [page, keyword, statusFilter, cityFilter])

  const { data, isLoading } = useQuery({
    queryKey: ["site-prospects", queryParams],
    queryFn: () => listSiteProspects(queryParams),
  })

  const prospects = data?.items ?? []
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)
  const overallScore = useMemo(() => calcOverall(form), [form])

  const createMut = useMutation({
    mutationFn: (d: Partial<SiteProspect>) => createSiteProspect(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["site-prospects"] }); toast.success("创建成功"); setDialogOpen(false) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Partial<SiteProspect> }) => updateSiteProspect(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["site-prospects"] }); toast.success("更新成功"); setDialogOpen(false) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSiteProspect(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["site-prospects"] }); toast.success("删除成功"); setDeleteTarget(null) },
  })

  const buildPayload = (): Partial<SiteProspect> => ({
    name: form.name,
    province: form.province || undefined,
    city: form.city || undefined,
    district: form.district || undefined,
    address: form.address || undefined,
    longitude: form.longitude ? Number(form.longitude) : undefined,
    latitude: form.latitude ? Number(form.latitude) : undefined,
    area_size: form.area_size ? Number(form.area_size) : undefined,
    land_type: form.land_type || undefined,
    owner_name: form.owner_name || undefined,
    owner_phone: form.owner_phone || undefined,
    owner_company: form.owner_company || undefined,
    expected_rent: form.expected_rent ? Number(form.expected_rent) : undefined,
    lease_term_months: form.lease_term_months ? Number(form.lease_term_months) : undefined,
    traffic_flow_score: form.traffic_flow_score ? Number(form.traffic_flow_score) : undefined,
    parking_demand_score: form.parking_demand_score ? Number(form.parking_demand_score) : undefined,
    competition_score: form.competition_score ? Number(form.competition_score) : undefined,
    power_supply_score: form.power_supply_score ? Number(form.power_supply_score) : undefined,
    overall_score: overallScore ?? undefined,
    estimated_investment: form.estimated_investment ? Number(form.estimated_investment) : undefined,
    estimated_monthly_revenue: form.estimated_monthly_revenue ? Number(form.estimated_monthly_revenue) : undefined,
    estimated_roi_months: form.estimated_roi_months ? Number(form.estimated_roi_months) : undefined,
    status: form.status || undefined,
    remark: form.remark || undefined,
  })

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setDialogOpen(true) }

  const openEdit = (item: SiteProspect) => {
    setForm({
      name: item.name ?? "",
      province: item.province ?? "",
      city: item.city ?? "",
      district: item.district ?? "",
      address: item.address ?? "",
      longitude: item.longitude?.toString() ?? "",
      latitude: item.latitude?.toString() ?? "",
      area_size: item.area_size?.toString() ?? "",
      land_type: item.land_type ?? "",
      owner_name: item.owner_name ?? "",
      owner_phone: item.owner_phone ?? "",
      owner_company: item.owner_company ?? "",
      expected_rent: item.expected_rent?.toString() ?? "",
      lease_term_months: item.lease_term_months?.toString() ?? "",
      traffic_flow_score: item.traffic_flow_score?.toString() ?? "",
      parking_demand_score: item.parking_demand_score?.toString() ?? "",
      competition_score: item.competition_score?.toString() ?? "",
      power_supply_score: item.power_supply_score?.toString() ?? "",
      estimated_investment: item.estimated_investment?.toString() ?? "",
      estimated_monthly_revenue: item.estimated_monthly_revenue?.toString() ?? "",
      estimated_roi_months: item.estimated_roi_months?.toString() ?? "",
      status: item.status ?? "initial",
      remark: item.remark ?? "",
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = buildPayload()
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const set = (key: keyof FormType) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const toggleSelect = (id: string) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const handleSearch = () => { setPage(1) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">场地线索</h1>
        <Button onClick={openCreate}><Plus className="size-4" />新增线索</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="搜索名称/地址/业主..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9 w-64"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="全部状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="城市筛选"
          value={cityFilter}
          onChange={(e) => { setCityFilter(e.target.value); setPage(1) }}
          className="w-32"
        />
        <Separator orientation="vertical" className="h-6" />
        <BatchToolbar entityType="site-prospects" selectedIds={selectedIds} templateType="site_prospect" onImportComplete={() => qc.invalidateQueries({ queryKey: ["site-prospects"] })} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Input
                      type="checkbox"
                      checked={prospects.length > 0 && selectedIds.length === prospects.length}
                      onChange={(e) => setSelectedIds(e.target.checked ? prospects.map((p) => p.id) : [])}
                    />
                  </TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>省市区</TableHead>
                  <TableHead>地址</TableHead>
                  <TableHead className="text-right">场地面积(㎡)</TableHead>
                  <TableHead>地主/业主</TableHead>
                  <TableHead>评分</TableHead>
                  <TableHead className="text-right">预计投资</TableHead>
                  <TableHead className="text-right">预计ROI(月)</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">暂无数据</TableCell>
                  </TableRow>
                )}
                {prospects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                    </TableCell>
                    <TableCell className="font-medium max-w-[140px] truncate">{p.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{[p.province, p.city, p.district].filter(Boolean).join(" ")}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={p.address}>{p.address ?? "-"}</TableCell>
                    <TableCell className="text-right">{p.area_size?.toLocaleString() ?? "-"}</TableCell>
                    <TableCell>{p.owner_name ?? "-"}</TableCell>
                    <TableCell><ScoreBadge score={p.overall_score} /></TableCell>
                    <TableCell className="text-right">{formatMoney(p.estimated_investment)}</TableCell>
                    <TableCell className="text-right">{p.estimated_roi_months != null ? `${p.estimated_roi_months}个月` : "-"}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-right">
                      {p.status !== "lost" && p.status !== "signed" && (
                        <Button variant="ghost" size="icon-sm" title="标记流失" onClick={() => updateMut.mutate({ id: p.id, data: { status: "lost" } })}>
                          <XCircle className="size-4 text-muted-foreground" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(p)}><Trash2 className="size-4" /></Button>
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
          <DialogHeader>
            <DialogTitle>{editing ? "编辑线索" : "新增线索"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-muted-foreground">基本信息</h3>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2"><Label>名称 *</Label><Input value={form.name} onChange={set("name")} required /></div>
                <div className="space-y-2"><Label>省份</Label><Input value={form.province} onChange={set("province")} /></div>
                <div className="space-y-2"><Label>城市</Label><Input value={form.city} onChange={set("city")} /></div>
                <div className="space-y-2"><Label>区县</Label><Input value={form.district} onChange={set("district")} /></div>
                <div className="col-span-2 space-y-2"><Label>详细地址</Label><Input value={form.address} onChange={set("address")} /></div>
                <div className="space-y-2"><Label>经度</Label><Input type="number" step="0.000001" value={form.longitude} onChange={set("longitude")} /></div>
                <div className="space-y-2"><Label>纬度</Label><Input type="number" step="0.000001" value={form.latitude} onChange={set("latitude")} /></div>
                <div className="space-y-2">
                  <Label>场地面积(㎡)</Label>
                  <Input type="number" step="0.01" value={form.area_size} onChange={set("area_size")} />
                </div>
                <div className="space-y-2">
                  <Label>用地类型</Label>
                  <Select value={form.land_type || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, land_type: v === "__none__" ? "" : (v ?? "") }))}>
                    <SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">请选择</SelectItem>
                      {Object.entries(LAND_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <User className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-muted-foreground">业主信息</h3>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2"><Label>业主姓名</Label><Input value={form.owner_name} onChange={set("owner_name")} /></div>
                <div className="space-y-2"><Label>联系电话</Label><Input value={form.owner_phone} onChange={set("owner_phone")} /></div>
                <div className="space-y-2"><Label>业主公司</Label><Input value={form.owner_company} onChange={set("owner_company")} /></div>
                <div className="space-y-2">
                  <Label>期望租金(元/月)</Label>
                  <Input type="number" step="0.01" value={form.expected_rent} onChange={set("expected_rent")} />
                </div>
                <div className="space-y-2">
                  <Label>租期(月)</Label>
                  <Input type="number" value={form.lease_term_months} onChange={set("lease_term_months")} />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Star className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-muted-foreground">场地评分</h3>
              </div>
              <div className="grid grid-cols-4 gap-4 [&>*]:min-w-0">
                <div className="space-y-2">
                  <Label>车流量 (1-10)</Label>
                  <Input type="number" min="1" max="10" value={form.traffic_flow_score} onChange={set("traffic_flow_score")} />
                </div>
                <div className="space-y-2">
                  <Label>停车需求 (1-10)</Label>
                  <Input type="number" min="1" max="10" value={form.parking_demand_score} onChange={set("parking_demand_score")} />
                </div>
                <div className="space-y-2">
                  <Label>竞争程度 (1-10)</Label>
                  <Input type="number" min="1" max="10" value={form.competition_score} onChange={set("competition_score")} />
                </div>
                <div className="space-y-2">
                  <Label>供电条件 (1-10)</Label>
                  <Input type="number" min="1" max="10" value={form.power_supply_score} onChange={set("power_supply_score")} />
                </div>
              </div>
              {overallScore != null && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">综合评分：</span>
                  <ScoreBadge score={overallScore} />
                </div>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-muted-foreground">投资测算</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>预计总投资(元)</Label>
                  <Input type="number" step="0.01" value={form.estimated_investment} onChange={set("estimated_investment")} />
                </div>
                <div className="space-y-2">
                  <Label>预计月收入(元)</Label>
                  <Input type="number" step="0.01" value={form.estimated_monthly_revenue} onChange={set("estimated_monthly_revenue")} />
                </div>
                <div className="space-y-2">
                  <Label>预计回本周期(月)</Label>
                  <Input type="number" step="0.1" value={form.estimated_roi_months} onChange={set("estimated_roi_months")} />
                </div>
              </div>
              {form.estimated_investment && form.estimated_monthly_revenue && !form.estimated_roi_months && (
                <div className="mt-2 text-xs text-muted-foreground">
                  自动测算回本周期：{Number(form.estimated_monthly_revenue) > 0 ? `${(Number(form.estimated_investment) / Number(form.estimated_monthly_revenue)).toFixed(1)}个月` : "无法计算"}
                </div>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-muted-foreground">其他信息</h3>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>状态</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? form.status }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 space-y-2">
                  <Label>备注</Label>
                  <Textarea rows={2} value={form.remark} onChange={set("remark")} />
                </div>
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
            <AlertDialogDescription>确定要删除线索「{deleteTarget?.name}」吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}>
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
