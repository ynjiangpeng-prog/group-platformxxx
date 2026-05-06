import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { listProjects, listProcurementApprovals, createProcurementApproval, updateProcurementApproval } from "@/api/project";
import type { ProcurementApproval } from "@/api/types";

export default function ProcurementPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [projectId, setProjectId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", total_amount: "", status: "pending" });

  const { data: projectData } = useQuery({ queryKey: ["projects-select"], queryFn: () => listProjects({ page: 1, page_size: 100 }) });
  const { data, isLoading } = useQuery({ queryKey: ["procurement-approvals", projectId, page], queryFn: () => listProcurementApprovals(projectId, { page, page_size: 20 }), enabled: !!projectId });

  const createMut = useMutation({ mutationFn: (d: Partial<ProcurementApproval>) => createProcurementApproval({ ...d, project_id: projectId }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["procurement-approvals", projectId] }); toast.success("已创建"); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, ...data }: { id: string; [k: string]: any }) => updateProcurementApproval(projectId, id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["procurement-approvals", projectId] }); toast.success("已更新"); setDialogOpen(false); } });

  function openCreate() { setEditId(null); setForm({ title: "", total_amount: "", status: "pending" }); setDialogOpen(true); }
  function openEdit(item: ProcurementApproval) { setEditId(item.id); setForm({ title: item.title ?? "", total_amount: String(item.total_amount ?? ""), status: item.status ?? "pending" }); setDialogOpen(true); }
  function submit() {
    const payload = { title: form.title, total_amount: Number(form.total_amount) || 0, status: form.status };
    editId ? updateMut.mutate({ id: editId, ...payload }) : createMut.mutate(payload);
  }

  return (
    <Card>
      <CardHeader><CardTitle>采购审批</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 mb-4">
          <div>
            <Label>项目</Label>
            <select className="border rounded-md px-3 py-2 text-sm bg-background" value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1); }}>
              <option value="">选择项目</option>
              {projectData?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <Button onClick={openCreate} disabled={!projectId}><Plus className="mr-1 h-4 w-4" />新建</Button>
        </div>
        {isLoading ? <Skeleton className="h-64 w-full" /> : (
          <>
            <Table>
              <TableHeader><TableRow><TableHead>标题</TableHead><TableHead>金额</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>{item.total_amount}</TableCell>
                    <TableCell><Badge variant={item.status === "approved" ? "default" : "secondary"}>{item.status}</Badge></TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(item)}><Pencil className="h-3 w-3" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
              <span className="text-sm text-muted-foreground">{page}</span>
              <Button size="sm" variant="outline" disabled={!data || data.items.length < 20} onClick={() => setPage((p) => p + 1)}>下一页</Button>
            </div>
          </>
        )}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "编辑" : "新建"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>标题</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>金额</Label><Input type="number" value={form.total_amount} onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
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
