import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Search, Zap, Loader2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { listProjects, createProject, updateProject, deleteProject } from "@/api/project"
import type { Project } from "@/api/types"

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  planning: { label: "规划中", variant: "secondary" },
  in_progress: { label: "进行中", variant: "default" },
  completed: { label: "已完成", variant: "outline" },
  on_hold: { label: "已暂停", variant: "destructive" },
  active: { label: "进行中", variant: "default" },
  paused: { label: "已暂停", variant: "destructive" },
  closed: { label: "已关闭", variant: "secondary" },
}

const typeMap: Record<string, string> = {
  construction: "施工",
  renovation: "装修",
  maintenance: "维修",
  design: "设计",
  pure_engineering: "纯工程",
  charging_epc: "充电站EPC",
  self_invest_build: "自投自建",
  cooperative_build: "合作共建",
  pure_epc: "纯工程EPC",
  hv_epc: "高压EPC",
  lv_epc: "低压EPC",
  equipment_sale: "设备销售",
  co_invest: "合作共投",
  full_invest: "全投",
}

export default function ProjectListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("all")
  const [keyword, setKeyword] = useState("")
  const [projectType, setProjectType] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<Project | null>(null)
  const [form, setForm] = useState<Partial<Project>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 快速创建
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickName, setQuickName] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["projects", page, status, keyword, projectType],
    queryFn: () =>
      listProjects({
        page,
        page_size: 10,
        ...(status !== "all" && { status }),
        ...(keyword && { keyword }),
        ...(projectType !== "all" && { project_type: projectType }),
      }),
  })

  const saveMutation = useMutation({
    mutationFn: (vars: { id?: string; data: Partial<Project> }) => {
      if (vars.id) return updateProject(vars.id, vars.data)
      return createProject(vars.data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      toast.success(editItem ? "更新成功" : "创建成功")
      setDialogOpen(false)
      setEditItem(null)
      setForm({})
    },
  })

  const quickCreateMutation = useMutation({
    mutationFn: (name: string) =>
      createProject({ name, project_type: "construction", status: "planning" } as Partial<Project>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      toast.success("项目快速创建成功")
      setQuickOpen(false)
      setQuickName("")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      toast.success("删除成功")
      setDeleteId(null)
    },
  })

  const openCreate = () => {
    setEditItem(null)
    setForm({})
    setDialogOpen(true)
  }

  const openEdit = (item: Project) => {
    setEditItem(item)
    setForm({ ...item })
    setDialogOpen(true)
  }

  const handleSubmit = () => {
    saveMutation.mutate({ id: editItem?.id, data: form })
  }

  const handleQuickCreate = () => {
    if (!quickName.trim()) return toast.warning("请输入项目名称")
    quickCreateMutation.mutate(quickName.trim())
  }

  const totalPages = data ? Math.ceil(data.total / 10) : 1

  return (
    <Card>
      <CardHeader>
        <CardTitle>项目管理</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <Select value={status} onValueChange={(v) => { setStatus(v ?? ""); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {Object.entries(statusMap).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projectType} onValueChange={(v) => { setProjectType(v ?? ""); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {Object.entries(typeMap).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="搜索项目..."
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
              className="pl-8 w-[200px]"
            />
          </div>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => setQuickOpen(true)}>
            <Zap className="size-4" />
            快速创建
          </Button>
          <Button onClick={() => navigate("/project/create")}><Plus />完整创建</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>项目编号</TableHead>
              <TableHead>项目名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>优先级</TableHead>
              <TableHead>进度</TableHead>
              <TableHead>总预算</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.items.length ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">暂无数据</TableCell>
              </TableRow>
            ) : (
              data.items.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/project/${p.id}`)}
                >
                  <TableCell>{p.project_code || "-"}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Badge variant="secondary">{typeMap[p.project_type] || p.project_type}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={statusMap[p.status]?.variant ?? "outline"}>
                      {statusMap[p.status]?.label ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.priority}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{p.progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{p.total_budget?.toLocaleString() ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)}><Pencil className="size-3.5" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(p.id)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted-foreground">共 {data?.total ?? 0} 条</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
          </div>
        </div>
      </CardContent>

      {/* 快速创建弹窗 */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>快速创建项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">只需输入项目名称即可快速创建，后续可在项目详情中补充信息。</p>
            <div className="space-y-2">
              <Label>项目名称 *</Label>
              <Input
                placeholder="输入项目名称"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuickCreate()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={handleQuickCreate} disabled={quickCreateMutation.isPending || !quickName.trim()}>
              {quickCreateMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              创建项目
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 项目信息编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditItem(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "编辑项目信息" : "新建项目"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>项目名称 *</Label>
                <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>项目编号</Label>
                <Input value={form.project_code ?? ""} onChange={(e) => setForm((f) => ({ ...f, project_code: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>项目类型</Label>
                <Select value={form.project_type ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, project_type: v ?? "" }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="选择类型" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeMap).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? "" }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="选择状态" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusMap).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>优先级</Label>
                <Select value={String(form.priority ?? 2)} onValueChange={(v) => setForm((f) => ({ ...f, priority: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">高</SelectItem>
                    <SelectItem value="2">普通</SelectItem>
                    <SelectItem value="3">低</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>开始日期</Label>
                <Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>结束日期</Label>
                <Input type="date" value={form.end_date ?? ""} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>省份</Label>
                <Input value={form.province ?? ""} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>城市</Label>
                <Input value={form.city ?? ""} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>地址</Label>
              <Input value={form.address ?? ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>总预算 (元)</Label>
                <Input type="number" value={form.total_budget ?? ""} onChange={(e) => setForm((f) => ({ ...f, total_budget: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <div className="space-y-2">
                <Label>对方公司</Label>
                <Input value={form.counterparty_company ?? ""} onChange={(e) => setForm((f) => ({ ...f, counterparty_company: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>项目描述</Label>
              <Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该项目吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
