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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/erp";

const statusLabel: Record<string, string> = { pending: "待质检", passed: "质检通过", failed: "质检不合格" };
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = { pending: "secondary", passed: "default", failed: "destructive" };

export default function ReceiptPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ po_id: "", received_date: "", items: "", notes: "" });

  const { data, isLoading } = useQuery({ queryKey: ["goods-receipts", page], queryFn: () => api.listGoodsReceipts({ page, page_size: 20 }) });
  const { data: pos } = useQuery({ queryKey: ["purchase-orders-opts"], queryFn: () => api.listPurchaseOrders({ page_size: 100 }) });
  const createMut = useMutation({ mutationFn: api.createGoodsReceipt, onSuccess: () => { qc.invalidateQueries({ queryKey: ["goods-receipts"] }); toast.success("收货单已创建"); setDialogOpen(false); } });
  const qualityMut = useMutation({ mutationFn: api.qualityPass, onSuccess: () => { qc.invalidateQueries({ queryKey: ["goods-receipts"] }); toast.success("质检已通过"); } });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>收货管理</CardTitle>
        <Button onClick={() => { setForm({ po_id: "", received_date: "", items: "", notes: "" }); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />新建收货</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>收货单号</TableHead><TableHead>采购单</TableHead><TableHead>收货日期</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.receipt_number ?? r.id}</TableCell>
                <TableCell>{r.po_number ?? r.po_id}</TableCell>
                <TableCell>{r.received_date ? format(new Date(r.received_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell><Badge variant={statusVariant[r.status] ?? "secondary"}>{statusLabel[r.status] ?? r.status}</Badge></TableCell>
                <TableCell>{r.status === "pending" && <Button size="sm" variant="outline" onClick={() => qualityMut.mutate(r.id)}><CheckCircle className="mr-1 h-3 w-3" />质检通过</Button>}</TableCell>
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
          <DialogHeader><DialogTitle>新建收货</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>采购单</Label>
              <Select value={form.po_id} onValueChange={(v) => setForm((f) => ({ ...f, po_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择采购单" /></SelectTrigger>
                <SelectContent>{pos?.items?.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.order_number ?? po.id}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>收货日期</Label><Input type="date" value={form.received_date} onChange={(e) => setForm((f) => ({ ...f, received_date: e.target.value }))} /></div>
            <div><Label>收货明细</Label><Textarea value={form.items} onChange={(e) => setForm((f) => ({ ...f, items: e.target.value }))} placeholder='[{"name":"材料名","quantity":10,"unit":"个"}]' rows={3} /></div>
            <div><Label>备注</Label><Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => { const payload: any = { ...form, received_date: form.received_date || undefined }; if (form.items) { try { payload.items = JSON.parse(form.items); } catch { payload.items = []; } } createMut.mutate(payload); }} disabled={createMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
