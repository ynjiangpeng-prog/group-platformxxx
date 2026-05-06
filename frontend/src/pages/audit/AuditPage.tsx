import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Search, Landmark, FileSignature, ArrowLeftRight, Receipt,
  Zap, Bolt, ListTree, Wallet, FolderKanban,
  ChevronDown, ChevronRight, ArrowUpDown,
} from "lucide-react"
import { listAuditProjects, type AuditProjectSummary } from "@/api/audit"

export default function AuditPage() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState("")
  const [sortKey, setSortKey] = useState<"total_links" | "name" | "bank_count" | "status">("total_links")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const { data, isLoading } = useQuery({
    queryKey: ["audit-projects", keyword],
    queryFn: () => listAuditProjects(keyword || undefined),
  })

  const items: AuditProjectSummary[] = data?.items ?? []

  const sorted = [...items].sort((a, b) => {
    let av: any = a[sortKey]
    let bv: any = b[sortKey]
    if (typeof av === "string") {
      av = av.toLowerCase()
      bv = bv.toLowerCase()
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1
    if (av > bv) return sortDir === "asc" ? 1 : -1
    return 0
  })

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const statusColor: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    completed: "bg-blue-100 text-blue-700",
    paused: "bg-yellow-100 text-yellow-700",
    draft: "bg-gray-100 text-gray-700",
    pending: "bg-orange-100 text-orange-700",
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <FolderKanban className="size-5 text-blue-600" />
          全局审计 - 项目关联概览
        </h1>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 size-4 text-gray-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索项目名称或编码..."
            className="w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto border border-gray-200 rounded-md bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th
                  className="px-3 py-2 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort("name")}
                >
                  <span className="flex items-center gap-1">
                    项目名称 <ArrowUpDown className="size-3" />
                  </span>
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">实体</th>
                <th
                  className="px-3 py-2 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort("status")}
                >
                  <span className="flex items-center gap-1">
                    状态 <ArrowUpDown className="size-3" />
                  </span>
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">
                  <span className="flex items-center justify-center gap-1">
                    <Landmark className="size-3.5" /> 流水
                  </span>
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">
                  <span className="flex items-center justify-center gap-1">
                    <FileSignature className="size-3.5" /> 合同
                  </span>
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">
                  <span className="flex items-center justify-center gap-1">
                    <ArrowLeftRight className="size-3.5" /> 收付
                  </span>
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">
                  <span className="flex items-center justify-center gap-1">
                    <Receipt className="size-3.5" /> 发票
                  </span>
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">
                  <span className="flex items-center justify-center gap-1">
                    <Zap className="size-3.5" /> 站点
                  </span>
                </th>
                <th
                  className="px-3 py-2 text-center font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort("total_links")}
                >
                  <span className="flex items-center justify-center gap-1">
                    关联总计 <ArrowUpDown className="size-3" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/audit/${item.id}`)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.code}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{item.entity_name}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[item.status] || statusColor.draft}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.bank_count > 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium text-xs">
                        {item.bank_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.contract_count > 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-medium text-xs">
                        {item.contract_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.arap_count > 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium text-xs">
                        {item.arap_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.invoice_count > 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-green-50 text-green-700 font-medium text-xs">
                        {item.invoice_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.station_count > 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 font-medium text-xs">
                        {item.station_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-xs ${item.total_links > 0 ? "bg-indigo-50 text-indigo-700" : "text-gray-300"}`}>
                      {item.total_links}
                      <ChevronRight className="size-3" />
                    </span>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                    暂无项目数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
