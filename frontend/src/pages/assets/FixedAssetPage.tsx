import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Loader2, Pencil, Trash2, UserCheck, RotateCcw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { listFixedAssets, createFixedAsset, updateFixedAsset, deleteFixedAsset, assignFixedAsset, returnFixedAsset } from "@/api/project"
import { listUsers } from "@/api/organization"

const STATUS_LABELS: Record<string, string> = { in_stock: "在库", assigned: "已领用", scrapped: "已报废" }
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = { in_stock: "default", assigned: "secondary", scrapped: "destructive" }
const CATEGORY_OPTIONS = ["办公设备", "电子设备", "施工设备", "车辆", "其他"]

const defaultForm = {
  name: "", category: "办公设备", model_spec: "", serial_no: "",
  purchase_date: "", original_value: "", current_value: "",
  depreciation_rate: "", remark: "",
}

export default function FixedAssetPage() {
  const qc = useQueryClient()

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState("all")
  const [catFilter, setCatFilter] = useState("all")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)

  const [assignDialog, setAssignDialog] = useState(false)
  const [assignAssetId, setAssignAssetId] = useState("")
  const [assignForm, setAssignForm] = useState({ user_id: "", assign_date: "", expected_return_date: "", remark: "" })

  const [returnDialog, setReturnDialog] = useState(false)
  const [returnAssetId, setReturnAssetId] = useState("")
  const [returnForm, setReturnForm] = useState({ actual_return_date: "" })

  const { data, isLoading } = useQuery({
    queryKey: ["fixed-assets", page, statusFilter, catFilter],
    queryFn: () => listFixedAssets({
      page, page_size: 20,
      status: statusFilter !== "all" ? statusFilter : undefined,
      category: catFilter !== "all" ? catFilter : undefined,
    }),
  })

  const { data: usersData } = useQuery({
    queryKey: ["users-for-assign"],
    queryFn: () => listUsers({ page: 1, page_size: 500 }),
  })
  const users = usersData?.items ?? []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.real_name ?? u.username]))

  const assets = data?.items ?? []

  const createMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => createFixedAsset(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-assets"] }); toast.success("资产已创建"); setDialogOpen(false) },
    onError: () => toast.error("创建失败"),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Record<string, unknown> }) => updateFixedAsset(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-assets"] }); toast.success("资产已更新"); setDialogOpen(false) },
    onError: () => toast.error("更新失败"),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFixedAsset(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-assets"] }); toast.success("资产已删除") },
    onError: () => toast.error("删除失败"),
  })

  const assignMut = useMutation({
    mutationFn: ({ assetId, data: d }: { assetId: string; data: Record<string, unknown> }) => assignFixedAsset(assetId, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-assets"] }); toast.success("领用成功"); setAssignDialog(false) },
    onError: () => toast.error("领用失败"),
  })

  const returnMut = useMutation({
    mutationFn: ({ assetId, data: d }: { assetId: string; data: Record<string, unknown> }) => returnFixedAsset(assetId, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-assets"] }); toast.success("归还成功"); setReturnDialog(false) },
    onError: () => toast.error("归还失败"),
  })

  const openCreate = () => {
    setEditId(null)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  const openEdit = (a: Record<string, unknown>) => {
    setEditId(a.id as string)
    setForm({
      name: String(a.name ?? ""), category: String(a.category ?? "办公设备"),
      model_spec: String(a.model_spec ?? ""), serial_no: String(a.serial_no ?? ""),
      purchase_date: String(a.purchase_date ?? "").slice(0, 10),
      original_value: a.original_value != null ? String(a.original_value) : "",
      current_value: a.current_value != null ? String(a.current_value) : "",
      depreciation_rate: a.depreciation_rate != null ? String(a.depreciation_rate) : "",
      remark: String(a.remark ?? ""),
    })
    setDialogOpen(true)
  }

  const openAssign = (assetId: string) => {
    setAssignAssetId(assetId)
    setAssignForm({ user_id: "", assign_date: new Date().toISOString().slice(0, 10), expected_return_date: "", remark: "" })
    setAssignDialog(true)
  }

  const openReturn = (assetId: string) => {
    setReturnAssetId(assetId)
    setReturnForm({ actual_return_date: new Date().toISOString().slice(0, 10) })
    setReturnDialog(true)
  }

  const submitForm = () => {
    const payload = {
      name: form.name,
      category: form.category,
      model_spec: form.model_spec || undefined,
      serial_no: form.serial_no || undefined,
      purchase_date: form.purchase_date || undefined,
      original_value: Number(form.original_value) || undefined,
      current_value: Number(form.current_value) || undefined,
      depreciation_rate: Number(form.depreciation_rate) || undefined,
      remark: form.remark || undefined,
    }
    if (editId) updateMut.mutate({ id: editId, data: payload })
    else createMut.mutate(payload)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">固定资产管理</h1>
        <Button onClick={openCreate}><Plus className="size-4" />新建资产</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="状态筛选" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={(v) => { setCatFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="分类筛选" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>规格型号</TableHead>
                  <TableHead>序列号</TableHead>
                  <TableHead>购入日期</TableHead>
                  <TableHead>原值</TableHead>
                  <TableHead>现值</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>领用人</TableHead>
                  <TableHead className="w-36">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
                )}
                {assets.map((a: Record<string, unknown>) => (
                  <TableRow key={a.id as string}>
                    <TableCell className="font-medium">{String(a.name ?? "")}</TableCell>
                    <TableCell>{String(a.category ?? "-")}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{String(a.model_spec ?? "-")}</TableCell>
                    <TableCell className="font-mono text-xs">{String(a.serial_no ?? "-")}</TableCell>
                    <TableCell>{String(a.purchase_date ?? "-").slice(0, 10)}</TableCell>
                    <TableCell>{a.original_value != null ? `¥${Number(a.original_value).toLocaleString()}` : "-"}</TableCell>
                    <TableCell>{a.current_value != null ? `¥${Number(a.current_value).toLocaleString()}` : "-"}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANTS[String(a.status)] ?? "secondary"}>{STATUS_LABELS[String(a.status)] ?? String(a.status)}</Badge></TableCell>
                    <TableCell>{a.assignee_id ? (userMap[a.assignee_id as string] ?? String(a.assignee_id)) : "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(a)}><Pencil className="size-4" /></Button>
                        {String(a.status) === "in_stock" && (
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openAssign(a.id as string)}><UserCheck className="size-4" /></Button>
                        )}
                        {String(a.status) === "assigned" && (
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openReturn(a.id as string)}><RotateCcw className="size-4" /></Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => deleteMut.mutate(a.id as string)}><Trash2 className="size-4" /></Button>
                      </div>
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
          <span className="text-sm">{page}</span>
          <Button variant="outline" size="sm" disabled={assets.length < 20} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "编辑资产" : "新建资产"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>资产名称 *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="grid gap-2">
                <Label>分类</Label>
                <Select value={form.category} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, category: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>规格型号</Label><Input value={form.model_spec} onChange={(e) => setForm((f) => ({ ...f, model_spec: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>序列号</Label><Input value={form.serial_no} onChange={(e) => setForm((f) => ({ ...f, serial_no: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>购入日期</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>原值</Label><Input type="number" step="0.01" value={form.original_value} onChange={(e) => setForm((f) => ({ ...f, original_value: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>现值</Label><Input type="number" step="0.01" value={form.current_value} onChange={(e) => setForm((f) => ({ ...f, current_value: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>折旧率</Label><Input type="number" step="0.01" value={form.depreciation_rate} onChange={(e) => setForm((f) => ({ ...f, depreciation_rate: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>备注</Label><Textarea value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button disabled={!form.name || createMut.isPending || updateMut.isPending} onClick={submitForm}>
              {(createMut.isPending || updateMut.isPending) && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>领用资产</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>领用人 *</Label>
              <Select value={assignForm.user_id} onValueChange={(v) => { if (v) setAssignForm((f) => ({ ...f, user_id: v })) }}>
                <SelectTrigger><SelectValue placeholder="选择用户" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.real_name ?? u.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>领用日期 *</Label><Input type="date" value={assignForm.assign_date} onChange={(e) => setAssignForm((f) => ({ ...f, assign_date: e.target.value }))} /></div>
            <div className="grid gap-2"><Label>预计归还日期</Label><Input type="date" value={assignForm.expected_return_date} onChange={(e) => setAssignForm((f) => ({ ...f, expected_return_date: e.target.value }))} /></div>
            <div className="grid gap-2"><Label>备注</Label><Textarea value={assignForm.remark} onChange={(e) => setAssignForm((f) => ({ ...f, remark: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>取消</Button>
            <Button disabled={assignMut.isPending || !assignForm.user_id || !assignForm.assign_date} onClick={() => assignMut.mutate({
              assetId: assignAssetId,
              data: {
                user_id: assignForm.user_id,
                assign_date: assignForm.assign_date,
                expected_return_date: assignForm.expected_return_date || undefined,
                remark: assignForm.remark || undefined,
              },
            })}>
              {assignMut.isPending && <Loader2 className="size-4 animate-spin" />}确认领用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnDialog} onOpenChange={setReturnDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>归还资产</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label>实际归还日期 *</Label><Input type="date" value={returnForm.actual_return_date} onChange={(e) => setReturnForm((f) => ({ ...f, actual_return_date: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialog(false)}>取消</Button>
            <Button disabled={returnMut.isPending || !returnForm.actual_return_date} onClick={() => returnMut.mutate({
              assetId: returnAssetId,
              data: { actual_return_date: returnForm.actual_return_date },
            })}>
              {returnMut.isPending && <Loader2 className="size-4 animate-spin" />}确认归还
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
