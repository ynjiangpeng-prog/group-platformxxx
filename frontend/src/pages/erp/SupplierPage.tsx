import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/erp";

const defaultForm = { name: "", code: "", contact_person: "", contact_phone: "", address: "", status: "active" };

export default function SupplierPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data, isLoading } = useQuery({ queryKey: ["suppliers", page], queryFn: () => api.listSuppliers({ page, page_size: 20 }) });
  const createMut = useMutation({ mutationFn: api.createSupplier, onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("供应商已创建"); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, ...data }: { id: string; [k: string]: any }) => api.updateSupplier(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("供应商已更新"); setDialogOpen(false); } });
  const deleteMut = useMutation({ mutationFn: api.deleteSupplier, onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("供应商已删除"); } });

  function openCreate() { setEditId(null); setForm(defaultForm); setDialogOpen(true); }
  function openEdit(s: any) { setEditId(s.id); setForm({ name: s.name ?? "", code: s.code ?? "", contact_person: s.contact_person ?? "", contact_phone: s.contact_phone ?? "", address: s.address ?? "", status: s.status ?? "active" }); setDialogOpen(true); }
  function submit() { editId ? updateMut.mutate({ id: editId, name: form.name, code: form.code, contact_person: form.contact_person, contact_phone: form.contact_phone, status: form.status === "active" ? 1 : 0 } as any) : createMut.mutate({ name: form.name, code: form.code, contact_person: form.contact_person, contact_phone: form.contact_phone, status: form.status === "active" ? 1 : 0 } as any); }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>供应商管理</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新建供应商</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>名称</TableHead><TableHead>编码</TableHead><TableHead>联系人</TableHead><TableHead>联系电话</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell>{s.name}</TableCell><TableCell>{s.code}</TableCell>
                <TableCell>{s.contact_person}</TableCell><TableCell>{s.contact_phone}</TableCell>
                <TableCell><Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status === "active" ? "启用" : "停用"}</Badge></TableCell>
                <TableCell className="space-x-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => deleteMut.mutate(s.id)}><Trash2 className="h-3 w-3" /></Button>
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
          <DialogHeader><DialogTitle>{editId ? "编辑供应商" : "新建供应商"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>名称</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>编码</Label><Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>
            <div><Label>联系人</Label><Input value={form.contact_person} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} /></div>
            <div><Label>联系电话</Label><Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} /></div>
            <div><Label>地址</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
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
