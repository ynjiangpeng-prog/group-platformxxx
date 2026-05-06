import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/business";

const defaultForm = { project: "", permit_type: "", permit_no: "", permit_name: "", issuing_authority: "", apply_date: "", approve_date: "", status: "pending", description: "" };

export default function PermitPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data, isLoading } = useQuery({ queryKey: ["permits", page], queryFn: () => api.listProjectPermits({ page, page_size: 20 }) });
  const createMut = useMutation({ mutationFn: api.createProjectPermit, onSuccess: () => { qc.invalidateQueries({ queryKey: ["permits"] }); toast.success("许可证已创建"); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, ...data }: { id: string; [k: string]: any }) => api.updateProjectPermit(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["permits"] }); toast.success("许可证已更新"); setDialogOpen(false); } });

  function openCreate() { setEditId(null); setForm(defaultForm); setDialogOpen(true); }
  function openEdit(p: any) { setEditId(p.id); setForm({ project: p.project ?? "", permit_type: p.permit_type ?? "", permit_no: p.permit_no ?? "", permit_name: p.permit_name ?? "", issuing_authority: p.issuing_authority ?? "", apply_date: p.apply_date ?? "", approve_date: p.approve_date ?? "", status: p.status ?? "pending", description: p.description ?? "" }); setDialogOpen(true); }
  function submit() { editId ? updateMut.mutate({ id: editId, ...form }) : createMut.mutate(form); }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>项目许可</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新建许可</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>项目</TableHead><TableHead>许可类型</TableHead><TableHead>许可号</TableHead><TableHead>许可名称</TableHead><TableHead>发证机关</TableHead><TableHead>状态</TableHead><TableHead>申请日期</TableHead><TableHead>批准日期</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>{p.project}</TableCell><TableCell>{p.permit_type}</TableCell>
                <TableCell>{p.permit_no}</TableCell><TableCell>{p.permit_name}</TableCell>
                <TableCell>{p.issuing_authority}</TableCell>
                <TableCell><Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>{p.status === "approved" ? "已批准" : p.status === "rejected" ? "已拒绝" : "待审批"}</Badge></TableCell>
                <TableCell>{p.apply_date ? format(new Date(p.apply_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell>{p.approve_date ? format(new Date(p.approve_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button></TableCell>
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
          <DialogHeader><DialogTitle>{editId ? "编辑许可" : "新建许可"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>项目</Label><Input value={form.project} onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))} /></div>
            <div><Label>许可类型</Label><Input value={form.permit_type} onChange={(e) => setForm((f) => ({ ...f, permit_type: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>许可号</Label><Input value={form.permit_no} onChange={(e) => setForm((f) => ({ ...f, permit_no: e.target.value }))} /></div>
              <div><Label>许可名称</Label><Input value={form.permit_name} onChange={(e) => setForm((f) => ({ ...f, permit_name: e.target.value }))} /></div>
            </div>
            <div><Label>发证机关</Label><Input value={form.issuing_authority} onChange={(e) => setForm((f) => ({ ...f, issuing_authority: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>申请日期</Label><Input type="date" value={form.apply_date} onChange={(e) => setForm((f) => ({ ...f, apply_date: e.target.value }))} /></div>
              <div><Label>批准日期</Label><Input type="date" value={form.approve_date} onChange={(e) => setForm((f) => ({ ...f, approve_date: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
