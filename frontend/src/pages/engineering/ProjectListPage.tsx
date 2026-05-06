import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { listProjects } from "@/api/project"
import type { Project } from "@/api/types"

const TYPE_LABELS: Record<string, string> = {
  pure_epc: "纯工程EPC",
  hv_epc: "高压EPC",
  lv_epc: "低压EPC",
  equipment_sale: "设备销售",
  co_invest: "合作共投",
  full_invest: "全投",
}

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  planning: "outline",
  active: "default",
  paused: "secondary",
  completed: "default",
  closed: "secondary",
}

export default function ProjectListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  const { data, isLoading } = useQuery({
    queryKey: ["engineering-projects", page, search, statusFilter, typeFilter],
    queryFn: () =>
      listProjects({
        page,
        page_size: 20,
        keyword: search || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        project_type: typeFilter !== "all" ? typeFilter : undefined,
      }),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / 20)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">项目列表</h1>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="搜索项目名称/编号..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-64"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="planning">规划中</SelectItem>
            <SelectItem value="active">进行中</SelectItem>
            <SelectItem value="paused">已暂停</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="closed">已关闭</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>项目编号</TableHead>
                  <TableHead>项目名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>进度</TableHead>
                  <TableHead>地区</TableHead>
                  <TableHead>预算</TableHead>
                  <TableHead>开始日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">暂无数据</TableCell>
                  </TableRow>
                )}
                {data?.items.map((p: Project) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/project/${p.id}`)}>
                    <TableCell className="font-mono text-xs">{p.project_code}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABELS[p.project_type] ?? p.project_type}</Badge></TableCell>
                    <TableCell><Badge variant={STATUS_COLORS[p.status] ?? "secondary"}>{p.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${p.progress}%` }} />
                        </div>
                        <span className="text-xs">{p.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{[p.province, p.city].filter(Boolean).join(" ")}</TableCell>
                    <TableCell>¥{((p.total_budget ?? 0) / 10000).toFixed(1)}万</TableCell>
                    <TableCell>{p.start_date ? format(new Date(p.start_date), "yyyy-MM-dd") : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">共 {data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm">{page} / {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </div>
    </div>
  )
}
