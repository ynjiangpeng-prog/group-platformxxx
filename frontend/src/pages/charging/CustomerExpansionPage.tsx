import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { get, post, put, del } from "@/lib/http"
import { toast } from "sonner"

const STAGE_LABELS: Record<string, string> = {
  initial: "初步接触",
  contacting: "沟通中",
  negotiating: "谈判中",
  signed: "已签约",
  lost: "已流失",
}

const STAGE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  initial: "outline",
  contacting: "secondary",
  negotiating: "default",
  signed: "default",
  lost: "destructive",
}

const TYPE_LABELS: Record<string, string> = {
  fleet: "车队",
  enterprise: "企业",
  government: "政府",
  individual: "个人",
  other: "其他",
}

interface Customer {
  id: string
  customer_name: string
  customer_type: string
  contact_person: string | null
  contact_phone: string | null
  estimated_monthly_revenue: number | null
  nearby_station_id: string | null
  current_stage: string
  win_probability: number
  assigned_to: string | null
  status: string
  remark: string | null
  source: string | null
}

interface CustomerForm {
  customer_name: string
  customer_type: string
  contact_person: string
  contact_phone: string
  estimated_monthly_revenue: string
  nearby_station_id: string
  current_stage: string
  win_probability: string
  remark: string
  source: string
}

const EMPTY_FORM: CustomerForm = {
  customer_name: "",
  customer_type: "fleet",
  contact_person: "",
  contact_phone: "",
  estimated_monthly_revenue: "",
  nearby_station_id: "",
  current_stage: "initial",
  win_probability: "30",
  remark: "",
  source: "",
}

export default function CustomerExpansionPage() {
  const [page, setPage] = useState(1)
  const [stageFilter, setStageFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["target-customers", page, stageFilter],
    queryFn: () =>
      get<{ items: Customer[]; total: number }>(
        "/charging/target-customers",
        { page, page_size: 20, ...(stageFilter !== "all" ? { current_stage: stageFilter } : {}) },
      ),
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => post("/charging/target-customers", data),
    onSuccess: () => {
      toast.success("客户创建成功")
      queryClient.invalidateQueries({ queryKey: ["target-customers"] })
      setDialogOpen(false)
    },
    onError: () => toast.error("创建失败"),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      put(`/charging/target-customers/${id}`, data),
    onSuccess: () => {
      toast.success("客户更新成功")
      queryClient.invalidateQueries({ queryKey: ["target-customers"] })
      setDialogOpen(false)
    },
    onError: () => toast.error("更新失败"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/charging/target-customers/${id}`),
    onSuccess: () => {
      toast.success("客户已删除")
      queryClient.invalidateQueries({ queryKey: ["target-customers"] })
      setDeleteTarget(null)
    },
    onError: () => toast.error("删除失败"),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20) || 1

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (item: Customer) => {
    setForm({
      customer_name: item.customer_name,
      customer_type: item.customer_type || "fleet",
      contact_person: item.contact_person || "",
      contact_phone: item.contact_phone || "",
      estimated_monthly_revenue: item.estimated_monthly_revenue?.toString() || "",
      nearby_station_id: item.nearby_station_id || "",
      current_stage: item.current_stage || "initial",
      win_probability: item.win_probability?.toString() || "30",
      remark: item.remark || "",
      source: item.source || "",
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = {
      customer_name: form.customer_name,
      customer_type: form.customer_type,
      contact_person: form.contact_person || null,
      contact_phone: form.contact_phone || null,
      estimated_monthly_revenue: form.estimated_monthly_revenue ? parseFloat(form.estimated_monthly_revenue) : null,
      nearby_station_id: form.nearby_station_id || null,
      current_stage: form.current_stage,
      win_probability: form.win_probability ? parseInt(form.win_probability) : 30,
      remark: form.remark || null,
      source: form.source || null,
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const set = (key: keyof CustomerForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const submitting = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-bold">客户拓展</CardTitle>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新增客户
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v ?? "all"); setPage(1) }}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部阶段" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部阶段</SelectItem>
                {Object.entries(STAGE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">共 {total} 条</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">暂无客户数据，点击"新增客户"开始</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客户名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>联系人</TableHead>
                  <TableHead>电话</TableHead>
                  <TableHead>阶段</TableHead>
                  <TableHead>赢率</TableHead>
                  <TableHead className="text-right">预估月收入</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.customer_name}</TableCell>
                    <TableCell>{TYPE_LABELS[item.customer_type] ?? item.customer_type}</TableCell>
                    <TableCell>{item.contact_person || "-"}</TableCell>
                    <TableCell>{item.contact_phone || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={STAGE_VARIANTS[item.current_stage] ?? "secondary"}>
                        {STAGE_LABELS[item.current_stage] ?? item.current_stage}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.win_probability}%</TableCell>
                    <TableCell className="text-right">
                      {item.estimated_monthly_revenue ? `¥${Number(item.estimated_monthly_revenue).toLocaleString()}` : "-"}
                    </TableCell>
                    <TableCell>{item.source || "-"}</TableCell>
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

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑客户" : "新增客户"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>客户名称 *</Label>
                <Input value={form.customer_name} onChange={set("customer_name")} required />
              </div>
              <div className="space-y-2">
                <Label>客户类型 *</Label>
                <Select value={form.customer_type} onValueChange={(v) => setForm((f) => ({ ...f, customer_type: v ?? "fleet" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>联系人</Label>
                <Input value={form.contact_person} onChange={set("contact_person")} />
              </div>
              <div className="space-y-2">
                <Label>电话</Label>
                <Input value={form.contact_phone} onChange={set("contact_phone")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>预估月收入（元）</Label>
                <Input type="number" step="0.01" value={form.estimated_monthly_revenue} onChange={set("estimated_monthly_revenue")} />
              </div>
              <div className="space-y-2">
                <Label>赢率（%）</Label>
                <Input type="number" min="0" max="100" value={form.win_probability} onChange={set("win_probability")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>当前阶段</Label>
                <Select value={form.current_stage} onValueChange={(v) => setForm((f) => ({ ...f, current_stage: v ?? "initial" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STAGE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>来源</Label>
                <Input value={form.source} onChange={set("source")} placeholder="如：主动开发、转介绍" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea rows={3} value={form.remark} onChange={set("remark")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
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
            <AlertDialogDescription>确定要删除客户「{deleteTarget?.customer_name}」吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
