import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, DollarSign, Pencil } from "lucide-react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/finance";

export default function ArApPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("receivable");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleId, setSettleId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    type: "ar",
    business_type: "contract",
    business_id: "",
    source_no: "",
    counterparty: "",
    counterparty_id: "",
    total_amount: "",
    settled_amount: "0",
    remaining_amount: "",
    due_date: "",
    status: "pending",
    voucher_id: "",
    project_id: "",
    contract_id: "",
    remark: ""
  });
  const [settleForm, setSettleForm] = useState({ amount: "", method: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(createForm);

  const openEdit = (r: any) => {
    setEditId(r.id);
    setEditForm({
      type: r.type ?? "ar",
      business_type: r.business_type ?? "contract",
      business_id: r.business_id ?? "",
      source_no: r.source_no ?? "",
      counterparty: r.counterparty ?? "",
      counterparty_id: r.counterparty_id ?? "",
      total_amount: String(r.total_amount ?? ""),
      settled_amount: String(r.settled_amount ?? "0"),
      remaining_amount: String(r.remaining_amount ?? ""),
      due_date: r.due_date ?? "",
      status: r.status ?? "pending",
      voucher_id: r.voucher_id ?? "",
      project_id: r.project_id ?? "",
      contract_id: r.contract_id ?? "",
      remark: r.remark ?? "",
    });
    setEditOpen(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["arap", tab, page],
    queryFn: () => api.listArAp({ type: tab, page }),
  });

  const createMut = useMutation({ mutationFn: api.createArAp, onSuccess: () => { qc.invalidateQueries({ queryKey: ["arap"] }); toast.success("已创建"); setCreateOpen(false); } });
  const editMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateArAp(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["arap"] }); toast.success("已更新"); setEditOpen(false); setEditId(null); } });
  const settleMut = useMutation({ mutationFn: ({ id, ...data }: { id: string; [k: string]: any }) => api.settleArAp(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["arap"] }); toast.success("已结算"); setSettleOpen(false); } });

  function openSettle(id: string) { setSettleId(id); setSettleForm({ amount: "", method: "" }); setSettleOpen(true); }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>应收应付管理</CardTitle>
        <Button onClick={() => { setCreateForm({ type: tab === "receivable" ? "ar" : "ap", business_type: "contract", business_id: "", source_no: "", counterparty: "", counterparty_id: "", total_amount: "", settled_amount: "0", remaining_amount: "", due_date: "", status: "pending", voucher_id: "", project_id: "", contract_id: "", remark: "" }); setCreateOpen(true); }}><Plus className="mr-1 h-4 w-4" />新建</Button>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
          <TabsList><TabsTrigger value="receivable">应收</TabsTrigger><TabsTrigger value="payable">应付</TabsTrigger></TabsList>
          <TabsContent value={tab}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>业务类型</TableHead>
                  <TableHead>来源单号</TableHead>
                  <TableHead>交易方</TableHead>
                  <TableHead>原始金额</TableHead>
                  <TableHead>已结算</TableHead>
                  <TableHead>剩余金额</TableHead>
                  <TableHead>到期日</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items?.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.business_type}</TableCell>
                    <TableCell>{r.source_no}</TableCell>
                    <TableCell>{r.counterparty}</TableCell>
                    <TableCell>{r.total_amount}</TableCell>
                    <TableCell>{r.settled_amount}</TableCell>
                    <TableCell><Badge variant={r.remaining_amount > 0 ? "secondary" : "default"}>{r.remaining_amount}</Badge></TableCell>
                    <TableCell>{r.due_date ? format(new Date(r.due_date), "yyyy-MM-dd") : ""}</TableCell>
                    <TableCell><Badge variant={r.status === "pending" ? "default" : r.status === "overdue" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => openSettle(r.id)}><DollarSign className="h-3 w-3 mr-1" />结算</Button>
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
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新建{tab === "receivable" ? "应收" : "应付"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">基本信息</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>类型</Label>
                  <Select value={createForm.type} onValueChange={(v) => setCreateForm((f) => ({ ...f, type: v ?? "ar" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar">应收</SelectItem>
                      <SelectItem value="ap">应付</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>业务类型</Label>
                  <Select value={createForm.business_type} onValueChange={(v) => setCreateForm((f) => ({ ...f, business_type: v ?? "contract" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contract">合同</SelectItem>
                      <SelectItem value="salary">工资</SelectItem>
                      <SelectItem value="expense">费用</SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>业务编号</Label><Input value={createForm.business_id} onChange={(e) => setCreateForm((f) => ({ ...f, business_id: e.target.value }))} /></div>
                <div><Label>来源单号</Label><Input value={createForm.source_no} onChange={(e) => setCreateForm((f) => ({ ...f, source_no: e.target.value }))} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">交易信息</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>交易方</Label><Input value={createForm.counterparty} onChange={(e) => setCreateForm((f) => ({ ...f, counterparty: e.target.value }))} /></div>
                <div><Label>交易方ID</Label><Input value={createForm.counterparty_id} onChange={(e) => setCreateForm((f) => ({ ...f, counterparty_id: e.target.value }))} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">金额信息</div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>原始金额</Label><Input type="number" value={createForm.total_amount} onChange={(e) => setCreateForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
                <div><Label>已结算</Label><Input type="number" value={createForm.settled_amount} onChange={(e) => setCreateForm((f) => ({ ...f, settled_amount: e.target.value }))} disabled /></div>
                <div><Label>剩余金额</Label><Input type="number" value={createForm.remaining_amount} onChange={(e) => setCreateForm((f) => ({ ...f, remaining_amount: e.target.value }))} placeholder="自动计算" /></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">其他信息</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>到期日</Label><Input type="date" value={createForm.due_date} onChange={(e) => setCreateForm((f) => ({ ...f, due_date: e.target.value }))} /></div>
                <div><Label>状态</Label>
                  <Select value={createForm.status} onValueChange={(v) => setCreateForm((f) => ({ ...f, status: v ?? "pending" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">待结算</SelectItem>
                      <SelectItem value="partial_paid">部分结算</SelectItem>
                      <SelectItem value="overdue">已逾期</SelectItem>
                      <SelectItem value="written_off">已核销</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>凭证编号</Label><Input value={createForm.voucher_id} onChange={(e) => setCreateForm((f) => ({ ...f, voucher_id: e.target.value }))} /></div>
                <div><Label>项目编号</Label><Input value={createForm.project_id} onChange={(e) => setCreateForm((f) => ({ ...f, project_id: e.target.value }))} /></div>
                <div><Label>合同编号</Label><Input value={createForm.contract_id} onChange={(e) => setCreateForm((f) => ({ ...f, contract_id: e.target.value }))} /></div>
              </div>
              <div><Label>备注</Label><Input value={createForm.remark} onChange={(e) => setCreateForm((f) => ({ ...f, remark: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({ ...createForm, total_amount: Number(createForm.total_amount) || 0, settled_amount: Number(createForm.settled_amount) || 0, remaining_amount: Number(createForm.remaining_amount) || 0 })} disabled={createMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>结算</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>结算金额</Label><Input type="number" value={settleForm.amount} onChange={(e) => setSettleForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            <div><Label>结算方式</Label>
              <Select value={settleForm.method} onValueChange={(v) => setSettleForm((f) => ({ ...f, method: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择方式" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">银行转账</SelectItem>
                  <SelectItem value="cash">现金</SelectItem>
                  <SelectItem value="offset">抵扣</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleOpen(false)}>取消</Button>
            <Button onClick={() => settleMut.mutate({ id: settleId!, ...settleForm })} disabled={settleMut.isPending}>确认结算</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>编辑{editForm.type === "ar" ? "应收" : "应付"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>对方</Label><Input value={editForm.counterparty} onChange={(e) => setEditForm((f) => ({ ...f, counterparty: e.target.value }))} /></div>
              <div><Label>总金额</Label><Input type="number" value={editForm.total_amount} onChange={(e) => setEditForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
              <div><Label>已结算</Label><Input type="number" value={editForm.settled_amount} onChange={(e) => setEditForm((f) => ({ ...f, settled_amount: e.target.value }))} /></div>
              <div><Label>到期日</Label><Input type="date" value={editForm.due_date} onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))} /></div>
              <div><Label>状态</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v ?? "pending" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">待处理</SelectItem>
                    <SelectItem value="partial">部分结算</SelectItem>
                    <SelectItem value="settled">已结清</SelectItem>
                    <SelectItem value="overdue">已逾期</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>备注</Label><Input value={editForm.remark} onChange={(e) => setEditForm((f) => ({ ...f, remark: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={() => editMut.mutate({ id: editId!, data: { ...editForm, total_amount: Number(editForm.total_amount) || 0, settled_amount: Number(editForm.settled_amount) || 0, remaining_amount: Number(editForm.total_amount) - Number(editForm.settled_amount) } })} disabled={editMut.isPending}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
