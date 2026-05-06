import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, MessageSquare, ChevronDown, ChevronRight, CheckCircle2, Circle, BarChart3 } from "lucide-react"
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
import { Separator } from "@/components/ui/separator"
import { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import * as api from "@/api/business"
import * as projectApi from "@/api/project"
import { listUsers } from "@/api/organization"

const statusLabel: Record<string, string> = { draft: "草稿", submitted: "已提交", confirmed: "已确认", completed: "已完成" }
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = { draft: "secondary", submitted: "default", confirmed: "default", completed: "default" }
const weatherLabel: Record<string, string> = { sunny: "晴", cloudy: "多云", rainy: "雨", snowy: "雪", windy: "大风", foggy: "雾" }

interface TargetItem { project_id: string; target: string; assigned_to: string }

const defaultWeekForm = { week_start: "", week_end: "", objectives: "", target_items: [] as TargetItem[], status: "draft" }
const defaultDayForm = { project_id: "", weekly_plan_id: "", plan_date: "", tasks: "", materials: "", weather: "sunny", temperature: "", estimated_hours: "", assigned_to: "", status: "draft" }
const defaultFbForm = { daily_plan_id: "", weekly_plan_id: "", completed_tasks: "", issues: "", actual_hours: "", worker_count: "", feedback_date: "" }

export default function PlanPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState("plans")
  const [weekPage, setWeekPage] = useState(1)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())

  const [weekDialog, setWeekDialog] = useState(false)
  const [weekEditId, setWeekEditId] = useState<string | null>(null)
  const [weekDeleteId, setWeekDeleteId] = useState<string | null>(null)
  const [weekForm, setWeekForm] = useState(defaultWeekForm)

  const [dayDialog, setDayDialog] = useState(false)
  const [dayEditId, setDayEditId] = useState<string | null>(null)
  const [dayDeleteId, setDayDeleteId] = useState<string | null>(null)
  const [dayForm, setDayForm] = useState(defaultDayForm)

  const [fbDialog, setFbDialog] = useState(false)
  const [fbEditId, setFbEditId] = useState<string | null>(null)
  const [fbDeleteId, setFbDeleteId] = useState<string | null>(null)
  const [fbForm, setFbForm] = useState(defaultFbForm)

  const { data: weekData, isLoading: weekLoading } = useQuery({ queryKey: ["weekly-plans", weekPage], queryFn: () => api.listWeeklyPlans({ page: weekPage, page_size: 50 }) })
  const { data: allDailyPlans } = useQuery({ queryKey: ["daily-plans-all"], queryFn: () => api.listDailyPlans({ page: 1, page_size: 500 }) })
  const { data: allFeedbacks } = useQuery({ queryKey: ["daily-feedbacks-all"], queryFn: () => api.listDailyFeedbacks({ page: 1, page_size: 500 }) })
  const { data: projects } = useQuery({ queryKey: ["projects-opts"], queryFn: () => projectApi.listProjects({ page_size: 200 }) })
  const { data: users } = useQuery({ queryKey: ["users-opts"], queryFn: () => listUsers({ page_size: 200 }) })

  const dailyPlansByWeek = useMemo(() => {
    const map: Record<string, any[]> = {}
    if (!allDailyPlans?.items) return map
    for (const dp of allDailyPlans.items) {
      const wid = dp.weekly_plan_id || "__none__"
      if (!map[wid]) map[wid] = []
      map[wid].push(dp)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a: any, b: any) => (a.plan_date > b.plan_date ? 1 : -1))
    }
    return map
  }, [allDailyPlans])

  const feedbacksByDailyPlan = useMemo(() => {
    const map: Record<string, any> = {}
    if (!allFeedbacks?.items) return map
    for (const fb of allFeedbacks.items as any[]) {
      map[fb.daily_plan_id] = fb
    }
    return map
  }, [allFeedbacks])

  const projectName = (id: string) => projects?.items?.find((p: any) => p.id === id)?.name ?? id
  const userName = (id: string) => users?.items?.find((u: any) => u.id === id)?.real_name ?? id

  const getWeekFeedbackStats = (weekId: string) => {
    const plans = dailyPlansByWeek[weekId] || []
    const total = plans.length
    const withFeedback = plans.filter((p: any) => feedbacksByDailyPlan[p.id]).length
    return { total, withFeedback }
  }

  const overallStats = useMemo(() => {
    const allPlans = allDailyPlans?.items || []
    const total = allPlans.length
    const withFeedback = allPlans.filter((p: any) => feedbacksByDailyPlan[p.id]).length
    return { total, withFeedback, rate: total > 0 ? Math.round((withFeedback / total) * 100) : 0 }
  }, [allDailyPlans, feedbacksByDailyPlan])

  const weekCreateMut = useMutation({ mutationFn: api.createWeeklyPlan, onSuccess: () => { qc.invalidateQueries({ queryKey: ["weekly-plans"] }); toast.success("周计划已创建"); setWeekDialog(false) } })
  const weekUpdateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateWeeklyPlan(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["weekly-plans"] }); toast.success("周计划已更新"); setWeekDialog(false); setWeekEditId(null) } })
  const weekDeleteMut = useMutation({ mutationFn: api.deleteWeeklyPlan, onSuccess: () => { qc.invalidateQueries({ queryKey: ["weekly-plans"] }); toast.success("已删除"); setWeekDeleteId(null) } })

  const dayCreateMut = useMutation({ mutationFn: api.createDailyPlan, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-plans-all"] }); toast.success("日计划已创建"); setDayDialog(false) } })
  const dayUpdateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateDailyPlan(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-plans-all"] }); toast.success("日计划已更新"); setDayDialog(false); setDayEditId(null) } })
  const dayDeleteMut = useMutation({ mutationFn: api.deleteDailyPlan, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-plans-all"] }); toast.success("已删除"); setDayDeleteId(null) } })

  const fbCreateMut = useMutation({ mutationFn: api.createDailyFeedback, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-feedbacks-all"] }); toast.success("反馈已提交"); setFbDialog(false) } })
  const fbUpdateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateDailyFeedback(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-feedbacks-all"] }); toast.success("反馈已更新"); setFbDialog(false); setFbEditId(null) } })
  const fbDeleteMut = useMutation({ mutationFn: api.deleteDailyFeedback, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-feedbacks-all"] }); toast.success("已删除"); setFbDeleteId(null) } })

  const toggleWeek = (id: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openWeekCreate = () => { setWeekForm({ ...defaultWeekForm, target_items: [] }); setWeekEditId(null); setWeekDialog(true) }
  const openWeekEdit = (item: any) => {
    let targets: TargetItem[] = []
    try { targets = typeof item.target_items === "string" ? JSON.parse(item.target_items) : (Array.isArray(item.target_items) ? item.target_items : []) } catch { targets = [] }
    setWeekForm({ week_start: item.week_start ?? "", week_end: item.week_end ?? "", objectives: item.objectives ?? "", target_items: targets, status: item.status ?? "draft" })
    setWeekEditId(item.id); setWeekDialog(true)
  }
  const weekSubmit = () => {
    const payload = { ...weekForm }
    editId: weekEditId ? weekUpdateMut.mutate({ id: weekEditId, data: payload }) : weekCreateMut.mutate(payload)
  }

  const addTargetItem = () => setWeekForm((f) => ({ ...f, target_items: [...f.target_items, { project_id: "", target: "", assigned_to: "" }] }))
  const updateTargetItem = (idx: number, field: keyof TargetItem, val: string) => setWeekForm((f) => {
    const items = [...f.target_items]
    items[idx] = { ...items[idx], [field]: val }
    return { ...f, target_items: items }
  })
  const removeTargetItem = (idx: number) => setWeekForm((f) => ({ ...f, target_items: f.target_items.filter((_, i) => i !== idx) }))

  const openDayCreate = (weekId: string) => { setDayForm({ ...defaultDayForm, weekly_plan_id: weekId }); setDayEditId(null); setDayDialog(true) }
  const openDayEdit = (item: any) => {
    setDayForm({ project_id: item.project_id ?? "", weekly_plan_id: item.weekly_plan_id ?? "", plan_date: item.plan_date ?? "", tasks: item.tasks ?? "", materials: item.materials ?? "", weather: item.weather ?? "sunny", temperature: String(item.temperature ?? ""), estimated_hours: String(item.estimated_hours ?? ""), assigned_to: item.assigned_to ?? "", status: item.status ?? "draft" })
    setDayEditId(item.id); setDayDialog(true)
  }
  const daySubmit = () => {
    const payload = { ...dayForm, estimated_hours: Number(dayForm.estimated_hours) || 0, temperature: dayForm.temperature || undefined }
    dayEditId ? dayUpdateMut.mutate({ id: dayEditId, data: payload }) : dayCreateMut.mutate(payload)
  }

  const openFbCreate = (dailyPlanId: string, weeklyPlanId: string, planDate: string) => {
    setFbForm({ ...defaultFbForm, daily_plan_id: dailyPlanId, weekly_plan_id: weeklyPlanId, feedback_date: planDate })
    setFbEditId(null); setFbDialog(true)
  }
  const openFbEdit = (fb: any) => {
    setFbForm({ daily_plan_id: fb.daily_plan_id ?? "", weekly_plan_id: fb.weekly_plan_id ?? "", completed_tasks: fb.completed_tasks ?? "", issues: fb.issues ?? "", actual_hours: String(fb.actual_hours ?? ""), worker_count: String(fb.worker_count ?? ""), feedback_date: fb.feedback_date ?? "" })
    setFbEditId(fb.id); setFbDialog(true)
  }
  const fbSubmit = () => {
    const payload = { ...fbForm, actual_hours: Number(fbForm.actual_hours) || 0, worker_count: Number(fbForm.worker_count) || 0 }
    fbEditId ? fbUpdateMut.mutate({ id: fbEditId, data: payload }) : fbCreateMut.mutate(payload)
  }

  if (weekLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>计划管理</CardTitle>
        <Button onClick={openWeekCreate}><Plus className="mr-1 h-4 w-4" />新增周计划</Button>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="plans">周计划与日计划</TabsTrigger>
            <TabsTrigger value="dashboard">反馈闭环看板</TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="mt-4 space-y-2">
            {weekData?.items?.map((week: any) => {
              const expanded = expandedWeeks.has(week.id)
              const stats = getWeekFeedbackStats(week.id)
              const plans = dailyPlansByWeek[week.id] || []
              return (
                <div key={week.id} className="border rounded-lg">
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleWeek(week.id)}>
                    {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="font-medium text-sm whitespace-nowrap">
                      {week.week_start ? format(new Date(week.week_start), "yyyy-MM-dd") : "?"} ~ {week.week_end ? format(new Date(week.week_end), "yyyy-MM-dd") : "?"}
                    </span>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="text-sm text-muted-foreground truncate flex-1">目标: {week.objectives || "无"}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{stats.withFeedback}/{stats.total}天已反馈</span>
                    <Badge variant={statusVariant[week.status] ?? "secondary"}>{statusLabel[week.status] ?? week.status}</Badge>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openWeekEdit(week)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setWeekDeleteId(week.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t bg-muted/20">
                      {plans.length === 0 ? (
                        <div className="px-8 py-4 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">暂无日计划</span>
                          <Button size="sm" variant="outline" onClick={() => openDayCreate(week.id)}><Plus className="mr-1 h-3 w-3" />新增日计划</Button>
                        </div>
                      ) : (
                        <>
                          <div className="px-8 py-2 flex justify-end">
                            <Button size="sm" variant="outline" onClick={() => openDayCreate(week.id)}><Plus className="mr-1 h-3 w-3" />新增日计划</Button>
                          </div>
                          {plans.map((dp: any) => {
                            const fb = feedbacksByDailyPlan[dp.id]
                            return (
                              <div key={dp.id} className="flex items-center gap-3 px-8 py-2 border-t hover:bg-muted/30 transition-colors">
                                <span className="text-sm w-24 shrink-0">{dp.plan_date ? format(new Date(dp.plan_date), "yyyy-MM-dd") : ""}</span>
                                <span className="text-sm w-28 shrink-0 truncate">[{projectName(dp.project_id)}]</span>
                                <span className="text-sm flex-1 truncate">{dp.tasks || "无任务"}</span>
                                <span className="text-xs text-muted-foreground w-16 shrink-0">{weatherLabel[dp.weather] ?? dp.weather ?? ""}</span>
                                <span className="text-xs text-muted-foreground w-16 shrink-0">{userName(dp.assigned_to)}</span>
                                <Badge variant={statusVariant[dp.status] ?? "secondary"} className="text-[10px]">{statusLabel[dp.status] ?? dp.status}</Badge>
                                {fb ? (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    <span className="text-xs text-green-600">已反馈</span>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-1" onClick={() => openFbEdit(fb)}><Pencil className="h-3 w-3" /></Button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => openFbCreate(dp.id, week.id, dp.plan_date)}>
                                    <MessageSquare className="mr-1 h-3 w-3" />反馈
                                  </Button>
                                )}
                                <div className="flex gap-1 shrink-0">
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openDayEdit(dp)}><Pencil className="h-3 w-3" /></Button>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDayDeleteId(dp.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                                </div>
                              </div>
                            )
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button size="sm" variant="outline" disabled={weekPage <= 1} onClick={() => setWeekPage((p) => p - 1)}>上一页</Button>
              <span className="text-sm text-muted-foreground">{weekPage}</span>
              <Button size="sm" variant="outline" disabled={!weekData || weekData.items.length < 50} onClick={() => setWeekPage((p) => p + 1)}>下一页</Button>
            </div>
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">日计划总数</div>
                <div className="text-2xl font-bold">{overallStats.total}</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">已反馈</div>
                <div className="text-2xl font-bold text-green-600">{overallStats.withFeedback}</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-sm text-muted-foreground mb-1">未反馈</div>
                <div className="text-2xl font-bold text-amber-600">{overallStats.total - overallStats.withFeedback}</div>
              </div>
            </div>

            <div className="border rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">反馈完成率</span>
                <span className="text-sm text-muted-foreground">{overallStats.rate}%</span>
              </div>
              <Progress value={overallStats.rate}>
                <ProgressLabel />
                <ProgressValue />
                <ProgressTrack>
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
            </div>

            <div className="border rounded-lg">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="text-sm font-medium">按周计划统计</span>
              </div>
              {weekData?.items?.map((week: any) => {
                const stats = getWeekFeedbackStats(week.id)
                const rate = stats.total > 0 ? Math.round((stats.withFeedback / stats.total) * 100) : 0
                return (
                  <div key={week.id} className="px-4 py-3 border-b last:border-b-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">
                        {week.week_start ? format(new Date(week.week_start), "MM-dd") : "?"} ~ {week.week_end ? format(new Date(week.week_end), "MM-dd") : "?"}
                      </span>
                      <span className="text-xs text-muted-foreground">{stats.withFeedback}/{stats.total}天</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={weekDialog} onOpenChange={setWeekDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{weekEditId ? "编辑" : "新增"}周计划</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>开始日期</Label><Input type="date" value={weekForm.week_start} onChange={(e) => setWeekForm((f) => ({ ...f, week_start: e.target.value }))} /></div>
              <div><Label>结束日期</Label><Input type="date" value={weekForm.week_end} onChange={(e) => setWeekForm((f) => ({ ...f, week_end: e.target.value }))} /></div>
            </div>
            <div><Label>目标</Label><Textarea value={weekForm.objectives} onChange={(e) => setWeekForm((f) => ({ ...f, objectives: e.target.value }))} rows={3} /></div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>目标项</Label>
                <Button size="sm" variant="outline" type="button" onClick={addTargetItem}><Plus className="mr-1 h-3 w-3" />添加</Button>
              </div>
              {weekForm.target_items.length === 0 && <p className="text-sm text-muted-foreground">暂无目标项，点击上方按钮添加</p>}
              <div className="space-y-2">
                {weekForm.target_items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <div>
                      {idx === 0 && <Label className="text-xs">项目</Label>}
                      <Select value={item.project_id} onValueChange={(v) => updateTargetItem(idx, "project_id", v ?? "")}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="选择项目" /></SelectTrigger>
                        <SelectContent>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      {idx === 0 && <Label className="text-xs">目标</Label>}
                      <div className="flex gap-1">
                        <Input className="h-8" value={item.target} onChange={(e) => updateTargetItem(idx, "target", e.target.value)} />
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={() => removeTargetItem(idx)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    <div className="w-32">
                      {idx === 0 && <Label className="text-xs">负责人</Label>}
                      <Select value={item.assigned_to} onValueChange={(v) => updateTargetItem(idx, "assigned_to", v ?? "")}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="选择" /></SelectTrigger>
                        <SelectContent>{users?.items?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.real_name ?? u.username}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div><Label>状态</Label>
              <Select value={weekForm.status} onValueChange={(v) => setWeekForm((f) => ({ ...f, status: v ?? "draft" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(statusLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWeekDialog(false)}>取消</Button>
            <Button onClick={weekSubmit} disabled={weekCreateMut.isPending || weekUpdateMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dayDialog} onOpenChange={setDayDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{dayEditId ? "编辑" : "新增"}日计划</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>项目</Label>
              <Select value={dayForm.project_id} onValueChange={(v) => setDayForm((f) => ({ ...f, project_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>日期</Label><Input type="date" value={dayForm.plan_date} onChange={(e) => setDayForm((f) => ({ ...f, plan_date: e.target.value }))} /></div>
            <div><Label>天气</Label>
              <Select value={dayForm.weather} onValueChange={(v) => setDayForm((f) => ({ ...f, weather: v ?? "sunny" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(weatherLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>温度(℃)</Label><Input type="number" value={dayForm.temperature} onChange={(e) => setDayForm((f) => ({ ...f, temperature: e.target.value }))} /></div>
              <div><Label>预计工时</Label><Input type="number" value={dayForm.estimated_hours} onChange={(e) => setDayForm((f) => ({ ...f, estimated_hours: e.target.value }))} /></div>
            </div>
            <div><Label>任务</Label><Textarea value={dayForm.tasks} onChange={(e) => setDayForm((f) => ({ ...f, tasks: e.target.value }))} rows={3} /></div>
            <div><Label>材料</Label><Textarea value={dayForm.materials} onChange={(e) => setDayForm((f) => ({ ...f, materials: e.target.value }))} rows={2} /></div>
            <div><Label>负责人</Label>
              <Select value={dayForm.assigned_to} onValueChange={(v) => setDayForm((f) => ({ ...f, assigned_to: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择负责人" /></SelectTrigger>
                <SelectContent>{users?.items?.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.real_name ?? u.username}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>状态</Label>
              <Select value={dayForm.status} onValueChange={(v) => setDayForm((f) => ({ ...f, status: v ?? "draft" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(statusLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDayDialog(false)}>取消</Button>
            <Button onClick={daySubmit} disabled={dayCreateMut.isPending || dayUpdateMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fbDialog} onOpenChange={setFbDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{fbEditId ? "编辑" : "新增"}反馈</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>日期</Label><Input type="date" value={fbForm.feedback_date} onChange={(e) => setFbForm((f) => ({ ...f, feedback_date: e.target.value }))} /></div>
            <div><Label>完成情况</Label><Textarea value={fbForm.completed_tasks} onChange={(e) => setFbForm((f) => ({ ...f, completed_tasks: e.target.value }))} rows={3} /></div>
            <div><Label>问题与风险</Label><Textarea value={fbForm.issues} onChange={(e) => setFbForm((f) => ({ ...f, issues: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>实际工时</Label><Input type="number" value={fbForm.actual_hours} onChange={(e) => setFbForm((f) => ({ ...f, actual_hours: e.target.value }))} /></div>
              <div><Label>人数</Label><Input type="number" value={fbForm.worker_count} onChange={(e) => setFbForm((f) => ({ ...f, worker_count: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFbDialog(false)}>取消</Button>
            <Button onClick={fbSubmit} disabled={fbCreateMut.isPending || fbUpdateMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!weekDeleteId} onOpenChange={() => setWeekDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除此周计划吗？关联的日计划不会自动删除。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (weekDeleteId) weekDeleteMut.mutate(weekDeleteId) }}>确认删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!dayDeleteId} onOpenChange={() => setDayDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除此日计划吗？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (dayDeleteId) dayDeleteMut.mutate(dayDeleteId) }}>确认删除</AlertDialogAction></AlertDialogFooter>
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
