import { useState } from "react"
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Zap,
  LayoutDashboard,
  PlusCircle,
  CheckSquare,
  Wallet,
  Brain,
  Building2,
  Settings,
  ScrollText,
  Bell,
  LogOut,
  FolderKanban,
  ChevronDown,
  HardHat,
  ClipboardList,
  ShieldCheck,
  Cpu,
  Search,
  FileSignature,
  Receipt,
  ArrowLeftRight,
  FileSpreadsheet,
  MapPin,
  BarChart3,
  Headphones,
  Calendar,
  FileText,
  DollarSign,
  Plane,
  Package,
  Landmark,
  GitBranch,
  Megaphone,
  TrendingUp,
  ReceiptText,
  Truck,
  ShoppingCart,
  ClipboardCheck,
  Users,
  Eye,
  Activity,
  Sparkles,
  AlertTriangle,
  LineChart,
  PieChart,
  Target,
  Briefcase,
  Radar,
  Gauge,
  CircuitBoard,
  Wrench,
  CircleDollarSign,
  Binary,
} from "lucide-react"
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuthStore } from "@/store/auth"
import { listProjects } from "@/api/project"
import { listNotifications, markNotificationRead, markAllRead } from "@/api/system"
import AiQuickEntry from "@/components/ai/AiQuickEntry"

import type { LucideIcon } from "lucide-react"
import type { Project, Notification } from "@/api/types"

interface MenuItem {
  title: string
  icon: LucideIcon
  path: string
  badge?: string
}

interface MenuGroup {
  label: string
  icon: LucideIcon
  items: MenuItem[]
}

// 只使用系统中实际存在的路由
const menuGroups: MenuGroup[] = [
  {
    label: "项目主线",
    icon: Radar,
    items: [
      { title: "经营驾驶舱", icon: Gauge, path: "/autopilot" },
      { title: "智能进化", icon: Brain, path: "/agent-evolution" },
      { title: "全部项目", icon: LayoutDashboard, path: "/" },
      { title: "新建项目", icon: PlusCircle, path: "/project/create" },
    ],
  },
  {
    label: "工程数据",
    icon: HardHat,
    items: [
      { title: "施工日志", icon: Wrench, path: "/engineering/logs" },
      { title: "安全巡检", icon: ShieldCheck, path: "/engineering/inspections" },
    ],
  },
  {
    label: "运营数据",
    icon: Zap,
    items: [
      { title: "运营监控", icon: Activity, path: "/charging/operations" },
      { title: "充电订单", icon: ReceiptText, path: "/charging/orders" },
      { title: "站点管理", icon: Cpu, path: "/charging/stations" },
    ],
  },
  {
    label: "客户数据",
    icon: Users,
    items: [
      { title: "场地线索", icon: Search, path: "/charging/leads" },
      { title: "供应商列表", icon: Package, path: "/erp/counterparty-flow" },
    ],
  },
  {
    label: "财务数据",
    icon: Landmark,
    items: [
      { title: "合同管理", icon: FileSignature, path: "/contracts" },
      { title: "应收应付", icon: ArrowLeftRight, path: "/ar-ap" },
      { title: "发票管理", icon: Receipt, path: "/invoices" },
      { title: "银行流水", icon: Landmark, path: "/bank-transactions" },
      { title: "跨主体关联", icon: ArrowLeftRight, path: "/cross-entity-flow" },
      { title: "财务报表", icon: FileSpreadsheet, path: "/finance/reports" },
      { title: "我的备用金", icon: Wallet, path: "/my-petty-cash" },
      { title: "备用金管理", icon: CircleDollarSign, path: "/petty-cash-admin" },
    ],
  },
  {
    label: "资产数据",
    icon: Package,
    items: [
      { title: "仓库管理", icon: Package, path: "/warehouse" },
      { title: "固定资产", icon: FileSpreadsheet, path: "/fixed-assets" },
    ],
  },
  {
    label: "数字孪生",
    icon: Binary,
    items: [
      { title: "业务时间轴", icon: Calendar, path: "/business-twin" },
      { title: "知识图谱", icon: Binary, path: "/business-twin/graph" },
      { title: "预测中心", icon: TrendingUp, path: "/business-twin/predictions" },
      { title: "模拟沙盘", icon: Activity, path: "/business-twin/simulate" },
      { title: "AI助手", icon: Brain, path: "/business-twin/assistant" },
    ],
  },
  {
    label: "系统管理",
    icon: Settings,
    items: [
      { title: "组织架构", icon: Building2, path: "/organization" },
      { title: "审批流程", icon: GitBranch, path: "/workflow-config" },
      { title: "系统配置", icon: Settings, path: "/system" },
      { title: "操作日志", icon: ScrollText, path: "/logs" },
    ],
  },
]

