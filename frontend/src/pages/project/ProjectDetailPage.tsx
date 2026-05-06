import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, DollarSign, TrendingUp } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from "recharts"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { getProject, updateProject, updateProjectProgress, listMilestones, createMilestone, updateMilestone, deleteMilestone, getProjectCostSummary } from "@/api/project"
import type { Project, Milestone } from "@/api/types"

const COST_TYPE_LABELS: Record<string, string> = {
  travel: "差旅",
  petty_cash: "备用金",
  salary: "工资",
  contract: "合同",
  equipment: "设备",
  other: "其他",
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  planning: { label: "规划中", variant: "secondary" },
  in_progress: { label: "进行中", variant: "default" },
  completed: { label: "已完成", variant: "outline" },
  on_hold: { label: "已暂停", variant: "destructive" },
}

const typeMap: Record<string, string> = {
  construction: "施工",
  renovation: "装修",
  maintenance: "维修",
  design: "设计",
}

const milestoneStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "待完成", variant: "secondary" },
  in_progress: { label: "进行中", variant: "default" },
  completed: { label: "已完成", variant: "outline" },
}

function ProjectCostTab({ projectId, budget }: { projectId: string; budget?: number }) {
  const navigate = useNavigate()
  const { data: cost, isLoading } = useQuery({
    queryKey: ["project-cost-summary", projectId],
    queryFn: () => getProjectCostSummary(projectId),
  })

  if (isLoading) {
    return <Skeleton className="h-64 w-full mt-4" />
  }

  const usageRate = cost?.budget_usage_rate ?? 0
  const byTypeEntries = Object.entries(cost?.by_type ?? {})
  const barData = byTypeEntries.map(([k, v]) => ({ name: COST_TYPE_LABELS[k] ?? k, value: v }))
  const monthlyTrend = cost?.monthly_trend ?? []

  return (
    <div className="mt-4 space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Card className="overflow-hidden relative">
          <div className="absolute inset-0 bg-blue-500 opacity-[0.03]" />
          <CardContent className="p-4 relative">
            <p className="text-sm text-muted-foreground">总成本</p>
            <p className="text-xl font-bold tabular-nums">¥{(cost?.total_cost ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden relative">
          <div className="absolute inset-0 bg-emerald-500 opacity-[0.03]" />
          <CardContent className="p-4 relative">
            <p className="text-sm text-muted-foreground">预算</p>
            <p className="text-xl font-bold tabular-nums">¥{(cost?.budget ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden relative">
          <div className="absolute inset-0 bg-violet-500 opacity-[0.03]" />
          <CardContent className="p-4 relative">
            <p className="text-sm text-muted-foreground">预算使用率</p>
            <p className={`text-xl font-bold tabular-nums ${usageRate >= 90 ? "text-red-500" : usageRate >= 70 ? "text-amber-500" : "text-emerald-500"}`}>
              {usageRate.toFixed(1)}%
            </p>
            <div className="mt-1 h-2 w-full rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${usageRate >= 90 ? "bg-red-500" : usageRate >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(usageRate, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <div className="flex items-center justify-center">
          <Button variant="outline" onClick={() => navigate(`/project/${projectId}/cost`)}>
            <DollarSign className="size-4" />查看完整成本报表
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">成本分类</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={50} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(v: any) => [`¥${Number(v ?? 0).toLocaleString()}`, "金额"]}
                />
                <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">月度趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(v: any, name: any) => [
                    `¥${Number(v ?? 0).toLocaleString()}`,
                    name === "cost" ? "月度成本" : "累计成本",
                  ]}
                />
                <Bar dataKey="cost" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="accumulated" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Partial<Project>>({})
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const [editMilestone, setEditMilestone] = useState<Milestone | null>(null)
  const [milestoneForm, setMilestoneForm] = useState<Partial<Milestone>>({})
  const [deleteMilestoneId, setDeleteMilestoneId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  })

  const { data: milestoneData } = useQuery({
    queryKey: ["milestones", id],
    queryFn: () => listMilestones(id!, { page: 1, page_size: 100 }),
    enabled: !!id,
  })

  useEffect(() => {
    if (project) {
      setForm({ ...project })
      setProgress(project.progress)
    }
  }, [project])

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Project>) => updateProject(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] })
      toast.success("更新成功")
    },
  })

  const progressMutation = useMutation({
    mutationFn: (p: number) => updateProjectProgress(id!, { progress: p }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] })
      toast.success("进度已更新")
    },
  })

  const milestoneSaveMutation = useMutation({
    mutationFn: (vars: { mid?: string; data: Partial<Milestone> }) => {
      if (vars.mid) return updateMilestone(id!, vars.mid, vars.data)
      return createMilestone(id!, vars.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones", id] })
      toast.success("保存成功")
      setMilestoneDialogOpen(false)
      setEditMilestone(null)
      setMilestoneForm({})
    },
  })

  const milestoneDeleteMutation = useMutation({
    mutationFn: (mid: string) => deleteMilestone(id!, mid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones", id] })
      toast.success("删除成功")
      setDeleteMilestoneId(null)
    },
  })

  const openCreateMilestone = () => {
    setEditMilestone(null)
    setMilestoneForm({})
    setMilestoneDialogOpen(true)
  }

  const openEditMilestone = (m: Milestone) => {
    setEditMilestone(m)
    setMilestoneForm({ ...m })
    setMilestoneDialogOpen(true)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-32 mb-8" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!project) return null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>{project.name}</CardTitle>
            <Badge variant={statusMap[project.status]?.variant ?? "outline"}>
              {statusMap[project.status]?.label ?? project.status}
            </Badge>
            <span className="text-sm text-muted-foreground">{project.project_code}</span>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info">基本信息</TabsTrigger>
              <TabsTrigger value="milestones">里程碑</TabsTrigger>
              <TabsTrigger value="cost">成本归集</TabsTrigger>
              <TabsTrigger value="progress">进度</TabsTrigger>
            </TabsList>

            <TabsContent value="info">
              <div className="grid gap-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>项目编号</Label>
                    <Input value={form.project_code ?? ""} onChange={(e) => setForm((f) => ({ ...f, project_code: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>项目名称</Label>
                    <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>项目类型</Label>
                    <Select value={form.project_type ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, project_type: v ?? "" }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(typeMap).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>状态</Label>
                    <Select value={form.status ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? "" }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusMap).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>优先级</Label>
                    <Input type="number" value={form.priority ?? ""} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value ? Number(e.target.value) : undefined }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>总预算</Label>
                    <Input type="number" value={form.total_budget ?? ""} onChange={(e) => setForm((f) => ({ ...f, total_budget: e.target.value ? Number(e.target.value) : undefined }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>开始日期</Label>
                    <Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>结束日期</Label>
                    <Input type="date" value={form.end_date ?? ""} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>省份</Label>
                    <Input value={form.province ?? ""} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>城市</Label>
                    <Input value={form.city ?? ""} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>地址</Label>
                    <Input value={form.address ?? ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>描述</Label>
                  <Textarea value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <Separator />
                <div className="flex justify-end">
                  <Button onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending}>保存修改</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="milestones">
              <div className="mt-4">
                <div className="flex justify-end mb-4">
                  <Button onClick={openCreateMilestone}><Plus />新建里程碑</Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>计划日期</TableHead>
                      <TableHead>实际日期</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!milestoneData?.items.length ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无里程碑</TableCell>
                      </TableRow>
                    ) : (
                      milestoneData.items.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>{m.name}</TableCell>
                          <TableCell>{m.planned_date}</TableCell>
                          <TableCell>{m.actual_date ?? "-"}</TableCell>
                          <TableCell>
                            <Badge variant={milestoneStatusMap[m.status]?.variant ?? "outline"}>
                              {milestoneStatusMap[m.status]?.label ?? m.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon-sm" onClick={() => openEditMilestone(m)}><Pencil className="size-3.5" /></Button>
                              <Button variant="ghost" size="icon-sm" onClick={() => setDeleteMilestoneId(m.id)}><Trash2 className="size-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="cost">
              <ProjectCostTab projectId={id!} budget={project.total_budget} />
            </TabsContent>

            <TabsContent value="progress">
              <div className="mt-4 space-y-6 max-w-lg">
                <div className="flex items-center gap-4">
                  <Label className="w-20 shrink-0">当前进度</Label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-16 text-right font-medium">{progress}%</span>
                </div>
                <div className="flex items-center gap-4">
                  <Label className="w-20 shrink-0">精确输入</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={progress}
                    onChange={(e) => setProgress(Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <div className="h-3 w-full rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
                <Button onClick={() => progressMutation.mutate(progress)} disabled={progressMutation.isPending}>更新进度</Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={milestoneDialogOpen} onOpenChange={(o) => { setMilestoneDialogOpen(o); if (!o) setEditMilestone(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editMilestone ? "编辑里程碑" : "新建里程碑"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={milestoneForm.name ?? ""} onChange={(e) => setMilestoneForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>计划日期</Label>
                <Input type="date" value={milestoneForm.planned_date ?? ""} onChange={(e) => setMilestoneForm((f) => ({ ...f, planned_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>实际日期</Label>
                <Input type="date" value={milestoneForm.actual_date ?? ""} onChange={(e) => setMilestoneForm((f) => ({ ...f, actual_date: e.target.value || undefined }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={milestoneForm.status ?? ""} onValueChange={(v) => setMilestoneForm((f) => ({ ...f, status: v ?? "" }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="选择状态" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(milestoneStatusMap).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={() => milestoneSaveMutation.mutate({ mid: editMilestone?.id, data: milestoneForm })} disabled={milestoneSaveMutation.isPending}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteMilestoneId} onOpenChange={(o) => { if (!o) setDeleteMilestoneId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该里程碑吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMilestoneId && milestoneDeleteMutation.mutate(deleteMilestoneId)}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
