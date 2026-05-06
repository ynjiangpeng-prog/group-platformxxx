import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/business";
import * as projectApi from "@/api/project";
import * as orgApi from "@/api/organization";

const defaultForm = { project_id: "", daily_plan_id: "", feedback_date: "", completed_tasks: "", issues: "", actual_hours: "", worker_count: "", recorder_id: "", status: "draft" };
const statusLabel: Record<string, string> = { draft: "草稿", submitted: "已提交", confirmed: "已确认" };
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = { draft: "secondary", submitted: "default", confirmed: "default" };

export default function DailyFeedbackPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [form, setForm] = useState(defaultForm);

  const { data, isLoading } = useQuery({ queryKey: ["daily-feedbacks", page, filterProject, filterDate], queryFn: () => api.listDailyFeedbacks({ page, page_size: 20, project_id: filterProject || undefined, feedback_date: filterDate || undefined }) });
  const { data: projects } = useQuery({ queryKey: ["projects-opts"], queryFn: () => projectApi.listProjects({ page_size: 200 }) });
  const { data: plans } = useQuery({ queryKey: ["daily-plans-opts"], queryFn: () => api.listDailyPlans({ page_size: 200 }) });
  const { data: users } = useQuery({ queryKey: ["users-opts"], queryFn: () => orgApi.listUsers({ page_size: 200 }) });

  const createMut = useMutation({ mutationFn: api.createDailyFeedback, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-feedbacks"] }); toast.success("已创建"); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateDailyFeedback(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-feedbacks"] }); toast.success("已更新"); setDialogOpen(false); setEditId(null); } });
  const deleteMut = useMutation({ mutationFn: api.deleteDailyFeedback, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-feedbacks"] }); toast.success("已删除"); setDeleteId(null); } });

  const openCreate = () => { setForm(defaultForm); setEditId(null); setDialogOpen(true); };
  const openEdit = (item: any) => { setForm({ project_id: item.project_id ?? "", daily_plan_id: item.daily_plan_id ?? "", feedback_date: item.feedback_date ?? "", completed_tasks: item.completed_tasks ?? "", issues: item.issues ?? "", actual_hours: String(item.actual_hours ?? ""), worker_count: String(item.worker_count ?? ""), recorder_id: item.recorder_id ?? "", status: item.status ?? "draft" }); setEditId(item.id); setDialogOpen(true); };
  const submit = () => { const payload = { ...form, actual_hours: Number(form.actual_hours) || 0, worker_count: Number(form.worker_count) || 0 }; editId ? updateMut.mutate({ id: editId, data: payload }) : createMut.mutate(payload); };

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>每日反馈</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新增</Button>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Select value={filterProject} onValueChange={(v) => { setFilterProject(v === "_all" ? "" : (v ?? "")); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="全部项目" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">全部项目</SelectItem>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" className="w-40" value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setPage(1); }} />
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>项目</TableHead><TableHead>完成情况</TableHead><TableHead>问题</TableHead><TableHead>工时</TableHead><TableHead>人数</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.items?.map((f: any) => (
              <TableRow key={f.id}>
                <TableCell>{f.feedback_date ? format(new Date(f.feedback_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell>{f.project_name ?? f.project_id}</TableCell>
                <TableCell className="max-w-40 truncate">{f.completed_tasks}</TableCell>
                <TableCell className="max-w-40 truncate">{f.issues}</TableCell>
                <TableCell>{f.actual_hours}</TableCell>
                <TableCell>{f.worker_count}</TableCell>
                <TableCell><Badge variant={statusVariant[f.status] ?? "secondary"}>{statusLabel[f.status] ?? f.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(f)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(f.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">{page}</span>
          <Button size="sm" variant="outline" disabled={!data || data.items.length < 20} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "编辑" : "新增"}反馈</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>项目</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>关联日计划</Label>
              <Select value={form.daily_plan_id} onValueChange={(v) => setForm((f) => ({ ...f, daily_plan_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择日计划" /></SelectTrigger>
                <SelectContent>{plans?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.plan_date ?? p.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>日期</Label><Input type="date" value={form.feedback_date} onChange={(e) => setForm((f) => ({ ...f, feedback_date: e.target.value }))} /></div>
            <div><Label>完成情况</Label><Textarea value={form.completed_tasks} onChange={(e) => setForm((f) => ({ ...f, completed_tasks: e.target.value }))} rows={2} /></div>
            <div><Label>问题</Label><Textarea value={form.issues} onChange={(e) => setForm((f) => ({ ...f, issues: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>实际工时</Label><Input type="number" value={form.actual_hours} onChange={(e) => setForm((f) => ({ ...f, actual_hours: e.target.value }))} /></div>
              <div><Label>人数</Label><Input type="number" value={form.worker_count} onChange={(e) => setForm((f) => ({ ...f, worker_count: e.target.value }))} /></div>
            </div>
            <div><Label>记录人</Label>
              <Select value={form.recorder_id} onValueChange={(v) => setForm((f) => ({ ...f, recorder_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择记录人" /></SelectTrigger>
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除此记录吗？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteId) deleteMut.mutate(deleteId); }}>确认删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
