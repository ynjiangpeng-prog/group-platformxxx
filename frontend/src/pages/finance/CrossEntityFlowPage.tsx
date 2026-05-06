import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import * as api from "@/api/finance"

export default function CrossEntityFlowPage() {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const params: Record<string, unknown> = {}
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate

  const { data, isLoading } = useQuery({
    queryKey: ["cross-entity-flow", params],
    queryFn: () => api.getCrossEntityFlow(params),
  })

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>

  const entities = data?.entities ?? []
  const entityTotals = data?.entity_totals ?? {}
  const pairSummaries = data?.pair_summaries ?? []
  const pairFlows = data?.pair_flows ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">跨主体资金往来</h1>
      </div>

      <div className="flex items-end gap-3">
        <div><Label>开始日期</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div><Label>结束日期</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
      </div>

      {/* Entity Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {entities.map((e) => {
          const totals = entityTotals[e.id] ?? { inflow: 0, outflow: 0, net: 0, tax_loss: 0, proxy_count: 0 }
          return (
            <Card key={e.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{e.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">流入</p>
                    <p className="font-medium text-green-600">{totals.inflow.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">流出</p>
                    <p className="font-medium text-red-600">{totals.outflow.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">净额</p>
                    <p className={`font-medium ${totals.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {totals.net >= 0 ? "+" : ""}{totals.net.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">税务损失</p>
                    <p className="font-medium text-orange-600">{totals.tax_loss?.toLocaleString() ?? "0"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Pair Summaries */}
      {pairSummaries.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">主体间往来汇总</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>主体A</TableHead>
                  <TableHead>主体B</TableHead>
                  <TableHead className="text-right">A→B</TableHead>
                  <TableHead className="text-right">B→A</TableHead>
                  <TableHead className="text-right">净额(A→B)</TableHead>
                  <TableHead className="text-right">笔数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairSummaries.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{p.entity_a.name}</TableCell>
                    <TableCell className="font-medium">{p.entity_b.name}</TableCell>
                    <TableCell className="text-right text-red-600">{p.a_to_b.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-green-600">{p.b_to_a.toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-medium ${p.net_a_to_b >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {p.net_a_to_b >= 0 ? "+" : ""}{p.net_a_to_b.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">{p.flow_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detail Flows */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">往来明细 <span className="text-muted-foreground font-normal text-sm">(共 {data?.total_flow_count ?? 0} 笔)</span></CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>付款方</TableHead>
                <TableHead>收款方</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>方向</TableHead>
                <TableHead>摘要</TableHead>
                <TableHead>费用类型</TableHead>
                <TableHead>代收付</TableHead>
                <TableHead>税务损失</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairFlows.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">暂无跨主体往来数据</TableCell></TableRow>
              )}
              {pairFlows.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{f.tx_date}</TableCell>
                  <TableCell className="font-medium">{f.direction === "outflow" ? f.entity_name : f.counterparty_entity_name}</TableCell>
                  <TableCell className="font-medium">{f.direction === "outflow" ? f.counterparty_entity_name : f.entity_name}</TableCell>
                  <TableCell className={f.direction === "outflow" ? "text-red-600" : "text-green-600"}>
                    {Math.abs(f.amount).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.direction === "outflow" ? "destructive" : "default"}>
                      {f.direction === "outflow" ? "支出" : "收入"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{f.summary ?? f.counterparty ?? ""}</TableCell>
                  <TableCell>{f.expense_type ?? ""}</TableCell>
                  <TableCell>{f.is_proxy_payment ? <Badge variant="outline" className="text-xs">代收付</Badge> : ""}</TableCell>
                  <TableCell className="text-orange-600">{f.tax_loss ? f.tax_loss.toLocaleString() : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
