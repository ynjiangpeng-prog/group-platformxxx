import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/system";

export default function LogPage() {
  const [page, setPage] = useState(1);
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["logs", page, module, action],
    queryFn: () => api.getLogs({ page, module: module || undefined, action: action || undefined }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>操作日志</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 mb-4">
          <div>
            <Label>模块</Label>
            <Select value={module} onValueChange={(v) => { setModule((v ?? "") === "all" ? "" : (v ?? "")); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="全部模块" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模块</SelectItem>
                <SelectItem value="finance">财务</SelectItem>
                <SelectItem value="erp">ERP</SelectItem>
                <SelectItem value="business">业务</SelectItem>
                <SelectItem value="system">系统</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>操作</Label>
            <Input placeholder="搜索操作" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-[200px]" />
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead><TableHead>模块</TableHead><TableHead>操作</TableHead>
                <TableHead>目标类型</TableHead><TableHead>目标ID</TableHead><TableHead>详情</TableHead>
                <TableHead>IP</TableHead><TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell>{log.username}</TableCell>
                  <TableCell><Badge variant="secondary">{log.module}</Badge></TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.target_type}</TableCell>
                  <TableCell>{log.target_id}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{log.detail}</TableCell>
                  <TableCell>{log.ip}</TableCell>
                  <TableCell>{log.created_at ? format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss") : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">{page}</span>
          <Button size="sm" variant="outline" disabled={!data || data.items.length < 20} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </CardContent>
    </Card>
  );
}
