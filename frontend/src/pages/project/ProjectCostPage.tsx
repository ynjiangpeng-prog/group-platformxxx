import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Download, DollarSign, Wallet, TrendingUp, FileText, Users } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
} from "recharts"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { getProject, getProjectCostSummary } from "@/api/project"

const TYPE_LABELS: Record<string, string> = {
  travel: "差旅",
  petty_cash: "备用金",
  salary: "工资",
  contract: "合同",
  equipment: "设备",
  other: "其他",
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(220 70% 55%)",
]

function StatCard({
  title,
  value,
  icon: Icon,
  gradient,
  sub,
}: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  gradient: string
  sub?: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden relative">
      <div className={`absolute inset-0 ${gradient} opacity-[0.03]`} />
      <CardContent className="p-5 relative">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {sub}
          </div>
          <div className={`flex size-10 items-center justify-center rounded-lg ${gradient}`}>
            <Icon className="size-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ProjectCostPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [lineType, setLineType] = useState("all")

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  })

  const { data: cost, isLoading: costLoading } = useQuery({
    queryKey: ["project-cost-summary", id],
    queryFn: () => getProjectCostSummary(id!),
    enabled: !!id,
  })

  if (projectLoading || costLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (!project) return null

  const usageRate = cost?.budget_usage_rate ?? 0
  const usageColor = usageRate >= 90 ? "text-red-500" : usageRate >= 70 ? "text-amber-500" : "text-emerald-500"

  const byTypeEntries = Object.entries(cost?.by_type ?? {})
  const barChartData = byTypeEntries.map(([k, v]) => ({
    name: TYPE_LABELS[k] ?? k,
    value: v,
  }))

  const monthlyTrend = cost?.monthly_trend ?? []

  const contractCost = cost?.by_type?.contract ?? 0
  const salaryCost = cost?.by_type?.salary ?? 0

  const handleExport = () => {
    const params = new URLSearchParams({ project_id: id! })
    if (dateFrom) params.set("date_from", dateFrom)
    if (dateTo) params.set("date_to", dateTo)
    if (lineType !== "all") params.set("line_type", lineType)
    window.open(`/api/project/${id}/cost-export?${params.toString()}`, "_blank")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <Badge variant="outline">{project.project_code}</Badge>
        </div>
        <Button variant="outline" onClick={() => navigate(`/project/detail/${id}`)}>
          返回详情
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard
          title="总成本"
          value={`¥${(cost?.total_cost ?? 0).toLocaleString()}`}
          icon={DollarSign}
          gradient="bg-blue-500"
        />
        <StatCard
          title="预算"
          value={`¥${(cost?.budget ?? 0).toLocaleString()}`}
          icon={Wallet}
          gradient="bg-emerald-500"
        />
        <Card className="overflow-hidden relative">
          <div className="absolute inset-0 bg-violet-500 opacity-[0.03]" />
          <CardContent className="p-5 relative">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">预算使用率</p>
                <p className={`text-2xl font-bold tabular-nums ${usageColor}`}>
                  {usageRate.toFixed(1)}%
                </p>
                <div className="h-2 w-32 rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usageRate >= 90 ? "bg-red-500" : usageRate >= 70 ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(usageRate, 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg bg-violet-500">
                <TrendingUp className="size-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <StatCard
          title="合同金额"
          value={`¥${contractCost.toLocaleString()}`}
          icon={FileText}
          gradient="bg-amber-500"
        />
        <StatCard
          title="人工成本"
          value={`¥${salaryCost.toLocaleString()}`}
          icon={Users}
          gradient="bg-rose-500"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>成本分类</CardTitle>
            <CardDescription>按类型分布</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={60} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(v: any) => [`¥${Number(v ?? 0).toLocaleString()}`, "金额"]}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {barChartData.map((_, i) => (
                    <rect key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>月度趋势</CardTitle>
            <CardDescription>月度成本与累计成本</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(v: any, name: any) => [
                    `¥${Number(v ?? 0).toLocaleString()}`,
                    name === "cost" ? "月度成本" : "累计成本",
                  ]}
                />
                <Legend />
                <Bar dataKey="cost" name="月度成本" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="accumulated"
                  name="累计成本"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>成本明细</CardTitle>
              <CardDescription>全部成本记录</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4" />导出
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">日期范围</span>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
              <span className="text-muted-foreground">-</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
            </div>
            <Select value={lineType} onValueChange={(v) => setLineType(v ?? "all")}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>单据号</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>描述</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!cost ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    暂无明细数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
