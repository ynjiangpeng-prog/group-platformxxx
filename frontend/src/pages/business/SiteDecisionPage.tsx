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
import * as api from "@/api/business";

const typeConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  self_invest: { label: "自投", variant: "default" },
  cooperate: { label: "合作", variant: "default" },
  abandon: { label: "放弃", variant: "destructive" },
};

export default function SiteDecisionPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ site_id: "", decision_type: "", investment_amount: "", cooperate_partner: "", decision_date: "", description: "" });

  const { data, isLoading } = useQuery({ queryKey: ["site-decisions", page], queryFn: () => api.listSiteDecisions({ page, page_size: 20 }) });
  const createMut = useMutation({ mutationFn: api.createSiteDecision, onSuccess: () => { qc.invalidateQueries({ queryKey: ["site-decisions"] }); toast.success("决策已创建"); setDialogOpen(false); } });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>站点决策</CardTitle>
        <Button onClick={() => { setForm({ site_id: "", decision_type: "", investment_amount: "", cooperate_partner: "", decision_date: "", description: "" }); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />新建决策</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>站点ID</TableHead><TableHead>决策类型</TableHead><TableHead>决策日期</TableHead><TableHead>投资金额</TableHead><TableHead>合作方</TableHead><TableHead>状态</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((d: any) => {
              const tc = typeConfig[d.decision_type] ?? { label: d.decision_type, variant: "secondary" as const };
              return (
                <TableRow key={d.id}>
                  <TableCell className="max-w-[120px] truncate">{d.site_id}</TableCell>
                  <TableCell><Badge variant={tc.variant}>{tc.label}</Badge></TableCell>
                  <TableCell>{d.decision_date ? format(new Date(d.decision_date), "yyyy-MM-dd") : ""}</TableCell>
                  <TableCell>{d.investment_amount}</TableCell>
                  <TableCell>{d.cooperate_partner ?? "-"}</TableCell>
                  <TableCell><Badge variant="secondary">{d.status}</Badge></TableCell>
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
        <DialogContent>
          <DialogHeader><DialogTitle>新建站点决策</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>站点ID</Label><Input value={form.site_id} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))} /></div>
            <div><Label>决策类型</Label>
              <Select value={form.decision_type} onValueChange={(v) => setForm((f) => ({ ...f, decision_type: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self_invest">自投</SelectItem>
                  <SelectItem value="cooperate">合作</SelectItem>
                  <SelectItem value="abandon">放弃</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>投资金额</Label><Input type="number" value={form.investment_amount} onChange={(e) => setForm((f) => ({ ...f, investment_amount: e.target.value }))} /></div>
            <div><Label>合作方</Label><Input value={form.cooperate_partner} onChange={(e) => setForm((f) => ({ ...f, cooperate_partner: e.target.value }))} /></div>
            <div><Label>决策日期</Label><Input type="date" value={form.decision_date} onChange={(e) => setForm((f) => ({ ...f, decision_date: e.target.value }))} /></div>
            <div><Label>说明</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({ ...form, investment_amount: Number(form.investment_amount) || 0 })} disabled={createMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
