import { useState, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { toast } from "sonner"
import { useAuthStore } from "@/store/auth"
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  MapPin,
  Plus,
  Upload,
  Wallet,
  Timer,
  ChevronRight,
  FileText,
  Package,
  CalendarDays,
  BarChart3,
  FileSpreadsheet,
  Send,
  X,
  DollarSign,
  Users,
  Activity,
  TrendingUp,
  ClipboardList,
  CloudSun,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getProject,
  getProjectCostSummary,
  updateProject,
  updateProjectProgress,
  listConstructionLogs,
  createConstructionLog,
  listProcurementApprovals,
  createProcurementApproval,
  listServiceTickets,
  listInspections,
  getProjectStations,
  getProjectOpsSummary,
  getProjectRevenueShares,
  getProjectOpLogs,
  getProjectHub,
  listTargetCosts,
  createTargetCost,
  updateTargetCost,
  deleteTargetCost,
} from "@/api/project"
import {
  getProjectProgress,
  getProjectTimeline,
  advanceStage,
} from "@/api/workflow"
import {
  listContracts,
  createContract,
  listProcurementRequests,
  createProcurementRequest,
  listPurchaseOrders,
  listGoodsReceipts,
  createGoodsReceipt,
  getThreeWayMatch,
} from "@/api/erp"
import {
  listWorkHours,
  createWorkHour,
  getWorkHourSummary,
  listWeeklyPlans,
  createWeeklyPlan,
  listDailyPlans,
  createDailyPlan,
  updateWeeklyPlan,
} from "@/api/business"
import {
  listFunds,
  createFund,
} from "@/api/petty-cash"
import { createDailyExpense } from "@/api/business"
import { listInvoices, createInvoice } from "@/api/finance"
import OcrUploadButton from "@/components/ocr/OcrUploadButton"
import OcrFieldMapper from "@/components/ocr/OcrFieldMapper"
import BatchToolbar from "@/components/batch/BatchToolbar"
import GaodeMap from "@/components/map/GaodeMap"
import ProjectHubPage from "@/pages/project/ProjectHubPage"
import type { Project } from "@/api/types"
import type { ContractOcrResult, InvoiceOcrResult } from "@/api/ocr"

const TYPE_LABELS: Record<string, string> = {
  pure_engineering: "纯工程",
  charging_epc: "充电站EPC",
  self_invest_build: "自投自建",
  cooperative_build: "合作共建",
  pure_epc: "纯工程EPC",
  hv_epc: "高压EPC",
  lv_epc: "低压EPC",
  equipment_sale: "设备销售",
  co_invest: "合作共投",
  full_invest: "全投",
}

const COST_TYPE_LABELS: Record<string, string> = {
  travel: "差旅",
  petty_cash: "备用金",
  salary: "工资",
  contract: "合同",
  material: "材料",
  equipment: "设备",
  other: "其他",
}

const STATION_TYPE_LABELS: Record<string, string> = {
  public: "公共",
  private: "私有",
  fleet: "车队",
  highway: "高速",
  community: "社区",
  commercial: "商业",
}

const STATION_STATUS_LABELS: Record<string, string> = {
  planning: "规划中",
  constructing: "建设中",
  operating: "运营中",
  maintenance: "维护中",
  closed: "已关闭",
}

const SAFETY_STATUS_LABELS: Record<string, string> = {
  normal: "正常",
  warning: "警告",
  danger: "危险",
}

const REVENUE_SHARE_STATUS: Record<string, string> = {
  pending: "待结算",
  paid: "已结算",
  partial: "部分结算",
  overdue: "逾期",
}

const WEATHER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  晴: Sun,
  多云: Cloud,
  阴: Cloud,
  小雨: CloudRain,
  大雨: CloudRain,
  雪: CloudSnow,
}

export default function ProjectCockpit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const userId = String(useAuthStore((s) => s.user?.id) ?? "")
  const [activeTab, setActiveTab] = useState("overview")
  const [viewMode, setViewMode] = useState<"classic" | "hub">("hub")

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  })

  const { data: costSummary } = useQuery({
    queryKey: ["project-cost-summary", id],
    queryFn: () => getProjectCostSummary(id!),
    enabled: !!id,
  })

  const { data: profitHub } = useQuery({
    queryKey: ["project-profit", id],
    queryFn: () => getProjectHub(id!),
    enabled: !!id,
  })

  const { data: workflowProgress } = useQuery({
    queryKey: ["workflow-progress", id],
    queryFn: () => getProjectProgress(id!),
    enabled: !!id,
  })

  const { data: timeline } = useQuery({
    queryKey: ["workflow-timeline", id],
    queryFn: () => getProjectTimeline(id!),
    enabled: !!id,
  })

  const { data: contractsData } = useQuery({
    queryKey: ["project-contracts", id],
    queryFn: () => listContracts({ project_id: id!, page: 1, page_size: 100 }),
    enabled: !!id && activeTab === "contracts",
  })

  const { data: prData } = useQuery({
    queryKey: ["project-pr", id],
    queryFn: () => listProcurementRequests({ project_id: id!, page: 1, page_size: 100 }),
    enabled: !!id && activeTab === "procurement",
  })

  const { data: poData } = useQuery({
    queryKey: ["project-po", id],
    queryFn: () => listPurchaseOrders({ project_id: id!, page: 1, page_size: 100 }),
    enabled: !!id && activeTab === "procurement",
  })

  const { data: grData } = useQuery({
    queryKey: ["project-gr", id],
    queryFn: () => listGoodsReceipts({ project_id: id!, page: 1, page_size: 100 }),
    enabled: !!id && activeTab === "procurement",
  })

  const { data: workHoursData } = useQuery({
    queryKey: ["project-work-hours", id],
    queryFn: () => listWorkHours({ project_id: id!, page: 1, page_size: 100 }),
    enabled: !!id && activeTab === "workhours",
  })

  const { data: workHourSummary } = useQuery({
    queryKey: ["project-wh-summary", id],
    queryFn: () => getWorkHourSummary({ project_id: id! }),
    enabled: !!id && activeTab === "workhours",
  })

  const { data: weeklyPlansData } = useQuery({
    queryKey: ["project-weekly-plans", id],
    queryFn: () => listWeeklyPlans({ project_id: id!, page: 1, page_size: 20 }),
    enabled: !!id && activeTab === "workhours",
  })

  const { data: dailyPlansData } = useQuery({
    queryKey: ["project-daily-plans", id],
    queryFn: () => listDailyPlans({ project_id: id!, page: 1, page_size: 30 }),
    enabled: !!id && activeTab === "workhours",
  })

  const { data: fundsData } = useQuery({
    queryKey: ["project-funds", id],
    queryFn: () => listFunds({ project_id: id!, page: 1, page_size: 100 }),
    enabled: !!id,
  })

  const { data: constructionLogsData } = useQuery({
    queryKey: ["project-construction-logs", id],
    queryFn: () => listConstructionLogs(id!, { page: 1, page_size: 10 }),
    enabled: !!id && activeTab === "overview",
  })

  const { data: projectStationsData } = useQuery({
    queryKey: ["project-stations", id],
    queryFn: () => getProjectStations(id!),
    enabled: !!id && activeTab === "operations",
  })

  const { data: opsSummaryData } = useQuery({
    queryKey: ["project-ops-summary", id],
    queryFn: () => getProjectOpsSummary(id!),
    enabled: !!id && activeTab === "operations",
  })

  const { data: revenueSharesData } = useQuery({
    queryKey: ["project-revenue-shares", id],
    queryFn: () => getProjectRevenueShares(id!),
    enabled: !!id && activeTab === "operations",
  })

  const { data: opLogsData } = useQuery({
    queryKey: ["project-op-logs", id],
    queryFn: () => getProjectOpLogs(id!, { page: 1, page_size: 50 }),
    enabled: !!id && activeTab === "operations",
  })

  if (projectLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>项目不存在</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>返回看板</Button>
      </div>
    )
  }

  const totalBudget = costSummary?.budget ?? project.total_budget ?? 0
  const totalCost = costSummary?.total_cost ?? project.actual_cost ?? 0
  const remaining = totalBudget - totalCost
  const usageRate = costSummary?.budget_usage_rate ?? (totalBudget > 0 ? (totalCost / totalBudget) * 100 : 0)
  const byType = costSummary?.by_type ?? {}
  const monthlyTrend = costSummary?.monthly_trend ?? []
  const contracts = contractsData?.items ?? []
  const procurementRequests = prData?.items ?? []
  const purchaseOrders = poData?.items ?? []
  const goodsReceipts = grData?.items ?? []
  const workHours = workHoursData?.items ?? []
  const stages = workflowProgress?.stages ?? []
  const isInvestProject = project.project_type === "co_invest" || project.project_type === "full_invest" || project.project_type === "self_invest_build" || project.project_type === "cooperative_build"
  const pettyCashBalance = fundsData?.items?.reduce((s: number, f: { remaining_amount: number }) => s + f.remaining_amount, 0) ?? 0
  const contractTotal = (contracts as any[]).reduce((s: number, c: any) => s + (c.total_amount ?? 0), 0)
  const profitInfo = (profitHub as any)?.profit as { type: string; contract_total: number; cost_total: number; investment: number; ops_revenue: number; ops_cost: number; profit: number; profit_rate: number } | undefined

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold truncate">{project.name}</h1>
            <Badge variant="outline">{TYPE_LABELS[project.project_type] ?? project.project_type}</Badge>
            <Badge>{project.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{project.project_code}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button size="sm" variant={viewMode === "hub" ? "default" : "ghost"} onClick={() => setViewMode("hub")} className="h-7 text-xs px-3">主线视图</Button>
          <Button size="sm" variant={viewMode === "classic" ? "default" : "ghost"} onClick={() => setViewMode("classic")} className="h-7 text-xs px-3">经典视图</Button>
        </div>
      </div>

      {viewMode === "hub" && id && <ProjectHubPage projectId={id} />}
      {viewMode === "classic" && (
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="timeline">流程时间线</TabsTrigger>
          <TabsTrigger value="cost">费用归集</TabsTrigger>
          <TabsTrigger value="target-cost">目标成本</TabsTrigger>
          <TabsTrigger value="contracts">合同与发票</TabsTrigger>
          <TabsTrigger value="procurement">采购</TabsTrigger>
          <TabsTrigger value="workhours">工时与计划</TabsTrigger>
          {isInvestProject && <TabsTrigger value="operations">运营</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            project={project}
            stages={stages}
            totalBudget={totalBudget}
            totalCost={totalCost}
            remaining={remaining}
            usageRate={usageRate}
            projectId={id!}
            contractTotal={contractTotal}
            pettyCashBalance={pettyCashBalance}
            timeline={timeline ?? []}
            constructionLogs={(constructionLogsData?.items ?? []) as any}
            profitInfo={profitInfo}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <TimelineTab
            projectId={id!}
            stages={stages}
            timeline={timeline ?? []}
          />
        </TabsContent>

        <TabsContent value="cost">
          <CostTab
            projectId={id!}
            byType={byType}
            monthlyTrend={monthlyTrend}
            totalBudget={totalBudget}
            totalCost={totalCost}
          />
        </TabsContent>

        <TabsContent value="target-cost">
          <TargetCostTab projectId={id!} />
        </TabsContent>

        <TabsContent value="contracts">
          <ContractsTab
            projectId={id!}
            contracts={contracts as any}
          />
        </TabsContent>

        <TabsContent value="procurement">
          <ProcurementTab
            projectId={id!}
            procurementRequests={procurementRequests as any}
            purchaseOrders={purchaseOrders as any}
            goodsReceipts={goodsReceipts as any}
          />
        </TabsContent>

        <TabsContent value="workhours">
          <WorkHoursTab
            projectId={id!}
            workHours={workHours as any}
            whSummary={workHourSummary ?? null}
            weeklyPlans={(weeklyPlansData?.items ?? []) as any}
            dailyPlans={(dailyPlansData?.items ?? []) as any}
          />
        </TabsContent>

        {isInvestProject && (
          <TabsContent value="operations">
            <OperationsTab
              project={project}
              projectId={id!}
              stations={(projectStationsData?.items ?? []) as any}
              opsSummary={opsSummaryData ?? null}
              revenueShares={(revenueSharesData?.items ?? []) as any}
              opLogs={(opLogsData?.items ?? []) as any}
            />
          </TabsContent>
        )}
      </Tabs>
      )}
    </div>
  )
}

