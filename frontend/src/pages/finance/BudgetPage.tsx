import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Eye } from "lucide-react";
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

export default function BudgetPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    period_type: "monthly",
    period: "",
    department_id: "",
    project_id: "",
    total_budget: "",
    status: "draft"
  });

  const { data, isLoading } = useQuery({ queryKey: ["budgets", page], queryFn: () => api.listBudgets({ page, page_size: 20 }) });
  const { data: execution } = useQuery({ queryKey: ["budget-execution", detailId], queryFn: () => api.getBudgetExecution(detailId!), enabled: !!detailId });
  const createMut = useMutation({ mutationFn: api.createBudget, onSuccess: () => { qc.invalidateQueries({ queryKey: ["budgets"] }); toast.success("预算已创建"); setDialogOpen(false); } });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>预算管理</CardTitle>
        <Button onClick={() => { setForm({ name: "", period_type: "monthly", period: "", department_id: "", project_id: "", total_budget: "", status: "draft" }); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />新建预算</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>期间类型</TableHead>
              <TableHead>期间</TableHead>
              <TableHead>部门</TableHead>
              <TableHead>总预算</TableHead>
              <TableHead>已使用</TableHead>
              <TableHead>已承诺</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((b: any) => {
              const pct = b.total_budget ? Math.round((b.total_used / b.total_budget) * 100) : 0;
              return (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => { setDetailId(b.id); setDetailOpen(true); }}>
                  <TableCell>{b.name}</TableCell>
                  <TableCell>{b.period_type}</TableCell>
                  <TableCell>{b.period}</TableCell>
                  <TableCell>{b.department_id}</TableCell>
                  <TableCell>{b.total_budget}</TableCell>
                  <TableCell>{b.total_used}</TableCell>
                  <TableCell>{b.total_committed}</TableCell>
                  <TableCell><Badge variant={pct >= 90 ? "destructive" : pct >= 70 ? "secondary" : "default"}>{b.status}</Badge></TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetailId(b.id); setDetailOpen(true); }}><Eye className="h-3 w-3" /></Button></TableCell>
                </TableRow>
              );
            })}
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
          <DialogHeader><DialogTitle>新建预算</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">基本信息</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>预算名称</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div><Label>期间类型</Label>
                  <Select value={form.period_type} onValueChange={(v) => setForm((f) => ({ ...f, period_type: v ?? "monthly" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">月度</SelectItem>
                      <SelectItem value="quarterly">季度</SelectItem>
                      <SelectItem value="annual">年度</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>期间</Label><Input placeholder="如 2026-04" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} /></div>
                <div><Label>状态</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? "draft" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">草稿</SelectItem>
                      <SelectItem value="approved">已批准</SelectItem>
                      <SelectItem value="executed">执行中</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">关联信息</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>部门编号</Label><Input value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))} /></div>
                <div><Label>项目编号</Label><Input value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">金额信息</div>
              <div><Label>总预算金额</Label><Input type="number" value={form.total_budget} onChange={(e) => setForm((f) => ({ ...f, total_budget: e.target.value }))} placeholder="输入总预算金额" /></div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">预算明细</div>
              <div className="text-sm text-muted-foreground p-3 bg-muted rounded">预算明细项(科目/金额/说明)可在保存后编辑</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({ ...form, total_budget: Number(form.total_budget) || 0 })} disabled={createMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>预算执行详情</DialogTitle></DialogHeader>
          {execution && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1"><span>执行进度</span><span>{execution.budget.total_used} / {execution.budget.total_budget}</span></div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (execution.budget.total_used / (execution.budget.total_budget || 1)) * 100)}%` }} />
                </div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>科目</TableHead><TableHead>预算金额</TableHead><TableHead>已使用</TableHead><TableHead>占比</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(execution as any).breakdown?.map((item: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.budget_amount}</TableCell>
                      <TableCell>{item.used_amount}</TableCell>
                      <TableCell>{item.budget_amount ? ((item.used_amount / item.budget_amount) * 100).toFixed(1) + "%" : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
