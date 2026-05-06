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
import * as api from "@/api/erp";

const defaultForm = { contract_no: "", name: "", party_a: "", party_b: "", total_amount: "", start_date: "", end_date: "", description: "" };

export default function ContractPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data, isLoading } = useQuery({ queryKey: ["contracts", page], queryFn: () => api.listContracts({ page, page_size: 20 }) });
  const createMut = useMutation({ mutationFn: api.createContract, onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); toast.success("合同已创建"); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, ...data }: { id: string; [k: string]: any }) => api.updateContract(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["contracts"] }); toast.success("合同已更新"); setDialogOpen(false); } });

  function openCreate() { setEditId(null); setForm(defaultForm); setDialogOpen(true); }
  function openEdit(c: any) { setEditId(c.id); setForm({ contract_no: c.contract_no ?? "", name: c.name ?? "", party_a: c.party_a ?? "", party_b: c.party_b ?? "", total_amount: String(c.total_amount ?? ""), start_date: c.start_date ?? "", end_date: c.end_date ?? "", description: c.description ?? "" }); setDialogOpen(true); }
  function submit() { editId ? updateMut.mutate({ id: editId, ...form, total_amount: Number(form.total_amount) || 0 }) : createMut.mutate({ ...form, total_amount: Number(form.total_amount) || 0 }); }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>合同管理</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新建合同</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>合同号</TableHead><TableHead>名称</TableHead><TableHead>甲方</TableHead><TableHead>乙方</TableHead><TableHead>金额</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell>{c.contract_no}</TableCell><TableCell>{c.name}</TableCell>
                <TableCell>{c.party_a}</TableCell><TableCell>{c.party_b}</TableCell>
                <TableCell>{c.total_amount}</TableCell>
                <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button></TableCell>
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
          <DialogHeader><DialogTitle>{editId ? "编辑合同" : "新建合同"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>合同号</Label><Input value={form.contract_no} onChange={(e) => setForm((f) => ({ ...f, contract_no: e.target.value }))} /></div>
            <div><Label>名称</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>甲方</Label><Input value={form.party_a} onChange={(e) => setForm((f) => ({ ...f, party_a: e.target.value }))} /></div>
              <div><Label>乙方</Label><Input value={form.party_b} onChange={(e) => setForm((f) => ({ ...f, party_b: e.target.value }))} /></div>
            </div>
            <div><Label>金额</Label><Input type="number" value={form.total_amount} onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>开始日期</Label><Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
              <div><Label>结束日期</Label><Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
            </div>
            <div><Label>备注</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
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
