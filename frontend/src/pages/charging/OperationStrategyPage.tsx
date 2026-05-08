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

const STRATEGY_TYPE_LABELS: Record<string, string> = {
  pricing: "定价策略",
  promotion: "促销活动",
  service: "服务策略",
  brand: "品牌策略",
}

const STATUS_LABELS: Record<string, string> = {
  active: "生效中",
  paused: "已暂停",
  expired: "已过期",
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  paused: "secondary",
  expired: "outline",
}

interface Strategy {
  id: string
  title: string
  station_id: string | null
  strategy_type: string
  content: string | null
  effective_date: string | null
  expiry_date: string | null
  status: string
}

interface StrategyForm {
  title: string
  station_id: string
  strategy_type: string
  content: string
  effective_date: string
  expiry_date: string
  status: string
}

const EMPTY_FORM: StrategyForm = {
  title: "",
  station_id: "",
  strategy_type: "pricing",
  content: "",
  effective_date: "",
  expiry_date: "",
  status: "active",
}

export default function OperationStrategyPage() {
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Strategy | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Strategy | null>(null)
  const [form, setForm] = useState<StrategyForm>(EMPTY_FORM)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["operation-strategies", page, typeFilter, statusFilter],
    queryFn: () =>
      get<{ items: Strategy[]; total: number }>(
        "/charging/operation-strategies",
        {
          page,
          page_size: 20,
          ...(typeFilter !== "all" ? { strategy_type: typeFilter } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        },
      ),
  })

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => post("/charging/operation-strategies", d),
    onSuccess: () => {
      toast.success("策略创建成功")
      queryClient.invalidateQueries({ queryKey: ["operation-strategies"] })
      setDialogOpen(false)
    },
    onError: () => toast.error("创建失败"),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Record<string, unknown> }) =>
      put(`/charging/operation-strategies/${id}`, d),
    onSuccess: () => {
      toast.success("策略更新成功")
      queryClient.invalidateQueries({ queryKey: ["operation-strategies"] })
      setDialogOpen(false)
    },
    onError: () => toast.error("更新失败"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/charging/operation-strategies/${id}`),
    onSuccess: () => {
      toast.success("策略已删除")
      queryClient.invalidateQueries({ queryKey: ["operation-strategies"] })
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

  const openEdit = (item: Strategy) => {
    setForm({
      title: item.title,
      station_id: item.station_id || "",
      strategy_type: item.strategy_type || "pricing",
      content: item.content || "",
      effective_date: item.effective_date || "",
      expiry_date: item.expiry_date || "",
      status: item.status || "active",
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = {
      title: form.title,
      station_id: form.station_id || null,
      strategy_type: form.strategy_type,
      content: form.content || null,
      effective_date: form.effective_date || null,
      expiry_date: form.expiry_date || null,
      status: form.status,
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, d: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const set = (key: keyof StrategyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const submitting = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-bold">运营策略</CardTitle>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新增策略
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v ?? "all"); setPage(1) }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {Object.entries(STRATEGY_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1) }}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">共 {total} 条</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">暂无策略数据，点击"新增策略"开始</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>策略名称</TableHead>
                  <TableHead>策略类型</TableHead>
                  <TableHead>生效日期</TableHead>
                  <TableHead>失效日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>策略内容</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>{STRATEGY_TYPE_LABELS[item.strategy_type] ?? item.strategy_type}</TableCell>
                    <TableCell>{item.effective_date || "-"}</TableCell>
                    <TableCell>{item.expiry_date || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[item.status] ?? "secondary"}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{item.content || "-"}</TableCell>
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
            <DialogTitle>{editing ? "编辑策略" : "新增策略"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>策略名称 *</Label>
              <Input value={form.title} onChange={set("title")} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>策略类型</Label>
                <Select value={form.strategy_type} onValueChange={(v) => setForm((f) => ({ ...f, strategy_type: v ?? "pricing" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STRATEGY_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? "active" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>生效日期</Label>
                <Input type="date" value={form.effective_date} onChange={set("effective_date")} />
              </div>
              <div className="space-y-2">
                <Label>失效日期</Label>
                <Input type="date" value={form.expiry_date} onChange={set("expiry_date")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>策略内容</Label>
              <Textarea rows={4} value={form.content} onChange={set("content")} />
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
            <AlertDialogDescription>确定要删除策略「{deleteTarget?.title}」吗？此操作不可撤销。</AlertDialogDescription>
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
