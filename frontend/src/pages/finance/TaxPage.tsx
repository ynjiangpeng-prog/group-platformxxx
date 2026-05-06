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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/finance";

export default function TaxPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ tax_type: "", period: "", taxable_amount: "", tax_amount: "", description: "" });

  const { data, isLoading } = useQuery({ queryKey: ["tax", page], queryFn: () => api.listTax({ page, page_size: 20 }) });
  const createMut = useMutation({ mutationFn: api.createTax, onSuccess: () => { qc.invalidateQueries({ queryKey: ["tax"] }); toast.success("已创建"); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, ...data }: { id: string; [k: string]: any }) => api.updateTax(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tax"] }); toast.success("已更新"); setDialogOpen(false); } });

  function openCreate() { setEditId(null); setForm({ tax_type: "", period: "", taxable_amount: "", tax_amount: "", description: "" }); setDialogOpen(true); }
  function openEdit(r: any) { setEditId(r.id); setForm({ tax_type: r.tax_type ?? "", period: r.period ?? "", taxable_amount: String(r.taxable_amount ?? ""), tax_amount: String(r.tax_amount ?? ""), description: r.description ?? "" }); setDialogOpen(true); }
  function submit() { editId ? updateMut.mutate({ id: editId, ...form, taxable_amount: Number(form.taxable_amount) || 0, tax_amount: Number(form.tax_amount) || 0 }) : createMut.mutate({ ...form, taxable_amount: Number(form.taxable_amount) || 0, tax_amount: Number(form.tax_amount) || 0 }); }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>税务管理</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新建</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>税种</TableHead>
              <TableHead>期间</TableHead>
              <TableHead>应税金额</TableHead>
              <TableHead>税额</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.tax_type}</TableCell>
                <TableCell>{r.period}</TableCell>
                <TableCell>{r.taxable_amount}</TableCell>
                <TableCell>{r.tax_amount}</TableCell>
                <TableCell><Badge variant={r.status === "filed" ? "default" : "secondary"}>{r.status === "filed" ? "已申报" : "未申报"}</Badge></TableCell>
                <TableCell>{r.status !== "filed" && <Button size="sm" variant="outline" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>}</TableCell>
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
          <DialogHeader><DialogTitle>{editId ? "编辑税务记录" : "新建税务记录"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>税种</Label>
              <Select value={form.tax_type} onValueChange={(v) => setForm((f) => ({ ...f, tax_type: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择税种" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vat">增值税</SelectItem>
                  <SelectItem value="income_tax">企业所得税</SelectItem>
                  <SelectItem value="surcharge">附加税</SelectItem>
                  <SelectItem value="stamp_duty">印花税</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>期间</Label><Input placeholder="如 2026-04" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} /></div>
            <div><Label>应税金额</Label><Input type="number" value={form.taxable_amount} onChange={(e) => setForm((f) => ({ ...f, taxable_amount: e.target.value }))} /></div>
            <div><Label>税额</Label><Input type="number" value={form.tax_amount} onChange={(e) => setForm((f) => ({ ...f, tax_amount: e.target.value }))} /></div>
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
