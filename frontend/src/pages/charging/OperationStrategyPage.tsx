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

const EMPTY_FORM = {
  title: "",
  station_id: "",
  strategy_type: "pricing",
  content: "",
  effective_date: "",
  expiry_date: "",
  status: "active",
}

type FormType = typeof EMPTY_FORM

interface Strategy {
  id: string
  title: string
  station_id: string
  strategy_type: string
  content: string
  effective_date: string
  expiry_date: string
  status: string
}

const PAGE_SIZE = 20

export default function OperationStrategyPage() {
  const [data, setData] = useState<Strategy[]>([])
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Strategy | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Strategy | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const filtered = data.filter((item) => {
    if (typeFilter !== "all" && item.strategy_type !== typeFilter) return false
    if (statusFilter !== "all" && item.status !== statusFilter) return false
    return true
  })

  const total = filtered.length
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (item: Strategy) => {
    setForm({
      title: item.title,
      station_id: item.station_id,
      strategy_type: item.strategy_type,
      content: item.content,
      effective_date: item.effective_date,
      expiry_date: item.expiry_date,
      status: item.status,
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
        const newItem: Strategy = {
          id: crypto.randomUUID(),
          ...form,
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

  const set = (key: keyof FormType) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

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
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            接口开发中，当前数据仅保存在本地
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v ?? ""); setPage(1) }}>
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
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">暂无数据</TableCell>
                </TableRow>
              )}
              {paged.map((item) => (
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
            <DialogTitle>{editing ? "编辑策略" : "新增策略"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>策略名称</Label>
              <Input value={form.title} onChange={set("title")} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>策略类型</Label>
                <Select value={form.strategy_type} onValueChange={(v) => setForm((f) => ({ ...f, strategy_type: v ?? "" }))}>
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
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
