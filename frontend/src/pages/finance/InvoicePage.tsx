import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import * as api from "@/api/finance";

const statusMap: Record<string, string> = { draft: "草稿", issued: "已开具", paid: "已付款", void: "已作废" };
const checkStatusMap: Record<string, string> = { unchecked: "未查验", pending: "查验中", passed: "已通过", failed: "未通过" };
const invoiceTypeMap: Record<string, string> = { sales: "销售", purchase: "采购", credit: "红冲", debit: "红字通知" };

export default function InvoicePage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    invoice_type: "sales",
    direction: "out",
    invoice_code: "",
    invoice_no: "",
    issue_date: "",
    seller_name: "",
    buyer_name: "",
    amount_before_tax: "",
    tax_rate: "13",
    tax_amount: "",
    total_amount: "",
    check_status: "unchecked",
    contract_id: "",
    purchase_order_id: "",
    voucher_id: "",
    arap_id: "",
    status: "draft"
  });

  const { data, isLoading } = useQuery({ queryKey: ["invoices", page], queryFn: () => api.listInvoices({ page, page_size: 20 }) });
  const createMut = useMutation({ mutationFn: api.createInvoice, onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); toast.success("发票已创建"); setDialogOpen(false); } });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>发票管理</CardTitle>
        <Button onClick={() => { setForm({ invoice_type: "sales", direction: "out", invoice_code: "", invoice_no: "", issue_date: "", seller_name: "", buyer_name: "", amount_before_tax: "", tax_rate: "13", tax_amount: "", total_amount: "", check_status: "unchecked", contract_id: "", purchase_order_id: "", voucher_id: "", arap_id: "", status: "draft" }); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />新建发票</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>发票代码</TableHead>
              <TableHead>发票号</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>方向</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>税额</TableHead>
              <TableHead>交易方</TableHead>
              <TableHead>日期</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((inv: any) => (
              <TableRow key={inv.id}>
                <TableCell>{inv.invoice_code}</TableCell>
                <TableCell>{inv.invoice_no}</TableCell>
                <TableCell>{invoiceTypeMap[inv.invoice_type] ?? inv.invoice_type}</TableCell>
                <TableCell><Badge variant={inv.direction === "out" ? "default" : "secondary"}>{inv.direction === "out" ? "开票" : "收票"}</Badge></TableCell>
                <TableCell>{inv.total_amount}</TableCell>
                <TableCell>{inv.tax_amount}</TableCell>
                <TableCell>{inv.direction === "out" ? inv.buyer_name : inv.seller_name}</TableCell>
                <TableCell>{inv.issue_date ? format(new Date(inv.issue_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell><Badge variant={inv.status === "paid" ? "default" : "secondary"}>{statusMap[inv.status] ?? inv.status}</Badge></TableCell>
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新建发票</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">基本信息</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>发票类型</Label>
                  <Select value={form.invoice_type} onValueChange={(v) => setForm((f) => ({ ...f, invoice_type: v ?? "sales" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">销售</SelectItem>
                      <SelectItem value="purchase">采购</SelectItem>
                      <SelectItem value="credit">红冲</SelectItem>
                      <SelectItem value="debit">红字通知</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>方向</Label>
                  <Select value={form.direction} onValueChange={(v) => setForm((f) => ({ ...f, direction: v ?? "out" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="out">开票(销)</SelectItem>
                      <SelectItem value="in">收票(进)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>发票代码</Label><Input value={form.invoice_code} onChange={(e) => setForm((f) => ({ ...f, invoice_code: e.target.value }))} placeholder="如: 1100194130" /></div>
                <div><Label>发票号码</Label><Input value={form.invoice_no} onChange={(e) => setForm((f) => ({ ...f, invoice_no: e.target.value }))} placeholder="如: 12345678" /></div>
                <div><Label>开票日期</Label><Input type="date" value={form.issue_date} onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">交易信息</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>销售方名称</Label><Input value={form.seller_name} onChange={(e) => setForm((f) => ({ ...f, seller_name: e.target.value }))} /></div>
                <div><Label>购买方名称</Label><Input value={form.buyer_name} onChange={(e) => setForm((f) => ({ ...f, buyer_name: e.target.value }))} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">金额信息</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>不含税金额</Label><Input type="number" value={form.amount_before_tax} onChange={(e) => setForm((f) => ({ ...f, amount_before_tax: e.target.value }))} /></div>
                <div><Label>税率(%)</Label><Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))} placeholder="13" /></div>
                <div><Label>税额</Label><Input type="number" value={form.tax_amount} onChange={(e) => setForm((f) => ({ ...f, tax_amount: e.target.value }))} /></div>
                <div><Label>价税合计</Label><Input type="number" value={form.total_amount} onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">关联信息</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>查验状态</Label>
                  <Select value={form.check_status} onValueChange={(v) => setForm((f) => ({ ...f, check_status: v ?? "unchecked" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unchecked">未查验</SelectItem>
                      <SelectItem value="pending">查验中</SelectItem>
                      <SelectItem value="passed">已通过</SelectItem>
                      <SelectItem value="failed">未通过</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>状态</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? "draft" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">草稿</SelectItem>
                      <SelectItem value="issued">已开具</SelectItem>
                      <SelectItem value="paid">已付款</SelectItem>
                      <SelectItem value="void">已作废</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>合同编号</Label><Input value={form.contract_id} onChange={(e) => setForm((f) => ({ ...f, contract_id: e.target.value }))} /></div>
                <div><Label>采购订单</Label><Input value={form.purchase_order_id} onChange={(e) => setForm((f) => ({ ...f, purchase_order_id: e.target.value }))} /></div>
                <div><Label>凭证编号</Label><Input value={form.voucher_id} onChange={(e) => setForm((f) => ({ ...f, voucher_id: e.target.value }))} /></div>
                <div><Label>应收应付</Label><Input value={form.arap_id} onChange={(e) => setForm((f) => ({ ...f, arap_id: e.target.value }))} /></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({ ...form, amount_before_tax: Number(form.amount_before_tax) || 0, tax_rate: Number(form.tax_rate) || 0, tax_amount: Number(form.tax_amount) || 0, total_amount: Number(form.total_amount) || 0 })} disabled={createMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
