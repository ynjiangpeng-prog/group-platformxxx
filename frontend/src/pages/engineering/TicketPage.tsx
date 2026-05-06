import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { listProjects, listServiceTickets, createServiceTicket } from "@/api/project"
import { listUsers } from "@/api/organization"
import BatchToolbar from "@/components/batch/BatchToolbar"

const PRIORITY_COLORS: Record<number, "default" | "secondary" | "outline" | "destructive"> = {
  1: "destructive",
  2: "default",
  3: "secondary",
}

const PRIORITY_LABELS: Record<number, string> = { 1: "高", 2: "中", 3: "低" }

const PRIORITY_MAP: Record<string, number> = { urgent: 1, high: 1, medium: 2, low: 3 }

const SERVICE_TYPE_LABELS: Record<string, string> = { maintenance: "维护", repair: "维修", upgrade: "升级", consultation: "咨询" }

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline"> = {
  open: "default",
  in_progress: "secondary",
  completed: "outline",
  closed: "secondary",
}

const STATUS_LABELS: Record<string, string> = { open: "待处理", in_progress: "处理中", completed: "已完成", closed: "已关闭" }

export default function TicketPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [projectFilter, setProjectFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogProjectId, setDialogProjectId] = useState("")
  const [form, setForm] = useState({ title: "", service_type: "repair", priority: "medium", description: "", assigned_to: "" })
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-filter"],
    queryFn: () => listProjects({ page: 1, page_size: 200 }),
  })
  const projects = projectsData?.items ?? []

  const { data: usersData } = useQuery({
    queryKey: ["users-for-assign"],
    queryFn: () => listUsers({ page: 1, page_size: 200 }),
  })
  const users = usersData?.items ?? [] as { id: string; name: string }[]

  const { data, isLoading } = useQuery({
    queryKey: ["service-tickets", page, projectFilter],
    queryFn: () => {
      const pid = projectFilter === "all" ? undefined : projectFilter
      return listServiceTickets(pid, { page, page_size: 20 })
    },
    enabled: true,
  })

  const tickets = (data?.items ?? []) as { id: string; project_id: string; title: string; service_type: string; priority: number; status: string; assigned_to?: string; description?: string }[]

  const createMut = useMutation({
    mutationFn: () =>
      createServiceTicket({
        project_id: dialogProjectId,
        title: form.title,
        service_type: form.service_type,
        priority: PRIORITY_MAP[form.priority] ?? 2,
        description: form.description || undefined,
        assigned_to: form.assigned_to || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-tickets"] })
      toast.success("工单已创建")
      setDialogOpen(false)
      setForm({ title: "", service_type: "repair", priority: "medium", description: "", assigned_to: "" })
    },
    onError: () => toast.error("创建失败"),
  })

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">工单管理</h1>
        <Button onClick={() => setDialogOpen(true)}><Plus className="size-4" />新建工单</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={projectFilter} onValueChange={(v) => { if (v) { setProjectFilter(v); setPage(1) } }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="筛选项目" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <BatchToolbar
          entityType="service-tickets"
          selectedIds={selectedIds}
          templateType="service_ticket"
          onImportComplete={() => qc.invalidateQueries({ queryKey: ["service-tickets"] })}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? tickets.map((t) => t.id) : [])} /></TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>项目</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>负责人</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
                )}
                {tickets.map((t) => {
                  const proj = projects.find((p) => p.id === t.project_id)
                  return (
                      <TableRow key={t.id}>
                        <TableCell><Input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleSelect(t.id)} /></TableCell>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell>
                          <span className="text-primary cursor-pointer hover:underline" onClick={() => navigate(`/project/${t.project_id}`)}>
                            {proj?.name ?? t.project_id}
                          </span>
                        </TableCell>
                        <TableCell><Badge variant="outline">{SERVICE_TYPE_LABELS[t.service_type] ?? t.service_type}</Badge></TableCell>
                        <TableCell><Badge variant={PRIORITY_COLORS[t.priority] ?? "secondary"}>{PRIORITY_LABELS[t.priority] ?? t.priority}</Badge></TableCell>
                        <TableCell><Badge variant={STATUS_COLORS[t.status] ?? "secondary"}>{STATUS_LABELS[t.status] ?? t.status}</Badge></TableCell>
                        <TableCell>{t.assigned_to ? (users as any[]).find((u: any) => u.id === t.assigned_to)?.real_name ?? t.assigned_to.substring(0, 8) : <span className="text-muted-foreground">未指派</span>}</TableCell>
                      </TableRow>
                  )
                })}
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
          <Button variant="outline" size="sm" disabled={(data?.items?.length ?? 0) < 20} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>新建工单</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>所属项目 *</Label>
              <Select value={dialogProjectId} onValueChange={(v) => { if (v) setDialogProjectId(v) }}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>标题 *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="工单标题..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>类型</Label>
                <Select value={form.service_type} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, service_type: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="repair">维修</SelectItem>
                    <SelectItem value="install">安装</SelectItem>
                    <SelectItem value="inspection">巡检</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>优先级</Label>
                <Select value={form.priority} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, priority: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">紧急</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="low">低</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>描述</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="问题描述..." rows={3} />
            </div>
            <div className="grid gap-2">
              <Label>指派执行人</Label>
              <Select value={form.assigned_to || "__none__"} onValueChange={(v) => { const val = v === "__none__" ? "" : v; setForm((f) => ({ ...f, assigned_to: val as string })) }}>
                <SelectTrigger><SelectValue placeholder="选择执行人" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">不指派</SelectItem>
                  {users.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.real_name || u.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button disabled={createMut.isPending || !dialogProjectId || !form.title} onClick={() => createMut.mutate()}>
              {createMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
