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

const defaultForm = { project_id: "", week_start: "", week_end: "", week_no: "", objectives: "", key_tasks: "", resource_plan: "", risk_assessment: "", status: "draft", reviewer_id: "" };
const statusLabel: Record<string, string> = { draft: "草稿", submitted: "已提交", approved: "已审批", rejected: "已驳回" };
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = { draft: "secondary", submitted: "default", approved: "default", rejected: "destructive" };

export default function WeeklyPlanPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [form, setForm] = useState(defaultForm);

  const { data, isLoading } = useQuery({ queryKey: ["weekly-plans", page, filterProject, filterStatus], queryFn: () => api.listWeeklyPlans({ page, page_size: 20, project_id: filterProject || undefined, status: filterStatus || undefined }) });
  const { data: projects } = useQuery({ queryKey: ["projects-opts"], queryFn: () => projectApi.listProjects({ page_size: 200 }) });
  const { data: users } = useQuery({ queryKey: ["users-opts"], queryFn: () => orgApi.listUsers({ page_size: 200 }) });

  const createMut = useMutation({ mutationFn: api.createWeeklyPlan, onSuccess: () => { qc.invalidateQueries({ queryKey: ["weekly-plans"] }); toast.success("已创建"); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateWeeklyPlan(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["weekly-plans"] }); toast.success("已更新"); setDialogOpen(false); setEditId(null); } });
  const deleteMut = useMutation({ mutationFn: api.deleteWeeklyPlan, onSuccess: () => { qc.invalidateQueries({ queryKey: ["weekly-plans"] }); toast.success("已删除"); setDeleteId(null); } });

  const openCreate = () => { setForm(defaultForm); setEditId(null); setDialogOpen(true); };
  const openEdit = (item: any) => { setForm({ project_id: item.project_id ?? "", week_start: item.week_start ?? "", week_end: item.week_end ?? "", week_no: String(item.week_no ?? ""), objectives: item.objectives ?? "", key_tasks: item.key_tasks ?? "", resource_plan: item.resource_plan ?? "", risk_assessment: item.risk_assessment ?? "", status: item.status ?? "draft", reviewer_id: item.reviewer_id ?? "" }); setEditId(item.id); setDialogOpen(true); };
  const submit = () => { const payload = { ...form, week_no: Number(form.week_no) || 0 }; editId ? updateMut.mutate({ id: editId, data: payload }) : createMut.mutate(payload); };

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>周计划</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新增</Button>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Select value={filterProject} onValueChange={(v) => { setFilterProject(v === "_all" ? "" : (v ?? "")); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="全部项目" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">全部项目</SelectItem>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === "_all" ? "" : (v ?? "")); setPage(1); }}>
            <SelectTrigger className="w-32"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">全部状态</SelectItem>{Object.entries(statusLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>周次</TableHead><TableHead>项目</TableHead><TableHead>开始</TableHead><TableHead>结束</TableHead><TableHead>目标</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.items?.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>第{p.week_no ?? "?"}周</TableCell>
                <TableCell>{p.project_name ?? p.project_id}</TableCell>
                <TableCell>{p.week_start ? format(new Date(p.week_start), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell>{p.week_end ? format(new Date(p.week_end), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell className="max-w-48 truncate">{p.objectives}</TableCell>
                <TableCell><Badge variant={statusVariant[p.status] ?? "secondary"}>{statusLabel[p.status] ?? p.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>{editId ? "编辑" : "新增"}周计划</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>项目</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>开始日期</Label><Input type="date" value={form.week_start} onChange={(e) => setForm((f) => ({ ...f, week_start: e.target.value }))} /></div>
              <div><Label>结束日期</Label><Input type="date" value={form.week_end} onChange={(e) => setForm((f) => ({ ...f, week_end: e.target.value }))} /></div>
              <div><Label>周次</Label><Input type="number" value={form.week_no} onChange={(e) => setForm((f) => ({ ...f, week_no: e.target.value }))} /></div>
            </div>
            <div><Label>目标</Label><Textarea value={form.objectives} onChange={(e) => setForm((f) => ({ ...f, objectives: e.target.value }))} rows={3} /></div>
            <div><Label>关键任务</Label><Textarea value={form.key_tasks} onChange={(e) => setForm((f) => ({ ...f, key_tasks: e.target.value }))} rows={3} /></div>
            <div><Label>资源计划</Label><Textarea value={form.resource_plan} onChange={(e) => setForm((f) => ({ ...f, resource_plan: e.target.value }))} rows={2} /></div>
            <div><Label>风险评估</Label><Textarea value={form.risk_assessment} onChange={(e) => setForm((f) => ({ ...f, risk_assessment: e.target.value }))} rows={2} /></div>
            <div><Label>审核人</Label>
              <Select value={form.reviewer_id} onValueChange={(v) => setForm((f) => ({ ...f, reviewer_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择审核人" /></SelectTrigger>
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
