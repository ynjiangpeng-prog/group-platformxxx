import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, MessageSquare, ChevronDown, ChevronRight } from "lucide-react"
import { format } from "date-fns"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import * as api from "@/api/business"
import * as projectApi from "@/api/project"
import { listUsers } from "@/api/organization"

const defaultPlanForm = { project_id: "", plan_date: "", weekly_plan_id: "", tasks: "", materials: "", weather: "sunny", temperature: "", estimated_hours: "", assigned_to: "", status: "draft" }
const defaultFeedbackForm = { project_id: "", daily_plan_id: "", feedback_date: "", completed_tasks: "", issues: "", actual_hours: "", worker_count: "", recorder_id: "", status: "draft" }
const statusLabel: Record<string, string> = { draft: "草稿", submitted: "已提交", confirmed: "已确认" }
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = { draft: "secondary", submitted: "default", confirmed: "default" }
const weatherLabel: Record<string, string> = { sunny: "晴", cloudy: "多云", rainy: "雨", snowy: "雪", windy: "大风", foggy: "雾" }

export default function DailyPlanPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState("plans")
  const [page, setPage] = useState(1)
  const [fbPage, setFbPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [filterProject, setFilterProject] = useState("")
  const [filterDate, setFilterDate] = useState("")
  const [form, setForm] = useState(defaultPlanForm)
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)

  const [fbDialogOpen, setFbDialogOpen] = useState(false)
  const [fbEditId, setFbEditId] = useState<string | null>(null)
  const [fbDeleteId, setFbDeleteId] = useState<string | null>(null)
  const [fbForm, setFbForm] = useState(defaultFeedbackForm)

  const { data, isLoading } = useQuery({ queryKey: ["daily-plans", page, filterProject, filterDate], queryFn: () => api.listDailyPlans({ page, page_size: 20, project_id: filterProject || undefined, plan_date: filterDate || undefined }) })
  const { data: fbData, isLoading: fbLoading } = useQuery({ queryKey: ["daily-feedbacks", fbPage, filterProject, filterDate], queryFn: () => api.listDailyFeedbacks({ page: fbPage, page_size: 20, project_id: filterProject || undefined, feedback_date: filterDate || undefined }) })
  const { data: projects } = useQuery({ queryKey: ["projects-opts"], queryFn: () => projectApi.listProjects({ page_size: 200 }) })
  const { data: weeklyPlans } = useQuery({ queryKey: ["weekly-plans-opts"], queryFn: () => api.listWeeklyPlans({ page_size: 200 }) })
  const { data: users } = useQuery({ queryKey: ["users-opts"], queryFn: () => listUsers({ page_size: 200 }) })

  const createMut = useMutation({ mutationFn: api.createDailyPlan, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-plans"] }); toast.success("已创建"); setDialogOpen(false) } })
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateDailyPlan(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-plans"] }); toast.success("已更新"); setDialogOpen(false); setEditId(null) } })
  const deleteMut = useMutation({ mutationFn: api.deleteDailyPlan, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-plans"] }); toast.success("已删除"); setDeleteId(null) } })

  const fbCreateMut = useMutation({ mutationFn: api.createDailyFeedback, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-feedbacks"] }); toast.success("反馈已提交"); setFbDialogOpen(false) } })
  const fbUpdateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateDailyFeedback(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-feedbacks"] }); toast.success("已更新"); setFbDialogOpen(false); setFbEditId(null) } })
  const fbDeleteMut = useMutation({ mutationFn: api.deleteDailyFeedback, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-feedbacks"] }); toast.success("已删除"); setFbDeleteId(null) } })

  const openCreate = () => { setForm(defaultPlanForm); setEditId(null); setDialogOpen(true) }
  const openEdit = (item: any) => { setForm({ project_id: item.project_id ?? "", plan_date: item.plan_date ?? "", weekly_plan_id: item.weekly_plan_id ?? "", tasks: item.tasks ?? "", materials: item.materials ?? "", weather: item.weather ?? "sunny", temperature: String(item.temperature ?? ""), estimated_hours: String(item.estimated_hours ?? ""), assigned_to: item.assigned_to ?? "", status: item.status ?? "draft" }); setEditId(item.id); setDialogOpen(true) }
  const submit = () => { const payload = { ...form, estimated_hours: Number(form.estimated_hours) || 0 }; editId ? updateMut.mutate({ id: editId, data: payload }) : createMut.mutate(payload) }

  const openFbCreate = (planId?: string, projectId?: string, planDate?: string) => { setFbForm({ ...defaultFeedbackForm, daily_plan_id: planId || "", project_id: projectId || "", feedback_date: planDate || "" }); setFbEditId(null); setFbDialogOpen(true) }
  const openFbEdit = (item: any) => { setFbForm({ project_id: item.project_id ?? "", daily_plan_id: item.daily_plan_id ?? "", feedback_date: item.feedback_date ?? "", completed_tasks: item.completed_tasks ?? "", issues: item.issues ?? "", actual_hours: String(item.actual_hours ?? ""), worker_count: String(item.worker_count ?? ""), recorder_id: item.recorder_id ?? "", status: item.status ?? "draft" }); setFbEditId(item.id); setFbDialogOpen(true) }
  const fbSubmit = () => { const payload = { ...fbForm, actual_hours: Number(fbForm.actual_hours) || 0, worker_count: Number(fbForm.worker_count) || 0 }; fbEditId ? fbUpdateMut.mutate({ id: fbEditId, data: payload }) : fbCreateMut.mutate(payload) }

  const projectName = (id: string) => projects?.items?.find((p: any) => p.id === id)?.name ?? id

  const filterBar = (
    <div className="flex gap-2 mb-4">
      <Select value={filterProject} onValueChange={(v) => { setFilterProject(v === "_all" ? "" : (v ?? "")); setPage(1); setFbPage(1) }}>
        <SelectTrigger className="w-48"><SelectValue placeholder="全部项目" /></SelectTrigger>
        <SelectContent><SelectItem value="_all">全部项目</SelectItem>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
      </Select>
      <Input type="date" className="w-40" value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setPage(1); setFbPage(1) }} />
    </div>
  )

  const pagination = (p: number, setP: (v: number) => void, hasMore: boolean) => (
    <div className="flex items-center justify-end gap-2 mt-4">
      <Button size="sm" variant="outline" disabled={p <= 1} onClick={() => setP(p - 1)}>上一页</Button>
      <span className="text-sm text-muted-foreground">{p}</span>
      <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => setP(p + 1)}>下一页</Button>
    </div>
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>日计划与反馈</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新增计划</Button>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="plans">日计划</TabsTrigger>
            <TabsTrigger value="feedback">日报反馈</TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="mt-4">
            {filterBar}
            {isLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <Table>
                <TableHeader><TableRow><TableHead className="w-6" /><TableHead>日期</TableHead><TableHead>项目</TableHead><TableHead>天气</TableHead><TableHead>任务</TableHead><TableHead>材料</TableHead><TableHead>工时</TableHead><TableHead>负责人</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data?.items?.map((p: any) => (
                    <>
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => setExpandedPlan(expandedPlan === p.id ? null : p.id)}>
                        <TableCell>{expandedPlan === p.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                        <TableCell>{p.plan_date ? format(new Date(p.plan_date), "yyyy-MM-dd") : ""}</TableCell>
                        <TableCell className="max-w-32 truncate">{projectName(p.project_id)}</TableCell>
                        <TableCell>{weatherLabel[p.weather] ?? p.weather}</TableCell>
                        <TableCell className="max-w-40 truncate">{p.tasks}</TableCell>
                        <TableCell className="max-w-32 truncate">{p.materials}</TableCell>
                        <TableCell>{p.estimated_hours}</TableCell>
                        <TableCell>{users?.items?.find((u: any) => u.id === p.assigned_to)?.real_name ?? "-"}</TableCell>
                        <TableCell><Badge variant={statusVariant[p.status] ?? "secondary"}>{statusLabel[p.status] ?? p.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedPlan === p.id && (
                        <TableRow key={`${p.id}-fb`}>
                          <TableCell colSpan={10} className="bg-muted/30 px-8 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">反馈记录</span>
                              <Button size="sm" variant="outline" onClick={() => openFbCreate(p.id, p.project_id, p.plan_date)}><MessageSquare className="mr-1 h-3 w-3" />写反馈</Button>
                            </div>
                            {p.feedbacks && p.feedbacks.length > 0 ? (
                              <div className="space-y-2">
                                {p.feedbacks.map((fb: any) => (
                                  <div key={fb.id} className="flex items-start gap-3 p-2 rounded border text-sm">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium">{fb.feedback_date}</span>
                                        <Badge variant={statusVariant[fb.status] ?? "secondary"} className="text-[10px]">{statusLabel[fb.status] ?? fb.status}</Badge>
                                        <span className="text-muted-foreground">{fb.actual_hours}h / {fb.worker_count}人</span>
                                      </div>
                                      <p className="text-muted-foreground">{fb.completed_tasks || "无完成记录"}</p>
                                      {fb.issues && <p className="text-amber-600 mt-1">问题: {fb.issues}</p>}
                                    </div>
                                    <div className="flex gap-1">
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openFbEdit(fb)}><Pencil className="h-3 w-3" /></Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">暂无反馈，点击上方按钮添加</p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}
            {pagination(page, setPage, !!data && data.items.length >= 20)}
          </TabsContent>

          <TabsContent value="feedback" className="mt-4">
            {filterBar}
            {fbLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <Table>
                <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>项目</TableHead><TableHead>完成情况</TableHead><TableHead>问题</TableHead><TableHead>工时</TableHead><TableHead>人数</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                <TableBody>
                  {fbData?.items?.map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell>{f.feedback_date ? format(new Date(f.feedback_date), "yyyy-MM-dd") : ""}</TableCell>
                      <TableCell>{projectName(f.project_id)}</TableCell>
                      <TableCell className="max-w-40 truncate">{f.completed_tasks}</TableCell>
                      <TableCell className="max-w-40 truncate">{f.issues}</TableCell>
                      <TableCell>{f.actual_hours}</TableCell>
                      <TableCell>{f.worker_count}</TableCell>
                      <TableCell><Badge variant={statusVariant[f.status] ?? "secondary"}>{statusLabel[f.status] ?? f.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openFbEdit(f)}><Pencil className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setFbDeleteId(f.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {pagination(fbPage, setFbPage, !!fbData && fbData.items.length >= 20)}
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "编辑" : "新增"}日计划</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>项目</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>关联周计划</Label>
              <Select value={form.weekly_plan_id} onValueChange={(v) => setForm((f) => ({ ...f, weekly_plan_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择周计划" /></SelectTrigger>
                <SelectContent>{weeklyPlans?.items?.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.week_start ?? w.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>日期</Label><Input type="date" value={form.plan_date} onChange={(e) => setForm((f) => ({ ...f, plan_date: e.target.value }))} /></div>
            <div><Label>天气</Label>
              <Select value={form.weather} onValueChange={(v) => setForm((f) => ({ ...f, weather: v ?? "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(weatherLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>温度(℃)</Label><Input type="number" value={form.temperature} onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))} /></div>
              <div><Label>预计工时</Label><Input type="number" value={form.estimated_hours} onChange={(e) => setForm((f) => ({ ...f, estimated_hours: e.target.value }))} /></div>
            </div>
            <div><Label>任务</Label><Textarea value={form.tasks} onChange={(e) => setForm((f) => ({ ...f, tasks: e.target.value }))} rows={3} /></div>
            <div><Label>材料</Label><Textarea value={form.materials} onChange={(e) => setForm((f) => ({ ...f, materials: e.target.value }))} rows={2} /></div>
            <div><Label>负责人</Label>
              <Select value={form.assigned_to} onValueChange={(v) => setForm((f) => ({ ...f, assigned_to: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择负责人" /></SelectTrigger>
                <SelectContent>{users?.items?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.real_name ?? u.username}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fbDialogOpen} onOpenChange={setFbDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{fbEditId ? "编辑" : "新增"}反馈</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>项目</Label>
              <Select value={fbForm.project_id} onValueChange={(v) => setFbForm((f) => ({ ...f, project_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>日期</Label><Input type="date" value={fbForm.feedback_date} onChange={(e) => setFbForm((f) => ({ ...f, feedback_date: e.target.value }))} /></div>
            <div><Label>完成情况</Label><Textarea value={fbForm.completed_tasks} onChange={(e) => setFbForm((f) => ({ ...f, completed_tasks: e.target.value }))} rows={2} /></div>
            <div><Label>问题与风险</Label><Textarea value={fbForm.issues} onChange={(e) => setFbForm((f) => ({ ...f, issues: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>实际工时</Label><Input type="number" value={fbForm.actual_hours} onChange={(e) => setFbForm((f) => ({ ...f, actual_hours: e.target.value }))} /></div>
              <div><Label>人数</Label><Input type="number" value={fbForm.worker_count} onChange={(e) => setFbForm((f) => ({ ...f, worker_count: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFbDialogOpen(false)}>取消</Button>
            <Button onClick={fbSubmit} disabled={fbCreateMut.isPending || fbUpdateMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除此日计划吗？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteId) deleteMut.mutate(deleteId) }}>确认删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!fbDeleteId} onOpenChange={() => setFbDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除此反馈吗？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (fbDeleteId) fbDeleteMut.mutate(fbDeleteId) }}>确认删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
