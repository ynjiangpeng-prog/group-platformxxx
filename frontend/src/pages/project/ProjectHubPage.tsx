import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { getProjectHub, getProject, listProjectDocs, listServiceTickets } from "@/api/project"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  FileText, Receipt, DollarSign, BookOpen, Wrench, Clock,
  MapPin, Zap, TrendingUp, TrendingDown, Users, ChevronRight,
  ChevronDown, ChevronUp, Building2, BarChart3, HandCoins, AlertTriangle, CheckCircle2,
  CircleDot, Timer, ClipboardList, Battery, Cable, Package,
  Settings, Construction, Plug, Store, Paperclip, ExternalLink,
} from "lucide-react"
import type { Project } from "@/api/types"

const TYPE_LABELS: Record<string, string> = {
  pure_engineering: "纯工程", charging_epc: "充电站EPC",
  self_invest_build: "自投自建", cooperative_build: "合作共建",
  pure_epc: "纯工程EPC", hv_epc: "高压EPC", lv_epc: "低压EPC",
  equipment_sale: "设备销售", co_invest: "合作共投", full_invest: "全投",
}

const MODULE_META: Record<string, { code: string; name: string; icon: React.ElementType; color: string }> = {
  land_lease: { code: "land_lease", name: "租地", icon: MapPin, color: "bg-orange-500" },
  ndrc_filing: { code: "ndrc_filing", name: "发改备案", icon: FileText, color: "bg-blue-500" },
  power_application: { code: "power_application", name: "电力报装供电方案", icon: Zap, color: "bg-yellow-500" },
  civil_construction: { code: "civil_construction", name: "土建施工", icon: Construction, color: "bg-amber-600" },
  transformer_supply: { code: "transformer_supply", name: "变压器供货", icon: Battery, color: "bg-indigo-500" },
  cable_supply: { code: "cable_supply", name: "电缆供货", icon: Cable, color: "bg-teal-500" },
  charging_pile_supply: { code: "charging_pile_supply", name: "充电桩供货", icon: Plug, color: "bg-green-500" },
  electrical_material_supply: { code: "electrical_material_supply", name: "电气材料供货", icon: Package, color: "bg-slate-500" },
  hv_installation: { code: "hv_installation", name: "高压安装", icon: Zap, color: "bg-red-500" },
  lv_installation: { code: "lv_installation", name: "低压安装", icon: Settings, color: "bg-purple-500" },
  ancillary_construction: { code: "ancillary_construction", name: "附属设施建设", icon: Wrench, color: "bg-cyan-600" },
  operation: { code: "operation", name: "运营", icon: BarChart3, color: "bg-emerald-600" },
  partner_revenue_share: { code: "partner_revenue_share", name: "合作方分成", icon: Users, color: "bg-pink-500" },
}

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-slate-400", active: "bg-blue-500", paused: "bg-amber-500",
  completed: "bg-emerald-500", closed: "bg-emerald-600",
}

const CONTRACT_TYPE: Record<string, string> = {
  construction: "施工", epc: "EPC", purchase: "采购", equipment_sale: "设备销售",
  land_lease: "租地", service: "服务", cooperation: "合作", supplement: "补充", other: "其他",
}

const TICKET_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "待处理", color: "text-amber-600" },
  assigned: { label: "已分配", color: "text-blue-600" },
  processing: { label: "处理中", color: "text-purple-600" },
  completed: { label: "已完成", color: "text-emerald-600" },
  closed: { label: "已关闭", color: "text-slate-400" },
}

const fmt = (n: number) => n >= 10000 ? `¥${(n / 10000).toFixed(2)}万` : `¥${n.toFixed(2)}`

interface HubProps { projectId: string }

