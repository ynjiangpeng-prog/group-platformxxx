import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, CheckCircle, Loader2 } from "lucide-react"
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
import { listReminders, createReminder, updateReminder, deleteReminder } from "@/api/crm"
import type { CrmReminder } from "@/api/crm"

const REMINDER_TYPE_LABELS: Record<string, string> = {
  follow_up: "跟进回访",
  contract_renewal: "合同续签",
  payment_reminder: "付款提醒",
  birthday: "生日提醒",
  custom: "自定义",
}

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  done: "已完成",
  overdue: "已逾期",
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  done: "default",
  overdue: "destructive",
}

const PAGE_SIZE = 20

const EMPTY_FORM = {
  customer_name: "",
  reminder_type: "follow_up",
  remind_at: "",
  content: "",
}

type FormType = typeof EMPTY_FORM

export default function CrmReminderPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>("pending")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CrmReminder | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CrmReminder | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { page, page_size: PAGE_SIZE }
    if (statusFilter !== "all") params.status = statusFilter
    return params
  }, [page, statusFilter])

  const { data, isLoading } = useQuery({
    queryKey: ["crm-reminders", queryParams],
    queryFn: () => listReminders(queryParams),
  })

  const reminders = data?.items ?? []
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const createMut = useMutation({
    mutationFn: (d: Partial<CrmReminder>) => createReminder(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm-reminders"] }); toast.success("创建成功"); setDialogOpen(false) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Partial<CrmReminder> }) => updateReminder(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm-reminders"] }); toast.success("更新成功"); setDialogOpen(false) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteReminder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm-reminders"] }); toast.success("删除成功"); setDeleteTarget(null) },
  })

  const completeMut = useMutation({
    mutationFn: (id: string) => updateReminder(id, { status: "done" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm-reminders"] }); toast.success("已标记完成") },
  })

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setDialogOpen(true) }

  const openEdit = (item: CrmReminder) => {
    setForm({
      customer_name: item.customer_name ?? "",
      reminder_type: item.reminder_type ?? "follow_up",
      remind_at: item.remind_at ? item.remind_at.slice(0, 16) : "",
      content: item.content ?? "",
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Partial<CrmReminder> = {
      customer_name: form.customer_name || undefined,
      reminder_type: form.reminder_type,
      remind_at: form.remind_at,
      content: form.content || undefined,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const set = (key: keyof FormType) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">跟进提醒</h1>
        <Button onClick={openCreate}><Plus className="size-4" />新建提醒</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="全部状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
                  <TableHead>客户名称</TableHead>
                  <TableHead>提醒类型</TableHead>
                  <TableHead>提醒时间</TableHead>
                  <TableHead>内容</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reminders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">暂无数据</TableCell>
                  </TableRow>
                )}
                {reminders.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.customer_name ?? "-"}</TableCell>
                    <TableCell>{REMINDER_TYPE_LABELS[r.reminder_type] ?? r.reminder_type}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.remind_at ? new Date(r.remind_at).toLocaleString("zh-CN") : "-"}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={r.content}>{r.content ?? "-"}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANTS[r.status] ?? "secondary"}>{STATUS_LABELS[r.status] ?? r.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" && (
                        <Button variant="ghost" size="icon-sm" title="标记完成" onClick={() => completeMut.mutate(r.id)}>
                          <CheckCircle className="size-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(r)}><Trash2 className="size-4" /></Button>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑提醒" : "新建提醒"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>客户名称</Label>
              <Input value={form.customer_name} onChange={set("customer_name")} />
            </div>
            <div className="space-y-2">
              <Label>提醒类型</Label>
              <Select value={form.reminder_type} onValueChange={(v) => setForm((f) => ({ ...f, reminder_type: v ?? "follow_up" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REMINDER_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>提醒时间</Label>
              <Input type="datetime-local" value={form.remind_at} onChange={set("remind_at")} required />
            </div>
            <div className="space-y-2">
              <Label>内容</Label>
              <Textarea rows={3} value={form.content} onChange={set("content")} />
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
            <AlertDialogDescription>确定要删除该提醒吗？此操作不可撤销。</AlertDialogDescription>
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