function OverviewTab({
  project,
  stages,
  totalBudget,
  totalCost,
  remaining,
  usageRate,
  projectId,
  contractTotal,
  pettyCashBalance,
  timeline,
  constructionLogs,
  profitInfo,
}: {
  project: Project
  stages: { code: string; name: string; order: number; status: string; started_at?: string; completed_at?: string }[]
  totalBudget: number
  totalCost: number
  remaining: number
  usageRate: number
  projectId: string
  contractTotal: number
  pettyCashBalance: number
  timeline: { id: string; from_stage: string; to_stage: string; action: string; operator: string; remark?: string; created_at: string }[]
  constructionLogs: { id: string; log_date: string; weather: string; work_content: string; worker_count: number }[]
  profitInfo?: { type: string; contract_total: number; cost_total: number; investment: number; ops_revenue: number; ops_cost: number; profit: number; profit_rate: number }
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [location, setLocation] = useState<{ lng: number; lat: number; address?: string } | undefined>(
    project.address ? { lng: 116.397, lat: 39.909, address: project.address } : undefined
  )
  const currentStage = stages.find((s) => s.status === "in_progress")
  const [progressValue, setProgressValue] = useState(project.progress)
  const [statusDialog, setStatusDialog] = useState(false)
  const [newStatus, setNewStatus] = useState(project.status)

  const statusMut = useMutation({
    mutationFn: (status: string) => updateProject(projectId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] })
      toast.success("状态已更新")
      setStatusDialog(false)
    },
    onError: () => toast.error("更新失败"),
  })

  const progressMut = useMutation({
    mutationFn: (progress: number) => updateProjectProgress(projectId, { progress }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] })
      toast.success("进度已更新")
    },
    onError: () => toast.error("更新失败"),
  })

  const recentActivity = timeline.slice(0, 10)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <DollarSign className="size-4 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase">预算</span>
              </div>
              <p className="text-lg font-bold mt-1">¥{(totalBudget / 10000).toFixed(1)}万</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <TrendingUp className="size-4 text-rose-500" />
                <span className="text-[10px] text-muted-foreground uppercase">已花费</span>
              </div>
              <p className="text-lg font-bold mt-1 text-rose-500">¥{(totalCost / 10000).toFixed(1)}万</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Activity className="size-4 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase">使用率</span>
              </div>
              <p className="text-lg font-bold mt-1">{usageRate.toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <FileText className="size-4 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase">合同额</span>
              </div>
              <p className="text-lg font-bold mt-1">¥{(contractTotal / 10000).toFixed(1)}万</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Wallet className="size-4 text-emerald-500" />
                <span className="text-[10px] text-muted-foreground uppercase">备用金</span>
              </div>
              <p className="text-lg font-bold mt-1 text-emerald-500">¥{pettyCashBalance.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        {profitInfo && (
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="size-4 text-amber-500" />
                  {profitInfo.type === "invest" ? "投资回报分析" : "工程利润分析"}
                </h3>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${profitInfo.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {profitInfo.profit >= 0 ? "+" : ""}¥{(profitInfo.profit / 10000).toFixed(2)}万
                  </p>
                  <p className="text-xs text-muted-foreground">
                    利润率 {profitInfo.profit_rate > 0 ? "+" : ""}{profitInfo.profit_rate}%
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {profitInfo.type === "invest" ? (
                  <>
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">总投资额</p>
                      <p className="font-semibold">¥{(profitInfo.investment / 10000).toFixed(1)}万</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-emerald-50">
                      <p className="text-xs text-muted-foreground">累计营收</p>
                      <p className="font-semibold text-emerald-600">¥{(profitInfo.ops_revenue / 10000).toFixed(1)}万</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-rose-50">
                      <p className="text-xs text-muted-foreground">累计运营成本</p>
                      <p className="font-semibold text-rose-600">¥{(profitInfo.ops_cost / 10000).toFixed(1)}万</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-blue-50">
                      <p className="text-xs text-muted-foreground">投资回报率</p>
                      <p className="font-semibold text-blue-600">{profitInfo.investment > 0 ? ((profitInfo.ops_revenue / profitInfo.investment) * 100).toFixed(1) : 0}%</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">合同总额</p>
                      <p className="font-semibold">¥{(profitInfo.contract_total / 10000).toFixed(1)}万</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-rose-50">
                      <p className="text-xs text-muted-foreground">工程成本</p>
                      <p className="font-semibold text-rose-600">¥{(profitInfo.cost_total / 10000).toFixed(1)}万</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">成本占比</p>
                      <p className="font-semibold">{profitInfo.contract_total > 0 ? ((profitInfo.cost_total / profitInfo.contract_total) * 100).toFixed(1) : 0}%</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">毛利润率</p>
                      <p className={`font-semibold ${profitInfo.profit_rate >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{profitInfo.profit_rate}%</p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">项目进度</h3>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold">{progressValue}%</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => progressMut.mutate(progressValue)}
                  disabled={progressMut.isPending || progressValue === project.progress}
                >
                  {progressMut.isPending ? <Loader2 className="size-3 animate-spin" /> : "保存"}
                </Button>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={progressValue}
              onChange={(e) => setProgressValue(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
            />
            {currentStage && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">当前阶段：</span>
                <Badge variant="outline">{currentStage.name}</Badge>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">项目状态：</span>
              <Badge>{project.status}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setStatusDialog(true)}>变更</Button>
            </div>
          </CardContent>
        </Card>

        {stages.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">流程阶段</h3>
              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                {stages.map((stage, i) => (
                  <div key={stage.code} className="flex items-center shrink-0">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`flex size-8 items-center justify-center rounded-full ${
                        stage.status === "completed" ? "bg-emerald-500 text-white" :
                        stage.status === "in_progress" ? "bg-primary text-primary-foreground" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {stage.status === "completed" ? (
                          <CheckCircle2 className="size-4" />
                        ) : stage.status === "in_progress" ? (
                          <Clock className="size-4" />
                        ) : (
                          <Circle className="size-4" />
                        )}
                      </div>
                      <span className="text-[10px] text-center max-w-[60px] leading-tight">{stage.name}</span>
                    </div>
                    {i < stages.length - 1 && <ChevronRight className="size-4 text-muted-foreground mx-1" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">最近动态</h3>
            {recentActivity.length === 0 && constructionLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">暂无动态</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 text-sm">
                    <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 shrink-0 mt-0.5">
                      <Activity className="size-3 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p>
                        <span className="text-muted-foreground">{entry.from_stage}</span>
                        {" → "}
                        <span className="font-medium">{entry.to_stage}</span>
                        {" by "}
                        <span className="font-medium">{entry.operator}</span>
                      </p>
                      {entry.remark && <p className="text-xs text-muted-foreground">{entry.remark}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{format(new Date(entry.created_at), "MM-dd HH:mm")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">项目信息</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {project.province && <div><span className="text-muted-foreground">地区：</span>{project.province} {project.city}</div>}
              {project.start_date && <div><span className="text-muted-foreground">开始日期：</span>{format(new Date(project.start_date), "yyyy-MM-dd")}</div>}
              {project.end_date && <div><span className="text-muted-foreground">结束日期：</span>{format(new Date(project.end_date), "yyyy-MM-dd")}</div>}
              <div><span className="text-muted-foreground">项目类型：</span>{TYPE_LABELS[project.project_type] ?? project.project_type}</div>
              {project.description && <div className="col-span-2"><span className="text-muted-foreground">描述：</span>{project.description}</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3"><MapPin className="inline size-4 mr-1" />项目位置</h3>
            <GaodeMap value={location} onChange={setLocation} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>变更项目状态</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>当前状态: {project.status}</Label>
              <Select value={newStatus} onValueChange={(v) => { if (v) setNewStatus(v) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">规划中</SelectItem>
                  <SelectItem value="active">进行中</SelectItem>
                  <SelectItem value="paused">已暂停</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="closed">已关闭</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={() => statusMut.mutate(newStatus)} disabled={statusMut.isPending || newStatus === project.status}>
              {statusMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TimelineTab({
  projectId,
  stages,
  timeline,
}: {
  projectId: string
  stages: { code: string; name: string; order: number; status: string; started_at?: string; completed_at?: string; assignee?: string; remark?: string; auto_actions?: string[] }[]
  timeline: { id: string; from_stage: string; to_stage: string; action: string; operator: string; remark?: string; created_at: string }[]
}) {
  const qc = useQueryClient()
  const [advanceDialog, setAdvanceDialog] = useState<string | null>(null)
  const [remark, setRemark] = useState("")

  const advanceMut = useMutation({
    mutationFn: (stageCode: string) =>
      advanceStage(projectId, { target_stage_code: stageCode, action: "complete", data: { remark } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-progress", projectId] })
      qc.invalidateQueries({ queryKey: ["workflow-timeline", projectId] })
      toast.success("阶段已推进")
      setAdvanceDialog(null)
      setRemark("")
    },
    onError: () => toast.error("推进失败"),
  })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>流程阶段</CardTitle>
          <CardDescription>项目工作流各阶段状态与文档要求</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative space-y-0">
            {stages.map((stage, i) => (
              <div key={stage.code} className="flex gap-3 pb-6 last:pb-0">
                <div className="flex flex-col items-center">
                  <div className={`flex size-8 items-center justify-center rounded-full shrink-0 ${
                    stage.status === "completed" ? "bg-emerald-500 text-white" :
                    stage.status === "in_progress" ? "bg-primary text-primary-foreground animate-pulse" :
                    stage.status === "skipped" ? "bg-muted text-muted-foreground" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {stage.status === "completed" ? (
                      <CheckCircle2 className="size-4" />
                    ) : stage.status === "in_progress" ? (
                      <Clock className="size-4" />
                    ) : (
                      <span className="text-xs">{i + 1}</span>
                    )}
                  </div>
                  {i < stages.length - 1 && (
                    <div className={`w-0.5 flex-1 min-h-[16px] ${
                      stage.status === "completed" ? "bg-emerald-500" : "bg-muted"
                    }`} />
                  )}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${stage.status === "pending" ? "text-muted-foreground" : ""}`}>
                      {stage.name}
                    </span>
                    <Badge variant={
                      stage.status === "completed" ? "default" :
                      stage.status === "in_progress" ? "outline" :
                      "secondary"
                    } className="text-[10px]">
                      {stage.status === "completed" ? "已完成" :
                       stage.status === "in_progress" ? "进行中" :
                       stage.status === "skipped" ? "已跳过" : "待开始"}
                    </Badge>
                  </div>
                  {stage.started_at && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      开始: {format(new Date(stage.started_at), "yyyy-MM-dd HH:mm")}
                    </p>
                  )}
                  {stage.completed_at && (
                    <p className="text-xs text-muted-foreground">
                      完成: {format(new Date(stage.completed_at), "yyyy-MM-dd HH:mm")}
                    </p>
                  )}
                  {stage.remark && <p className="text-xs text-muted-foreground mt-0.5">{stage.remark}</p>}
                  {stage.status === "in_progress" && (
                    <Button size="sm" className="mt-2" onClick={() => setAdvanceDialog(stage.code)}>
                      推进到下一阶段
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>操作记录</CardTitle>
          <CardDescription>流程变更历史</CardDescription>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>操作</TableHead>
                  <TableHead>操作人</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeline.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="text-sm">
                        <span className="text-muted-foreground">{entry.from_stage}</span>
                        {" → "}
                        <span className="font-medium">{entry.to_stage}</span>
                      </div>
                      {entry.remark && <p className="text-xs text-muted-foreground">{entry.remark}</p>}
                    </TableCell>
                    <TableCell>{entry.operator}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(new Date(entry.created_at), "MM-dd HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!advanceDialog} onOpenChange={(open) => !open && setAdvanceDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>推进阶段</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>上传文档（可选）</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Upload className="size-3.5" />
                  选择文件
                </Button>
                <span className="text-xs text-muted-foreground">支持 PDF、图片</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>备注</Label>
              <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="推进说明..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button
              onClick={() => advanceDialog && advanceMut.mutate(advanceDialog)}
              disabled={advanceMut.isPending}
            >
              {advanceMut.isPending && <Loader2 className="size-4 animate-spin" />}
              确认推进
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CostTab({
  projectId,
  byType,
  monthlyTrend,
  totalBudget,
  totalCost,
}: {
  projectId: string
  byType: Record<string, number>
  monthlyTrend: { month: string; cost: number; accumulated: number }[]
  totalBudget: number
  totalCost: number
}) {
  const qc = useQueryClient()
  const userId = String(useAuthStore((s) => s.user?.id) ?? "")
  const [expenseDialog, setExpenseDialog] = useState(false)
  const [fundDialog, setFundDialog] = useState(false)
  const [hasTax, setHasTax] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    category: "travel",
    amount: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    origin: "",
    destination: "",
    travel_purpose: "",
    vehicle: "car",
    supplier: "",
    qty: "",
    unit_price: "",
  })
  const [fundForm, setFundForm] = useState({
    amount: "",
    purpose: "",
    expected_return_date: "",
  })

  const expenseMut = useMutation({
    mutationFn: () =>
      createDailyExpense({
        project_id: projectId,
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        description: expenseForm.description,
        expense_date: expenseForm.date,
        payer_type: "project",
      } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-cost-summary", projectId] })
      toast.success("费用已记录")
      setExpenseDialog(false)
      setExpenseForm({ category: "travel", amount: "", description: "", date: new Date().toISOString().split("T")[0], origin: "", destination: "", travel_purpose: "", vehicle: "car", supplier: "", qty: "", unit_price: "" })
    },
    onError: () => toast.error("记录失败"),
  })

  const fundMut = useMutation({
    mutationFn: () =>
      createFund({
        project_id: projectId,
        employee_id: userId,
        amount: Number(fundForm.amount),
        purpose: fundForm.purpose,
        issue_date: new Date().toISOString().split("T")[0],
        expected_return_date: fundForm.expected_return_date || undefined,
      } as Parameters<typeof createFund>[0]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-cost-summary", projectId] })
      qc.invalidateQueries({ queryKey: ["project-funds", projectId] })
      qc.invalidateQueries({ queryKey: ["project-hub", projectId] })
      toast.success("备用金申请已提交")
      setFundDialog(false)
      setFundForm({ amount: "", purpose: "", expected_return_date: "" })
    },
    onError: () => toast.error("申请失败"),
  })

  const costEntries = Object.entries(byType).sort((a, b) => b[1] - a[1])
  const isTravel = expenseForm.category === "travel"
  const isMaterial = expenseForm.category === "material"

  const metricCards = [
    { label: "总成本", value: totalCost, color: "" },
    { label: "差旅", value: byType.travel ?? 0, color: "text-blue-500" },
    { label: "备用金", value: byType.petty_cash ?? 0, color: "text-emerald-500" },
    { label: "工资", value: byType.salary ?? 0, color: "text-purple-500" },
    { label: "合同", value: byType.contract ?? 0, color: "text-orange-500" },
    { label: "其他", value: (byType.other ?? 0) + (byType.equipment ?? 0) + (byType.material ?? 0), color: "text-muted-foreground" },
  ]

  const chartData = monthlyTrend.map((m) => ({
    month: m.month,
    cost: m.cost,
    accumulated: m.accumulated,
  }))

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setExpenseDialog(true)}><Plus className="size-3.5" />记一笔费用</Button>
        <Button variant="outline" size="sm" onClick={() => setFundDialog(true)}><Wallet className="size-3.5" />申请备用金</Button>
        <BatchToolbar entityType="project-lines" selectedIds={[]} templateType="project_line" onImportComplete={() => qc.invalidateQueries({ queryKey: ["project-cost-summary", projectId] })} />
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {metricCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className={`text-lg font-bold ${card.color}`}>¥{(card.value / 10000).toFixed(2)}万</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>月度费用趋势</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Legend />
                <Bar dataKey="cost" name="月度费用" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="accumulated" name="累计费用" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>费用明细</CardTitle></CardHeader>
        <CardContent>
          {costEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无费用数据</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>费用类型</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>占比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costEntries.map(([type, amount]) => (
                  <TableRow key={type}>
                    <TableCell><Badge variant="outline">{COST_TYPE_LABELS[type] ?? type}</Badge></TableCell>
                    <TableCell className="font-bold">¥{amount.toFixed(2)}</TableCell>
                    <TableCell>{totalCost > 0 ? ((amount / totalCost) * 100).toFixed(1) + "%" : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={expenseDialog} onOpenChange={setExpenseDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>记一笔费用</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>费用类型 *</Label>
                <Select value={expenseForm.category} onValueChange={(v) => { if (v) setExpenseForm((f) => ({ ...f, category: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="travel">差旅</SelectItem>
                    <SelectItem value="petty_cash">备用金</SelectItem>
                    <SelectItem value="material">材料</SelectItem>
                    <SelectItem value="equipment">设备</SelectItem>
                    <SelectItem value="salary">人工</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>日期</Label>
                <Input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>金额 *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm">¥</span>
                  <Input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="flex-1" />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={hasTax} onCheckedChange={setHasTax} />
                <Label>含税</Label>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>说明</Label>
              <Textarea value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} placeholder="费用说明..." rows={2} />
            </div>

            <div className="grid gap-2">
              <Label>上传票据</Label>
              <OcrUploadButton type="receipt" onRecognized={() => {}} />
            </div>

            {isTravel && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-sm font-medium mb-2">差旅信息</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1"><Label className="text-xs">出发地</Label><Input value={expenseForm.origin} onChange={(e) => setExpenseForm((f) => ({ ...f, origin: e.target.value }))} placeholder="出发城市" /></div>
                    <div className="grid gap-1"><Label className="text-xs">目的地</Label><Input value={expenseForm.destination} onChange={(e) => setExpenseForm((f) => ({ ...f, destination: e.target.value }))} placeholder="目的城市" /></div>
                    <div className="grid gap-1"><Label className="text-xs">出差事由</Label><Input value={expenseForm.travel_purpose} onChange={(e) => setExpenseForm((f) => ({ ...f, travel_purpose: e.target.value }))} /></div>
                    <div className="grid gap-1">
                      <Label className="text-xs">交通工具</Label>
                      <Select value={expenseForm.vehicle} onValueChange={(v) => { if (v) setExpenseForm((f) => ({ ...f, vehicle: v })) }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="car">自驾/打车</SelectItem>
                          <SelectItem value="train">火车</SelectItem>
                          <SelectItem value="plane">飞机</SelectItem>
                          <SelectItem value="bus">大巴</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {isMaterial && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-sm font-medium mb-2">材料信息</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="grid gap-1"><Label className="text-xs">供应商</Label><Input value={expenseForm.supplier} onChange={(e) => setExpenseForm((f) => ({ ...f, supplier: e.target.value }))} /></div>
                    <div className="grid gap-1"><Label className="text-xs">数量</Label><Input type="number" value={expenseForm.qty} onChange={(e) => setExpenseForm((f) => ({ ...f, qty: e.target.value }))} /></div>
                    <div className="grid gap-1"><Label className="text-xs">单价</Label><Input type="number" step="0.01" value={expenseForm.unit_price} onChange={(e) => setExpenseForm((f) => ({ ...f, unit_price: e.target.value }))} /></div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={() => expenseMut.mutate()} disabled={expenseMut.isPending || !expenseForm.amount}>
              {expenseMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fundDialog} onOpenChange={setFundDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>申请备用金</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>金额 *</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm">¥</span>
                <Input type="number" step="0.01" value={fundForm.amount} onChange={(e) => setFundForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>用途 *</Label>
              <Textarea value={fundForm.purpose} onChange={(e) => setFundForm((f) => ({ ...f, purpose: e.target.value }))} placeholder="备用金用途..." rows={2} />
            </div>
            <div className="grid gap-2">
              <Label>预计归还日期</Label>
              <Input type="date" value={fundForm.expected_return_date} onChange={(e) => setFundForm((f) => ({ ...f, expected_return_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={() => fundMut.mutate()} disabled={fundMut.isPending || !fundForm.amount || !fundForm.purpose}>
              {fundMut.isPending && <Loader2 className="size-4 animate-spin" />}提交申请
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ContractsTab({
  projectId,
  contracts,
}: {
  projectId: string
  contracts: { id: string; contract_no: string; name: string; party_a: string; party_b: string; total_amount: number; status: string; contract_type?: string; signing_date?: string; start_date?: string; end_date?: string; remark?: string; attachments?: { name: string; url: string; size?: number }[] }[]
}) {
  const qc = useQueryClient()
  const [ocrData, setOcrData] = useState<Record<string, unknown> | null>(null)
  const [showMapper, setShowMapper] = useState(false)
  const [contractDialog, setContractDialog] = useState(false)
  const [invoiceDialog, setInvoiceDialog] = useState<string | null>(null)
  const [expandedContract, setExpandedContract] = useState<string | null>(null)
  const [contractForm, setContractForm] = useState({
    contract_no: "", name: "", contract_type: "epc", party_a: "", party_b: "",
    total_amount: "", signing_date: "", start_date: "", end_date: "",
    payment_method: "milestone", warranty_rate: "", warranty_months: "", main_terms: "",
  })
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_no: "", invoice_type: "special", total_amount: "", tax_amount: "", seller_name: "", issue_date: "",
  })

  const contractFields = [
    { key: "contract_no", label: "合同编号" },
    { key: "contract_name", label: "合同名称" },
    { key: "party_a", label: "甲方" },
    { key: "party_b", label: "乙方" },
    { key: "total_amount", label: "金额" },
    { key: "start_date", label: "开始日期" },
    { key: "end_date", label: "结束日期" },
  ]

  const createContractMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      createContract({ ...data, project_id: projectId } as Parameters<typeof createContract>[0]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-contracts", projectId] })
      qc.invalidateQueries({ queryKey: ["project-hub", projectId] })
      qc.invalidateQueries({ queryKey: ["project-profit", projectId] })
      toast.success("合同已创建")
      setOcrData(null)
      setShowMapper(false)
      setContractDialog(false)
    },
    onError: () => toast.error("创建失败"),
  })

  const createInvoiceMut = useMutation({
    mutationFn: () => createInvoice({
      invoice_no: invoiceForm.invoice_no,
      invoice_type: invoiceForm.invoice_type,
      total_amount: Number(invoiceForm.total_amount) || 0,
      tax_amount: Number(invoiceForm.tax_amount) || 0,
      seller_name: invoiceForm.seller_name,
      issue_date: invoiceForm.issue_date || undefined,
      direction: "receivable",
      project_id: projectId,
      contract_id: invoiceDialog || undefined,
    } as Parameters<typeof createInvoice>[0]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-hub", projectId] })
      qc.invalidateQueries({ queryKey: ["project-profit", projectId] })
      qc.invalidateQueries({ queryKey: ["project-contracts", projectId] })
      toast.success("发票已创建")
      setInvoiceDialog(null)
      setInvoiceForm({ invoice_no: "", invoice_type: "special", total_amount: "", tax_amount: "", seller_name: "", issue_date: "" })
    },
    onError: () => toast.error("创建失败"),
  })

  const handleContractOcr = (data: Record<string, unknown>) => {
    setOcrData(data)
    setShowMapper(true)
    setContractForm((f) => ({
      ...f,
      contract_no: (data.contract_no as string) ?? f.contract_no,
      name: (data.contract_name as string) ?? f.name,
      party_a: (data.party_a as string) ?? f.party_a,
      party_b: (data.party_b as string) ?? f.party_b,
      total_amount: data.total_amount != null ? String(data.total_amount) : f.total_amount,
      signing_date: (data.signing_date as string) ?? f.signing_date,
      start_date: (data.start_date as string) ?? f.start_date,
      end_date: (data.end_date as string) ?? f.end_date,
    }))
  }

  const handleInvoiceOcr = (data: Record<string, unknown>) => {
    setInvoiceForm((f) => ({
      ...f,
      invoice_no: (data.invoice_no as string) ?? f.invoice_no,
      invoice_type: (data.invoice_type as string) ?? f.invoice_type,
      total_amount: data.total_amount != null ? String(data.total_amount) : f.total_amount,
      tax_amount: data.tax_amount != null ? String(data.tax_amount) : f.tax_amount,
      seller_name: (data.seller_name as string) ?? f.seller_name,
      issue_date: (data.issue_date as string) ?? f.issue_date,
    }))
  }

  const totalContractAmount = contracts.reduce((s, c) => s + c.total_amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setContractDialog(true)}>
          <Plus className="size-3.5" />新建合同
        </Button>
        <OcrUploadButton type="contract" onRecognized={handleContractOcr} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">合同数量</p><p className="text-xl font-bold">{contracts.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">合同总额</p><p className="text-xl font-bold">¥{(totalContractAmount / 10000).toFixed(2)}万</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">执行中</p><p className="text-xl font-bold">{contracts.filter((c) => c.status === "active").length}</p></CardContent></Card>
      </div>

      {showMapper && ocrData && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">OCR识别结果</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => { setOcrData(null); setShowMapper(false) }}>
                <X className="size-4" />
              </Button>
            </div>
            <OcrFieldMapper
              ocrData={ocrData}
              fields={contractFields}
              onConfirm={(mapped) => createContractMut.mutate(mapped)}
            />
          </CardContent>
        </Card>
      )}

      {contracts.map((c) => (
        <Card key={c.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{c.contract_no}</span>
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                </div>
                <h4 className="font-semibold">{c.name}</h4>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>甲方: {c.party_a}</span>
                  <span>乙方: {c.party_b}</span>
                  <span className="font-bold text-foreground">¥{c.total_amount.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setInvoiceDialog(c.id)}>
                  上传发票
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setExpandedContract(expandedContract === c.id ? null : c.id)}>
                  {expandedContract === c.id ? "收起" : "展开"}
                </Button>
              </div>
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>付款进度</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[200px]">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${c.status === "completed" ? 100 : 30}%` }} />
                </div>
              </div>
            </div>
            {expandedContract === c.id && (
              <div className="mt-3 pt-3 border-t space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  {c.contract_type && <div><span className="text-muted-foreground">类型：</span>{c.contract_type}</div>}
                  {c.signing_date && <div><span className="text-muted-foreground">签订日期：</span>{c.signing_date}</div>}
                  {c.start_date && <div><span className="text-muted-foreground">开始日期：</span>{c.start_date}</div>}
                  {c.end_date && <div><span className="text-muted-foreground">结束日期：</span>{c.end_date}</div>}
                  {c.remark && <div className="col-span-3"><span className="text-muted-foreground">备注：</span>{c.remark}</div>}
                </div>
                {c.attachments && c.attachments.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">合同附件</p>
                    <div className="flex flex-wrap gap-2">
                      {c.attachments.map((att, i) => (
                        <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-muted">
                          <FileText className="size-3" />
                          {att.name}
                          {att.size && <span className="text-muted-foreground">({(att.size / 1024).toFixed(0)}KB)</span>}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {contracts.length === 0 && (
        <Card>
          <CardContent className="text-center text-muted-foreground py-8">暂无合同</CardContent>
        </Card>
      )}

      <Dialog open={contractDialog} onOpenChange={(open) => { setContractDialog(open); if (!open) setContractForm({ contract_no: "", name: "", contract_type: "epc", party_a: "", party_b: "", total_amount: "", signing_date: "", start_date: "", end_date: "", payment_method: "milestone", warranty_rate: "", warranty_months: "", main_terms: "" }); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>新建合同</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="flex justify-end"><OcrUploadButton type="contract" onRecognized={handleContractOcr} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>合同编号 *</Label><Input value={contractForm.contract_no} onChange={(e) => setContractForm((f) => ({ ...f, contract_no: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>合同名称 *</Label><Input value={contractForm.name} onChange={(e) => setContractForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="grid gap-2">
                <Label>合同类型</Label>
                <Select value={contractForm.contract_type} onValueChange={(v) => { if (v) setContractForm((f) => ({ ...f, contract_type: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="epc">EPC总承包</SelectItem>
                    <SelectItem value="civil_construction">土建施工</SelectItem>
                    <SelectItem value="hv_construction">高压工程施工</SelectItem>
                    <SelectItem value="lv_construction">低压工程施工</SelectItem>
                    <SelectItem value="ancillary_construction">附属设施施工</SelectItem>
                    <SelectItem value="transformer_purchase">变压器采购</SelectItem>
                    <SelectItem value="cable_purchase">电缆采购</SelectItem>
                    <SelectItem value="charging_pile_purchase">充电桩采购</SelectItem>
                    <SelectItem value="electrical_material_purchase">电气材料采购</SelectItem>
                    <SelectItem value="equipment_sale">设备销售</SelectItem>
                    <SelectItem value="service">服务合同</SelectItem>
                    <SelectItem value="cooperation">合作协议</SelectItem>
                    <SelectItem value="land_lease">租地合同</SelectItem>
                    <SelectItem value="supplement">补充协议</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>金额 *</Label><div className="flex items-center gap-1"><span>¥</span><Input type="number" step="0.01" value={contractForm.total_amount} onChange={(e) => setContractForm((f) => ({ ...f, total_amount: e.target.value }))} /></div></div>
              <div className="grid gap-2"><Label>甲方</Label><Input value={contractForm.party_a} onChange={(e) => setContractForm((f) => ({ ...f, party_a: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>乙方</Label><Input value={contractForm.party_b} onChange={(e) => setContractForm((f) => ({ ...f, party_b: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>签订日期</Label><Input type="date" value={contractForm.signing_date} onChange={(e) => setContractForm((f) => ({ ...f, signing_date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>开始日期</Label><Input type="date" value={contractForm.start_date} onChange={(e) => setContractForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>结束日期</Label><Input type="date" value={contractForm.end_date} onChange={(e) => setContractForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
              <div className="grid gap-2">
                <Label>付款方式</Label>
                <Select value={contractForm.payment_method} onValueChange={(v) => { if (v) setContractForm((f) => ({ ...f, payment_method: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">一次性</SelectItem>
                    <SelectItem value="installment">分期</SelectItem>
                    <SelectItem value="milestone">里程碑</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>质保金比例(%)</Label><Input type="number" value={contractForm.warranty_rate} onChange={(e) => setContractForm((f) => ({ ...f, warranty_rate: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>质保期(月)</Label><Input type="number" value={contractForm.warranty_months} onChange={(e) => setContractForm((f) => ({ ...f, warranty_months: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>主要条款</Label><Textarea value={contractForm.main_terms} onChange={(e) => setContractForm((f) => ({ ...f, main_terms: e.target.value }))} rows={3} placeholder="合同主要条款..." /></div>
            <div className="grid gap-2">
              <Label>合同附件</Label>
              <input type="file" multiple onChange={async (e) => {
                const files = e.target.files
                if (!files?.length) return
                const fd = new FormData()
                for (let i = 0; i < files.length; i++) fd.append("files", files[i])
                try {
                  const res = await fetch("/api/minio/upload", { method: "POST", body: fd })
                  const urls = await res.json()
                  toast.success(`${files.length}个文件已上传`)
                } catch { toast.error("上传失败") }
              }} className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractDialog(false)}>取消</Button>
            <Button disabled={createContractMut.isPending || !contractForm.contract_no || !contractForm.name} onClick={() => createContractMut.mutate(contractForm)}>
              {createContractMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!invoiceDialog} onOpenChange={(open) => !open && setInvoiceDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>上传发票</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex justify-end"><OcrUploadButton type="invoice" onRecognized={handleInvoiceOcr} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>发票号 *</Label><Input value={invoiceForm.invoice_no} onChange={(e) => setInvoiceForm((f) => ({ ...f, invoice_no: e.target.value }))} /></div>
              <div className="grid gap-2">
                <Label>发票类型</Label>
                <Select value={invoiceForm.invoice_type} onValueChange={(v) => setInvoiceForm((f) => ({ ...f, invoice_type: v ?? "special" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="special">专票</SelectItem><SelectItem value="normal">普票</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>金额</Label><Input type="number" step="0.01" value={invoiceForm.total_amount} onChange={(e) => setInvoiceForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>税额</Label><Input type="number" step="0.01" value={invoiceForm.tax_amount} onChange={(e) => setInvoiceForm((f) => ({ ...f, tax_amount: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>开票方</Label><Input value={invoiceForm.seller_name} onChange={(e) => setInvoiceForm((f) => ({ ...f, seller_name: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>开票日期</Label><Input type="date" value={invoiceForm.issue_date} onChange={(e) => setInvoiceForm((f) => ({ ...f, issue_date: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialog(null)}>取消</Button>
            <Button disabled={createInvoiceMut.isPending} onClick={() => createInvoiceMut.mutate()}>
              {createInvoiceMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProcurementTab({
  projectId,
  procurementRequests,
  purchaseOrders,
  goodsReceipts,
}: {
  projectId: string
  procurementRequests: { id: string; title: string; requester_id: string; status: string; total_amount: number }[]
  purchaseOrders: { id: string; po_no: string; supplier_id?: string; status: string; total_amount: number; items?: { name: string; quantity: number; price: number; amount: number }[] }[]
  goodsReceipts: { id: string; po_id: string; received_date: string; status: string; quality_status: string }[]
}) {
  const qc = useQueryClient()
  const [prDialog, setPrDialog] = useState(false)
  const [grDialog, setGrDialog] = useState(false)
  const [threeWayMatch, setThreeWayMatch] = useState<unknown>(null)
  const [prItems, setPrItems] = useState([{ material: "", qty: "", unit_price: "" }])
  const [prForm, setPrForm] = useState({ title: "", urgency: "normal", justification: "" })
  const [grForm, setGrForm] = useState({ po_id: "", quality_check: true })

  const createPrMut = useMutation({
    mutationFn: () =>
      createProcurementRequest({
        title: prForm.title,
        total_amount: prItems.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0),
        project_id: projectId,
      } as Parameters<typeof createProcurementRequest>[0]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-pr", projectId] })
      toast.success("采购申请已创建")
      setPrDialog(false)
      setPrForm({ title: "", urgency: "normal", justification: "" })
      setPrItems([{ material: "", qty: "", unit_price: "" }])
    },
    onError: () => toast.error("创建失败"),
  })

  const createGrMut = useMutation({
    mutationFn: () => createGoodsReceipt({
      po_id: grForm.po_id,
      received_date: new Date().toISOString().split("T")[0],
      quality_status: grForm.quality_check ? "pass" : "pending",
      project_id: projectId,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-gr", projectId] })
      toast.success("收货记录已创建")
      setGrDialog(false)
    },
    onError: () => toast.error("创建失败"),
  })

  const addPrItem = () => setPrItems((prev) => [...prev, { material: "", qty: "", unit_price: "" }])
  const removePrItem = (idx: number) => setPrItems((prev) => prev.filter((_, i) => i !== idx))
  const updatePrItem = (idx: number, key: string, value: string) =>
    setPrItems((prev) => prev.map((item, i) => i === idx ? { ...item, [key]: value } : item))

  const handleThreeWayMatch = async (poId: string) => {
    try {
      const result = await getThreeWayMatch(poId)
      setThreeWayMatch(result)
    } catch {
      toast.error("获取三单匹配数据失败")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setPrDialog(true)}><Plus className="size-3.5" />新建采购申请</Button>
        <Button variant="outline" size="sm" onClick={() => setGrDialog(true)}><Package className="size-3.5" />收货登记</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>采购申请</CardTitle><CardDescription>本项目的采购流程</CardDescription></CardHeader>
        <CardContent>
          {procurementRequests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无采购记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>申请人</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procurementRequests.map((pr) => (
                  <TableRow key={pr.id}>
                    <TableCell className="font-medium">{pr.title}</TableCell>
                    <TableCell>{pr.requester_id}</TableCell>
                    <TableCell>¥{pr.total_amount.toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline">{pr.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>采购订单</CardTitle></CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无采购订单</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-mono text-xs">{po.po_no}</TableCell>
                    <TableCell>{po.supplier_id ?? "-"}</TableCell>
                    <TableCell>¥{po.total_amount.toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline">{po.status}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleThreeWayMatch(po.id)}>三单匹配</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>收货记录</CardTitle></CardHeader>
        <CardContent>
          {goodsReceipts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无收货记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>收货日期</TableHead>
                  <TableHead>质检状态</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goodsReceipts.map((gr) => (
                  <TableRow key={gr.id}>
                    <TableCell>{gr.po_id}</TableCell>
                    <TableCell>{gr.received_date}</TableCell>
                    <TableCell>
                      <Badge variant={gr.quality_status === "pass" ? "default" : "secondary"}>
                        {gr.quality_status === "pass" ? "合格" : "待检"}
                      </Badge>
                    </TableCell>
                    <TableCell><Badge variant="outline">{gr.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={prDialog} onOpenChange={setPrDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>新建采购申请</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2"><Label>标题 *</Label><Input value={prForm.title} onChange={(e) => setPrForm((f) => ({ ...f, title: e.target.value }))} placeholder="采购标题..." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>紧急程度</Label>
                <Select value={prForm.urgency} onValueChange={(v) => { if (v) setPrForm((f) => ({ ...f, urgency: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">普通</SelectItem>
                    <SelectItem value="urgent">紧急</SelectItem>
                    <SelectItem value="critical">特急</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>采购明细</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>物料/服务</TableHead>
                    <TableHead>数量</TableHead>
                    <TableHead>单价</TableHead>
                    <TableHead>预估金额</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prItems.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell><Input value={item.material} onChange={(e) => updatePrItem(idx, "material", e.target.value)} placeholder="物料名称" /></TableCell>
                      <TableCell><Input type="number" value={item.qty} onChange={(e) => updatePrItem(idx, "qty", e.target.value)} /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={item.unit_price} onChange={(e) => updatePrItem(idx, "unit_price", e.target.value)} /></TableCell>
                      <TableCell className="font-medium">¥{((Number(item.qty) || 0) * (Number(item.unit_price) || 0)).toFixed(2)}</TableCell>
                      <TableCell>{prItems.length > 1 && <Button variant="ghost" size="icon-sm" onClick={() => removePrItem(idx)}>×</Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button variant="outline" size="sm" onClick={addPrItem}>添加行</Button>
              <div className="text-right font-bold">合计: ¥{prItems.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0).toFixed(2)}</div>
            </div>
            <div className="grid gap-2"><Label>申请理由</Label><Textarea value={prForm.justification} onChange={(e) => setPrForm((f) => ({ ...f, justification: e.target.value }))} placeholder="采购理由..." rows={2} /></div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={() => createPrMut.mutate()} disabled={createPrMut.isPending || !prForm.title}>
              {createPrMut.isPending && <Loader2 className="size-4 animate-spin" />}提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={grDialog} onOpenChange={setGrDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>收货登记</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>采购订单 *</Label>
              <Select value={grForm.po_id} onValueChange={(v) => { if (v) setGrForm((f) => ({ ...f, po_id: v })) }}>
                <SelectTrigger><SelectValue placeholder="选择PO" /></SelectTrigger>
                <SelectContent>
                  {purchaseOrders.map((po) => <SelectItem key={po.id} value={po.id}>{po.po_no} - ¥{po.total_amount.toFixed(2)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={grForm.quality_check} onCheckedChange={(v) => setGrForm((f) => ({ ...f, quality_check: v }))} />
              <Label>质检通过</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrDialog(false)}>取消</Button>
            <Button onClick={() => createGrMut.mutate()} disabled={createGrMut.isPending || !grForm.po_id}>
              {createGrMut.isPending && <Loader2 className="size-4 animate-spin" />}确认收货
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function WorkHoursTab({
  projectId,
  workHours,
  whSummary,
  weeklyPlans,
  dailyPlans,
}: {
  projectId: string
  workHours: { id: string; employee_id: string; work_date: string; hours: number; work_type: string; overtime_hours: number; status: string }[]
  whSummary: { total_hours: number; total_overtime: number } | null
  weeklyPlans: { id: string; week_start: string; week_end: string; week_no: number; objectives: string; status: string; feedback?: string }[]
  dailyPlans: { id: string; plan_date: string; tasks?: string; status: string }[]
}) {
  const qc = useQueryClient()
  const [whDialog, setWhDialog] = useState(false)
  const [wpDialog, setWpDialog] = useState(false)
  const [logDialog, setLogDialog] = useState(false)
  const [feedbackDialog, setFeedbackDialog] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState("")
  const [whForm, setWhForm] = useState({
    work_date: new Date().toISOString().split("T")[0],
    hours: "8",
    work_type: "labor",
    overtime_hours: "0",
  })
  const [wpForm, setWpForm] = useState({ week_start: "", week_end: "", objectives: "" })
  const [logForm, setLogForm] = useState({ log_date: new Date().toISOString().split("T")[0], weather: "晴", temperature: "", work_content: "", worker_count: "0", equipment_used: "", materials_used: "", safety_status: "normal", quality_issues: "", execution_unit: "", feedback: "" })

  const createWhMut = useMutation({
    mutationFn: () => createWorkHour({ project_id: projectId, work_date: whForm.work_date, hours: Number(whForm.hours), work_type: whForm.work_type, overtime_hours: Number(whForm.overtime_hours) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-work-hours", projectId] }); qc.invalidateQueries({ queryKey: ["project-wh-summary", projectId] }); toast.success("工时已记录"); setWhDialog(false); setWhForm({ work_date: new Date().toISOString().split("T")[0], hours: "8", work_type: "labor", overtime_hours: "0" }) },
    onError: () => toast.error("记录失败"),
  })

  const createWpMut = useMutation({
    mutationFn: () => createWeeklyPlan({ project_id: projectId, week_start: wpForm.week_start, week_end: wpForm.week_end, objectives: wpForm.objectives, week_no: 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-weekly-plans", projectId] }); toast.success("周计划已创建"); setWpDialog(false); setWpForm({ week_start: "", week_end: "", objectives: "" }) },
    onError: () => toast.error("创建失败"),
  })

  const createLogMut = useMutation({
    mutationFn: () => createConstructionLog({
      project_id: projectId,
      log_date: logForm.log_date,
      weather: logForm.weather,
      temperature: logForm.temperature || undefined,
      work_content: logForm.work_content,
      worker_count: Number(logForm.worker_count),
      equipment_used: logForm.equipment_used || undefined,
      materials_used: logForm.materials_used || undefined,
      safety_status: logForm.safety_status,
      quality_issues: logForm.quality_issues || undefined,
      execution_unit: logForm.execution_unit || undefined,
      feedback: logForm.feedback || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-construction-logs", projectId] }); toast.success("日报已提交"); setLogDialog(false); setLogForm({ log_date: new Date().toISOString().split("T")[0], weather: "晴", temperature: "", work_content: "", worker_count: "0", equipment_used: "", materials_used: "", safety_status: "normal", quality_issues: "", execution_unit: "", feedback: "" }) },
    onError: () => toast.error("提交失败"),
  })

  const feedbackMut = useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: string }) => updateWeeklyPlan(id, { feedback, status: "reviewed" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-weekly-plans", projectId] }); toast.success("反馈已提交"); setFeedbackDialog(null); setFeedbackText("") },
    onError: () => toast.error("反馈失败"),
  })

  const totalHours = whSummary?.total_hours ?? workHours.reduce((s, wh) => s + wh.hours, 0)
  const totalOvertime = whSummary?.total_overtime ?? workHours.reduce((s, wh) => s + wh.overtime_hours, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>总工时: <strong className="text-foreground">{totalHours}h</strong></span>
          <span>加班: <strong className="text-foreground">{totalOvertime}h</strong></span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setLogDialog(true)}><ClipboardList className="size-3.5" />写日报</Button>
          <Button variant="outline" size="sm" onClick={() => setWpDialog(true)}><CalendarDays className="size-3.5" />周计划</Button>
          <Button variant="outline" size="sm" onClick={() => setWhDialog(true)}><Timer className="size-3.5" />记工时</Button>
        </div>
      </div>

      {weeklyPlans.length > 0 && (
        <Card>
          <CardHeader><CardTitle>本周计划</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {weeklyPlans.slice(0, 3).map((wp) => (
                <div key={wp.id} className="flex items-start gap-3 p-2 rounded border">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">第{wp.week_no}周</Badge>
                      <span className="text-xs text-muted-foreground">{wp.week_start} ~ {wp.week_end}</span>
                      <Badge variant={wp.status === "completed" ? "default" : wp.status === "reviewed" ? "outline" : "secondary"}>{wp.status}</Badge>
                    </div>
                    <p className="text-sm mt-1">{wp.objectives}</p>
                    {wp.feedback && <p className="text-xs text-blue-600 mt-1">反馈: {wp.feedback}</p>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setFeedbackDialog(wp.id); setFeedbackText(wp.feedback ?? "") }}>反馈</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {dailyPlans.length > 0 && (
        <Card>
          <CardHeader><CardTitle>日计划</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>任务</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyPlans.slice(0, 7).map((dp) => (
                  <TableRow key={dp.id}>
                    <TableCell>{dp.plan_date}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{dp.tasks ?? "-"}</TableCell>
                    <TableCell><Badge variant="secondary">{dp.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>工时记录</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>员工</TableHead>
                <TableHead>工时</TableHead>
                <TableHead>加班</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workHours.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">暂无工时记录</TableCell></TableRow>
              ) : (
                workHours.map((wh) => (
                  <TableRow key={wh.id}>
                    <TableCell>{wh.work_date}</TableCell>
                    <TableCell>{wh.employee_id}</TableCell>
                    <TableCell>{wh.hours}h</TableCell>
                    <TableCell>{wh.overtime_hours}h</TableCell>
                    <TableCell><Badge variant="outline">{wh.work_type}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{wh.status}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={whDialog} onOpenChange={setWhDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>记工时</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>日期</Label><Input type="date" value={whForm.work_date} onChange={(e) => setWhForm((f) => ({ ...f, work_date: e.target.value }))} /></div>
              <div className="grid gap-2">
                <Label>工时类型</Label>
                <Select value={whForm.work_type} onValueChange={(v) => { if (v) setWhForm((f) => ({ ...f, work_type: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="management">管理工时</SelectItem>
                    <SelectItem value="technical">技术工时</SelectItem>
                    <SelectItem value="labor">普通工时</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>工时</Label><Input type="number" value={whForm.hours} onChange={(e) => setWhForm((f) => ({ ...f, hours: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>加班工时</Label><Input type="number" value={whForm.overtime_hours} onChange={(e) => setWhForm((f) => ({ ...f, overtime_hours: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={() => createWhMut.mutate()} disabled={createWhMut.isPending}>
              {createWhMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wpDialog} onOpenChange={setWpDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>创建周计划</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>周开始日</Label><Input type="date" value={wpForm.week_start} onChange={(e) => setWpForm((f) => ({ ...f, week_start: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>周结束日</Label><Input type="date" value={wpForm.week_end} onChange={(e) => setWpForm((f) => ({ ...f, week_end: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>本周目标 *</Label><Textarea value={wpForm.objectives} onChange={(e) => setWpForm((f) => ({ ...f, objectives: e.target.value }))} rows={3} placeholder="本周工作目标..." /></div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={() => createWpMut.mutate()} disabled={createWpMut.isPending || !wpForm.objectives}>
              {createWpMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={logDialog} onOpenChange={setLogDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>写日报</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 [&>*]:min-w-0">
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>日期</Label>
                <Input type="date" value={logForm.log_date} onChange={(e) => setLogForm((f) => ({ ...f, log_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>天气</Label>
                <Select value={logForm.weather} onValueChange={(v) => { if (v) setLogForm((f) => ({ ...f, weather: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="晴">晴</SelectItem>
                    <SelectItem value="多云">多云</SelectItem>
                    <SelectItem value="阴">阴</SelectItem>
                    <SelectItem value="小雨">小雨</SelectItem>
                    <SelectItem value="大雨">大雨</SelectItem>
                    <SelectItem value="雪">雪</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>温度</Label>
                <Input value={logForm.temperature} onChange={(e) => setLogForm((f) => ({ ...f, temperature: e.target.value }))} placeholder="如 15~25℃" />
              </div>
            </div>
            <div className="grid gap-2"><Label>工作内容 *</Label><Textarea value={logForm.work_content} onChange={(e) => setLogForm((f) => ({ ...f, work_content: e.target.value }))} rows={3} placeholder="今日施工内容..." /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>工人数量</Label><Input type="number" value={logForm.worker_count} onChange={(e) => setLogForm((f) => ({ ...f, worker_count: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>安全状态</Label>
                <Select value={logForm.safety_status} onValueChange={(v) => { if (v) setLogForm((f) => ({ ...f, safety_status: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">正常</SelectItem>
                    <SelectItem value="warning">警告</SelectItem>
                    <SelectItem value="danger">危险</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>质量问题</Label><Input value={logForm.quality_issues} onChange={(e) => setLogForm((f) => ({ ...f, quality_issues: e.target.value }))} placeholder="可选" /></div>
            </div>
            <div className="grid gap-2"><Label>使用设备</Label><Input value={logForm.equipment_used} onChange={(e) => setLogForm((f) => ({ ...f, equipment_used: e.target.value }))} placeholder="如: 挖掘机x1, 吊车x1" /></div>
            <div className="grid gap-2"><Label>使用材料</Label><Input value={logForm.materials_used} onChange={(e) => setLogForm((f) => ({ ...f, materials_used: e.target.value }))} placeholder="如: 电缆100m, 配电箱x2" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>执行单位</Label><Input value={logForm.execution_unit} onChange={(e) => setLogForm((f) => ({ ...f, execution_unit: e.target.value }))} placeholder="如: XX建设公司" /></div>
              <div className="grid gap-2"><Label>反馈</Label><Input value={logForm.feedback} onChange={(e) => setLogForm((f) => ({ ...f, feedback: e.target.value }))} placeholder="现场反馈/问题" /></div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={() => createLogMut.mutate()} disabled={createLogMut.isPending || !logForm.work_content}>
              {createLogMut.isPending && <Loader2 className="size-4 animate-spin" />}提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!feedbackDialog} onOpenChange={(open) => { if (!open) setFeedbackDialog(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>周计划反馈</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <Textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} rows={4} placeholder="输入本周计划执行反馈..." />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={() => feedbackDialog && feedbackMut.mutate({ id: feedbackDialog, feedback: feedbackText })} disabled={feedbackMut.isPending || !feedbackText}>
              {feedbackMut.isPending && <Loader2 className="size-4 animate-spin" />}提交反馈
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OperationsTab({ project, projectId, stations, opsSummary, revenueShares, opLogs }: {
  project: Project; projectId: string;
  stations: { id: string; station_code: string; name: string; station_type: string; status: string; address?: string; total_parking?: number; power_capacity?: number; monthly_rent?: number; operation_start_date?: string; device_count: number }[];
  opsSummary: { monthly: { id: string; station_id: string; month: string; total_orders: number; total_kwh: number; total_energy_revenue: number; total_service_revenue: number; total_revenue: number; electricity_cost: number; rent_cost: number; depreciation: number; maintenance_cost: number; labor_cost: number; total_cost: number; gross_profit: number; gross_margin: number; status: string }[]; totals: { revenue: number; cost: number; profit: number; orders: number; kwh: number } } | null;
  revenueShares: { id: string; partnership_id: string; partner_name: string; station_id: string; period: string; total_revenue: number; our_share_ratio: number; our_share_amount: number; partner_share_amount: number; deduct_electricity: number; deduct_rent: number; deduct_maintenance: number; net_share_amount: number; payment_due_date?: string; payment_status: string }[];
  opLogs: { id: string; log_date: string; weather?: string; work_content?: string; worker_count: number; equipment_used?: string; materials_used?: string; safety_status: string; quality_issues?: string; created_at: string }[];
}) {
  const [selectedStation, setSelectedStation] = useState<string>("all")
  const qc = useQueryClient()
  const monthly = opsSummary?.monthly ?? []
  const totals = opsSummary?.totals ?? { revenue: 0, cost: 0, profit: 0, orders: 0, kwh: 0 }
  const investment = project.total_budget ?? 0
  const roiProgress = investment > 0 ? Math.min((totals.revenue / investment) * 100, 100) : 0
  const profitMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0

  const stationMap = useMemo(() => {
    const m: Record<string, string> = {}
    stations.forEach((s) => { m[s.id] = s.name })
    return m
  }, [stations])

  const filteredMonthly = selectedStation === "all" ? monthly : monthly.filter((m) => m.station_id === selectedStation)
  const filteredLogs = selectedStation === "all" ? opLogs : opLogs.filter((l: any) => l.station_id === selectedStation)

  const revenueChartData = filteredMonthly.map((f) => ({
    month: f.month,
    revenue: f.total_revenue,
    cost: f.total_cost,
    profit: f.gross_profit,
    kwh: f.total_kwh,
  }))

  const costBreakdown = useMemo(() => {
    if (filteredMonthly.length === 0) return []
    const acc = { electricity: 0, rent: 0, depreciation: 0, maintenance: 0, labor: 0 }
    filteredMonthly.forEach((m) => {
      acc.electricity += m.electricity_cost
      acc.rent += m.rent_cost
      acc.depreciation += m.depreciation
      acc.maintenance += m.maintenance_cost
      acc.labor += m.labor_cost
    })
    return [
      { label: "电费", value: acc.electricity, color: "bg-amber-500" },
      { label: "租金", value: acc.rent, color: "bg-blue-500" },
      { label: "折旧", value: acc.depreciation, color: "bg-purple-500" },
      { label: "维护", value: acc.maintenance, color: "bg-orange-500" },
      { label: "人工", value: acc.labor, color: "bg-emerald-500" },
    ].filter((c) => c.value > 0)
  }, [filteredMonthly])

  const totalCostBreakdown = costBreakdown.reduce((s, c) => s + c.value, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">充电站运营详情</h3>
          <Select value={selectedStation} onValueChange={(v) => { if (v) setSelectedStation(v) }}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="选择充电站" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部充电站</SelectItem>
              {stations.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <DollarSign className="size-4 text-emerald-500" />
              <span className="text-[10px] text-muted-foreground uppercase">累计收入</span>
            </div>
            <p className="text-lg font-bold mt-1 text-emerald-500">¥{(totals.revenue / 10000).toFixed(2)}万</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <TrendingUp className="size-4 text-rose-500" />
              <span className="text-[10px] text-muted-foreground uppercase">累计成本</span>
            </div>
            <p className="text-lg font-bold mt-1 text-rose-500">¥{(totals.cost / 10000).toFixed(2)}万</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Activity className="size-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase">净利润</span>
            </div>
            <p className={`text-lg font-bold mt-1 ${totals.profit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              ¥{(totals.profit / 10000).toFixed(2)}万
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <BarChart3 className="size-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase">利润率</span>
            </div>
            <p className="text-lg font-bold mt-1">{profitMargin.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Timer className="size-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase">充电量</span>
            </div>
            <p className="text-lg font-bold mt-1">{(totals.kwh / 10000).toFixed(2)}万kWh</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>ROI 回收进度</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">投资回收率</span>
              <span className="font-bold text-lg">{roiProgress.toFixed(1)}%</span>
            </div>
            <div className="h-4 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${roiProgress >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${Math.min(roiProgress, 100)}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-4 text-center text-xs text-muted-foreground">
              <div><span className="block font-semibold text-foreground">¥{((investment) / 10000).toFixed(1)}万</span>总投资</div>
              <div><span className="block font-semibold text-emerald-500">¥{(totals.revenue / 10000).toFixed(2)}万</span>累计收入</div>
              <div><span className={`block font-semibold ${totals.profit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>¥{(totals.profit / 10000).toFixed(2)}万</span>净收益</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {stations.length > 0 && (
          <Card>
            <CardHeader><CardTitle>充电站概览</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>站点</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>设备数</TableHead>
                    <TableHead>功率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stations.map((s) => (
                    <TableRow key={s.id} className={selectedStation === s.id ? "bg-primary/5" : ""}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.address ?? s.station_code}</p>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{STATION_TYPE_LABELS[s.station_type] ?? s.station_type}</Badge></TableCell>
                      <TableCell><Badge variant={s.status === "operating" ? "default" : "secondary"}>{STATION_STATUS_LABELS[s.status] ?? s.status}</Badge></TableCell>
                      <TableCell>{s.device_count}</TableCell>
                      <TableCell>{s.power_capacity ? `${s.power_capacity}kW` : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {costBreakdown.length > 0 && (
          <Card>
            <CardHeader><CardTitle>成本构成</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {costBreakdown.map((c) => (
                  <div key={c.label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{c.label}</span>
                      <span className="font-medium">¥{c.value.toFixed(2)} ({totalCostBreakdown > 0 ? ((c.value / totalCostBreakdown) * 100).toFixed(1) : 0}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${c.color} rounded-full`} style={{ width: `${totalCostBreakdown > 0 ? (c.value / totalCostBreakdown) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t flex justify-between font-semibold text-sm">
                  <span>合计</span>
                  <span>¥{totalCostBreakdown.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {revenueChartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>月度收入与成本对比</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Legend />
                <Bar dataKey="revenue" name="收入" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name="成本" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" name="利润" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>月度收支明细</CardTitle>
              <CardDescription>各月度运营数据汇总</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredMonthly.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无运营数据</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月份</TableHead>
                  {selectedStation === "all" && <TableHead>站点</TableHead>}
                  <TableHead>订单</TableHead>
                  <TableHead>充电量</TableHead>
                  <TableHead>电费收入</TableHead>
                  <TableHead>服务费收入</TableHead>
                  <TableHead>总收入</TableHead>
                  <TableHead>电费成本</TableHead>
                  <TableHead>租金</TableHead>
                  <TableHead>折旧</TableHead>
                  <TableHead>维护</TableHead>
                  <TableHead>人工</TableHead>
                  <TableHead>总成本</TableHead>
                  <TableHead>利润</TableHead>
                  <TableHead>利润率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMonthly.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono">{f.month}</TableCell>
                    {selectedStation === "all" && <TableCell className="text-xs">{stationMap[f.station_id] ?? "-"}</TableCell>}
                    <TableCell>{f.total_orders}</TableCell>
                    <TableCell>{f.total_kwh.toFixed(0)}</TableCell>
                    <TableCell>¥{f.total_energy_revenue.toFixed(2)}</TableCell>
                    <TableCell>¥{f.total_service_revenue.toFixed(2)}</TableCell>
                    <TableCell className="font-semibold">¥{f.total_revenue.toFixed(2)}</TableCell>
                    <TableCell>¥{f.electricity_cost.toFixed(2)}</TableCell>
                    <TableCell>¥{f.rent_cost.toFixed(2)}</TableCell>
                    <TableCell>¥{f.depreciation.toFixed(2)}</TableCell>
                    <TableCell>¥{f.maintenance_cost.toFixed(2)}</TableCell>
                    <TableCell>¥{f.labor_cost.toFixed(2)}</TableCell>
                    <TableCell>¥{f.total_cost.toFixed(2)}</TableCell>
                    <TableCell className={`font-semibold ${f.gross_profit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>¥{f.gross_profit.toFixed(2)}</TableCell>
                    <TableCell>{f.gross_margin.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {revenueShares.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>收益分成跟踪</CardTitle>
            <CardDescription>合作共投项目的收益分配与结算</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>期间</TableHead>
                  <TableHead>站点</TableHead>
                  <TableHead>合作方</TableHead>
                  <TableHead>总收入</TableHead>
                  <TableHead>我方比例</TableHead>
                  <TableHead>我方分成</TableHead>
                  <TableHead>合作方分成</TableHead>
                  <TableHead>扣电费</TableHead>
                  <TableHead>扣租金</TableHead>
                  <TableHead>扣维护</TableHead>
                  <TableHead>净分成</TableHead>
                  <TableHead>到期日</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueShares.map((rs) => (
                  <TableRow key={rs.id}>
                    <TableCell className="font-mono">{rs.period}</TableCell>
                    <TableCell className="text-xs">{stationMap[rs.station_id] ?? "-"}</TableCell>
                    <TableCell>{rs.partner_name}</TableCell>
                    <TableCell>¥{rs.total_revenue.toFixed(2)}</TableCell>
                    <TableCell>{rs.our_share_ratio}%</TableCell>
                    <TableCell className="font-semibold">¥{rs.our_share_amount.toFixed(2)}</TableCell>
                    <TableCell>¥{rs.partner_share_amount.toFixed(2)}</TableCell>
                    <TableCell>¥{rs.deduct_electricity.toFixed(2)}</TableCell>
                    <TableCell>¥{rs.deduct_rent.toFixed(2)}</TableCell>
                    <TableCell>¥{rs.deduct_maintenance.toFixed(2)}</TableCell>
                    <TableCell className={`font-semibold ${rs.net_share_amount >= 0 ? "text-emerald-500" : "text-rose-500"}`}>¥{rs.net_share_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-xs">{rs.payment_due_date ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={rs.payment_status === "paid" ? "default" : "outline"}>
                        {REVENUE_SHARE_STATUS[rs.payment_status] ?? rs.payment_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
       )}

      <Card>
        <CardHeader>
          <CardTitle>运行日志</CardTitle>
          <CardDescription>项目施工/运行过程中的关键记录</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filteredLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无日志记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>天气</TableHead>
                  <TableHead>工作内容</TableHead>
                  <TableHead>工人</TableHead>
                  <TableHead>设备</TableHead>
                  <TableHead>安全状态</TableHead>
                  <TableHead>质量问题</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono whitespace-nowrap">{l.log_date}</TableCell>
                    <TableCell>{l.weather ? (() => { const Ic = WEATHER_ICONS[l.weather]; return Ic ? <Ic className="inline size-3.5 mr-1" /> : null })() : null}{l.weather ?? "-"}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{l.work_content ?? "-"}</TableCell>
                    <TableCell>{l.worker_count}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-xs">{l.equipment_used ?? "-"}</TableCell>
                    <TableCell><Badge variant={l.safety_status === "normal" ? "default" : l.safety_status === "warning" ? "outline" : "destructive"}>{SAFETY_STATUS_LABELS[l.safety_status] ?? l.safety_status}</Badge></TableCell>
                    <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">{l.quality_issues ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
       </Card>
     </div>
   )
 }

function TargetCostTab({ projectId }: { projectId: string }) {
   const qc = useQueryClient()
   const [dialog, setDialog] = useState(false)
   const [editId, setEditId] = useState<string | null>(null)
   const [form, setForm] = useState({ category: "", module_code: "", target_amount: "", remark: "" })
 
   const { data } = useQuery({
     queryKey: ["target-costs", projectId],
     queryFn: () => listTargetCosts(projectId),
   })
 
   const items = (data?.items ?? []) as {
     id: string; category: string; module_code?: string; target_amount: number;
     actual_amount: number; variance_amount: number; varariance_rate: number; status: string; remark?: string
   }[]
 
   const createMut = useMutation({
     mutationFn: () => createTargetCost(projectId, {
       project_id: projectId, category: form.category, module_code: form.module_code || undefined,
       target_amount: Number(form.target_amount), remark: form.remark || undefined,
     }),
     onSuccess: () => { qc.invalidateQueries({ queryKey: ["target-costs", projectId] }); toast.success("已添加"); setDialog(false); setForm({ category: "", module_code: "", target_amount: "", remark: "" }) },
     onError: () => toast.error("添加失败"),
   })
 
   const updateMut = useMutation({
     mutationFn: (id: string) => updateTargetCost(id, {
       category: form.category, module_code: form.module_code || undefined,
       target_amount: Number(form.target_amount), remark: form.remark || undefined,
     }),
     onSuccess: () => { qc.invalidateQueries({ queryKey: ["target-costs", projectId] }); toast.success("已更新"); setDialog(false); setEditId(null); setForm({ category: "", module_code: "", target_amount: "", remark: "" }) },
     onError: () => toast.error("更新失败"),
   })
 
   const deleteMut = useMutation({
     mutationFn: (id: string) => deleteTargetCost(id),
     onSuccess: () => { qc.invalidateQueries({ queryKey: ["target-costs", projectId] }); toast.success("已删除") },
     onError: () => toast.error("删除失败"),
   })
 
   const totalTarget = items.reduce((s, i) => s + i.target_amount, 0)
   const totalActual = items.reduce((s, i) => s + i.actual_amount, 0)
   const totalVariance = items.reduce((s, i) => s + i.variance_amount, 0)
 
   const openEdit = (item: typeof items[0]) => {
     setEditId(item.id)
     setForm({ category: item.category, module_code: item.module_code ?? "", target_amount: String(item.target_amount), remark: item.remark ?? "" })
     setDialog(true)
   }
 
   return (
    <div className="space-y-4">
       <div className="flex items-center justify-between">
         <div className="flex gap-4 text-sm text-muted-foreground">
           <span>目标总额: <strong className="text-foreground">¥{(totalTarget / 10000).toFixed(2)}万</strong></span>
           <span>实际: <strong className="text-rose-500">¥{(totalActual / 10000).toFixed(2)}万</strong></span>
           <span>偏差: <strong className={totalVariance >= 0 ? "text-emerald-500" : "text-rose-500"}>¥{(totalVariance / 10000).toFixed(2)}万</strong></span>
         </div>
         <Button size="sm" onClick={() => { setEditId(null); setForm({ category: "", module_code: "", target_amount: "", remark: "" }); setDialog(true) }}>
           <Plus className="size-3.5" />添加目标成本
         </Button>
       </div>
 
       <Card>
         <CardContent className="p-0">
           {items.length === 0 ? (
             <p className="text-center text-muted-foreground py-8">暂无目标成本数据</p>
           ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>成本类别</TableHead>
                  <TableHead>模块</TableHead>
                  <TableHead>目标金额</TableHead>
                  <TableHead>实际金额</TableHead>
                  <TableHead>偏差</TableHead>
                  <TableHead>偏差率</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.category}</TableCell>
                    <TableCell><Badge variant="outline">{item.module_code ?? "-"}</Badge></TableCell>
                    <TableCell>¥{item.target_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-rose-500">¥{item.actual_amount.toFixed(2)}</TableCell>
                    <TableCell className={item.variance_amount >= 0 ? "text-emerald-500" : "text-rose-500"}>
                      {item.variance_amount >= 0 ? "+" : ""}¥{item.variance_amount.toFixed(2)}
                    </TableCell>
                    <TableCell>{item.varariance_rate}%</TableCell>
                    <TableCell><Badge variant={item.status === "active" ? "default" : "secondary"}>{item.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>编辑</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMut.mutate(item.id)}>删除</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
           )}
         </CardContent>
       </Card>
 
       <Dialog open={dialog} onOpenChange={(open) => { setDialog(open); if (!open) setEditId(null) }}>
         <DialogContent className="sm:max-w-lg">
           <DialogHeader><DialogTitle>{editId ? "编辑目标成本" : "添加目标成本"}</DialogTitle></DialogHeader>
           <div className="grid gap-4 py-4">
             <div className="grid gap-2">
               <Label>成本类别 *</Label>
               <Select value={form.category} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, category: v })) }}>
                 <SelectTrigger><SelectValue placeholder="选择类别" /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value="施工人工">施工人工</SelectItem>
                   <SelectItem value="设备材料">设备材料</SelectItem>
                   <SelectItem value="变压器">变压器</SelectItem>
                   <SelectItem value="电缆">电缆</SelectItem>
                   <SelectItem value="充电桩">充电桩</SelectItem>
                   <SelectItem value="土建">土建</SelectItem>
                   <SelectItem value="高压安装">高压安装</SelectItem>
                   <SelectItem value="低压安装">低压安装</SelectItem>
                   <SelectItem value="附属设施">附属设施</SelectItem>
                   <SelectItem value="租地">租地</SelectItem>
                   <SelectItem value="其他">其他</SelectItem>
                 </SelectContent>
               </Select>
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div className="grid gap-2">
                 <Label>目标金额 *</Label>
                <div className="flex items-center gap-1"><span>¥</span><Input type="number" step="0.01" value={form.target_amount} onChange={(e) => setForm((f) => ({ ...f, target_amount: e.target.value }))} placeholder="0.00" /></div>
               </div>
               <div className="grid gap-2">
                 <Label>关联模块</Label>
                 <Input value={form.module_code} onChange={(e) => setForm((f) => ({ ...f, module_code: e.target.value }))} placeholder="如: transformer" />
               </div>
             </div>
             <div className="grid gap-2">
               <Label>备注</Label>
               <Textarea value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} rows={2} placeholder="备注说明..." />
             </div>
           </div>
           <DialogFooter>
             <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button
              onClick={() => editId ? updateMut.mutate(editId) : createMut.mutate()}
              disabled={(editId ? updateMut.isPending : createMut.isPending) || !form.category || !form.target_amount}
            >
              {(editId ? updateMut.isPending : createMut.isPending) && <Loader2 className="size-4 animate-spin" />}
              {editId ? "保存" : "添加"}
            </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </div>
   )
 }
