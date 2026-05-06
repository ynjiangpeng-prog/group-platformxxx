import { useQuery } from "@tanstack/react-query"
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowUpRight,
  PlusCircle,
  Wallet,
  BarChart3,
  Download,
  CalendarDays,
  Settings,
  ChevronDown,
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { listProjects } from "@/api/project"
import { listContracts } from "@/api/erp"
import { listStations } from "@/api/charging"
import { cn } from "@/lib/utils"
import { Link } from "react-router-dom"
import { useState } from "react"

interface AlertItem {
  id: string
  title: string
  message: string
  severity: string
  type: string
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overview")

  const { data: projects } = useQuery({
    queryKey: ["dashboard-projects"],
    queryFn: () => listProjects({ page: 1, page_size: 5 }),
  })

  const { data: contracts } = useQuery({
    queryKey: ["dashboard-contracts"],
    queryFn: () => listContracts({ page: 1, page_size: 5 }),
  })

  const { data: stations } = useQuery({
    queryKey: ["dashboard-stations"],
    queryFn: () => listStations({ page: 1, page_size: 100 }),
  })

  const alerts: AlertItem[] = []

  const stats = [
    {
      title: "活跃项目",
      value: projects?.items?.length ?? 0,
      icon: FileText,
      color: "bg-blue-50 text-blue-600",
      trend: "+12%",
      trendUp: true,
    },
    {
      title: "充电站点",
      value: stations?.items?.length ?? 0,
      icon: Zap,
      color: "bg-emerald-50 text-emerald-600",
      trend: "+5%",
      trendUp: true,
    },
    {
      title: "待审批",
      value: "8",
      icon: Clock,
      color: "bg-amber-50 text-amber-600",
      trend: "-2",
      trendUp: false,
    },
    {
      title: "本月收入",
      value: "¥128,450",
      icon: TrendingUp,
      color: "bg-purple-50 text-purple-600",
      trend: "+18%",
      trendUp: true,
    },
    {
      title: "本月支出",
      value: "¥86,320",
      icon: TrendingDown,
      color: "bg-rose-50 text-rose-600",
      trend: "+5%",
      trendUp: false,
    },
  ]

  const recentProjects = projects?.items?.slice(0, 5) ?? []
  const recentContracts = contracts?.items?.slice(0, 5) ?? []

