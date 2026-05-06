import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
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
import { listProjects, listConstructionLogs, createConstructionLog } from "@/api/project"
import BatchToolbar from "@/components/batch/BatchToolbar"

export default function LogPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [projectFilter, setProjectFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ log_date: new Date().toISOString().split("T")[0], weather: "晴", temperature: "", work_content: "", worker_count: "0", equipment_used: "", materials_used: "", safety_status: "normal", quality_issues: "", recorder_id: "" })
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-filter"],
    queryFn: () => listProjects({ page: 1, page_size: 200 }),
  })
  const projects = projectsData?.items ?? []

  const { data, isLoading } = useQuery({
    queryKey: ["construction-logs", page, projectFilter],
    queryFn: () => {
      const pid = projectFilter === "all" ? undefined : projectFilter
      return listConstructionLogs(pid, { page, page_size: 20 })
    },
    enabled: true,
  })

  const logs = (data?.items ?? []) as { id: string; project_id: string; log_date: string; weather: string; work_content: string; worker_count: number; quality_issues?: string }[]

  const createMut = useMutation({
    mutationFn: (projectId: string) =>
      createConstructionLog({
        project_id: projectId,
        log_date: form.log_date,
        weather: form.weather,
        temperature: form.temperature || undefined,
        work_content: form.work_content,
        worker_count: Number(form.worker_count),
        equipment_used: form.equipment_used || undefined,
        materials_used: form.materials_used || undefined,
        safety_status: form.safety_status,
        quality_issues: form.quality_issues || undefined,
        recorder_id: form.recorder_id || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["construction-logs"] })
      toast.success("日志已创建")
      setDialogOpen(false)
      setForm({ log_date: new Date().toISOString().split("T")[0], weather: "晴", temperature: "", work_content: "", worker_count: "0", equipment_used: "", materials_used: "", safety_status: "normal", quality_issues: "", recorder_id: "" })
    },
    onError: () => toast.error("创建失败"),
  })

  const [dialogProjectId, setDialogProjectId] = useState("")

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">施工日志</h1>
        <Button onClick={() => setDialogOpen(true)}><Plus className="size-4" />新建日志</Button>
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
          entityType="construction-logs"
          selectedIds={selectedIds}
          templateType="construction_log"
          onImportComplete={() => qc.invalidateQueries({ queryKey: ["construction-logs"] })}
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
                  <TableHead className="w-10">
                    <Input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? logs.map((l) => l.id) : [])} />
                  </TableHead>
                  <TableHead>日期</TableHead>
                  <TableHead>项目</TableHead>
                  <TableHead>天气</TableHead>
                  <TableHead>工作内容</TableHead>
                  <TableHead>工人</TableHead>
                  <TableHead>问题</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
                )}
                {logs.map((log) => {
                  const proj = projects.find((p) => p.id === log.project_id)
                  return (
                    <TableRow key={log.id}>
                      <TableCell><Input type="checkbox" checked={selectedIds.includes(log.id)} onChange={() => toggleSelect(log.id)} /></TableCell>
                      <TableCell>{format(new Date(log.log_date), "yyyy-MM-dd")}</TableCell>
                      <TableCell>
                        <span
                          className="text-primary cursor-pointer hover:underline"
                          onClick={() => navigate(`/project/${log.project_id}`)}
                        >
                          {proj?.name ?? log.project_id}
                        </span>
                      </TableCell>
                      <TableCell><Badge variant="outline">{log.weather}</Badge></TableCell>
                      <TableCell className="max-w-[300px] truncate">{log.work_content}</TableCell>
                      <TableCell>{log.worker_count}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">{log.quality_issues ?? "-"}</TableCell>
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
          <DialogHeader><DialogTitle>新建施工日志</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>所属项目 *</Label>
              <Select value={dialogProjectId} onValueChange={(v) => { if (v) setDialogProjectId(v) }}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>日期</Label>
                <Input type="date" value={form.log_date} onChange={(e) => setForm((f) => ({ ...f, log_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>天气</Label>
                <Select value={form.weather} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, weather: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="晴">晴</SelectItem>
                    <SelectItem value="多云">多云</SelectItem>
                    <SelectItem value="阴">阴</SelectItem>
                    <SelectItem value="小雨">小雨</SelectItem>
                    <SelectItem value="大雨">大雨</SelectItem>
                    <SelectItem value="雪">雪</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>工作内容</Label>
              <Textarea value={form.work_content} onChange={(e) => setForm((f) => ({ ...f, work_content: e.target.value }))} placeholder="当日施工内容..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>工人数量</Label>
                <Input type="number" value={form.worker_count} onChange={(e) => setForm((f) => ({ ...f, worker_count: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>问题记录</Label>
                <Input value={form.quality_issues} onChange={(e) => setForm((f) => ({ ...f, quality_issues: e.target.value }))} placeholder="可选" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button disabled={createMut.isPending || !dialogProjectId || !form.work_content} onClick={() => createMut.mutate(dialogProjectId)}>
              {createMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
