import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/business";
import * as projectApi from "@/api/project";
import * as chargingApi from "@/api/charging";

const defaultForm = { name: "", category: "", amount: "", frequency: "monthly", start_date: "", end_date: "", next_due_date: "", payee: "", auto_record: false, status: "active", project_id: "", station_id: "" };
const categoryLabel: Record<string, string> = { electricity: "电费", equipment_repair: "设备维修", station_maintenance: "场站维护", property_management: "物业管理", travel: "交通差旅", office_supplies: "办公用品", labor: "人工费", meals: "餐饮住宿", telecom: "通讯网络", platform: "平台服务", other: "其他" };
const freqLabel: Record<string, string> = { monthly: "每月", quarterly: "每季度", yearly: "每年" };
const fmtAmount = (n: number) => `¥${Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FixedExpensePage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [form, setForm] = useState(defaultForm);

  const { data, isLoading } = useQuery({ queryKey: ["fixed-expenses", page, filterCategory, filterStatus], queryFn: () => api.listFixedExpenses({ page, page_size: 20, category: filterCategory || undefined, status: filterStatus || undefined }) });
  const { data: projects } = useQuery({ queryKey: ["projects-opts"], queryFn: () => projectApi.listProjects({ page_size: 200 }) });
  const { data: stations } = useQuery({ queryKey: ["stations-opts"], queryFn: () => chargingApi.listStations({ page_size: 200 }) });

  const createMut = useMutation({ mutationFn: api.createFixedExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-expenses"] }); toast.success("已创建"); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateFixedExpense(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-expenses"] }); toast.success("已更新"); setDialogOpen(false); setEditId(null); } });
  const deleteMut = useMutation({ mutationFn: api.deleteFixedExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-expenses"] }); toast.success("已删除"); setDeleteId(null); } });

  const openCreate = () => { setForm(defaultForm); setEditId(null); setDialogOpen(true); };
  const openEdit = (item: any) => { setForm({ name: item.name ?? "", category: item.category ?? "", amount: String(item.amount ?? ""), frequency: item.frequency ?? "monthly", start_date: item.start_date ?? "", end_date: item.end_date ?? "", next_due_date: item.next_due_date ?? "", payee: item.payee ?? "", auto_record: !!item.auto_record, status: item.status ?? "active", project_id: item.project_id ?? "", station_id: item.station_id ?? "" }); setEditId(item.id); setDialogOpen(true); };
  const submit = () => { const payload = { ...form, amount: Number(form.amount) || 0 }; editId ? updateMut.mutate({ id: editId, data: payload }) : createMut.mutate(payload); };

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>固定支出</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新增</Button>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v === "_all" ? "" : (v ?? "")); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="全部类别" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">全部类别</SelectItem>{Object.entries(categoryLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === "_all" ? "" : (v ?? "")); setPage(1); }}>
            <SelectTrigger className="w-32"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">全部状态</SelectItem><SelectItem value="active">生效中</SelectItem><SelectItem value="paused">已暂停</SelectItem><SelectItem value="ended">已结束</SelectItem></SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>类别</TableHead><TableHead>金额</TableHead><TableHead>频率</TableHead><TableHead>下次到期</TableHead><TableHead>收款方</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.items?.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{e.name}</TableCell>
                <TableCell>{categoryLabel[e.category] ?? e.category}</TableCell>
                <TableCell>{fmtAmount(e.amount)}</TableCell>
                <TableCell>{freqLabel[e.frequency] ?? e.frequency}</TableCell>
                <TableCell>{e.next_due_date ? format(new Date(e.next_due_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell>{e.payee}</TableCell>
                <TableCell><Badge variant={e.status === "active" ? "default" : "secondary"}>{e.status === "active" ? "生效中" : e.status === "paused" ? "已暂停" : "已结束"}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(e)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(e.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "编辑" : "新增"}固定支出</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>名称</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>类别</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择类别" /></SelectTrigger>
                <SelectContent>{Object.entries(categoryLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>金额</Label><Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></div>
              <div><Label>频率</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v ?? "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(freqLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>开始日期</Label><Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
              <div><Label>结束日期</Label><Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
            </div>
            <div><Label>下次到期</Label><Input type="date" value={form.next_due_date} onChange={(e) => setForm((f) => ({ ...f, next_due_date: e.target.value }))} /></div>
            <div><Label>收款方</Label><Input value={form.payee} onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))} /></div>
            <div><Label>项目</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent><SelectItem value="">无</SelectItem>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>场站</Label>
              <Select value={form.station_id} onValueChange={(v) => setForm((f) => ({ ...f, station_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择场站" /></SelectTrigger>
                <SelectContent><SelectItem value="">无</SelectItem>{stations?.items?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2"><input type="checkbox" checked={form.auto_record} onChange={(e) => setForm((f) => ({ ...f, auto_record: e.target.checked }))} /><Label>自动记账</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除此记录吗？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteId) deleteMut.mutate(deleteId); }}>确认删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
