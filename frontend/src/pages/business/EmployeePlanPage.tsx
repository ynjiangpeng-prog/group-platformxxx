import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/business";

export default function EmployeePlanPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [form, setForm] = useState({ plan_date: "", employee_id: "", tasks: "" });

  const { data, isLoading } = useQuery({ queryKey: ["employee-plans", page], queryFn: () => api.listEmployeePlans({ page, page_size: 20 }) });
  const createMut = useMutation({ mutationFn: api.createEmployeePlan, onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-plans"] }); toast.success("计划已创建"); setDialogOpen(false); } });
  const completeMut = useMutation({ mutationFn: ({ id, ...data }: { id: string; [k: string]: any }) => api.completeEmployeePlan(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-plans"] }); toast.success("已完成"); setCompleteOpen(false); } });

  function openComplete(id: string) { setCompleteId(id); setCompletionNote(""); setCompleteOpen(true); }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>员工日计划</CardTitle>
        <Button onClick={() => { setForm({ plan_date: "", employee_id: "", tasks: "" }); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />新建计划</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>日期</TableHead><TableHead>员工</TableHead><TableHead>任务</TableHead><TableHead>状态</TableHead><TableHead>完成备注</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>{p.plan_date ? format(new Date(p.plan_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell>{p.employee_id}</TableCell>
                <TableCell className="max-w-[200px] truncate">{typeof p.tasks === "object" ? JSON.stringify(p.tasks) : p.tasks}</TableCell>
                <TableCell><Badge variant={p.status === "completed" ? "default" : "secondary"}>{p.status === "completed" ? "已完成" : "进行中"}</Badge></TableCell>
                <TableCell className="max-w-[200px] truncate">{p.completion_note ?? "-"}</TableCell>
                <TableCell>
                  {p.status !== "completed" && <Button size="sm" variant="outline" onClick={() => openComplete(p.id)}><CheckCircle className="h-3 w-3 mr-1" />完成</Button>}
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
        <DialogContent>
          <DialogHeader><DialogTitle>新建员工计划</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>日期</Label><Input type="date" value={form.plan_date} onChange={(e) => setForm((f) => ({ ...f, plan_date: e.target.value }))} /></div>
            <div><Label>员工</Label><Input value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))} /></div>
            <div><Label>任务</Label><Textarea value={form.tasks} onChange={(e) => setForm((f) => ({ ...f, tasks: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => { let tasks: any = {}; if (form.tasks) { try { tasks = JSON.parse(form.tasks); } catch { tasks = { text: form.tasks }; } } createMut.mutate({ ...form, tasks, plan_date: form.plan_date || undefined }); }} disabled={createMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>完成任务</DialogTitle></DialogHeader>
          <div><Label>完成备注</Label><Textarea value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>取消</Button>
            <Button onClick={() => completeMut.mutate({ id: completeId!, completion_note: completionNote })} disabled={completeMut.isPending}>确认完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
