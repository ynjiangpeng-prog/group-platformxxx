import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/business";

const categoryLabel: Record<string, string> = { electricity: "电费", equipment_repair: "设备维修", station_maintenance: "场站维护", property_management: "物业管理", travel: "交通差旅", office_supplies: "办公用品", labor: "人工费", meals: "餐饮住宿", telecom: "通讯网络", platform: "平台服务", other: "其他" };
const payerTypeLabel: Record<string, string> = { company: "公司", project: "项目", personal: "个人" };
const freqLabel: Record<string, string> = { monthly: "每月", quarterly: "每季度", yearly: "每年" };
const fmtAmount = (n: number) => `¥${Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ExpensePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("daily");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const dailyDefault = { date: "", category: "", amount: "", payer_type: "", payer_name: "", description: "" };
  const fixedDefault = { name: "", category: "", amount: "", frequency: "monthly", start_date: "", end_date: "", payee: "", status: "active" };
  const [dailyForm, setDailyForm] = useState(dailyDefault);
  const [fixedForm, setFixedForm] = useState(fixedDefault);

  const { data: summary } = useQuery({ queryKey: ["expense-summary"], queryFn: () => api.getDailyExpenseSummary({}) });
  const { data: dailyData, isLoading: dailyLoading } = useQuery({ queryKey: ["daily-expenses", page], queryFn: () => api.listDailyExpenses({ page, page_size: 20 }), enabled: tab === "daily" });
  const { data: fixedData, isLoading: fixedLoading } = useQuery({ queryKey: ["fixed-expenses", page], queryFn: () => api.listFixedExpenses({ page, page_size: 20 }), enabled: tab === "fixed" });

  const createDailyMut = useMutation({ mutationFn: api.createDailyExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-expenses"] }); qc.invalidateQueries({ queryKey: ["expense-summary"] }); toast.success("已创建"); setDialogOpen(false); } });
  const updateDailyMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateDailyExpense(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-expenses"] }); toast.success("已更新"); setDialogOpen(false); setEditId(null); } });
  const deleteDailyMut = useMutation({ mutationFn: api.deleteDailyExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-expenses"] }); toast.success("已删除"); setDeleteId(null); } });
  const createFixedMut = useMutation({ mutationFn: api.createFixedExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-expenses"] }); toast.success("已创建"); setDialogOpen(false); } });
  const updateFixedMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: any }) => api.updateFixedExpense(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-expenses"] }); toast.success("已更新"); setDialogOpen(false); setEditId(null); } });
  const deleteFixedMut = useMutation({ mutationFn: api.deleteFixedExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["fixed-expenses"] }); toast.success("已删除"); setDeleteId(null); } });

  const openCreate = () => { if (tab === "daily") setDailyForm(dailyDefault); else setFixedForm(fixedDefault); setEditId(null); setDialogOpen(true); };
  const openEdit = (item: any) => { if (tab === "daily") setDailyForm({ date: item.expense_date ?? item.date ?? "", category: item.category ?? "", amount: String(item.amount ?? ""), payer_type: item.payer_type ?? "", payer_name: item.payer_name ?? "", description: item.description ?? "" }); else setFixedForm({ name: item.name ?? "", category: item.category ?? "", amount: String(item.amount ?? ""), frequency: item.frequency ?? "monthly", start_date: item.start_date ?? "", end_date: item.end_date ?? "", payee: item.payee ?? "", status: item.status ?? "active" }); setEditId(item.id); setDialogOpen(true); };

  const submitDaily = () => { const payload = { ...dailyForm, amount: Number(dailyForm.amount) || 0 }; editId ? updateDailyMut.mutate({ id: editId, data: payload }) : createDailyMut.mutate(payload); };
  const submitFixed = () => { const payload = { ...fixedForm, amount: Number(fixedForm.amount) || 0 }; editId ? updateFixedMut.mutate({ id: editId, data: payload }) : createFixedMut.mutate(payload); };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>费用管理</CardTitle>
        <Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新增</Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">总支出</div><div className="text-xl font-bold">{fmtAmount(summary?.total ?? 0)}</div></div>
          <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">分类数</div><div className="text-xl font-bold">{summary?.by_category?.length ?? 0}</div></div>
          <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">付款方类型</div><div className="text-xl font-bold">{summary?.by_payer?.length ?? 0}</div></div>
        </div>

        <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
          <TabsList><TabsTrigger value="daily">每日记账</TabsTrigger><TabsTrigger value="fixed">固定支出</TabsTrigger></TabsList>
          <TabsContent value="daily">
            {(dailyLoading) ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <Table>
                <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>类别</TableHead><TableHead>金额</TableHead><TableHead>付款方</TableHead><TableHead>说明</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                <TableBody>
                  {dailyData?.items?.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.expense_date ? format(new Date(e.expense_date), "yyyy-MM-dd") : ""}</TableCell>
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
            )}
          </TabsContent>
          <TabsContent value="fixed">
            {fixedLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
              <Table>
                <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>类别</TableHead><TableHead>金额</TableHead><TableHead>频率</TableHead><TableHead>收款方</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                <TableBody>
                  {fixedData?.items?.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.name}</TableCell>
                      <TableCell>{categoryLabel[e.category] ?? e.category}</TableCell>
                      <TableCell>{fmtAmount(e.amount)}</TableCell>
                      <TableCell>{freqLabel[e.frequency] ?? e.frequency}</TableCell>
                      <TableCell>{e.payee}</TableCell>
                      <TableCell>{e.status}</TableCell>
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
            )}
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">{page}</span>
          <Button size="sm" variant="outline" disabled={!(tab === "daily" ? dailyData : fixedData)?.items?.length || (tab === "daily" ? dailyData : fixedData)!.items.length < 20} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "编辑" : "新增"}{tab === "daily" ? "每日支出" : "固定支出"}</DialogTitle></DialogHeader>
          {tab === "daily" ? (
            <div className="grid gap-3">
              <div><Label>日期</Label><Input type="date" value={dailyForm.date} onChange={(e) => setDailyForm((f) => ({ ...f, date: e.target.value }))} /></div>
              <div><Label>类别</Label>
                <Select value={dailyForm.category} onValueChange={(v) => setDailyForm((f) => ({ ...f, category: v ?? "" }))}>
                  <SelectTrigger><SelectValue placeholder="选择类别" /></SelectTrigger>
                  <SelectContent>{Object.entries(categoryLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>金额</Label><Input type="number" value={dailyForm.amount} onChange={(e) => setDailyForm((f) => ({ ...f, amount: e.target.value }))} /></div>
              <div><Label>付款方类型</Label>
                <Select value={dailyForm.payer_type} onValueChange={(v) => setDailyForm((f) => ({ ...f, payer_type: v ?? "" }))}>
                  <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                  <SelectContent>{Object.entries(payerTypeLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>付款方名称</Label><Input value={dailyForm.payer_name} onChange={(e) => setDailyForm((f) => ({ ...f, payer_name: e.target.value }))} /></div>
              <div><Label>说明</Label><Textarea value={dailyForm.description} onChange={(e) => setDailyForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
            </div>
          ) : (
            <div className="grid gap-3">
              <div><Label>名称</Label><Input value={fixedForm.name} onChange={(e) => setFixedForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>类别</Label>
                <Select value={fixedForm.category} onValueChange={(v) => setFixedForm((f) => ({ ...f, category: v ?? "" }))}>
                  <SelectTrigger><SelectValue placeholder="选择类别" /></SelectTrigger>
                  <SelectContent>{Object.entries(categoryLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>金额</Label><Input type="number" value={fixedForm.amount} onChange={(e) => setFixedForm((f) => ({ ...f, amount: e.target.value }))} /></div>
                <div><Label>频率</Label>
                  <Select value={fixedForm.frequency} onValueChange={(v) => setFixedForm((f) => ({ ...f, frequency: v ?? "" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(freqLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>开始日期</Label><Input type="date" value={fixedForm.start_date} onChange={(e) => setFixedForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
                <div><Label>结束日期</Label><Input type="date" value={fixedForm.end_date} onChange={(e) => setFixedForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
              </div>
              <div><Label>收款方</Label><Input value={fixedForm.payee} onChange={(e) => setFixedForm((f) => ({ ...f, payee: e.target.value }))} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={tab === "daily" ? submitDaily : submitFixed} disabled={createDailyMut.isPending || updateDailyMut.isPending || createFixedMut.isPending || updateFixedMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除此记录吗？此操作不可撤销。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteId) (tab === "daily" ? deleteDailyMut : deleteFixedMut).mutate(deleteId); }}>确认删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