  const tabs = [
    { id: "overview", label: "总览" },
    { id: "projects", label: "项目" },
    { id: "finance", label: "财务" },
  ]

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">经营仪表盘</h1>
          <p className="page-subtitle">实时监控企业运营关键指标与业务动态</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <CalendarDays className="w-4 h-4" />
            2026年5月
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
            <PlusCircle className="w-4 h-4" />
            新建项目
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "tab-pill",
              activeTab === tab.id ? "tab-pill-active" : "tab-pill-inactive"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <div key={stat.title} className="stat-box">
            <div className="flex items-start justify-between mb-4">
              <div className={cn("stat-box-icon", stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
              {stat.trend && (
                <span
                  className={cn(
                    "text-[11px] font-semibold px-2 py-1 rounded-full",
                    stat.trendUp
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-red-50 text-red-600"
                  )}
                >
                  {stat.trend}
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-[13px] text-gray-400 mt-1">{stat.title}</p>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Projects Table */}
        <div className="lg:col-span-2 modern-card">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">最近项目</h3>
              <p className="text-xs text-gray-400 mt-0.5">共 {projects?.total ?? 0} 个项目</p>
            </div>
            <Link
              to="/engineering/projects"
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              查看全部
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="px-2 pb-2">
            <table className="modern-table">
              <thead>
                <tr>
                  <th className="rounded-l-lg">项目名称</th>
                  <th>状态</th>
                  <th>进度</th>
                  <th>预算</th>
                  <th className="rounded-r-lg"></th>
                </tr>
              </thead>
              <tbody>
                {recentProjects.length > 0 ? (
                  recentProjects.map((project: any) => (
                    <tr key={project.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                            <FileText className="w-4 h-4 text-gray-500" />
                          </div>
                          <span className="font-medium text-gray-900">{project.name}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={cn(
                            "status-pill",
                            project.status === "active"
                              ? "pill-active"
                              : project.status === "pending"
                              ? "pill-pending"
                              : "pill-offline"
                          )}
                        >
                          {project.status === "active"
                            ? "进行中"
                            : project.status === "pending"
                            ? "待启动"
                            : "已结束"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gray-900 rounded-full transition-all"
                              style={{ width: `${project.progress ?? 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 font-medium">
                            {project.progress ?? 0}%
                          </span>
                        </div>
                      </td>
                      <td className="font-mono text-xs text-gray-500">
                        ¥{(project.total_budget ?? 0).toLocaleString()}
                      </td>
                      <td>
                        <Link
                          to={`/project/${project.id}`}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-gray-400">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">暂无项目数据</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="modern-card">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">业务告警</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {alerts?.length ?? 0} 个待处理</p>
            </div>
            <Link
              to="/autopilot"
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              查看全部
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="px-5 pb-5">
            <div className="space-y-2.5">
              {alerts?.length > 0 ? (
                alerts.slice(0, 5).map((alert: AlertItem, index: number) => (
                  <div
                    key={alert.id || index}
                    className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/50 border border-gray-100"
                  >
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full mt-1.5 shrink-0",
                        alert.severity === "critical"
                          ? "bg-red-500"
                          : alert.severity === "high"
                          ? "bg-orange-500"
                          : "bg-amber-500"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{alert.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                        {alert.message}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-6 h-6 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-900">暂无告警</p>
                  <p className="text-xs text-gray-400 mt-1">系统运行正常</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Contracts */}
        <div className="modern-card">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">最近合同</h3>
              <p className="text-xs text-gray-400 mt-0.5">共 {contracts?.total ?? 0} 个合同</p>
            </div>
            <Link
              to="/contracts"
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              查看全部
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="px-2 pb-2">
            <table className="modern-table">
              <thead>
                <tr>
                  <th className="rounded-l-lg">合同名称</th>
                  <th>金额</th>
                  <th className="rounded-r-lg">状态</th>
                </tr>
              </thead>
              <tbody>
                {recentContracts.length > 0 ? (
                  recentContracts.map((contract: any) => (
                    <tr key={contract.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                            <FileText className="w-4 h-4 text-gray-500" />
                          </div>
                          <span className="font-medium text-gray-900">{contract.name}</span>
                        </div>
                      </td>
                      <td className="font-mono text-xs text-gray-500">
                        ¥{(contract.total_amount ?? 0).toLocaleString()}
                      </td>
                      <td>
                        <span
                          className={cn(
                            "status-pill",
                            contract.status === "active"
                              ? "pill-active"
                              : contract.status === "pending"
                              ? "pill-pending"
                              : "pill-offline"
                          )}
                        >
                          {contract.status === "active"
                            ? "执行中"
                            : contract.status === "pending"
                            ? "待签订"
                            : "已结束"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="text-center py-10 text-gray-400">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">暂无合同数据</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="modern-card">
          <div className="px-5 pt-5 pb-3">
            <h3 className="text-base font-bold text-gray-900">快捷操作</h3>
            <p className="text-xs text-gray-400 mt-0.5">常用功能入口</p>
          </div>
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { title: "新建项目", desc: "创建新的工程项目", icon: PlusCircle, path: "/project/create", color: "bg-blue-50 text-blue-600" },
                { title: "新建合同", desc: "添加采购或施工合同", icon: FileText, path: "/contracts", color: "bg-emerald-50 text-emerald-600" },
                { title: "备用金申请", desc: "申请项目备用金", icon: Wallet, path: "/my-petty-cash", color: "bg-purple-50 text-purple-600" },
                { title: "查看报表", desc: "财务数据分析", icon: BarChart3, path: "/finance/reports", color: "bg-orange-50 text-orange-600" },
              ].map((action) => (
                <Link
                  key={action.path}
                  to={action.path}
                  className="flex items-start gap-3 p-4 rounded-xl bg-gray-50/50 hover:bg-gray-50 transition-colors border border-gray-100 group"
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", action.color)}>
                    <action.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-gray-900">{action.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{action.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
