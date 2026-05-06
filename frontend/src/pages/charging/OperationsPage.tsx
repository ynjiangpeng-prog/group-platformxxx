import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Download } from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { listStationFinancials, listStations, listDevices } from "@/api/charging"

const PAGE_SIZE = 20

const fmt = (v: number) => `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function OperationsPage() {
  const [page, setPage] = useState(1)
  const [stationFilter, setStationFilter] = useState("all")
  const [startMonth, setStartMonth] = useState("")
  const [endMonth, setEndMonth] = useState("")

  const { data: stationsData } = useQuery({
    queryKey: ["stations-for-ops"],
    queryFn: () => listStations({ page: 1, page_size: 500 }),
  })
  const stations = stationsData?.items ?? []
  const stationMap = new Map(stations.map((s) => [s.id, s]))

  const { data: devicesData } = useQuery({
    queryKey: ["devices-for-ops"],
    queryFn: () => listDevices({ page: 1, page_size: 500 }),
  })
  const devices = devicesData?.items ?? []

  const summaryParams: Record<string, unknown> = { page: 1, page_size: 500 }
  if (stationFilter !== "all") summaryParams.station_id = stationFilter
  if (startMonth) summaryParams.month_start = startMonth
  if (endMonth) summaryParams.month_end = endMonth

  const { data: allData } = useQuery({
    queryKey: ["station-financials-summary", stationFilter, startMonth, endMonth],
    queryFn: () => listStationFinancials(summaryParams),
  })
  const allFinancials = allData?.items ?? []

  const pageParams: Record<string, unknown> = { page, page_size: PAGE_SIZE }
  if (stationFilter !== "all") pageParams.station_id = stationFilter
  if (startMonth) pageParams.month_start = startMonth
  if (endMonth) pageParams.month_end = endMonth

  const { data, isLoading } = useQuery({
    queryKey: ["station-financials", page, stationFilter, startMonth, endMonth],
    queryFn: () => listStationFinancials(pageParams),
  })

  const financials = data?.items ?? []
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const deviceCountByStation = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of devices) m.set(d.station_id, (m.get(d.station_id) ?? 0) + 1)
    return m
  }, [devices])

  const { totalRevenue, totalCost, totalOrders, totalKwh, grossProfit, deviceCount, avgPerOrder, dailyPerDevice, profitRate } = useMemo(() => {
    const rev = allFinancials.reduce((s, f) => s + (f.total_revenue ?? 0), 0)
    const cost = allFinancials.reduce((s, f) => s + f.electricity_cost + f.rent_cost + f.depreciation + f.maintenance_cost + f.labor_cost, 0)
    const orders = allFinancials.reduce((s, f) => s + f.total_orders, 0)
    const kwh = allFinancials.reduce((s, f) => s + (f.total_kwh ?? 0), 0)
    const gp = rev - cost
    const stationIds = new Set(allFinancials.map((f) => f.station_id))
    const dCount = [...stationIds].reduce((s, id) => s + (deviceCountByStation.get(id) ?? 0), 0)
    const months = new Set(allFinancials.map((f) => f.month))
    const avgDays = months.size > 0 ? months.size * 30 : 1
    return {
      totalRevenue: rev,
      totalCost: cost,
      totalOrders: orders,
      totalKwh: kwh,
      grossProfit: gp,
      deviceCount: dCount,
      avgPerOrder: orders > 0 ? rev / orders : 0,
      dailyPerDevice: dCount > 0 ? rev / dCount / avgDays : 0,
      profitRate: rev > 0 ? (gp / rev) * 100 : 0,
    }
  }, [allFinancials, deviceCountByStation])

  const chartData = financials.map((f) => {
    const station = stationMap.get(f.station_id)
    return {
      name: station?.name ?? f.station_id,
      revenue: f.total_revenue ?? 0,
      cost: f.electricity_cost + f.rent_cost + f.depreciation + f.maintenance_cost + f.labor_cost,
    }
  })

  const resetPage = (fn: () => void) => { fn(); setPage(1) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">运营数据</h1>
        <Button variant="outline" size="sm" onClick={() => alert("导出功能开发中")}>
          <Download className="size-4" />
          导出Excel
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={stationFilter} onValueChange={(v) => resetPage(() => setStationFilter(v ?? "all"))}>
          <SelectTrigger className="w-52"><SelectValue placeholder="筛选站点" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部站点</SelectItem>
            {stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          type="month"
          className="w-44"
          value={startMonth}
          onChange={(e) => resetPage(() => setStartMonth(e.target.value))}
          placeholder="起始月份"
        />
        <span className="text-sm text-muted-foreground">至</span>
        <Input
          type="month"
          className="w-44"
          value={endMonth}
          onChange={(e) => resetPage(() => setEndMonth(e.target.value))}
          placeholder="结束月份"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">总收入</p><p className="text-xl font-bold text-emerald-500">{fmt(totalRevenue)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">总成本</p><p className="text-xl font-bold text-rose-500">{fmt(totalCost)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">总订单</p><p className="text-xl font-bold">{totalOrders.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">总充电量</p><p className="text-xl font-bold">{totalKwh.toLocaleString("zh-CN", { maximumFractionDigits: 1 })} kWh</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">客单价</p><p className="text-xl font-bold">{fmt(avgPerOrder)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">单桩日均</p><p className="text-xl font-bold">{fmt(dailyPerDevice)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">利润率</p><p className={`text-xl font-bold ${profitRate >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{profitRate.toFixed(1)}%</p></CardContent></Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>收入与成本对比</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="revenue" name="收入" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name="成本" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>运营明细</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">站点</TableHead>
                  <TableHead className="whitespace-nowrap">月份</TableHead>
                  <TableHead className="whitespace-nowrap text-right">订单数</TableHead>
                  <TableHead className="whitespace-nowrap text-right">充电量(kWh)</TableHead>
                  <TableHead className="whitespace-nowrap text-right">收入</TableHead>
                  <TableHead className="whitespace-nowrap text-right">电费成本</TableHead>
                  <TableHead className="whitespace-nowrap text-right">租金成本</TableHead>
                  <TableHead className="whitespace-nowrap text-right">折旧</TableHead>
                  <TableHead className="whitespace-nowrap text-right">维护成本</TableHead>
                  <TableHead className="whitespace-nowrap text-right">人工成本</TableHead>
                  <TableHead className="whitespace-nowrap text-right">总成本</TableHead>
                  <TableHead className="whitespace-nowrap text-right">毛利润</TableHead>
                  <TableHead className="whitespace-nowrap text-right">毛利率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {financials.length === 0 && <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>}
                {financials.map((f) => {
                  const station = stationMap.get(f.station_id)
                  const totalCost = f.electricity_cost + f.rent_cost + f.depreciation + f.maintenance_cost + f.labor_cost
                  const grossProfit = (f.total_revenue ?? 0) - totalCost
                  const grossMargin = (f.total_revenue ?? 0) > 0 ? (grossProfit / (f.total_revenue ?? 0)) * 100 : 0
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium whitespace-nowrap">{station?.name ?? f.station_id}</TableCell>
                      <TableCell className="whitespace-nowrap">{f.month}</TableCell>
                      <TableCell className="text-right">{f.total_orders.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(f.total_kwh ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}</TableCell>
                      <TableCell className="text-right">{fmt(f.total_revenue ?? 0)}</TableCell>
                      <TableCell className="text-right">{fmt(f.electricity_cost)}</TableCell>
                      <TableCell className="text-right">{fmt(f.rent_cost)}</TableCell>
                      <TableCell className="text-right">{fmt(f.depreciation)}</TableCell>
                      <TableCell className="text-right">{fmt(f.maintenance_cost)}</TableCell>
                      <TableCell className="text-right">{fmt(f.labor_cost)}</TableCell>
                      <TableCell className="text-right">{fmt(totalCost)}</TableCell>
                      <TableCell className={`text-right ${grossProfit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fmt(grossProfit)}</TableCell>
                      <TableCell className={`text-right ${grossMargin >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{grossMargin.toFixed(1)}%</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">共 {data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm">{page} / {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </div>
    </div>
  )
}