export default function ProjectHubPage({ projectId }: HubProps) {
  const navigate = useNavigate()
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(Object.keys(MODULE_META)))

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
  })

  const { data: hub, isLoading } = useQuery({
    queryKey: ["project-hub", projectId],
    queryFn: () => getProjectHub(projectId),
  })

  if (isLoading || !hub || !project) {
    return <div className="flex items-center justify-center h-[60vh]"><div className="animate-pulse text-muted-foreground">加载项目主线...</div></div>
  }

  const p = project as unknown as Project
  const contracts = (hub.contracts || []) as any[]
  const invoices = (hub.invoices || []) as any[]
  const arap = (hub.arap || []) as any[]
  const vouchers = hub.vouchers as any
  const logs = (hub.logs || []) as any[]
  const tickets = (hub.tickets || []) as any[]
  const plans = (hub.plans || []) as any[]
  const workHours = hub.work_hours as any
  const stations = (hub.stations || []) as any[]
  const devices = (hub.devices || []) as any[]
  const opsSummary = hub.ops_summary as any
  const financials = (hub.financials || []) as any[]
  const revenueShares = (hub.revenue_shares || []) as any[]

  const isInvest = ["co_invest", "full_invest", "self_invest_build", "cooperative_build"].includes(p.project_type)
  const isCooperative = p.project_type === "cooperative_build"
  const enabledModules = Array.isArray(p.enabled_modules)
    ? p.enabled_modules as string[]
    : (p.enabled_modules && typeof p.enabled_modules === "object"
      ? Object.keys(p.enabled_modules).filter((k) => (p.enabled_modules as Record<string, boolean>)[k])
      : [])

  const contractTotal = contracts.reduce((s: number, c: any) => s + (c.total_amount || 0), 0)
  const contractPaid = contracts.reduce((s: number, c: any) => s + (c.paid_amount || 0), 0)
  const invoiceTotal = invoices.reduce((s: number, i: any) => s + (i.total_amount || 0), 0)
  const arReceivable = arap.filter((a: any) => a.type === "receivable").reduce((s: number, a: any) => s + (a.remaining_amount || 0), 0)
  const arPayable = arap.filter((a: any) => a.type === "payable").reduce((s: number, a: any) => s + (a.remaining_amount || 0), 0)
  const openTickets = tickets.filter((t: any) => t.status !== "completed" && t.status !== "closed").length
  const budgetUsage = p.total_budget && p.total_budget > 0 ? Math.min(((p.actual_cost || 0) / p.total_budget) * 100, 100) : 0

  const moduleList = enabledModules.length > 0
    ? enabledModules.map((code) => MODULE_META[code]).filter(Boolean)
    : Object.values(MODULE_META)

  const getModuleContent = (code: string) => {
    const matchKeyword = (c: any, keywords: string[]) =>
      keywords.some((kw) => (c.name || "").includes(kw) || (c.remark || "").includes(kw))

    const landContracts = contracts.filter((c: any) => c.contract_type === "land_lease")
    const epcContracts = contracts.filter((c: any) => c.contract_type === "epc")
    const civilContracts = contracts.filter((c: any) => c.contract_type === "civil_construction")
    const hvContracts = contracts.filter((c: any) => c.contract_type === "hv_construction")
    const lvContracts = contracts.filter((c: any) => c.contract_type === "lv_construction")
    const ancContracts = contracts.filter((c: any) => c.contract_type === "ancillary_construction")
    const transformerContracts = contracts.filter((c: any) => c.contract_type === "transformer_purchase")
    const cableContracts = contracts.filter((c: any) => c.contract_type === "cable_purchase")
    const chargingPileContracts = contracts.filter((c: any) => c.contract_type === "charging_pile_purchase")
    const electricalMaterialContracts = contracts.filter((c: any) => c.contract_type === "electrical_material_purchase")
    const serviceContracts = contracts.filter((c: any) => c.contract_type === "service")
    const cooperationContracts = contracts.filter((c: any) => c.contract_type === "cooperation")

    const legacyConstruction = contracts.filter((c: any) => c.contract_type === "construction")
    const legacyPurchase = contracts.filter((c: any) => c.contract_type === "purchase")

    const allCivil = [...civilContracts, ...legacyConstruction.filter((c: any) =>
      !matchKeyword(c, ["高压", "外线", "10kV", "35kV", "架空", "低压", "内线", "0.4kV", "附属", "雨棚", "监控", "消防", "照明", "围墙", "硬化", "绿化"]))]
    const allHv = [...hvContracts, ...legacyConstruction.filter((c: any) => matchKeyword(c, ["高压", "外线", "10kV", "35kV", "架空"])), ...epcContracts.filter((c: any) => matchKeyword(c, ["高压", "外线", "10kV"]))]
    const allLv = [...lvContracts, ...legacyConstruction.filter((c: any) => matchKeyword(c, ["低压", "内线", "0.4kV"])), ...epcContracts.filter((c: any) => matchKeyword(c, ["低压", "内线", "0.4kV"]))]
    const allAnc = [...ancContracts, ...legacyConstruction.filter((c: any) => matchKeyword(c, ["附属", "雨棚", "监控", "消防", "照明", "围墙", "硬化", "绿化"])), ...serviceContracts.filter((c: any) => matchKeyword(c, ["附属", "雨棚", "监控", "消防", "照明", "围墙", "硬化", "绿化"]))]
    const allTransformer = [...transformerContracts, ...legacyPurchase.filter((c: any) => matchKeyword(c, ["变压器", "配电", "厢变", "箱变"]))]
    const allCable = [...cableContracts, ...legacyPurchase.filter((c: any) => matchKeyword(c, ["电缆", "线缆", "电线"]))]
    const allChargingPile = [...chargingPileContracts, ...legacyPurchase.filter((c: any) => matchKeyword(c, ["充电桩", "充电机", "充电设备", "充电终端"]))]
    const allElectricalMaterial = [...electricalMaterialContracts, ...legacyPurchase.filter((c: any) => matchKeyword(c, ["电气", "材料", "开关柜", "配电柜", "桥架", "母线"]))]

    switch (code) {
      case "land_lease": {
        if (landContracts.length === 0 && contracts.length === 0)
          return <EmptyHint text="暂无租地合同" action="请在合同管理中添加租地合同" />
        const items = landContracts.length > 0 ? landContracts : contracts.filter((c: any) => matchKeyword(c, ["租地", "土地", "场地"]))
        return items.length > 0 ? (
          <div className="space-y-1.5">
            {items.map((c: any) => (
              <ContractRow key={c.id} c={c} navigate={navigate} />
            ))}
          </div>
        ) : <EmptyHint text="暂无租地合同" action="请在合同管理中添加" />
      }

      case "ndrc_filing": {
        const filingTickets = tickets.filter((t: any) => matchKeyword(t, ["备案", "发改", "审批"]))
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <MiniCard label="相关合同" value={`${contracts.length}份`} detail={`土建${allCivil.length} / EPC${epcContracts.length}`} icon={<FileText className="size-3.5" />} />
              <MiniCard label="相关工单" value={`${filingTickets.length}条`} detail={filingTickets.length > 0 ? "有备案相关工单" : "无备案工单"} icon={<AlertTriangle className="size-3.5" />} />
            </div>
            {filingTickets.length > 0 && filingTickets.slice(0, 3).map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                <span className="font-mono text-muted-foreground">{t.ticket_no}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className={`font-medium ${TICKET_STATUS[t.status]?.color || ""}`}>{TICKET_STATUS[t.status]?.label || t.status}</span>
              </div>
            ))}
          </div>
        )
      }

      case "power_application": {
        const powerTickets = tickets.filter((t: any) => matchKeyword(t, ["电力", "供电", "报装", "方案"]))
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <MiniCard label="站点数" value={`${stations.length}个`} detail={stations.length > 0 ? stations.map((s: any) => s.name).join("、") : "未关联站点"} icon={<MapPin className="size-3.5" />} />
              <MiniCard label="供电相关工单" value={`${powerTickets.length}条`} detail={powerTickets.length > 0 ? "有待处理" : "无"} icon={<Zap className="size-3.5" />} />
            </div>
            {stations.length > 0 && (
              <div className="rounded-lg border p-2">
                <div className="text-xs font-medium text-muted-foreground mb-1">关联充电站</div>
                {stations.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs py-1">
                    <Badge variant="secondary" className="text-[10px]">{s.station_type || "站点"}</Badge>
                    <span className="flex-1">{s.name}</span>
                    <Badge variant={s.status === "operating" ? "default" : "outline"} className="text-[10px]">{s.status === "operating" ? "运营中" : s.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }

      case "civil_construction": {
        return (
          <div className="space-y-2">
            {allCivil.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">土建施工合同</div>
                {allCivil.map((c: any) => (
                  <ContractRow key={c.id} c={c} navigate={navigate} />
                ))}
              </div>
            )}
            {logs.length > 0 ? (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">施工日志（最近{Math.min(logs.length, 5)}条）</div>
                {logs.slice(0, 5).map((l: any) => (
                  <div key={l.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                    <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{l.log_date}</span>
                    <span className="flex-1 truncate">{l.work_content || "-"}</span>
                    <span className="text-xs text-muted-foreground">{l.worker_count || 0}人</span>
                    {l.weather && <span className="text-xs text-muted-foreground">{l.weather}</span>}
                    <Badge variant={l.safety_status === "normal" ? "secondary" : "destructive"} className="text-[10px]">
                      {l.safety_status === "normal" ? "安全" : "异常"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : <EmptyHint text="暂无施工日志" action="请在施工管理中添加" />}
          </div>
        )
      }

      case "transformer_supply": {
        return allTransformer.length > 0 ? (
          <div className="space-y-1.5">
            {allTransformer.map((c: any) => <ContractRow key={c.id} c={c} navigate={navigate} />)}
          </div>
        ) : <SupplyEmptyHint total={allTransformer.length + legacyPurchase.length} label="变压器" />
      }

      case "cable_supply": {
        return allCable.length > 0 ? (
          <div className="space-y-1.5">
            {allCable.map((c: any) => <ContractRow key={c.id} c={c} navigate={navigate} />)}
          </div>
        ) : <SupplyEmptyHint total={allCable.length + legacyPurchase.length} label="电缆" />
      }

      case "charging_pile_supply": {
        return (
          <div className="space-y-2">
            {allChargingPile.length > 0 ? (
              <div className="space-y-1.5">
                {allChargingPile.map((c: any) => <ContractRow key={c.id} c={c} navigate={navigate} />)}
              </div>
            ) : <SupplyEmptyHint total={allChargingPile.length + legacyPurchase.length} label="充电桩" />}
            {devices.length > 0 && (
              <div className="rounded-lg border p-2">
                <div className="text-xs font-medium text-muted-foreground mb-1">已安装设备 ({devices.length})</div>
                {devices.slice(0, 6).map((d: any) => (
                  <div key={d.id} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="font-mono text-muted-foreground">{d.device_code}</span>
                    <span className="flex-1">{d.device_type || "-"}</span>
                    {d.rated_power && <span>{d.rated_power}kW</span>}
                    <Badge variant={d.status === "online" ? "default" : "outline"} className="text-[10px]">{d.status || "-"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }

      case "electrical_material_supply": {
        return allElectricalMaterial.length > 0 ? (
          <div className="space-y-1.5">
            {allElectricalMaterial.map((c: any) => <ContractRow key={c.id} c={c} navigate={navigate} />)}
          </div>
        ) : <SupplyEmptyHint total={allElectricalMaterial.length + legacyPurchase.length} label="电气材料" />
      }

      case "hv_installation": {
        return (
          <div className="space-y-2">
            {allHv.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">高压施工合同</div>
                {allHv.map((c: any) => <ContractRow key={c.id} c={c} navigate={navigate} />)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <MiniCard label="施工日志" value={`${logs.length}篇`} detail={logs.length > 0 ? `最近 ${logs[0]?.log_date || "-"}` : "暂无"} icon={<ClipboardList className="size-3.5" />} />
              <MiniCard label="总工时" value={`${workHours?.total_hours || 0}h`} detail={`加班 ${workHours?.total_overtime || 0}h`} icon={<Timer className="size-3.5" />} />
            </div>
          </div>
        )
      }

      case "lv_installation": {
        return (
          <div className="space-y-2">
            {allLv.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">低压施工合同</div>
                {allLv.map((c: any) => <ContractRow key={c.id} c={c} navigate={navigate} />)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <MiniCard label="施工日志" value={`${logs.length}篇`} detail={logs.length > 0 ? `最近 ${logs[0]?.log_date || "-"}` : "暂无"} icon={<ClipboardList className="size-3.5" />} />
              <MiniCard label="总工时" value={`${workHours?.total_hours || 0}h`} detail={`加班 ${workHours?.total_overtime || 0}h`} icon={<Timer className="size-3.5" />} />
            </div>
          </div>
        )
      }

      case "ancillary_construction": {
        return (
          <div className="space-y-2">
            {allAnc.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">附属设施合同</div>
                {allAnc.map((c: any) => <ContractRow key={c.id} c={c} navigate={navigate} />)}
              </div>
            )}
            {logs.length > 0 ? (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">相关施工日志</div>
                {logs.slice(0, 3).map((l: any) => (
                  <div key={l.id} className="flex items-center gap-3 text-sm py-1 border-b last:border-0">
                    <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{l.log_date}</span>
                    <span className="flex-1 truncate">{l.work_content || "-"}</span>
                    <span className="text-xs text-muted-foreground">{l.worker_count || 0}人</span>
                  </div>
                ))}
              </div>
            ) : <EmptyHint text="暂无施工日志" />}
          </div>
        )
      }

      case "operation": {
        if (!isInvest) return <EmptyHint text="非运营类项目" />
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <MiniCard label="站点" value={`${stations.length}个`} detail={stations.filter((s: any) => s.status === "operating").length + "个运营中"} icon={<Store className="size-3.5" />} />
              <MiniCard label="累计收入" value={fmt(opsSummary?.total_revenue || 0)} detail={`${opsSummary?.months || 0}个月`} icon={<TrendingUp className="size-3.5 text-emerald-500" />} color="text-emerald-600" />
              <MiniCard label="累计成本" value={fmt(opsSummary?.total_cost || 0)} detail={`利润 ${fmt(opsSummary?.total_profit || 0)}`} icon={<TrendingDown className="size-3.5 text-rose-500" />} color="text-rose-600" />
            </div>
            {devices.length > 0 && (
              <div className="rounded-lg border p-2">
                <div className="text-xs font-medium text-muted-foreground mb-1">设备概览 ({devices.length}台)</div>
                <div className="grid grid-cols-2 gap-1">
                  {devices.slice(0, 6).map((d: any) => (
                    <div key={d.id} className="flex items-center gap-1 text-xs">
                      <Badge variant={d.status === "online" ? "default" : "outline"} className="text-[10px]">{d.status === "online" ? "在线" : d.status || "-"}</Badge>
                      <span className="font-mono text-muted-foreground">{d.device_code}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {financials.length > 0 && (
              <div className="rounded-lg border">
                <div className="px-3 py-1.5 border-b text-xs font-medium">月度运营明细</div>
                <div className="p-2 space-y-1">
                  {financials.slice(0, 4).map((f: any) => (
                    <div key={f.id} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground w-16">{f.month}</span>
                      <span className="flex-1">收入 {fmt(f.total_revenue)}</span>
                      <span className="w-20 text-right font-medium">{f.gross_profit >= 0 ? "+" : ""}{fmt(f.gross_profit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      }

      case "partner_revenue_share": {
        if (!isCooperative) return null
        const totalOur = revenueShares.reduce((s: number, r: any) => s + (r.our_share_amount || 0), 0)
        const totalNet = revenueShares.reduce((s: number, r: any) => s + (r.net_share_amount || 0), 0)
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <MiniCard label="我方累计分成" value={fmt(totalOur)} detail={`${revenueShares.length}期`} icon={<TrendingUp className="size-3.5 text-emerald-500" />} color="text-emerald-600" />
              <MiniCard label="我方净分成" value={fmt(totalNet)} detail="扣除电费/租金/维保" icon={<DollarSign className="size-3.5 text-blue-500" />} color="text-blue-600" />
            </div>
            {revenueShares.length > 0 ? (
              <div className="space-y-1">
                {revenueShares.slice(0, 5).map((rs: any) => (
                  <div key={rs.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                    <span className="font-mono text-xs text-muted-foreground w-16">{rs.period}</span>
                    <span className="flex-1">{rs.partner_name || "合作方"}</span>
                    <span className="text-xs font-semibold text-emerald-600">{fmt(rs.our_share_amount)}</span>
                    <Badge variant={rs.payment_status === "paid" ? "default" : "outline"} className="text-[10px]">
                      {rs.payment_status === "paid" ? "已结" : "待结"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : <EmptyHint text="暂无分成记录" action="请在充电站管理中录入" />}
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-1">
      <div className="flex items-center gap-4 mb-4">
        <div className={`size-4 rounded-full ${STATUS_COLORS[p.status] || "bg-slate-400"}`} />
        <div className="flex-1">
          <h1 className="text-xl font-bold">{p.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <Badge variant="outline">{TYPE_LABELS[p.project_type] || p.project_type}</Badge>
            {(p as any).counterparty_company && <span>对方: {(p as any).counterparty_company}</span>}
            {p.province && <span>{p.province} {p.city}</span>}
            {p.start_date && <span>{p.start_date} ~ {p.end_date || "进行中"}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{p.progress || 0}%</div>
          <div className="text-xs text-muted-foreground">总进度</div>
        </div>
      </div>
      <Progress value={p.progress || 0} className="h-2" />

      <div className="grid grid-cols-4 gap-3 mt-4">
        <MetricCard icon={<FileText className="size-4" />} label="合同总额" value={fmt(contractTotal)} sub={`已付 ${fmt(contractPaid)}`} />
        <MetricCard icon={<Receipt className="size-4" />} label="发票金额" value={fmt(invoiceTotal)} sub={`${invoices.length} 张`} />
        <MetricCard icon={<DollarSign className="size-4" />} label="应收" value={fmt(arReceivable)} sub={`应付 ${fmt(arPayable)}`} color="text-emerald-600" />
        <MetricCard icon={<Clock className="size-4" />} label="总工时" value={`${workHours?.total_hours || 0}h`} sub={`加班 ${workHours?.total_overtime || 0}h`} />
      </div>

      {p.total_budget && p.total_budget > 0 && (
        <Card className="mt-3">
          <CardContent className="p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">预算执行</span>
              <span>实际 ¥{((p.actual_cost || 0) / 10000).toFixed(1)}万 / 预算 ¥{(p.total_budget / 10000).toFixed(1)}万</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${budgetUsage > 90 ? "bg-rose-500" : budgetUsage > 70 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${budgetUsage}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      <Separator className="my-4" />

      {/* 财务汇总 */}
      <PhaseNode icon={<DollarSign />} title="财务归集" color="bg-emerald-500" count={invoices.length + arap.length}>
        <div className="grid grid-cols-3 gap-3">
          <MiniCard label="发票" value={fmt(invoiceTotal)} detail={`${invoices.length}张`} icon={<Receipt className="size-3.5" />} />
          <MiniCard label="凭证" value={fmt(vouchers?.total_amount || 0)} detail={`${vouchers?.count || 0}张`} icon={<BookOpen className="size-3.5" />} />
          <MiniCard label="应收应付" value={fmt(arReceivable + arPayable)} detail={`收${fmt(arReceivable)} / 付${fmt(arPayable)}`} icon={<DollarSign className="size-3.5" />} />
        </div>
      </PhaseNode>

      {/* 服务工单 */}
      <PhaseNode icon={<AlertTriangle />} title="服务工单" color="bg-rose-500" count={tickets.length} badge={openTickets > 0 ? `${openTickets}待处理` : undefined}>
        {tickets.length > 0 ? (
          <div className="space-y-1.5">
            {tickets.slice(0, 5).map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                <span className="font-mono text-xs text-muted-foreground">{t.ticket_no}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className={`text-xs font-medium ${TICKET_STATUS[t.status]?.color || ""}`}>
                  {TICKET_STATUS[t.status]?.label || t.status}
                </span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground py-2">暂无工单</p>}
      </PhaseNode>

      {/* 日计划 */}
      <PhaseNode icon={<CircleDot />} title="日计划与排期" color="bg-purple-500" count={plans.length}>
        {plans.length > 0 ? (
          <div className="space-y-1.5">
            {plans.slice(0, 7).map((pl: any) => {
              const tasks = Array.isArray(pl.tasks) ? pl.tasks : (pl.tasks ? String(pl.tasks).split("\n") : [])
              return (
                <div key={pl.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                  <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{pl.plan_date}</span>
                  <span className="flex-1 truncate">{tasks.slice(0, 2).join("；") || "-"}</span>
                  {pl.estimated_hours && <Badge variant="outline" className="text-[10px]">{pl.estimated_hours}h</Badge>}
                  <Badge variant={pl.status === "completed" ? "default" : pl.status === "in_progress" ? "secondary" : "outline"} className="text-[10px]">
                    {pl.status === "completed" ? "完成" : pl.status === "in_progress" ? "执行中" : "计划"}
                  </Badge>
                </div>
              )
            })}
          </div>
        ) : <p className="text-sm text-muted-foreground py-2">暂无计划</p>}
      </PhaseNode>

      <Separator className="my-4" />

      {/* ===== 模块时间轴 ===== */}
      <h2 className="text-lg font-semibold mb-3">项目模块</h2>
      <div className="relative">
        <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-border" />
        {moduleList.map((meta) => {
          const Icon = meta.icon
          const content = getModuleContent(meta.code)
          if (content === null) return null
          const isExpanded = expandedModules.has(meta.code)
          return (
            <div key={meta.code}>
              <div
                className="relative pl-12 pb-2 cursor-pointer"
                onClick={() => {
                  setExpandedModules(prev => {
                    const next = new Set(prev)
                    if (isExpanded) {
                      next.delete(meta.code)
                    } else {
                      next.add(meta.code)
                    }
                    return next
                  })
                }}
              >
                <div className={`absolute left-2.5 top-1 z-10 size-9 rounded-full ${meta.color} flex items-center justify-center text-white`}>
                  <Icon className="size-4" />
                </div>
                <div className="pt-0.5">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{meta.name}</h3>
                    {isExpanded
                      ? <ChevronUp className="size-4 text-muted-foreground" />
                      : <ChevronDown className="size-4 text-muted-foreground" />}
                  </div>
                  {!isExpanded && (
                    <div className="text-sm text-muted-foreground">点击展开详情</div>
                  )}
                </div>
              </div>
              {isExpanded && (
                <div className="pl-12 pb-6">
                  {content}
                  <ModuleExpandedDetails projectId={projectId} moduleCode={meta.code} navigate={navigate} tickets={tickets} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PhaseNode({ icon, title, color, count, badge, children }: {
  icon: React.ReactNode; title: string; color: string; count: number; badge?: string; children: React.ReactNode
}) {
  return (
    <div className="relative pl-12 pb-6">
      <div className={`absolute left-2.5 top-1 z-10 size-9 rounded-full ${color} flex items-center justify-center text-white`}>
        {icon}
      </div>
      <div className="pt-0.5">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-semibold">{title}</h3>
          {count > 0 && <Badge variant="secondary" className="text-[10px]">{count}</Badge>}
          {badge && <Badge variant="destructive" className="text-[10px]">{badge}</Badge>}
        </div>
        {children}
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[11px]">{label}</span></div>
        </div>
        <p className={`text-lg font-bold mt-0.5 ${color || ""}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

function MiniCard({ label, value, detail, icon, color }: { label: string; value: string; detail: string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-1">{icon}{label}</div>
      <p className={`font-semibold text-sm ${color || ""}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
    </div>
  )
}

function ContractRow({ c, navigate }: { c: any; navigate: (path: string) => void }) {
  const paidPct = c.total_amount > 0 ? Math.round((c.paid_amount / c.total_amount) * 100) : 0
  return (
    <div className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={() => navigate(`/contracts/${c.id}`)}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{c.name}</div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
          {c.party_b && <span>{c.party_b}</span>}
          {c.signing_date && <span>{c.signing_date}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 ml-2">
        <span className="text-sm font-semibold">{fmt(c.total_amount)}</span>
        <div className="flex items-center gap-1">
          <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${paidPct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{paidPct}%</span>
        </div>
      </div>
      <ChevronRight className="size-3.5 text-muted-foreground ml-1" />
    </div>
  )
}

function EmptyHint({ text, action }: { text: string; action?: string }) {
  return (
    <div className="py-2 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {action && <p className="text-xs text-muted-foreground mt-0.5">{action}</p>}
    </div>
  )
}

function SupplyEmptyHint({ total, label }: { total: number; label: string }) {
  return (
    <div className="py-2 text-center">
      <p className="text-sm text-muted-foreground">暂无{label}采购合同</p>
      {total > 0 && <p className="text-xs text-muted-foreground mt-0.5">项目有 {total} 份采购合同，但未匹配到"{label}"关键词</p>}
    </div>
  )
}

function ModuleExpandedDetails({ projectId, moduleCode, navigate, tickets: allTickets }: {
  projectId: string; moduleCode: string; navigate: (path: string) => void; tickets: any[]
}) {
  const { data: docs } = useQuery({
    queryKey: ["project-docs", projectId, moduleCode],
    queryFn: () => listProjectDocs(projectId, { module_code: moduleCode }),
    enabled: !!projectId,
  })

  const moduleTickets = allTickets.filter((t: any) =>
    (t.service_type || "").includes(moduleCode) ||
    (t.title || "").includes(MODULE_META[moduleCode]?.name || "") ||
    (t.description || "").includes(MODULE_META[moduleCode]?.name || "")
  )

  const docList = (docs || []) as any[]

  return (
    <div className="space-y-3 mt-3 pt-3 border-t">
      {docList.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><Paperclip className="size-3" />相关文档 ({docList.length})</div>
          <div className="space-y-1">
            {docList.map((d: any) => (
              <div key={d.id} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                <FileText className="size-3 text-muted-foreground" />
                <span className="flex-1 truncate">{d.name}</span>
                <Badge variant="outline" className="text-[10px]">{d.doc_type || "文档"}</Badge>
                {d.status && <Badge variant="secondary" className="text-[10px]">{d.status}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}

      {moduleTickets.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><AlertTriangle className="size-3" />相关工单 ({moduleTickets.length})</div>
          <div className="space-y-1">
            {moduleTickets.map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                <span className="font-mono text-muted-foreground">{t.ticket_no}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className={`font-medium ${TICKET_STATUS[t.status]?.color || ""}`}>{TICKET_STATUS[t.status]?.label || t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <button
          className="flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={(e) => { e.stopPropagation(); navigate(`/project/${projectId}?tab=cockpit`) }}
        >
          <ExternalLink className="size-3" />
          查看项目驾驶舱完整视图
        </button>
      </div>
    </div>
  )
}
