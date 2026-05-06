import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Loader2, CheckCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { listStations, listStationFinancials, createStationFinancial, updateStationFinancial, confirmStationFinancial } from "@/api/charging"
import type { StationFinancial } from "@/api/types"

const EMPTY_FORM = {
  station_id: "",
  month: "",
  total_orders: "",
  total_kwh: "",
  total_revenue: "",
  electricity_cost: "",
  rent_cost: "",
  depreciation: "",
  maintenance_cost: "",
  labor_cost: "",
}
const PAGE_SIZE = 20

export default function FinancialPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StationFinancial | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const { data: stationsData } = useQuery({
    queryKey: ["charging-stations-all"],
    queryFn: () => listStations({ page: 1, page_size: 500 }),
  })

  const stationNameMap = new Map(stationsData?.items?.map((s) => [s.id, s.name]) ?? [])

  const { data, isLoading } = useQuery({
    queryKey: ["charging-station-financials", page],
    queryFn: () => listStationFinancials({ page, page_size: PAGE_SIZE }),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const createMut = useMutation({
    mutationFn: (d: Partial<StationFinancial>) => createStationFinancial(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-station-financials"] })
      toast.success("创建成功")
      setDialogOpen(false)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StationFinancial> }) =>
      updateStationFinancial(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-station-financials"] })
      toast.success("更新成功")
      setDialogOpen(false)
    },
  })

  const confirmMut = useMutation({
    mutationFn: (id: string) => confirmStationFinancial(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-station-financials"] })
      toast.success("确认成功")
    },
  })

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setDialogOpen(true) }

  const openEdit = (item: StationFinancial) => {
    setForm({
      station_id: item.station_id ?? "",
      month: item.month ?? "",
      total_orders: item.total_orders?.toString() ?? "",
      total_kwh: item.total_kwh?.toString() ?? "",
      total_revenue: item.total_revenue?.toString() ?? "",
      electricity_cost: item.electricity_cost?.toString() ?? "",
      rent_cost: item.rent_cost?.toString() ?? "",
      depreciation: item.depreciation?.toString() ?? "",
      maintenance_cost: item.maintenance_cost?.toString() ?? "",
      labor_cost: item.labor_cost?.toString() ?? "",
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Partial<StationFinancial> = {
      station_id: form.station_id,
      month: form.month,
      total_orders: form.total_orders ? Number(form.total_orders) : undefined,
      total_kwh: form.total_kwh ? Number(form.total_kwh) : undefined,
      total_revenue: form.total_revenue ? Number(form.total_revenue) : undefined,
      electricity_cost: form.electricity_cost ? Number(form.electricity_cost) : undefined,
      rent_cost: form.rent_cost ? Number(form.rent_cost) : undefined,
      depreciation: form.depreciation ? Number(form.depreciation) : undefined,
      maintenance_cost: form.maintenance_cost ? Number(form.maintenance_cost) : undefined,
      labor_cost: form.labor_cost ? Number(form.labor_cost) : undefined,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">站点财务月报</h1>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          新增
        </Button>
      </div>

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
                  <TableHead>站点</TableHead>
                  <TableHead>月份</TableHead>
                  <TableHead>订单数</TableHead>
                  <TableHead>总电量(kWh)</TableHead>
                  <TableHead>总收入(元)</TableHead>
                  <TableHead>电费成本</TableHead>
                  <TableHead>租金成本</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
                {data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{stationNameMap.get(item.station_id) ?? "-"}</TableCell>
                    <TableCell>{item.month}</TableCell>
                    <TableCell>{item.total_orders}</TableCell>
                    <TableCell>{item.total_kwh}</TableCell>
                    <TableCell>{item.total_revenue}</TableCell>
                    <TableCell>{item.electricity_cost}</TableCell>
                    <TableCell>{item.rent_cost}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => confirmMut.mutate(item.id)}
                        disabled={confirmMut.isPending}
                        title="确认"
                      >
                        <CheckCircle className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)}>
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑财务记录" : "新增财务记录"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>所属站点</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.station_id}
                onChange={(e) => setForm((prev) => ({ ...prev, station_id: e.target.value }))}
                required
              >
                <option value="">请选择站点</option>
                {stationsData?.items.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>月份</Label>
              <Input value={form.month} onChange={set("month")} placeholder="如: 2026-04" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>订单数</Label>
                <Input type="number" value={form.total_orders} onChange={set("total_orders")} />
              </div>
              <div className="space-y-2">
                <Label>总电量(kWh)</Label>
                <Input type="number" step="0.01" value={form.total_kwh} onChange={set("total_kwh")} />
              </div>
              <div className="space-y-2">
                <Label>总收入(元)</Label>
                <Input type="number" step="0.01" value={form.total_revenue} onChange={set("total_revenue")} />
              </div>
              <div className="space-y-2">
                <Label>电费成本</Label>
                <Input type="number" step="0.01" value={form.electricity_cost} onChange={set("electricity_cost")} />
              </div>
              <div className="space-y-2">
                <Label>租金成本</Label>
                <Input type="number" step="0.01" value={form.rent_cost} onChange={set("rent_cost")} />
              </div>
              <div className="space-y-2">
                <Label>折旧</Label>
                <Input type="number" step="0.01" value={form.depreciation} onChange={set("depreciation")} />
              </div>
              <div className="space-y-2">
                <Label>维护成本</Label>
                <Input type="number" step="0.01" value={form.maintenance_cost} onChange={set("maintenance_cost")} />
              </div>
              <div className="space-y-2">
                <Label>人工成本</Label>
                <Input type="number" step="0.01" value={form.labor_cost} onChange={set("labor_cost")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="size-4 animate-spin" />}
                确定
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