interface NotificationResponse {
  items: Notification[]
  total: number
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [notifOpen, setNotifOpen] = useState(false)

  const { data: notificationData } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () =>
      import("@/lib/http").then(({ get }) =>
        get<NotificationResponse>("/system/notifications?page=1&page_size=1")
      ),
    refetchInterval: 30000,
  })

  const { data: notifList } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => listNotifications({ page: 1, page_size: 20 }),
    enabled: notifOpen,
  })

  const { data: projectData } = useQuery({
    queryKey: ["projects-switcher"],
    queryFn: () => listProjects({ page: 1, page_size: 50 }),
  })

  const unreadCount = notificationData?.total ?? 0
  const projects = projectData?.items ?? []

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/"
    return location.pathname === path || location.pathname.startsWith(path + "/")
  }

  const currentProjectId = location.pathname.startsWith("/project/")
    ? location.pathname.split("/project/")[1]?.split("/")[0]
    : null

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="pointer-events-none">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Zap className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">集团综合管理平台</span>
                  <span className="text-xs text-muted-foreground">项目驱动 · 数据分组</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {menuGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <group.icon className="size-3.5" />
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        render={<Link to={item.path} />}
                        isActive={isActive(item.path)}
                        tooltip={item.title}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                        {item.badge && (
                          <Badge 
                            variant="outline" 
                            className="ml-auto text-[10px] border-purple-500 text-purple-600"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="pointer-events-none">
                <Avatar className="size-8">
                  <AvatarFallback>
                    {user?.username?.charAt(0)?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-medium">{user?.username ?? "用户"}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={logout} tooltip="退出登录">
                <LogOut />
                <span>退出登录</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" size="sm" className="gap-1 max-w-[260px]" />
              }>
                <FolderKanban className="size-3.5 shrink-0" />
                <span className="truncate">
                  {currentProjectId
                    ? projects.find((p) => p.id === currentProjectId)?.name ?? "选择项目"
                    : "选择项目"}
                </span>
                <ChevronDown className="size-3.5 shrink-0 opacity-50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[280px]">
                {projects.length === 0 ? (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    暂无项目
                  </div>
                ) : (
                  projects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => navigate(`/project/${p.id}`)}
                    >
                      <span className="truncate">{p.name}</span>
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        {p.status}
                      </Badge>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex-1" />
          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className="relative" />}>
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 flex size-4 items-center justify-center p-0 text-[10px]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="flex items-center justify-between p-3 border-b">
                <span className="text-sm font-medium">通知</span>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={async () => {
                      await markAllRead()
                      queryClient.invalidateQueries({ queryKey: ["notifications"] })
                    }}
                  >
                    全部已读
                  </Button>
                )}
              </div>
              <ScrollArea className="max-h-80">
                {Array.isArray(notifList) ? (
                  notifList.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">暂无通知</div>
                  ) : (
                    notifList.map((n: Notification) => (
                      <div
                        key={n.id}
                        className={`p-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 ${!n.is_read ? "bg-muted/30" : ""}`}
                        onClick={async () => {
                          if (!n.is_read) {
                            await markNotificationRead(n.id)
                            queryClient.invalidateQueries({ queryKey: ["notifications"] })
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {!n.is_read && <div className="mt-1.5 size-2 rounded-full bg-primary shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!n.is_read ? "font-medium" : ""}`}>{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.content}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{n.created_at ? new Date(n.created_at).toLocaleString("zh-CN") : ""}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">加载中...</div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </header>
        <div className="flex-1 p-4">
          <Outlet />
        </div>
      </SidebarInset>
      {user && <AiQuickEntry />}
    </SidebarProvider>
  )
}
