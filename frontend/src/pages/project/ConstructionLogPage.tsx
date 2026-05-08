import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2 } from "lucide-react"
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
import { listProjects, listConstructionLogs, createConstructionLog, updateConstructionLog, deleteConstructionLog } from "@/api/project"
import type { ConstructionLog } from "@/api/types"

const weatherMap: Record<string, string> = {
  sunny: "晴",
  cloudy: "多云",
  rainy: "雨",
  snowy: "雪",
  windy: "大风",
}

export default function ConstructionLogPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [projectId, setProjectId] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<ConstructionLog | null>(null)
  const [form, setForm] = useState<Partial<ConstructionLog>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: projectData } = useQuery({
    queryKey: ["projects-select"],
    queryFn: () => listProjects({ page: 1, page_size: 100 }),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["construction-logs", projectId, page],
    queryFn: () => listConstructionLogs(projectId, { page, page_size: 10 }),
    enabled: !!projectId,
  })

  const saveMutation = useMutation({
    mutationFn: (vars: { id?: string; data: Partial<ConstructionLog> }) => {
      if (vars.id) return updateConstructionLog(projectId, vars.id, vars.data)
      return createConstructionLog({ ...vars.data, project_id: projectId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["construction-logs", projectId] })
      toast.success(editItem ? "更新成功" : "创建成功")
      setDialogOpen(false)
      setEditItem(null)
      setForm({})
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConstructionLog(projectId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["construction-logs", projectId] })
      toast.success("删除成功")
      setDeleteId(null)
    },
  })

  const openCreate = () => {
    setEditItem(null)
    setForm({})
    setDialogOpen(true)
  }

  const openEdit = (item: ConstructionLog) => {
    setEditItem(item)
    setForm({ ...item })
    setDialogOpen(true)
  }

  const handleSubmit = () => {
    const data = { ...form }
    if (data.log_date === "") data.log_date = undefined
    saveMutation.mutate({ id: editItem?.id, data })
  }

  const totalPages = data ? Math.ceil(data.total / 10) : 1

  return (
    <Card>
      <CardHeader>
        <CardTitle>施工日志</CardTitle>
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
              <TableHead>天气</TableHead>
              <TableHead>工作内容</TableHead>
              <TableHead>人数</TableHead>
              <TableHead>问题</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!projectId ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">请先选择项目</TableCell>
              </TableRow>
            ) : isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.items.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">暂无数据</TableCell>
              </TableRow>
            ) : (
              data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.log_date}</TableCell>
                  <TableCell><Badge variant="secondary">{weatherMap[item.weather ?? ""] ?? item.weather ?? "-"}</Badge></TableCell>
                  <TableCell className="max-w-[200px] truncate">{item.work_content}</TableCell>
                  <TableCell>{item.worker_count}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{item.quality_issues ?? "-"}</TableCell>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "编辑日志" : "新建日志"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>日期</Label>
                <Input type="date" value={form.log_date ?? ""} onChange={(e) => setForm((f) => ({ ...f, log_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>天气</Label>
                <Select value={form.weather ?? ""} onValueChange={(v) => setForm((f) => ({ ...f, weather: v ?? "" }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="选择天气" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(weatherMap).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>工作内容</Label>
              <Textarea value={form.work_content ?? ""} onChange={(e) => setForm((f) => ({ ...f, work_content: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>施工人数</Label>
              <Input type="number" value={form.worker_count ?? ""} onChange={(e) => setForm((f) => ({ ...f, worker_count: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="space-y-2">
              <Label>问题记录</Label>
              <Textarea value={form.quality_issues ?? ""} onChange={(e) => setForm((f) => ({ ...f, quality_issues: e.target.value }))} />
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
            <AlertDialogDescription>确定要删除该日志吗？</AlertDialogDescription>
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
