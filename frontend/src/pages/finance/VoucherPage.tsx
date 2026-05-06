import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CheckCircle, Send } from "lucide-react";
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

const statusVariant: Record<string, "secondary" | "default"> = {
  draft: "secondary",
  reviewed: "default",
  posted: "default",
};
const statusLabel: Record<string, string> = { draft: "草稿", reviewed: "已审核", posted: "已过账" };

interface LineItem {
  account: string;
  debit: string;
  credit: string;
  description: string;
}

const emptyLine = (): LineItem => ({ account: "", debit: "", credit: "", description: "" });

export default function VoucherPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    voucher_no: "",
    voucher_date: "",
    period: "",
    voucher_type: "general",
    business_type: "",
    business_id: "",
    source_module: "",
    source_no: "",
    status: "draft",
    prepared_by: "",
    reviewed_by: "",
    posted_by: "",
    workflow_instance_id: "",
    remark: ""
  });
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  const { data, isLoading } = useQuery({
    queryKey: ["vouchers", page],
    queryFn: () => listVouchers({ page }),
  });

  const createMut = useMutation({ mutationFn: api.createVoucher, onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); toast.success("凭证已创建"); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, ...data }: { id: string; [k: string]: any }) => api.updateVoucher(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); toast.success("凭证已更新"); setDialogOpen(false); } });
  const reviewMut = useMutation({ mutationFn: api.reviewVoucher, onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); toast.success("已审核"); } });
  const postMut = useMutation({ mutationFn: api.postVoucher, onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); toast.success("已过账"); } });
  const deleteMut = useMutation({ mutationFn: api.deleteVoucher, onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); toast.success("已删除"); } });

  function openCreate() {
    setEditingId(null);
    setForm({ voucher_no: "", voucher_date: "", period: "", voucher_type: "general", business_type: "", business_id: "", source_module: "", source_no: "", status: "draft", prepared_by: "", reviewed_by: "", posted_by: "", workflow_instance_id: "", remark: "" });
    setLines([emptyLine()]);
    setDialogOpen(true);
  }

  function openEdit(v: any) {
    setEditingId(v.id);
    setForm({ voucher_no: v.voucher_no ?? "", voucher_date: v.voucher_date ?? "", period: v.period ?? "", voucher_type: v.voucher_type ?? "general", business_type: v.business_type ?? "", business_id: v.business_id ?? "", source_module: v.source_module ?? "", source_no: v.source_no ?? "", status: v.status ?? "draft", prepared_by: v.prepared_by ?? "", reviewed_by: v.reviewed_by ?? "", posted_by: v.posted_by ?? "", workflow_instance_id: v.workflow_instance_id ?? "", remark: v.remark ?? "" });
    setLines(v.lines?.length ? v.lines : [emptyLine()]);
    setDialogOpen(true);
  }

  function handleSubmit() {
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (totalDebit !== totalCredit) { toast.error("借贷不平衡"); return; }
    const payload = { ...form, lines: lines.map((l) => ({ ...l, id: "", account_id: l.account, debit: Number(l.debit), credit: Number(l.credit) })) } as any;
    if (editingId) updateMut.mutate({ id: editingId, ...payload });
    else createMut.mutate(payload);
  }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>凭证管理</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新建凭证</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>凭证号</TableHead>
              <TableHead>日期</TableHead>
              <TableHead>期间</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>借方合计</TableHead>
              <TableHead>贷方合计</TableHead>
              <TableHead>分录数</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((v: any) => (
              <TableRow key={v.id}>
                <TableCell>{v.voucher_no}</TableCell>
                <TableCell>{v.voucher_date ? format(new Date(v.voucher_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell>{v.period}</TableCell>
                <TableCell>{v.voucher_type}</TableCell>
                <TableCell><Badge variant={statusVariant[v.status] ?? "secondary"}>{statusLabel[v.status] ?? v.status}</Badge></TableCell>
                <TableCell>{v.total_debit}</TableCell>
                <TableCell>{v.total_credit}</TableCell>
                <TableCell>{v.line_count}</TableCell>
                <TableCell className="space-x-1">
                  {v.status === "draft" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openEdit(v)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => deleteMut.mutate(v.id)}><Trash2 className="h-3 w-3" /></Button>
                    </>
                  )}
                  {v.status === "draft" && <Button size="sm" variant="outline" onClick={() => reviewMut.mutate(v.id)}><CheckCircle className="h-3 w-3" /></Button>}
                  {v.status === "reviewed" && <Button size="sm" variant="outline" onClick={() => postMut.mutate(v.id)}><Send className="h-3 w-3" /></Button>}
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
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "编辑凭证" : "新建凭证"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">基本信息</div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>凭证号</Label><Input value={form.voucher_no} onChange={(e) => setForm((f) => ({ ...f, voucher_no: e.target.value }))} placeholder="自动生成" disabled /></div>
                <div><Label>凭证日期</Label><Input type="date" value={form.voucher_date} onChange={(e) => setForm((f) => ({ ...f, voucher_date: e.target.value }))} /></div>
                <div><Label>期间</Label><Input value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} placeholder="如 2026-04" /></div>
                <div><Label>凭证类型</Label>
                  <Select value={form.voucher_type} onValueChange={(v) => setForm((f) => ({ ...f, voucher_type: v ?? "general" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">通用</SelectItem>
                      <SelectItem value="settlement">结算</SelectItem>
                      <SelectItem value="adjustment">调整</SelectItem>
                      <SelectItem value="transfer">转账</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>状态</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? "draft" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">草稿</SelectItem>
                      <SelectItem value="reviewed">已审核</SelectItem>
                      <SelectItem value="posted">已过账</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>工作流ID</Label><Input value={form.workflow_instance_id} onChange={(e) => setForm((f) => ({ ...f, workflow_instance_id: e.target.value }))} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">业务关联</div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>业务类型</Label><Input value={form.business_type} onChange={(e) => setForm((f) => ({ ...f, business_type: e.target.value }))} /></div>
                <div><Label>业务编号</Label><Input value={form.business_id} onChange={(e) => setForm((f) => ({ ...f, business_id: e.target.value }))} /></div>
                <div><Label>来源模块</Label><Input value={form.source_module} onChange={(e) => setForm((f) => ({ ...f, source_module: e.target.value }))} /></div>
                <div><Label>来源单号</Label><Input value={form.source_no} onChange={(e) => setForm((f) => ({ ...f, source_no: e.target.value }))} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">人员信息</div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>制单人</Label><Input value={form.prepared_by} onChange={(e) => setForm((f) => ({ ...f, prepared_by: e.target.value }))} /></div>
                <div><Label>审核人</Label><Input value={form.reviewed_by} onChange={(e) => setForm((f) => ({ ...f, reviewed_by: e.target.value }))} /></div>
                <div><Label>过账人</Label><Input value={form.posted_by} onChange={(e) => setForm((f) => ({ ...f, posted_by: e.target.value }))} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">分录行</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="outline" onClick={() => setLines((l) => [...l, emptyLine()])}><Plus className="h-3 w-3 mr-1" />添加分录</Button>
                  <div className="text-sm gap-4 flex">
                    <span>借方合计: {lines.reduce((s, l) => s + Number(l.debit || 0), 0).toFixed(2)}</span>
                    <span>贷方合计: {lines.reduce((s, l) => s + Number(l.credit || 0), 0).toFixed(2)}</span>
                  </div>
                </div>
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-2"><Input placeholder="科目编码" value={line.account} onChange={(e) => { const n = [...lines]; n[idx] = { ...n[idx], account: e.target.value }; setLines(n); }} /></div>
                    <div className="col-span-2"><Input placeholder="借方金额" type="number" step="0.01" value={line.debit} onChange={(e) => { const n = [...lines]; n[idx] = { ...n[idx], debit: e.target.value }; setLines(n); }} /></div>
                    <div className="col-span-2"><Input placeholder="贷方金额" type="number" step="0.01" value={line.credit} onChange={(e) => { const n = [...lines]; n[idx] = { ...n[idx], credit: e.target.value }; setLines(n); }} /></div>
                    <div className="col-span-5"><Input placeholder="摘要描述" value={line.description} onChange={(e) => { const n = [...lines]; n[idx] = { ...n[idx], description: e.target.value }; setLines(n); }} /></div>
                    <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => setLines((l) => l.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3" /></Button></div>
                  </div>
                ))}
              </div>
            </div>

            <div><Label>备注</Label><Input value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} placeholder="凭证备注说明" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function listVouchers(params: any) { return api.listVouchers(params); }
