import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/business";
import * as projectApi from "@/api/project";
import * as orgApi from "@/api/organization";
import * as chargingApi from "@/api/charging";

const defaultForm = { project_id: "", expense_date: "", category: "", amount: "", description: "", payer_type: "", payer_id: "", payer_name: "", station_id: "" };

const categoryLabel: Record<string, string> = { electricity: "电费", equipment_repair: "设备维修", station_maintenance: "场站维护", property_management: "物业管理", travel: "交通差旅", office_supplies: "办公用品", labor: "人工费", meals: "餐饮住宿", telecom: "通讯网络", platform: "平台服务", other: "其他" };
const payerTypeLabel: Record<string, string> = { company: "公司", project: "项目", personal: "个人" };
const fmtAmount = (n: number) => `¥${Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DailyExpensePage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [form, setForm] = useState(defaultForm);

  const { data: summary } = useQuery({ queryKey: ["daily-expense-summary"], queryFn: () => api.getDailyExpenseSummary({}) });
  const { data, isLoading } = useQuery({ queryKey: ["daily-expenses", page, filterProject, filterCategory], queryFn: () => api.listDailyExpenses({ page, page_size: 20, project_id: filterProject || undefined, category: filterCategory || undefined }) });
  const { data: projects } = useQuery({ queryKey: ["projects-opts"], queryFn: () => projectApi.listProjects({ page_size: 200 }) });
  const { data: users } = useQuery({ queryKey: ["users-opts"], queryFn: () => orgApi.listUsers({ page_size: 200 }) });
  const { data: stations } = useQuery({ queryKey: ["stations-opts"], queryFn: () => chargingApi.listStations({ page_size: 200 }) });

  const createMut = useMutation({ mutationFn: api.createDailyExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-expenses"] }); qc.invalidateQueries({ queryKey: ["daily-expense-summary"] }); toast.success("已创建"); setDialogOpen(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateDailyExpense(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-expenses"] }); toast.success("已更新"); setDialogOpen(false); setEditId(null); } });
  const deleteMut = useMutation({ mutationFn: api.deleteDailyExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-expenses"] }); toast.success("已删除"); setDeleteId(null); } });

  const openCreate = () => { setForm(defaultForm); setEditId(null); setDialogOpen(true); };
  const openEdit = (item: any) => { setForm({ project_id: item.project_id ?? "", expense_date: item.expense_date ?? "", category: item.category ?? "", amount: String(item.amount ?? ""), description: item.description ?? "", payer_type: item.payer_type ?? "", payer_id: item.payer_id ?? "", payer_name: item.payer_name ?? "", station_id: item.station_id ?? "" }); setEditId(item.id); setDialogOpen(true); };
  const submit = () => { const payload = { ...form, amount: Number(form.amount) || 0 }; editId ? updateMut.mutate({ id: editId, data: payload }) : createMut.mutate(payload); };

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>每日支出</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新增</Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">总支出</div><div className="text-xl font-bold">{fmtAmount(summary?.total ?? 0)}</div></div>
          <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">分类数</div><div className="text-xl font-bold">{summary?.by_category?.length ?? 0}</div></div>
        </div>
        <div className="flex gap-2 mb-4">
          <Select value={filterProject} onValueChange={(v) => { setFilterProject(v === "_all" ? "" : (v ?? "")); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="全部项目" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">全部项目</SelectItem>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v === "_all" ? "" : (v ?? "")); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="全部类别" /></SelectTrigger>
            <SelectContent><SelectItem value="_all">全部类别</SelectItem>{Object.entries(categoryLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>项目</TableHead><TableHead>类别</TableHead><TableHead>金额</TableHead><TableHead>付款方</TableHead><TableHead>说明</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.items?.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{e.expense_date ? format(new Date(e.expense_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell>{e.project_name ?? e.project_id}</TableCell>
                <TableCell>{categoryLabel[e.category] ?? e.category}</TableCell>
                <TableCell>{fmtAmount(e.amount)}</TableCell>
                <TableCell>{payerTypeLabel[e.payer_type] ?? e.payer_type} {e.payer_name}</TableCell>
                <TableCell className="max-w-48 truncate">{e.description}</TableCell>
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
          <DialogHeader><DialogTitle>{editId ? "编辑" : "新增"}支出</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>项目</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>{projects?.items?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>日期</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} /></div>
              <div><Label>金额</Label><Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            </div>
            <div><Label>类别</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择类别" /></SelectTrigger>
                <SelectContent>{Object.entries(categoryLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>付款方类型</Label>
              <Select value={form.payer_type} onValueChange={(v) => setForm((f) => ({ ...f, payer_type: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                <SelectContent>{Object.entries(payerTypeLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>付款方名称</Label><Input value={form.payer_name} onChange={(e) => setForm((f) => ({ ...f, payer_name: e.target.value }))} /></div>
            <div><Label>场站</Label>
              <Select value={form.station_id} onValueChange={(v) => setForm((f) => ({ ...f, station_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择场站" /></SelectTrigger>
                <SelectContent><SelectItem value="">无</SelectItem>{stations?.items?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>说明</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
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
