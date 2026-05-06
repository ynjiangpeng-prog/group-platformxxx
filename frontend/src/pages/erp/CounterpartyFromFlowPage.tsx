import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, RefreshCw, Users, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getCounterpartySummary } from "@/api/finance"

function fmtCurrency(v: number) {
  return "¥" + v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CounterpartyFromFlowPage() {
  const [tab, setTab] = useState<"supplier" | "customer">("supplier")
  const [search, setSearch] = useState("")

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["counterparty-summary"],
    queryFn: getCounterpartySummary,
    staleTime: 30_000,
  })

  const suppliers = (data?.suppliers ?? []).filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  )
  const customers = (data?.customers ?? []).filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalSupplierOutflow = suppliers.reduce((s, i) => s + i.total_outflow, 0)
  const totalCustomerInflow = customers.reduce((s, i) => s + i.total_inflow, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">供应商与客户列表</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          刷新数据
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        从银行流水自动提取：我方付款的对手方为供应商，我方收款的对手方为客户。数据随银行流水实时更新。
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Truck className="size-4" />供应商总数
            </div>
            <p className="text-2xl font-bold mt-1">{data?.total_suppliers ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Truck className="size-4" />供应商支出总额
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600">{fmtCurrency(totalSupplierOutflow)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" />客户总数
            </div>
            <p className="text-2xl font-bold mt-1">{data?.total_customers ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" />客户收入总额
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{fmtCurrency(totalCustomerInflow)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-end gap-3">
        <div className="flex gap-1 border rounded-lg p-1">
          <Button
            variant={tab === "supplier" ? "default" : "ghost"}
            size="sm"
            onClick={() => { setTab("supplier"); setSearch("") }}
          >
            <Truck className="size-3.5 mr-1" />供应商
          </Button>
          <Button
            variant={tab === "customer" ? "default" : "ghost"}
            size="sm"
            onClick={() => { setTab("customer"); setSearch("") }}
          >
            <Users className="size-3.5 mr-1" />客户
          </Button>
        </div>
        <div className="flex-1 max-w-xs">
          <Input
            placeholder="搜索名称..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  {tab === "supplier" ? (
                    <>
                      <TableHead className="text-right">累计付款</TableHead>
                      <TableHead className="text-right">付款笔数</TableHead>
                      <TableHead className="text-right">累计收款</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="text-right">累计收款</TableHead>
                      <TableHead className="text-right">收款笔数</TableHead>
                      <TableHead className="text-right">累计付款</TableHead>
                    </>
                  )}
                  <TableHead>类型</TableHead>
                  <TableHead>最近交易</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tab === "supplier" ? suppliers : customers).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
                {(tab === "supplier" ? suppliers : customers).map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right text-red-600">
                      {fmtCurrency(item.total_outflow)}
                    </TableCell>
                    <TableCell className="text-right">{item.outflow_count}</TableCell>
                    <TableCell className="text-right text-green-600">
                      {item.total_inflow > 0 ? fmtCurrency(item.total_inflow) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.type === "both" ? "default" : "secondary"}>
                        {item.type === "supplier" ? "供应商" : item.type === "customer" ? "客户" : "双向"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.latest_date || "-"}</TableCell>
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
