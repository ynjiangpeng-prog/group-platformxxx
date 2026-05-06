import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { listProjects, listDailyBudgets, createDailyBudget, updateDailyBudget, deleteDailyBudget } from "@/api/project"
import type { DailyBudget } from "@/api/types"

export default function DailyBudgetPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [projectId, setProjectId] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<DailyBudget | null>(null)
  const [form, setForm] = useState<Partial<DailyBudget>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: projectData } = useQuery({
    queryKey: ["projects-select"],
    queryFn: () => listProjects({ page: 1, page_size: 100 }),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["daily-budgets", projectId, page],
    queryFn: () => listDailyBudgets(projectId, { page, page_size: 10 }),
    enabled: !!projectId,
  })

  const saveMutation = useMutation({
    mutationFn: (vars: { id?: string; data: Partial<DailyBudget> }) => {
      if (vars.id) return updateDailyBudget(projectId, vars.id, vars.data)
      return createDailyBudget({ ...vars.data, project_id: projectId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-budgets", projectId] })
      toast.success(editItem ? "更新成功" : "创建成功")
      setDialogOpen(false)
      setEditItem(null)
      setForm({})
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDailyBudget(projectId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-budgets", projectId] })
      toast.success("删除成功")
      setDeleteId(null)
    },
  })

  const openCreate = () => {
    setEditItem(null)
    setForm({})
    setDialogOpen(true)
  }

  const openEdit = (item: DailyBudget) => {
    setEditItem(item)
    setForm({ ...item })
    setDialogOpen(true)
  }

  const handleSubmit = () => {
    saveMutation.mutate({ id: editItem?.id, data: form })
  }

  const totalPages = data ? Math.ceil(data.total / 10) : 1

  return (
    <Card>
      <CardHeader>
        <CardTitle>每日预算</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <Select value={projectId} onValueChange={(v) => { setProjectId(v ?? ""); setPage(1) }}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="选择项目" />
            </SelectTrigger>
            <SelectContent>
              {projectData?.items.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button onClick={openCreate} disabled={!projectId}><Plus />新建</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日期</TableHead>
              <TableHead>类别</TableHead>
              <TableHead>计划金额</TableHead>
              <TableHead>实际金额</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!projectId ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">请先选择项目</TableCell>
              </TableRow>
            ) : isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.items.length ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无数据</TableCell>
              </TableRow>
            ) : (
              data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.budget_date}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell>{item.planned_amount?.toLocaleString()}</TableCell>
                  <TableCell>{item.actual_amount?.toLocaleString() ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(item.id)}><Trash2 className="size-3.5" /></Button>
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

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditItem(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? "编辑预算" : "新建预算"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>日期</Label>
              <Input type="date" value={form.budget_date ?? ""} onChange={(e) => setForm((f) => ({ ...f, budget_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>类别</Label>
              <Input value={form.category ?? ""} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>计划金额</Label>
                <Input type="number" value={form.planned_amount ?? ""} onChange={(e) => setForm((f) => ({ ...f, planned_amount: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <div className="space-y-2">
                <Label>实际金额</Label>
                <Input type="number" value={form.actual_amount ?? ""} onChange={(e) => setForm((f) => ({ ...f, actual_amount: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={handleSubmit} disabled={saveMutation.isPending}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该预算记录吗？</AlertDialogDescription>
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
