import { useState } from "react"
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

const EMPTY_FORM = {
  title: "",
  station_id: "",
  memo_type: "maintenance",
  content: "",
  priority: "normal",
  status: "open",
  created_by: "",
}

type FormType = typeof EMPTY_FORM

interface Memo {
  id: string
  title: string
  station_id: string
  memo_type: string
  content: string
  priority: string
  status: string
  created_by: string
  created_at: string
}

const PAGE_SIZE = 20

export default function OperationMemoPage() {
  const [data, setData] = useState<Memo[]>([])
  const [page, setPage] = useState(1)
  const [stationFilter, setStationFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Memo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Memo | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const filtered = data.filter((item) => {
    if (typeFilter !== "all" && item.memo_type !== typeFilter) return false
    if (statusFilter !== "all" && item.status !== statusFilter) return false
    if (stationFilter && item.station_id !== stationFilter) return false
    return true
  })

  const total = filtered.length
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const stationSet = new Set(data.map((item) => item.station_id).filter(Boolean))

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (item: Memo) => {
    setForm({
      title: item.title,
      station_id: item.station_id,
      memo_type: item.memo_type,
      content: item.content,
      priority: item.priority,
      status: item.status,
      created_by: item.created_by,
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setTimeout(() => {
      if (editing) {
        setData((prev) =>
          prev.map((item) =>
            item.id === editing.id ? { ...item, ...form } : item
          )
        )
      } else {
        const newItem: Memo = {
          id: crypto.randomUUID(),
          ...form,
          created_at: new Date().toISOString(),
        }
        setData((prev) => [newItem, ...prev])
      }
      setSubmitting(false)
      setDialogOpen(false)
    }, 300)
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    setData((prev) => prev.filter((item) => item.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  const handleStatusChange = (id: string, newStatus: string) => {
    setData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    )
  }

  const set = (key: keyof FormType) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

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
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            接口开发中，当前数据仅保存在本地
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Select value={stationFilter || "all"} onValueChange={(v) => { setStationFilter(v === "all" ? "" : v ?? ""); setPage(1) }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="全部站点" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部站点</SelectItem>
                {Array.from(stationSet).map((sid) => (
                  <SelectItem key={sid} value={sid}>{sid}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v ?? ""); setPage(1) }}>
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
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ""); setPage(1) }}>
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
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>站点</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>优先级</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建人</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">暂无数据</TableCell>
                </TableRow>
              )}
              {paged.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium max-w-[160px] truncate">{item.title}</TableCell>
                  <TableCell>{item.station_id || "-"}</TableCell>
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
                      onChange={(e) => handleStatusChange(item.id, e.target.value)}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>{item.created_by || "-"}</TableCell>
                  <TableCell className="whitespace-nowrap">{item.created_at ? new Date(item.created_at).toLocaleString("zh-CN") : "-"}</TableCell>
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

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">共 {total} 条</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <span className="text-sm">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                下一页
              </Button>
            </div>
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
              <Label>标题</Label>
              <Input value={form.title} onChange={set("title")} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>站点ID（可选）</Label>
                <Input value={form.station_id} onChange={set("station_id")} placeholder="留空为公司级" />
              </div>
              <div className="space-y-2">
                <Label>创建人</Label>
                <Input value={form.created_by} onChange={set("created_by")} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>类型</Label>
                <Select value={form.memo_type} onValueChange={(v) => setForm((f) => ({ ...f, memo_type: v ?? "" }))}>
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
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v ?? "" }))}>
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
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? "" }))}>
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
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
