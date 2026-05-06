import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Loader2, UserPlus, CheckCircle2, Star } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { listProjects, listServiceTickets, createServiceTicket, updateServiceTicket } from "@/api/project"
import { listUsers } from "@/api/organization"
import type { ServiceTicket } from "@/api/types"

const TYPE_OPTIONS = [
  { value: "installation", label: "安装调试" },
  { value: "maintenance", label: "维护保养" },
  { value: "repair", label: "故障维修" },
  { value: "inspection", label: "巡检" },
  { value: "warranty", label: "质保服务" },
  { value: "other", label: "其他" },
]
const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((t) => [t.value, t.label]))

const PRIORITY_LABELS: Record<number, string> = { 1: "低", 2: "中", 3: "高", 4: "紧急" }
const PRIORITY_COLORS: Record<number, "default" | "secondary" | "destructive" | "outline"> = { 1: "secondary", 2: "outline", 3: "default", 4: "destructive" }

const STATUS_LABELS: Record<string, string> = { open: "待处理", assigned: "已分配", processing: "处理中", completed: "已完成", closed: "已关闭" }
const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = { open: "outline", assigned: "secondary", processing: "default", completed: "default", closed: "secondary" }

interface TicketForm {
  title: string
  service_type: string
  priority: string
  status: string
  description: string
  assigned_to: string
  customer_name: string
  customer_phone: string
  customer_company: string
  resolution: string
  customer_rating: string
  customer_feedback: string
}

const emptyForm: TicketForm = {
  title: "", service_type: "repair", priority: "2", status: "open",
  description: "", assigned_to: "", customer_name: "", customer_phone: "",
  customer_company: "", resolution: "", customer_rating: "", customer_feedback: "",
}

