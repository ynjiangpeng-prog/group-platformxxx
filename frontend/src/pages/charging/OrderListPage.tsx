import { useState, useRef, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Upload, Loader2, FileUp, ArrowUp, ArrowDown, ArrowUpDown, Filter } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { listStations, listOrders } from "@/api/charging"
import type { ChargingOrder } from "@/api/types"

interface OrderRow extends ChargingOrder {
  canonical_station_name?: string
  station_name?: string
  plate_number?: string
  start_time?: string
  end_time?: string
  energy_cost?: number
  service_cost?: number
  source_order_no?: string
  business_order_no?: string
  enterprise_name?: string
  vin?: string
  user_code?: string
  channel?: string
  gun_code?: string
  device_type?: string
  duration_minutes?: number
  energy_price?: number
  service_price?: number
  original_amount?: number
  discount_amount?: number
  start_soc?: number
  end_soc?: number
  stop_reason?: string
  start_mode?: string
  peak_kwh?: number
  peak_cost?: number
  flat_kwh?: number
  flat_cost?: number
  valley_kwh?: number
  valley_cost?: number
  sharp_kwh?: number
  sharp_cost?: number
  order_type?: string
  pay_method?: string
  adjusted_unit_price?: number
  adjusted_total?: number
}

const PAGE_SIZE = 20

const payStatusLabel: Record<string, string> = { paid: "已支付", unpaid: "未支付", refunded: "已退款" }
const statusLabel: Record<string, string> = { completed: "已完成", charging: "充电中", pending: "待充电", cancelled: "已取消" }
const orderTypeLabel: Record<string, string> = { charging: "充电", refund: "退款" }
const payMethodLabel: Record<string, string> = { wechat: "微信", alipay: "支付宝", card: "银行卡", balance: "余额", other: "其他" }
const deviceTypeLabel: Record<string, string> = { dc_fast: "直流快充", ac_slow: "交流慢充", dc_super: "超充" }
const channelLabel: Record<string, string> = { app: "APP", mini_program: "小程序", card: "充电卡", api: "API" }
const stopReasonLabel: Record<string, string> = { full: "充满", user_stop: "用户停止", error: "故障", timeout: "超时" }
const startModeLabel: Record<string, string> = { scan: "扫码", card: "刷卡", vin: "VIN", remote: "远程" }

function fmtCurrency(v?: number | null) {
  if (v == null) return "-"
  return "¥" + Number(v).toFixed(2)
}

function fmtNum(v?: number | null, decimals = 2) {
  if (v == null) return "-"
  return Number(v).toFixed(decimals)
}

