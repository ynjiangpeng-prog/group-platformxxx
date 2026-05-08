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

const MEMO_TYPE_LABELS: Record<string, string> = {
  maintenance: "维护",
  issue: "问题",
  opportunity: "机会",
  regulation: "合规",
}

const PRIORITY_LABELS: Record<string, string> = {
  high: "高",
  normal: "中",
  low: "低",
}

const PRIORITY_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  high: "destructive",
  normal: "default",
  low: "secondary",
}

const STATUS_LABELS: Record<string, string> = {
  open: "待处理",
  in_progress: "进行中",
  resolved: "已解决",
  closed: "已关闭",
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "outline",
  in_progress: "default",
  resolved: "secondary",
  closed: "secondary",
}

interface Memo {
  id: string
  title: string
  station_id: string | null
  memo_type: string
  content: string | null
  priority: string
  status: string
  created_by: string | null
  created_at: string
}

interface MemoForm {
  title: string
  station_id: string
  memo_type: string
  content: string
  priority: string
  status: string
}

const EMPTY_FORM: MemoForm = {
  title: "",
  station_id: "",
  memo_type: "maintenance",
  content: "",
  priority: "normal",
  status: "open",
}

export default function OperationMemoPage() {
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Memo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Memo | null>(null)
  const [form, setForm] = useState<MemoForm>(EMPTY_FORM)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["operation-memos", page, typeFilter, statusFilter],
    queryFn: () =>
      get<{ items: Memo[]; total: number }>(
        "/charging/operation-memos",
        {
          page,
          page_size: 20,
          ...(typeFilter !== "all" ? { memo_type: typeFilter } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        },
      ),
  })

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => post("/charging/operation-memos", d),
    onSuccess: () => {
      toast.success("备忘创建成功")
      queryClient.invalidateQueries({ queryKey: ["operation-memos"] })
      setDialogOpen(false)
    },
    onError: () => toast.error("创建失败"),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Record<string, unknown> }) =>
      put(`/charging/operation-memos/${id}`, d),
    onSuccess: () => {
      toast.success("备忘更新成功")
      queryClient.invalidateQueries({ queryKey: ["operation-memos"] })
      setDialogOpen(false)
    },
    onError: () => toast.error("更新失败"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/charging/operation-memos/${id}`),
    onSuccess: () => {
      toast.success("备忘已删除")
      queryClient.invalidateQueries({ queryKey: ["operation-memos"] })
      setDeleteTarget(null)
    },
    onError: () => toast.error("删除失败"),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      put(`/charging/operation-memos/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operation-memos"] }),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20) || 1

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (item: Memo) => {
    setForm({
      title: item.title,
      station_id: item.station_id || "",
      memo_type: item.memo_type || "maintenance",
      content: item.content || "",
      priority: item.priority || "normal",
      status: item.status || "open",
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = {
      title: form.title,
      station_id: form.station_id || null,
      memo_type: form.memo_type,
      content: form.content || null,
      priority: form.priority,
      status: form.status,
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, d: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const set = (key: keyof MemoForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const submitting = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-bold">运营备忘录</CardTitle>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新增备忘
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v ?? "all"); setPage(1) }}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {Object.entries(MEMO_TYPE_LABELS).map(([k, v]) => (
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
            <div className="text-center text-muted-foreground py-8">暂无备忘数据，点击"新增备忘"开始</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">{item.title}</TableCell>
                    <TableCell>{MEMO_TYPE_LABELS[item.memo_type] ?? item.memo_type}</TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANTS[item.priority] ?? "secondary"}>
                        {PRIORITY_LABELS[item.priority] ?? item.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <select
                        className="border rounded-md px-2 py-1 text-xs bg-background"
                        value={item.status}
                        onChange={(e) => statusMutation.mutate({ id: item.id, status: e.target.value })}
                      >
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.created_at ? new Date(item.created_at).toLocaleString("zh-CN") : "-"}
                    </TableCell>
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
            <DialogTitle>{editing ? "编辑备忘" : "新增备忘"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>标题 *</Label>
              <Input value={form.title} onChange={set("title")} required />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>类型</Label>
                <Select value={form.memo_type} onValueChange={(v) => setForm((f) => ({ ...f, memo_type: v ?? "maintenance" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MEMO_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>优先级</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v ?? "normal" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? "open" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>站点ID（可选）</Label>
              <Input value={form.station_id} onChange={set("station_id")} placeholder="留空为公司级" />
            </div>
            <div className="space-y-2">
              <Label>内容</Label>
              <Textarea rows={4} value={form.content} onChange={set("content")} required />
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
            <AlertDialogDescription>确定要删除备忘「{deleteTarget?.title}」吗？此操作不可撤销。</AlertDialogDescription>
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
