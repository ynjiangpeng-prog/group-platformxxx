import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Send, CheckCircle, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/erp";

const statusConfig: Record<string, { label: string; variant: "secondary" | "default" | "destructive" }> = {
  draft: { label: "草稿", variant: "secondary" },
  submitted: { label: "待审批", variant: "default" },
  approved: { label: "已批准", variant: "default" },
  rejected: { label: "已拒绝", variant: "destructive" },
};

export default function ProcurementPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", total_amount: "", items: "" });

  const { data, isLoading } = useQuery({ queryKey: ["procurement", page], queryFn: () => api.listProcurementRequests({ page, page_size: 20 }) });
  const createMut = useMutation({ mutationFn: api.createProcurementRequest, onSuccess: () => { qc.invalidateQueries({ queryKey: ["procurement"] }); toast.success("已创建"); setDialogOpen(false); } });
  const submitMut = useMutation({ mutationFn: api.submitProcurementRequest, onSuccess: () => { qc.invalidateQueries({ queryKey: ["procurement"] }); toast.success("已提交"); } });
  const approveMut = useMutation({ mutationFn: (id: string) => api.approveProcurementRequest(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["procurement"] }); toast.success("已批准"); } });
  const rejectMut = useMutation({ mutationFn: (id: string) => api.rejectProcurementRequest(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["procurement"] }); toast.success("已驳回"); } });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>采购申请</CardTitle>
        <Button onClick={() => { setForm({ title: "", description: "", total_amount: "", items: "" }); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />新建申请</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>标题</TableHead><TableHead>申请人</TableHead><TableHead>状态</TableHead><TableHead>金额</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.items?.map((r: any) => {
              const sc = statusConfig[r.status] ?? { label: r.status, variant: "secondary" as const };
              return (
                <TableRow key={r.id}>
                  <TableCell>{r.title}</TableCell><TableCell>{r.requester}</TableCell>
                  <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                  <TableCell>{r.total_amount}</TableCell>
                  <TableCell className="space-x-1">
                    {r.status === "draft" && <Button size="sm" variant="outline" onClick={() => submitMut.mutate(r.id)}><Send className="h-3 w-3 mr-1" />提交</Button>}
                    {r.status === "submitted" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => approveMut.mutate(r.id)}><CheckCircle className="h-3 w-3 mr-1" />批准</Button>
                        <Button size="sm" variant="outline" onClick={() => rejectMut.mutate(r.id)}><XCircle className="h-3 w-3 mr-1" />拒绝</Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
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
          <DialogHeader><DialogTitle>新建采购申请</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>标题</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>总金额</Label><Input type="number" value={form.total_amount} onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
            <div><Label>说明</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({ title: form.title, total_amount: Number(form.total_amount) || 0, description: form.description || undefined } as any)} disabled={createMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
