import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { format } from "date-fns"
import {
  FolderKanban,
  Clock,
  TrendingDown,
  Wallet,
  Search,
  ArrowLeftRight,
  Zap,
  AlertTriangle,
  Headphones,
} from "lucide-react"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { listProjects } from "@/api/project"
import { getFundStats } from "@/api/petty-cash"
import { getDashboardStats } from "@/api/system"
import type { Project } from "@/api/types"

const TYPE_OPTIONS = [
  { value: "all", label: "全部类型" },
  { value: "pure_epc", label: "纯工程EPC" },
  { value: "hv_epc", label: "高压EPC" },
  { value: "lv_epc", label: "低压EPC" },
  { value: "equipment_sale", label: "设备销售" },
  { value: "co_invest", label: "合作共投" },
  { value: "full_invest", label: "全投" },
]

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "planning", label: "规划中" },
  { value: "in_progress", label: "进行中" },
  { value: "completed", label: "已完成" },
  { value: "on_hold", label: "暂停" },
  { value: "cancelled", label: "已取消" },
]

const TYPE_LABELS: Record<string, string> = {
  pure_epc: "纯工程EPC",
  hv_epc: "高压EPC",
  lv_epc: "低压EPC",
  equipment_sale: "设备销售",
  co_invest: "合作共投",
  full_invest: "全投",
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planning: "outline",
  in_progress: "default",
  completed: "secondary",
  on_hold: "destructive",
  cancelled: "destructive",
}

function StatCard({
  title,
  value,
  icon: Icon,
  gradient,
}: {
  title: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  gradient: string
}) {
  return (
    <Card className="overflow-hidden relative">
      <div className={`absolute inset-0 ${gradient} opacity-[0.03]`} />
      <CardContent className="p-6 relative">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
          </div>
          <div className={`flex size-10 items-center justify-center rounded-lg ${gradient}`}>
            <Icon className="size-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const budget = project.total_budget ?? 0
  const spent = project.actual_cost ?? 0
  const rate = budget > 0 ? (spent / budget) * 100 : 0

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold truncate">{project.name}</h3>
            <p className="text-xs text-muted-foreground">{project.project_code}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Badge variant="outline" className="text-[10px]">
              {TYPE_LABELS[project.project_type] ?? project.project_type}
            </Badge>
            <Badge variant={STATUS_VARIANT[project.status] ?? "secondary"} className="text-[10px]">
              {project.status}
            </Badge>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>进度</span>
            <span>{project.progress}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(project.progress, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">总预算</span>
            <p className="font-medium">¥{(budget / 10000).toFixed(1)}万</p>
          </div>
          <div>
            <span className="text-muted-foreground">已花费</span>
            <p className="font-medium">¥{(spent / 10000).toFixed(1)}万</p>
          </div>
        </div>

        {rate > 80 && (
          <div className="text-xs text-destructive font-medium">
            预算使用率 {rate.toFixed(0)}%
          </div>
        )}

        {project.project_manager_id && (
          <div className="text-xs text-muted-foreground">
            负责人: {project.project_manager_id}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ProjectBoard() {
  const navigate = useNavigate()
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [keyword, setKeyword] = useState("")

  const { data: statsData } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: getDashboardStats,
  })

  const { data: pettyCashStats } = useQuery({
    queryKey: ["petty-cash", "stats"],
    queryFn: getFundStats,
  })

  const params: Record<string, unknown> = { page: 1, page_size: 100 }
  if (typeFilter !== "all") params.project_type = typeFilter
  if (statusFilter !== "all") params.status = statusFilter
  if (keyword.trim()) params.keyword = keyword.trim()

  const { data, isLoading } = useQuery({
    queryKey: ["projects", "board", typeFilter, statusFilter, keyword],
    queryFn: () => listProjects(params),
  })

  const projects = data?.items ?? []
  const activeProjects = projects.filter((p) => p.status === "in_progress")
  const stats = statsData

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard
          title="进行中项目"
          value={activeProjects.length}
          icon={FolderKanban}
          gradient="bg-blue-500"
        />
        <StatCard
          title="运营充电站"
          value={stats?.active_stations ?? 0}
          icon={Zap}
          gradient="bg-green-500"
        />
        <StatCard
          title="待审批"
          value={stats?.pending_approvals ?? 0}
          icon={Clock}
          gradient="bg-amber-500"
        />
        <StatCard
          title="待处理工单"
          value={stats?.pending_tickets ?? 0}
          icon={Headphones}
          gradient="bg-purple-500"
        />
        <StatCard
          title="应收余额"
          value={`¥${((stats?.total_ar ?? 0) / 10000).toFixed(1)}万`}
          icon={ArrowLeftRight}
          gradient="bg-emerald-500"
        />
        <StatCard
          title="逾期应收"
          value={`¥${((stats?.overdue_ar ?? 0) / 10000).toFixed(1)}万`}
          icon={AlertTriangle}
          gradient="bg-red-500"
        />
        <StatCard
          title="应付余额"
          value={`¥${((stats?.total_ap ?? 0) / 10000).toFixed(1)}万`}
          icon={Wallet}
          gradient="bg-orange-500"
        />
        <StatCard
          title="活跃备用金"
          value={pettyCashStats?.total_amount ?? 0}
          icon={Wallet}
          gradient="bg-teal-500"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索项目名称、编号..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { if (v) setTypeFilter(v) }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { if (v) setStatusFilter(v) }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-1.5 w-full" />
                <Skeleton className="h-4 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <FolderKanban className="mx-auto size-12 mb-4 opacity-30" />
            <p>暂无项目</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate("/project/create")}
            >
              创建第一个项目
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {projects.length > 0 && (() => {
            const totalBudget = projects.reduce((s, p) => s + (p.total_budget ?? 0), 0)
            const totalCost = projects.reduce((s, p) => s + (p.actual_cost ?? 0), 0)
            const avgProgress = projects.reduce((s, p) => s + (p.progress ?? 0), 0) / projects.length
            return (
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">项目总数</p>
                      <p className="text-lg font-bold">{projects.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">总预算</p>
                      <p className="text-lg font-bold">¥{(totalBudget / 10000).toFixed(1)}万</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">总成本</p>
                      <p className="text-lg font-bold text-rose-600">¥{(totalCost / 10000).toFixed(1)}万</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">平均进度</p>
                      <p className="text-lg font-bold">{avgProgress.toFixed(0)}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })()}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/project/${project.id}`)}
            />
          ))}
        </div>
        </>
      )}
    </div>
  )
}
