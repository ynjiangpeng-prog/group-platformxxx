import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listProjects, getInvestmentROI } from "@/api/project"
import type { Project } from "@/api/types"

const STATUS_LABELS: Record<string, string> = {
  planning: "规划中",
  in_progress: "进行中",
  completed: "已完成",
  on_hold: "暂停",
  cancelled: "已取消",
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function InvestmentROIPage() {
  const [selectedProjectId, setSelectedProjectId] = useState("")

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects-all"],
    queryFn: () => listProjects({ page: 1, page_size: 500 }),
  })

  const { data: roi, isLoading: roiLoading } = useQuery({
    queryKey: ["investment-roi", selectedProjectId],
    queryFn: () => getInvestmentROI(selectedProjectId),
    enabled: !!selectedProjectId,
  })

  const projects = (projectsData as { items?: Project[] } | undefined)?.items ?? []

  const revenueBreakdown = roi
    ? [
        { label: "运营收入", value: roi.revenue_from_operations },
        { label: "合同收入", value: roi.revenue_from_contracts },
        { label: "其他收入", value: roi.revenue_from_lines },
      ]
    : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">投资回报分析</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Select value={selectedProjectId} onValueChange={(v) => { if (v) setSelectedProjectId(v) }}>
            <SelectTrigger className="w-80">
              <SelectValue placeholder="请选择项目" />
            </SelectTrigger>
            <SelectContent>
              {projectsLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )}
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}（{STATUS_LABELS[p.status] ?? p.status}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {roiLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {roi && !roiLoading && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">总投资额</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-orange-600">¥{fmt(roi.total_investment)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">总收入</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">¥{fmt(roi.total_revenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">净利润</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${roi.net_profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  ¥{fmt(roi.net_profit)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">ROI</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${roi.roi_percentage >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmt(roi.roi_percentage)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">回收周期</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {roi.payback_months != null ? `${roi.payback_months}个月` : "无法计算"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>收入构成</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {revenueBreakdown.map((item) => {
                const pct = roi.total_revenue > 0 ? (item.value / roi.total_revenue) * 100 : 0
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{item.label}</span>
                      <span className="text-muted-foreground">
                        ¥{fmt(item.value)}（{pct.toFixed(1)}%）
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>月度收入趋势</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>月份</TableHead>
                    <TableHead className="text-right">收入(元)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roi.monthly_revenue_trend.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  )}
                  {[...roi.monthly_revenue_trend]
                    .sort((a, b) => a.month.localeCompare(b.month))
                    .map((item) => (
                      <TableRow key={item.month}>
                        <TableCell>{item.month}</TableCell>
                        <TableCell className="text-right">¥{fmt(item.revenue)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
