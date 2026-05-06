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
import { listProjects, listInspections, createInspection } from "@/api/project"
import { listUsers } from "@/api/organization"
import BatchToolbar from "@/components/batch/BatchToolbar"

const RESULT_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pass: "default",
  conditional: "secondary",
  fail: "destructive",
}

const RESULT_LABELS: Record<string, string> = { normal: "合格", issue: "有隐患", failure: "不合格" }

const INSPECTION_TYPE_LABELS: Record<string, string> = { safety: "安全巡检", quality: "质量检查", environmental: "环境检查" }
const OVERALL_LEVEL_LABELS: Record<string, string> = { pass: "合格", issue: "有隐患", failure: "不合格" }
const RECTIFICATION_STATUS_LABELS: Record<string, string> = { pending: "待整改", ongoing: "整改中", completed: "已完成" }

export default function InspectionPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [projectFilter, setProjectFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogProjectId, setDialogProjectId] = useState("")
  const [form, setForm] = useState({ inspection_type: "safety", inspection_date: new Date().toISOString().split("T")[0], overall_result: "normal", issues_found: "" })
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-filter"],
    queryFn: () => listProjects({ page: 1, page_size: 200 }),
  })
  const projects = projectsData?.items ?? []

  const { data: usersData } = useQuery({
    queryKey: ["users-for-inspection"],
    queryFn: () => listUsers({ page: 1, page_size: 200 }),
  })
  const users = usersData?.items ?? [] as any[]

  const { data, isLoading } = useQuery({
    queryKey: ["inspections", page, projectFilter],
    queryFn: () => {
      const pid = projectFilter === "all" ? undefined : projectFilter
      return listInspections(pid, { page, page_size: 20 })
    },
    enabled: true,
  })

  const inspections = (data?.items ?? []) as any[]

  const createMut = useMutation({
    mutationFn: () =>
      createInspection({
        project_id: dialogProjectId,
        inspection_type: form.inspection_type,
        inspection_date: form.inspection_date,
        overall_result: form.overall_result,
        issues_found: form.issues_found || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inspections"] })
      toast.success("巡检记录已创建")
      setDialogOpen(false)
      setForm({ inspection_type: "safety", inspection_date: new Date().toISOString().split("T")[0], overall_result: "normal", issues_found: "" })
    },
    onError: () => toast.error("创建失败"),
  })

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">安全巡检</h1>
        <Button onClick={() => setDialogOpen(true)}><Plus className="size-4" />新建巡检</Button>
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
          entityType="inspections"
          selectedIds={selectedIds}
          templateType="inspection"
          onImportComplete={() => qc.invalidateQueries({ queryKey: ["inspections"] })}
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
                  <TableHead className="w-10"><Input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? inspections.map((i: any) => i.id) : [])} /></TableHead>
                  <TableHead>日期</TableHead>
                  <TableHead>项目</TableHead>
                  <TableHead>巡检类型</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead>整改状态</TableHead>
                  <TableHead>巡检人</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
                )}
                {inspections.map((insp) => {
                  const proj = projects.find((p) => p.id === insp.project_id)
                  return (
                     <TableRow key={insp.id}>
                       <TableCell><Input type="checkbox" checked={selectedIds.includes(insp.id)} onChange={() => toggleSelect(insp.id)} /></TableCell>
                       <TableCell>{format(new Date(insp.inspection_date), "yyyy-MM-dd")}</TableCell>
                       <TableCell>
                         <span className="text-primary cursor-pointer hover:underline" onClick={() => navigate(`/project/${insp.project_id}`)}>
                           {proj?.name ?? insp.project_id}
                         </span>
                       </TableCell>
                       <TableCell><Badge variant="outline">{INSPECTION_TYPE_LABELS[insp.inspection_type] ?? insp.inspection_type}</Badge></TableCell>
                        <TableCell><Badge variant={insp.overall_result === "failure" ? "destructive" : insp.overall_result === "issue" ? "secondary" : "default"}>{RESULT_LABELS[insp.overall_result] ?? insp.overall_result}</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{RECTIFICATION_STATUS_LABELS[insp.rectification_status] ?? insp.rectification_status}</Badge></TableCell>
                        <TableCell>{insp.inspector_id ? (users as any[]).find((u: any) => u.id === insp.inspector_id)?.real_name ?? "-" : "-"}</TableCell>
                       <TableCell className="max-w-[200px] truncate text-muted-foreground">{insp.remark ?? "-"}</TableCell>
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
          <DialogHeader><DialogTitle>新建巡检记录</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>所属项目 *</Label>
              <Select value={dialogProjectId} onValueChange={(v) => { if (v) setDialogProjectId(v) }}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>巡检类型</Label>
                <Select value={form.inspection_type} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, inspection_type: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="safety">安全检查</SelectItem>
                    <SelectItem value="quality">质量检查</SelectItem>
                    <SelectItem value="environmental">环境检查</SelectItem>
                    <SelectItem value="equipment">设备检查</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>日期</Label>
                <Input type="date" value={form.inspection_date} onChange={(e) => setForm((f) => ({ ...f, inspection_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>检查结果</Label>
              <Select value={form.overall_result} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, overall_result: v })) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">合格</SelectItem>
                  <SelectItem value="issue">有隐患</SelectItem>
                  <SelectItem value="failure">不合格</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>发现问题</Label>
              <Textarea value={form.issues_found} onChange={(e) => setForm((f) => ({ ...f, issues_found: e.target.value }))} placeholder="发现的问题..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button disabled={createMut.isPending || !dialogProjectId} onClick={() => createMut.mutate()}>
              {createMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
