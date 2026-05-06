import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, FileText, Eye } from "lucide-react";
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

const statusLabel: Record<string, string> = { draft: "草稿", submitted: "已提交", approved: "已审批", rejected: "已驳回" };
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = { draft: "secondary", submitted: "default", approved: "default", rejected: "destructive" };

export default function PoPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState("");
  const [form, setForm] = useState({ supplier_id: "", items: "", total_amount: "", delivery_date: "" });

  const { data, isLoading } = useQuery({ queryKey: ["purchase-orders", page], queryFn: () => api.listPurchaseOrders({ page, page_size: 20 }) });
  const { data: suppliers } = useQuery({ queryKey: ["suppliers-opts"], queryFn: () => api.listSuppliers({ page_size: 200 }) });
  const { data: detail } = useQuery({ queryKey: ["purchase-order", detailId], queryFn: () => api.getPurchaseOrder(detailId), enabled: !!detailId });
  const createMut = useMutation({ mutationFn: api.createPurchaseOrder, onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); toast.success("采购单已创建"); setDialogOpen(false); } });
  const genContractMut = useMutation({ mutationFn: api.generateContract, onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-orders"] }); toast.success("合同已生成"); } });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>采购订单</CardTitle>
        <Button onClick={() => { setForm({ supplier_id: "", items: "", total_amount: "", delivery_date: "" }); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />新建订单</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>订单号</TableHead><TableHead>供应商</TableHead><TableHead>金额</TableHead><TableHead>交货日期</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((po: any) => (
              <TableRow key={po.id}>
                <TableCell>{po.order_number ?? po.id}</TableCell>
                <TableCell>{po.supplier_name ?? po.supplier_id}</TableCell>
                <TableCell>¥{Number(po.total_amount ?? 0).toLocaleString()}</TableCell>
                <TableCell>{po.delivery_date ? format(new Date(po.delivery_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell><Badge variant={statusVariant[po.status] ?? "secondary"}>{statusLabel[po.status] ?? po.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setDetailId(po.id); setDetailOpen(true); }}><Eye className="h-3 w-3" /></Button>
                    {po.status === "approved" && <Button size="sm" variant="outline" onClick={() => genContractMut.mutate(po.id)}><FileText className="mr-1 h-3 w-3" />生成合同</Button>}
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
        <DialogContent>
          <DialogHeader><DialogTitle>新建采购订单</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>供应商</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
                <SelectContent>{suppliers?.items?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>订单明细</Label><Textarea value={form.items} onChange={(e) => setForm((f) => ({ ...f, items: e.target.value }))} placeholder='[{"name":"材料","quantity":10,"unit_price":100}]' rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>总金额</Label><Input type="number" value={form.total_amount} onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
              <div><Label>交货日期</Label><Input type="date" value={form.delivery_date} onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => { const payload: any = { ...form, total_amount: Number(form.total_amount) || 0 }; if (form.items) { try { payload.items = JSON.parse(form.items); } catch { payload.items = []; } } createMut.mutate(payload); }} disabled={createMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>采购单详情</DialogTitle></DialogHeader>
          {detail && (
            <div className="grid gap-2 text-sm">
              <div><span className="text-muted-foreground">订单号：</span>{detail.order_number ?? detail.id}</div>
              <div><span className="text-muted-foreground">供应商：</span>{detail.supplier_name ?? detail.supplier_id}</div>
              <div><span className="text-muted-foreground">金额：</span>¥{Number(detail.total_amount ?? 0).toLocaleString()}</div>
              <div><span className="text-muted-foreground">交货日期：</span>{detail.delivery_date ? format(new Date(detail.delivery_date), "yyyy-MM-dd") : ""}</div>
              <div><span className="text-muted-foreground">状态：</span>{statusLabel[detail.status] ?? detail.status}</div>
              {detail.items && Array.isArray(detail.items) && (
                <div>
                  <div className="text-muted-foreground mb-1">明细：</div>
                  <Table>
                    <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>数量</TableHead><TableHead>单价</TableHead></TableRow></TableHeader>
                    <TableBody>{detail.items.map((item: any, i: number) => <TableRow key={i}><TableCell>{item.name}</TableCell><TableCell>{item.quantity}</TableCell><TableCell>¥{item.unit_price}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
