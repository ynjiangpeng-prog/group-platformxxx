import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft, Landmark, FileSignature, ArrowLeftRight, Receipt,
  Zap, Bolt, ListTree, Wallet, ChevronDown, ChevronRight,
  DollarSign, TrendingUp, TrendingDown,
} from "lucide-react"
import { getProjectAudit } from "@/api/audit"

const moduleMeta: Record<string, { label: string; icon: any; color: string }> = {
  bank: { label: "银行流水", icon: Landmark, color: "blue" },
  contracts: { label: "合同", icon: FileSignature, color: "purple" },
  ar_ap: { label: "应收应付", icon: ArrowLeftRight, color: "amber" },
  invoices: { label: "发票", icon: Receipt, color: "green" },
  charging: { label: "充电站", icon: Zap, color: "cyan" },
  electricity: { label: "电费缴纳", icon: Bolt, color: "yellow" },
  project_lines: { label: "项目明细", icon: ListTree, color: "indigo" },
  petty_cash: { label: "备用金", icon: Wallet, color: "rose" },
}

const colorMap: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue:    { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" },
  purple:  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  amber:   { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
  green:   { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", badge: "bg-green-100 text-green-700" },
  cyan:    { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", badge: "bg-cyan-100 text-cyan-700" },
  yellow:  { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700" },
  indigo:  { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700" },
  rose:    { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", badge: "bg-rose-100 text-rose-700" },
}

function Section({ modKey, data, defaultOpen = false }: {
  modKey: string
  data: {
    label: string; icon: string; count: number; items: any[]
    total_income?: number; total_expense?: number
    total_ar?: number; total_ap?: number; total_remaining?: number
    total_amount?: number; station_count?: number; order_count?: number
    recent_orders?: any[]
    total_fund?: number; fund_count?: number; expense_count?: number
  }
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const meta = moduleMeta[modKey] || { label: modKey, icon: DollarSign, color: "gray" }
  const colors = colorMap[meta.color] || colorMap.blue
  const Icon = meta.icon

  if (data.count === 0) {
    return (
      <div className={`rounded-lg border ${colors.border} ${colors.bg} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`size-4 ${colors.text}`} />
            <span className={`font-medium ${colors.text}`}>{meta.label}</span>
            <span className="text-xs text-gray-400">(无数据)</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border ${colors.border} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-3 ${colors.bg} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`size-5 ${colors.text}`} />
          <span className={`font-semibold ${colors.text}`}>{meta.label}</span>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
            {data.count}条
          </span>
          {data.total_income !== undefined && (
            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs flex items-center gap-0.5 text-green-600">
                <TrendingUp className="size-3" />
                {data.total_income.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs flex items-center gap-0.5 text-red-600">
                <TrendingDown className="size-3" />
                {data.total_expense?.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
          {data.total_remaining !== undefined && (
            <span className="text-xs text-gray-500">
              未结清: {data.total_remaining.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </span>
          )}
          {data.total_amount !== undefined && (
            <span className="text-xs text-gray-500">
              总计: {data.total_amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </span>
          )}
          {data.order_count !== undefined && data.order_count > 0 && (
            <span className="text-xs text-gray-500">
              近期订单: {data.order_count}条
            </span>
          )}
        </div>
        {open ? <ChevronDown className="size-4 text-gray-500" /> : <ChevronRight className="size-4 text-gray-500" />}
      </button>

      {open && (
        <div className="px-4 py-3 bg-white">
          {modKey === "bank" && (
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1 pr-2">日期</th>
                  <th className="text-left py-1 pr-2">对手方</th>
                  <th className="text-left py-1 pr-2">摘要</th>
                  <th className="text-left py-1 pr-2">用途</th>
                  <th className="text-left py-1 pr-2">备注</th>
                  <th className="text-right py-1 pr-2">金额</th>
                  <th className="text-left py-1">费用类型</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: any) => (
                  <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 pr-2 text-gray-600">{it.tx_date}</td>
                    <td className="py-1 pr-2 max-w-[120px] truncate" title={it.counterparty}>{it.counterparty}</td>
                    <td className="py-1 pr-2 max-w-[120px] truncate" title={it.summary}>{it.summary}</td>
                    <td className="py-1 pr-2 text-blue-600">{it.purpose}</td>
                    <td className="py-1 pr-2 text-orange-600">{it.remark}</td>
                    <td className={`py-1 pr-2 text-right font-medium ${it.tx_amount > 0 ? "text-green-600" : "text-red-600"}`}>
                      {it.tx_amount > 0 ? "+" : ""}{it.tx_amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-1">
                      {it.expense_type && (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">
                          {it.expense_type}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {modKey === "contracts" && (
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1 pr-2">合同编号</th>
                  <th className="text-left py-1 pr-2">合同名称</th>
                  <th className="text-left py-1 pr-2">甲方</th>
                  <th className="text-left py-1 pr-2">乙方</th>
                  <th className="text-right py-1 pr-2">金额</th>
                  <th className="text-right py-1 pr-2">已付</th>
                  <th className="text-left py-1">状态</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: any) => (
                  <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 pr-2 font-mono text-gray-500">{it.contract_no}</td>
                    <td className="py-1 pr-2 font-medium">{it.name}</td>
                    <td className="py-1 pr-2 max-w-[100px] truncate" title={it.party_a}>{it.party_a}</td>
                    <td className="py-1 pr-2 max-w-[100px] truncate" title={it.party_b}>{it.party_b}</td>
                    <td className="py-1 pr-2 text-right">{it.total_amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-1 pr-2 text-right text-green-600">{it.paid_amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-1">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${it.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {it.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {modKey === "ar_ap" && (
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1 pr-2">类型</th>
                  <th className="text-left py-1 pr-2">单号</th>
                  <th className="text-left py-1 pr-2">对手方</th>
                  <th className="text-right py-1 pr-2">总金额</th>
                  <th className="text-right py-1 pr-2">已结清</th>
                  <th className="text-right py-1 pr-2">剩余</th>
                  <th className="text-left py-1">状态</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: any) => (
                  <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 pr-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${it.type === "ar" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {it.type === "ar" ? "应收" : "应付"}
                      </span>
                    </td>
                    <td className="py-1 pr-2 font-mono text-gray-500">{it.source_no}</td>
                    <td className="py-1 pr-2">{it.counterparty}</td>
                    <td className="py-1 pr-2 text-right">{it.total_amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-1 pr-2 text-right text-green-600">{it.settled_amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-1 pr-2 text-right text-red-600">{it.remaining_amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-1">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${it.status === "settled" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                        {it.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {modKey === "invoices" && (
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1 pr-2">发票号</th>
                  <th className="text-left py-1 pr-2">方向</th>
                  <th className="text-left py-1 pr-2">销售方</th>
                  <th className="text-left py-1 pr-2">购买方</th>
                  <th className="text-right py-1 pr-2">金额</th>
                  <th className="text-left py-1">日期</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: any) => (
                  <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 pr-2 font-mono text-gray-500">{it.invoice_no}</td>
                    <td className="py-1 pr-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${it.direction === "out" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                        {it.direction === "out" ? "销项" : "进项"}
                      </span>
                    </td>
                    <td className="py-1 pr-2">{it.seller_name}</td>
                    <td className="py-1 pr-2">{it.buyer_name}</td>
                    <td className="py-1 pr-2 text-right">{it.total_amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-1">{it.issue_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {modKey === "charging" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {data.items.map((it: any) => (
                  <div key={it.id} className="rounded border border-gray-200 p-2 text-xs">
                    <div className="font-medium">{it.name}</div>
                    <div className="text-gray-500 mt-0.5">{it.station_code} · {it.status}</div>
                    <div className="text-gray-400 mt-0.5 truncate" title={it.address}>{it.address}</div>
                    {it.electricity_payee && (
                      <div className="text-blue-600 mt-0.5">电费户名: {it.electricity_payee}</div>
                    )}
                  </div>
                ))}
              </div>
              {data.recent_orders && data.recent_orders.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1">近期订单</div>
                  <table className="w-full text-xs">
                    <thead className="text-gray-400 border-b">
                      <tr>
                        <th className="text-left py-1 pr-2">订单号</th>
                        <th className="text-left py-1 pr-2">站点</th>
                        <th className="text-right py-1 pr-2">充电量(kWh)</th>
                        <th className="text-right py-1 pr-2">金额</th>
                        <th className="text-left py-1">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_orders.map((o: any) => (
                        <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-1 pr-2 font-mono text-gray-500">{o.order_no}</td>
                          <td className="py-1 pr-2">{o.station_name}</td>
                          <td className="py-1 pr-2 text-right">{o.charging_kwh}</td>
                          <td className="py-1 pr-2 text-right">{o.total_amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                          <td className="py-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${o.pay_status === "paid" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                              {o.pay_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {modKey === "electricity" && (
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1 pr-2">期间</th>
                  <th className="text-right py-1 pr-2">电量(kWh)</th>
                  <th className="text-right py-1 pr-2">金额</th>
                  <th className="text-left py-1 pr-2">状态</th>
                  <th className="text-left py-1 pr-2">应付日期</th>
                  <th className="text-left py-1">备注</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: any) => (
                  <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 pr-2">{it.period}</td>
                    <td className="py-1 pr-2 text-right">{it.total_kwh ?? "-"}</td>
                    <td className="py-1 pr-2 text-right">{it.total_amount?.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) ?? "-"}</td>
                    <td className="py-1 pr-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${it.payment_status === "paid" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {it.payment_status}
                      </span>
                    </td>
                    <td className="py-1 pr-2">{it.due_date}</td>
                    <td className="py-1 text-gray-500">{it.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {modKey === "project_lines" && (
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1 pr-2">类型</th>
                  <th className="text-right py-1 pr-2">金额</th>
                  <th className="text-left py-1 pr-2">说明</th>
                  <th className="text-left py-1 pr-2">单号</th>
                  <th className="text-left py-1">日期</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: any) => (
                  <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 pr-2">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">
                        {it.line_type}
                      </span>
                    </td>
                    <td className="py-1 pr-2 text-right">{it.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-1 pr-2 max-w-[200px] truncate" title={it.description}>{it.description}</td>
                    <td className="py-1 pr-2 font-mono text-gray-500">{it.source_no}</td>
                    <td className="py-1">{it.record_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {modKey === "petty_cash" && (
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b">
                <tr>
                  <th className="text-left py-1 pr-2">日期</th>
                  <th className="text-left py-1 pr-2">类别</th>
                  <th className="text-right py-1 pr-2">金额</th>
                  <th className="text-left py-1 pr-2">说明</th>
                  <th className="text-left py-1 pr-2">申请人</th>
                  <th className="text-left py-1">状态</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it: any) => (
                  <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 pr-2">{it.expense_date}</td>
                    <td className="py-1 pr-2">{it.category}</td>
                    <td className="py-1 pr-2 text-right">{it.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className="py-1 pr-2 max-w-[150px] truncate" title={it.description}>{it.description}</td>
                    <td className="py-1 pr-2">{it.applicant_name}</td>
                    <td className="py-1">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${it.status === "approved" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                        {it.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 添加备注输入区 - 每个模块底部 */}
          <div className="mt-3 pt-2 border-t border-dashed border-gray-200">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={`给${meta.label}添加备注...`}
                className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const input = e.currentTarget
                    if (input.value.trim()) {
                      // TODO: API call to add remark
                      input.value = ""
                    }
                  }
                }}
              />
              <button
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                onClick={(e) => {
                  const input = (e.currentTarget.previousSibling as HTMLInputElement)
                  if (input?.value?.trim()) {
                    input.value = ""
                  }
                }}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AuditProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = useQuery({
    queryKey: ["audit-project", projectId],
    queryFn: () => getProjectAudit(projectId!),
    enabled: !!projectId,
  })

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (!data || "error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <div className="text-lg mb-2">项目不存在或加载失败</div>
        <Link to="/audit" className="text-blue-600 hover:underline">返回审计列表</Link>
      </div>
    )
  }

  const project = data.project
  const summary = data.summary
  const modules = data.modules

  const defaultOpenKeys = ["bank", "contracts"]

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <Link to="/audit" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-2">
          <ArrowLeft className="size-3" /> 返回审计列表
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <span className="text-blue-600">[{project.code}]</span>
              {project.name}
            </h1>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
              <span>实体: {project.entity_name || "-"}</span>
              <span>类型: {project.project_type || "-"}</span>
              <span>状态: {project.status}</span>
              {project.start_date && (
                <span>周期: {project.start_date} ~ {project.end_date || "进行中"}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-xs text-gray-500">累计收入</div>
              <div className="text-sm font-bold text-green-600">
                {summary.bank_income.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">累计支出</div>
              <div className="text-sm font-bold text-red-600">
                {summary.bank_expense.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">累计流水</div>
              <div className={`text-sm font-bold ${summary.bank_net >= 0 ? "text-green-600" : "text-red-600"}`}>
                {summary.bank_net >= 0 ? "+" : ""}{summary.bank_net.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="text-center px-3 py-1 rounded-md bg-indigo-50 border border-indigo-100">
              <div className="text-xs text-indigo-600">关联模块</div>
              <div className="text-sm font-bold text-indigo-700">{summary.total_modules} / {summary.total_records}条</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-3 pb-4">
        {Object.entries(modules).map(([key, modData]) => (
          <Section
            key={key}
            modKey={key}
            data={modData}
            defaultOpen={defaultOpenKeys.includes(key)}
          />
        ))}
      </div>
    </div>
  )
}