function fmtShortDt(s?: string | null) {
  if (!s) return "-"
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function fmtFullDt(s?: string | null) {
  if (!s) return "-"
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

interface ColDef {
  key: string
  label: string
  type: "text" | "number" | "currency" | "datetime" | "enum"
  enumMap?: Record<string, string>
  width?: string
}

const columns: ColDef[] = [
  { key: "order_no", label: "订单号", type: "text", width: "160px" },
  { key: "source_order_no", label: "源订单号", type: "text", width: "160px" },
  { key: "canonical_station_name", label: "电站名称", type: "text", width: "140px" },
  { key: "device_type", label: "设备类型", type: "enum", enumMap: deviceTypeLabel, width: "100px" },
  { key: "gun_code", label: "枪编号", type: "text", width: "80px" },
  { key: "channel", label: "渠道", type: "enum", enumMap: channelLabel, width: "80px" },
  { key: "order_type", label: "订单类型", type: "enum", enumMap: orderTypeLabel, width: "80px" },
  { key: "user_code", label: "用户编码", type: "text", width: "100px" },
  { key: "enterprise_name", label: "企业名称", type: "text", width: "120px" },
  { key: "plate_number", label: "车牌号", type: "text", width: "100px" },
  { key: "vin", label: "VIN", type: "text", width: "140px" },
  { key: "start_time", label: "开始时间", type: "datetime", width: "150px" },
  { key: "end_time", label: "结束时间", type: "datetime", width: "150px" },
  { key: "duration_minutes", label: "时长(分)", type: "number", width: "80px" },
  { key: "start_soc", label: "起始SOC", type: "number", width: "80px" },
  { key: "end_soc", label: "结束SOC", type: "number", width: "80px" },
  { key: "charging_kwh", label: "充电量(kWh)", type: "number", width: "110px" },
  { key: "energy_price", label: "电价", type: "currency", width: "80px" },
  { key: "service_price", label: "服务单价", type: "currency", width: "80px" },
  { key: "energy_cost", label: "电费", type: "currency", width: "90px" },
  { key: "service_cost", label: "服务费", type: "currency", width: "90px" },
  { key: "original_amount", label: "原始金额", type: "currency", width: "90px" },
  { key: "discount_amount", label: "优惠金额", type: "currency", width: "90px" },
  { key: "total_amount", label: "总金额", type: "currency", width: "90px" },
  { key: "pay_amount", label: "实付金额", type: "currency", width: "90px" },
  { key: "pay_method", label: "支付方式", type: "enum", enumMap: payMethodLabel, width: "80px" },
  { key: "pay_status", label: "支付状态", type: "enum", enumMap: payStatusLabel, width: "80px" },
  { key: "status", label: "充电状态", type: "enum", enumMap: statusLabel, width: "80px" },
  { key: "stop_reason", label: "停止原因", type: "enum", enumMap: stopReasonLabel, width: "80px" },
  { key: "start_mode", label: "启动方式", type: "enum", enumMap: startModeLabel, width: "80px" },
  { key: "peak_kwh", label: "尖电量", type: "number", width: "80px" },
  { key: "peak_cost", label: "尖电费", type: "currency", width: "80px" },
  { key: "flat_kwh", label: "平电量", type: "number", width: "80px" },
  { key: "flat_cost", label: "平电费", type: "currency", width: "80px" },
  { key: "valley_kwh", label: "谷电量", type: "number", width: "80px" },
  { key: "valley_cost", label: "谷电费", type: "currency", width: "80px" },
  { key: "sharp_kwh", label: "峰电量", type: "number", width: "80px" },
  { key: "sharp_cost", label: "峰电费", type: "currency", width: "80px" },
]

function FilterPopover({
  col,
  value,
  onChange,
  uniqueValues,
}: {
  col: ColDef
  value: string
  onChange: (v: string) => void
  uniqueValues: string[]
}) {
  const [search, setSearch] = useState("")

  if (col.type === "enum" && col.enumMap) {
    const options = Object.entries(col.enumMap)
    const filtered = options.filter(([, label]) => label.includes(search) || search === "")
    const hasFilter = value !== "all"
    return (
      <Popover>
        <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className={`h-5 w-5 p-0 ${hasFilter ? "text-primary" : "text-muted-foreground"}`} />}>
          <Filter className="size-3" />
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="start">
          <Input placeholder="搜索..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs mb-2" />
          <div className="space-y-1 max-h-40 overflow-y-auto">
            <label className="flex items-center gap-2 text-xs cursor-pointer px-1 py-0.5 rounded hover:bg-muted">
              <Checkbox checked={value === "all"} onCheckedChange={() => onChange("all")} />
              <span>全部</span>
            </label>
            {filtered.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-xs cursor-pointer px-1 py-0.5 rounded hover:bg-muted">
                <Checkbox checked={value === k} onCheckedChange={() => onChange(value === k ? "all" : k)} />
                <span>{label}</span>
                {uniqueValues.includes(k) && <span className="ml-auto text-muted-foreground">✓</span>}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  if (col.type === "datetime") {
    const hasFilter = value !== ""
    return (
      <Popover>
        <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className={`h-5 w-5 p-0 ${hasFilter ? "text-primary" : "text-muted-foreground"}`} />}>
          <Filter className="size-3" />
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2" align="start">
          <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 text-xs" />
          {value && (
            <Button variant="ghost" size="sm" className="w-full mt-1 h-6 text-xs" onClick={() => onChange("")}>
              清除
            </Button>
          )}
        </PopoverContent>
      </Popover>
    )
  }

  // text and number columns: keyword search
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className={`h-5 w-5 p-0 ${value ? "text-primary" : "text-muted-foreground"}`} />}>
        <Filter className="size-3" />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <Input placeholder={`筛选${col.label}...`} value={value} onChange={(e) => onChange(e.target.value)} className="h-7 text-xs" />
        {value && (
          <Button variant="ghost" size="sm" className="w-full mt-1 h-6 text-xs" onClick={() => onChange("")}>
            清除
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function SortableHeader({
  col,
  sortBy,
  sortOrder,
  onSort,
  filterValue,
  onFilter,
  uniqueValues,
}: {
  col: ColDef
  sortBy: string
  sortOrder: "asc" | "desc"
  onSort: (key: string) => void
  filterValue: string
  onFilter: (v: string) => void
  uniqueValues: string[]
}) {
  const isActive = sortBy === col.key
  return (
    <div className="flex items-center gap-0.5">
      <button
        className="flex items-center gap-0.5 text-xs font-medium hover:text-foreground transition-colors"
        onClick={() => onSort(col.key)}
      >
        {col.label}
        {isActive ? (
          sortOrder === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </button>
      <FilterPopover col={col} value={filterValue} onChange={onFilter} uniqueValues={uniqueValues} />
    </div>
  )
}

export default function OrderListPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState("created_at")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [importOpen, setImportOpen] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; matched?: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Filters
  const [stationFilter, setStationFilter] = useState("all")
  const [filterMap, setFilterMap] = useState<Record<string, string>>({})

  const { data: stationsData } = useQuery({
    queryKey: ["charging-stations-all"],
    queryFn: () => listStations({ page: 1, page_size: 500 }),
  })

  const stationNameMap = new Map(stationsData?.items?.map((s) => [s.id, s.name]) ?? [])

  const params: Record<string, unknown> = { page, page_size: PAGE_SIZE, sort_by: sortBy, sort_order: sortOrder }
  if (stationFilter !== "all") params.station_id = stationFilter

  // Map filters to API params
  for (const [key, val] of Object.entries(filterMap)) {
    if (!val || val === "all") continue
    if (key === "start_time") {
      params.start_date = val
    } else if (key === "end_time") {
      params.end_date = val
    } else if (key === "canonical_station_name") {
      params.keyword = val
    } else if (key === "order_no" || key === "source_order_no" || key === "plate_number" || key === "enterprise_name" || key === "user_code" || key === "vin") {
      // Combine text filters into keyword
      params.keyword = [params.keyword, val].filter(Boolean).join(" ")
    } else if (["pay_status", "status", "order_type", "pay_method", "channel", "device_type"].includes(key)) {
      params[key] = val
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["charging-orders", params],
    queryFn: () => listOrders(params),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)
  const items = (data?.items ?? []) as OrderRow[]
  const totalKwh = items.reduce((s, i) => s + (Number(i.charging_kwh) || 0), 0)
  const totalRevenue = items.reduce((s, i) => s + (Number(i.pay_amount) || 0), 0)

  // Extract unique values from current data for filter indicators
  const uniqueValuesMap = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const col of columns) {
      if (col.type === "enum") {
        const vals = new Set(items.map((i) => String((i as Record<string, unknown>)[col.key] ?? "")).filter(Boolean))
        m[col.key] = Array.from(vals)
      }
    }
    return m
  }, [items])

  const fileImportMut = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData()
      fd.append("file", f)
      const { post } = await import("@/lib/http")
      return post<{ imported: number; skipped: number; matched?: number }>("/charging/orders/import-file", fd)
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["charging-orders"] })
      setImportResult(res)
      if (res.imported > 0) toast.success(`已导入 ${res.imported} 条${res.skipped > 0 ? `，跳过 ${res.skipped} 条重复` : ""}`)
      else toast.info("所有记录均已存在，无新导入")
    },
  })

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(key)
      setSortOrder("desc")
    }
    setPage(1)
  }

  const handleFilter = (colKey: string, value: string) => {
    setFilterMap((prev) => ({ ...prev, [colKey]: value }))
    setPage(1)
  }

  const resetFilters = () => {
    setStationFilter("all")
    setFilterMap({})
    setPage(1)
  }

  const hasActiveFilters = stationFilter !== "all" || Object.values(filterMap).some((v) => v && v !== "all")

  const renderCellValue = (item: OrderRow, col: ColDef) => {
    const raw = (item as Record<string, unknown>)[col.key]
    switch (col.type) {
      case "currency":
        return fmtCurrency(raw as number | null)
      case "number":
        return raw != null ? fmtNum(raw as number) : "-"
      case "datetime":
        return col.key === "start_time" || col.key === "end_time" ? fmtFullDt(raw as string) : String(raw ?? "-")
      case "enum":
        return col.enumMap?.[String(raw ?? "")] ?? String(raw ?? "-")
      default:
        return String(raw ?? "-")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">充电订单</h1>
        <Button onClick={() => setImportOpen(true)}>
          <Upload className="size-4" />
          导入订单
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">总订单数</p>
            <p className="text-2xl font-bold">{data?.total ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">本页充电量</p>
            <p className="text-2xl font-bold">{totalKwh.toFixed(2)} <span className="text-sm font-normal">kWh</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">本页收入</p>
            <p className="text-2xl font-bold">{fmtCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <Label>电站</Label>
          <Select value={stationFilter} onValueChange={(v) => { if (v) { setStationFilter(v); setPage(1) } }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部电站</SelectItem>
              {stationsData?.items.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={resetFilters}>重置筛选</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col.key} style={{ minWidth: col.width, whiteSpace: "nowrap" }}>
                        <SortableHeader
                          col={col}
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSort}
                          filterValue={filterMap[col.key] ?? "all"}
                          onFilter={(v) => handleFilter(col.key, v)}
                          uniqueValues={uniqueValuesMap[col.key] ?? []}
                        />
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      {columns.map((col) => (
                        <TableCell key={col.key} className="whitespace-nowrap text-xs" style={{ minWidth: col.width }}>
                          {col.key === "pay_status" ? (
                            <span className={item.pay_status === "paid" ? "text-green-600" : item.pay_status === "unpaid" ? "text-yellow-600" : "text-gray-500"}>
                              {renderCellValue(item, col)}
                            </span>
                          ) : col.key === "status" ? (
                            <span className={item.status === "completed" ? "text-green-600" : item.status === "charging" ? "text-blue-600" : "text-gray-500"}>
                              {renderCellValue(item, col)}
                            </span>
                          ) : col.key === "pay_amount" ? (
                            <span className="font-semibold">{renderCellValue(item, col)}</span>
                          ) : (
                            renderCellValue(item, col)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">共 {data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <span className="text-sm">{page} / {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      </div>

      <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) setImportResult(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入充电订单</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">支持 .xlsx 格式的充电订单文件</p>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="size-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">点击选择文件</p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) fileImportMut.mutate(f)
                e.target.value = ""
              }}
            />
            {fileImportMut.isPending && (
              <div className="flex justify-center py-4">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {importResult && (
              <div className="border rounded-lg p-4 space-y-1">
                <p className="font-medium">导入结果</p>
                <p className="text-sm">新增: <span className="font-medium text-green-600">{importResult.imported}</span> 条</p>
                <p className="text-sm">跳过(重复): <span className="font-medium text-orange-600">{importResult.skipped}</span> 条</p>
                {importResult.matched != null && (
                  <p className="text-sm">匹配充电站: <span className="font-medium text-blue-600">{importResult.matched}</span> 条</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportResult(null) }}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