export default function ServiceTicketPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [projectId, setProjectId] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [form, setForm] = useState<TicketForm>(emptyForm)
  const [resolution, setResolution] = useState("")
  const [rating, setRating] = useState("")
  const [feedback, setFeedback] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const setF = (patch: Partial<TicketForm>) => setForm((f) => ({ ...f, ...patch }))

  const { data: projectData } = useQuery({ queryKey: ["projects-select"], queryFn: () => listProjects({ page: 1, page_size: 200 }) })
  const { data: usersData } = useQuery({ queryKey: ["users-for-assign"], queryFn: () => listUsers({ page: 1, page_size: 200 }) })
  const { data, isLoading } = useQuery({
    queryKey: ["service-tickets", projectId, page, statusFilter],
    queryFn: () => listServiceTickets(projectId, { page, page_size: 20, status: statusFilter !== "all" ? statusFilter : undefined }),
    enabled: !!projectId,
  })
  const users = usersData?.items ?? []
  const tickets = data?.items ?? []

  const createMut = useMutation({
    mutationFn: (d: Partial<ServiceTicket>) => createServiceTicket({ ...d, project_id: projectId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["service-tickets", projectId] }); toast.success("工单已创建"); setDialogOpen(false) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string; [k: string]: unknown }) => updateServiceTicket(projectId, id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["service-tickets", projectId] }); toast.success("工单已更新"); setDialogOpen(false); setFeedbackOpen(false) },
  })

  function openCreate() {
    setEditId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(item: ServiceTicket) {
    setEditId(item.id)
    setForm({
      title: item.title ?? "",
      service_type: item.service_type ?? "repair",
      priority: String(item.priority ?? 2),
      status: item.status ?? "open",
      description: item.description ?? "",
      assigned_to: item.assigned_to ?? "",
      customer_name: item.customer_name ?? "",
      customer_phone: item.customer_phone ?? "",
      customer_company: item.customer_company ?? "",
      resolution: item.resolution ?? "",
      customer_rating: item.customer_rating != null ? String(item.customer_rating) : "",
      customer_feedback: item.customer_feedback ?? "",
    })
    setDialogOpen(true)
  }

  function openFeedback(item: ServiceTicket) {
    setFeedbackId(item.id)
    setResolution(item.resolution ?? "")
    setRating(item.customer_rating != null ? String(item.customer_rating) : "")
    setFeedback(item.customer_feedback ?? "")
    setFeedbackOpen(true)
  }

  function submit() {
    const payload = {
      title: form.title,
      service_type: form.service_type,
      priority: Number(form.priority) || 2,
      status: form.status,
      description: form.description || undefined,
      assigned_to: form.assigned_to || undefined,
      customer_name: form.customer_name || undefined,
      customer_phone: form.customer_phone || undefined,
      customer_company: form.customer_company || undefined,
    } as Partial<ServiceTicket>
    editId ? updateMut.mutate({ id: editId, ...payload }) : createMut.mutate(payload)
  }

  function submitFeedback() {
    if (!feedbackId) return
    updateMut.mutate({
      id: feedbackId,
      status: "completed",
      resolution: resolution || undefined,
      customer_rating: rating ? Number(rating) : undefined,
      customer_feedback: feedback || undefined,
    })
  }

  function changeStatus(id: string, status: string) {
    updateMut.mutate({ id, status })
  }

  function assignTicket(id: string, userId: string) {
    updateMut.mutate({ id, assigned_to: userId, status: "assigned" })
  }

  const userMap = Object.fromEntries(users.map((u) => [u.id, u.real_name ?? u.username]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">服务工单</h1>
        <Button onClick={openCreate} disabled={!projectId}><Plus className="size-4" />新建工单</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={projectId} onValueChange={(v) => { setProjectId(v ?? ""); setPage(1) }}>
          <SelectTrigger className="w-56"><SelectValue placeholder="选择项目" /></SelectTrigger>
          <SelectContent>
            {projectData?.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!projectId ? (
        <p className="text-center text-muted-foreground py-12">请选择项目</p>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>工单号</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>指派人</TableHead>
                  <TableHead>客户</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">暂无工单</TableCell></TableRow>
                )}
                {tickets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.ticket_no}</TableCell>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABELS[t.service_type] ?? t.service_type}</Badge></TableCell>
                    <TableCell><Badge variant={PRIORITY_COLORS[t.priority] ?? "secondary"}>{PRIORITY_LABELS[t.priority] ?? t.priority}</Badge></TableCell>
                    <TableCell><Badge variant={STATUS_COLORS[t.status] ?? "secondary"}>{STATUS_LABELS[t.status] ?? t.status}</Badge></TableCell>
                    <TableCell>{userMap[t.assigned_to ?? ""] ?? <span className="text-muted-foreground text-xs">未分配</span>}</TableCell>
                    <TableCell className="text-xs">{t.customer_name ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {t.status === "open" && (
                          <Select value="" onValueChange={(v) => { if (v) assignTicket(t.id, v) }}>
                            <SelectTrigger className="h-7 w-7 p-0 border-none"><UserPlus className="size-3.5" /></SelectTrigger>
                            <SelectContent>
                              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.real_name ?? u.username}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        {t.status === "assigned" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeStatus(t.id, "processing")}>开始处理</Button>
                        )}
                        {t.status === "processing" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openFeedback(t)}>完成</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="size-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">共 {data.total} 条</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
            <span className="text-sm">{page}</span>
            <Button variant="outline" size="sm" disabled={tickets.length < 20} onClick={() => setPage((p) => p + 1)}>下一页</Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "编辑工单" : "新建工单"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 [&>*]:min-w-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>工单标题 *</Label>
                <Input value={form.title} onChange={(e) => setF({ title: e.target.value })} placeholder="如: XX站1号桩故障维修" />
              </div>
              <div className="grid gap-2">
                <Label>服务类型</Label>
                <Select value={form.service_type} onValueChange={(v) => { if (v) setF({ service_type: v }) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>优先级</Label>
                <Select value={form.priority} onValueChange={(v) => { if (v) setF({ priority: v }) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>指派给</Label>
                <Select value={form.assigned_to} onValueChange={(v) => { if (v) setF({ assigned_to: v }) }}>
                  <SelectTrigger><SelectValue placeholder="选择人员" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">不指定</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.real_name ?? u.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>问题描述</Label>
              <Textarea value={form.description} onChange={(e) => setF({ description: e.target.value })} rows={3} placeholder="详细描述故障/服务需求..." />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>客户姓名</Label>
                <Input value={form.customer_name} onChange={(e) => setF({ customer_name: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>客户电话</Label>
                <Input value={form.customer_phone} onChange={(e) => setF({ customer_phone: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>客户单位</Label>
                <Input value={form.customer_company} onChange={(e) => setF({ customer_company: e.target.value })} />
              </div>
            </div>
            {editId && (
              <div className="grid gap-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => { if (v) setF({ status: v }) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending || !form.title}>
              {(createMut.isPending || updateMut.isPending) && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>完成工单 - 反馈</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>处理结果 *</Label>
              <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} placeholder="描述处理过程和结果..." />
            </div>
            <div className="grid gap-2">
              <Label>客户评分</Label>
              <Select value={rating} onValueChange={(v) => { if (v) setRating(v) }}>
                <SelectTrigger><SelectValue placeholder="选择评分" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5分 - 非常满意</SelectItem>
                  <SelectItem value="4">4分 - 满意</SelectItem>
                  <SelectItem value="3">3分 - 一般</SelectItem>
                  <SelectItem value="2">2分 - 不满意</SelectItem>
                  <SelectItem value="1">1分 - 非常不满意</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>客户反馈</Label>
              <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="客户反馈内容..." />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={submitFeedback} disabled={updateMut.isPending || !resolution}>
              {updateMut.isPending && <Loader2 className="size-4 animate-spin" />}
              <CheckCircle2 className="size-4" />确认完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
