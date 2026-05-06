import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Clock } from "lucide-react";
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

export default function WorkHourPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ project: "", employee: "", work_date: "", hours: "", work_type: "", overtime_hours: "", status: "normal" });

  const { data: summary } = useQuery({ queryKey: ["workhour-summary"], queryFn: () => api.getWorkHourSummary({}) });
  const { data, isLoading } = useQuery({ queryKey: ["workhours", page], queryFn: () => api.listWorkHours({ page, page_size: 20 }) });
  const createMut = useMutation({ mutationFn: api.createWorkHour, onSuccess: () => { qc.invalidateQueries({ queryKey: ["workhours"] }); qc.invalidateQueries({ queryKey: ["workhour-summary"] }); toast.success("工时已记录"); setDialogOpen(false); } });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>工时管理</CardTitle>
        <Button onClick={() => { setForm({ project: "", employee: "", work_date: "", hours: "", work_type: "", overtime_hours: "", status: "normal" }); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />记录工时</Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="border rounded-lg p-3 text-center">
            <div className="text-sm text-muted-foreground">总工时</div>
            <div className="text-xl font-bold"><Clock className="inline h-4 w-4 mr-1" />{summary?.total_hours ?? 0}</div>
          </div>
          <div className="border rounded-lg p-3 text-center">
            <div className="text-sm text-muted-foreground">总加班</div>
            <div className="text-xl font-bold">{summary?.total_overtime ?? 0}</div>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>项目</TableHead><TableHead>员工</TableHead><TableHead>日期</TableHead><TableHead>工时</TableHead><TableHead>工作类型</TableHead><TableHead>加班工时</TableHead><TableHead>状态</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data?.items?.map((w: any) => (
              <TableRow key={w.id}>
                <TableCell>{w.project}</TableCell><TableCell>{w.employee}</TableCell>
                <TableCell>{w.work_date ? format(new Date(w.work_date), "yyyy-MM-dd") : ""}</TableCell>
                <TableCell>{w.hours}</TableCell><TableCell>{w.work_type}</TableCell>
                <TableCell>{w.overtime_hours ?? "-"}</TableCell>
                <TableCell><Badge variant={w.status === "overtime" ? "destructive" : "secondary"}>{w.status}</Badge></TableCell>
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
          <DialogHeader><DialogTitle>记录工时</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>项目</Label><Input value={form.project} onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))} /></div>
            <div><Label>员工</Label><Input value={form.employee} onChange={(e) => setForm((f) => ({ ...f, employee: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>日期</Label><Input type="date" value={form.work_date} onChange={(e) => setForm((f) => ({ ...f, work_date: e.target.value }))} /></div>
              <div><Label>工时</Label><Input type="number" value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} /></div>
            </div>
            <div><Label>工作类型</Label><Input value={form.work_type} onChange={(e) => setForm((f) => ({ ...f, work_type: e.target.value }))} /></div>
            <div><Label>加班工时</Label><Input type="number" value={form.overtime_hours} onChange={(e) => setForm((f) => ({ ...f, overtime_hours: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => createMut.mutate({ ...form, hours: Number(form.hours) || 0, overtime_hours: Number(form.overtime_hours) || 0 })} disabled={createMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
