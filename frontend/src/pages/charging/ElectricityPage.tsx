import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { listStations, listElectricityPayments, createElectricityPayment, updateElectricityPayment, deleteElectricityPayment } from "@/api/charging"
import type { ElectricityPayment } from "@/api/types"

const EMPTY_FORM = { station_id: "", period: "", total_amount: "", total_kwh: "" }
const PAGE_SIZE = 20

export default function ElectricityPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [stationFilter, setStationFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ElectricityPayment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ElectricityPayment | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const { data: stationsData } = useQuery({
    queryKey: ["charging-stations-all"],
    queryFn: () => listStations({ page: 1, page_size: 500 }),
  })

  const stationNameMap = new Map(stationsData?.items?.map((s) => [s.id, s.name]) ?? [])

  const { data, isLoading } = useQuery({
    queryKey: ["charging-electricity", page, stationFilter],
    queryFn: () =>
      listElectricityPayments({
        page,
        page_size: PAGE_SIZE,
        ...(stationFilter !== "all" && { station_id: stationFilter }),
      }),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const createMut = useMutation({
    mutationFn: (d: Partial<ElectricityPayment>) => createElectricityPayment(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-electricity"] })
      toast.success("创建成功")
      setDialogOpen(false)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ElectricityPayment> }) =>
      updateElectricityPayment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-electricity"] })
      toast.success("更新成功")
      setDialogOpen(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteElectricityPayment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-electricity"] })
      toast.success("删除成功")
      setDeleteTarget(null)
    },
  })

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setDialogOpen(true) }

  const openEdit = (item: ElectricityPayment) => {
    setForm({
      station_id: item.station_id ?? "",
      period: item.period ?? "",
      total_amount: item.total_amount?.toString() ?? "",
      total_kwh: item.total_kwh?.toString() ?? "",
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Partial<ElectricityPayment> = {
      station_id: form.station_id,
      period: form.period,
      total_amount: form.total_amount ? Number(form.total_amount) : undefined,
      total_kwh: form.total_kwh ? Number(form.total_kwh) : undefined,
    }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">电费管理</h1>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          新增
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 p-4 border-b">
            <Label className="shrink-0">站点筛选</Label>
            <select
              className="border rounded-md px-3 py-1.5 text-sm bg-background"
              value={stationFilter}
              onChange={(e) => { setStationFilter(e.target.value); setPage(1) }}
            >
              <option value="all">全部站点</option>
              {stationsData?.items.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>站点</TableHead>
                  <TableHead>周期</TableHead>
                  <TableHead>金额(元)</TableHead>
                  <TableHead>电量(kWh)</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无数据</TableCell>
                  </TableRow>
                )}
                {data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{stationNameMap.get(item.station_id) ?? "-"}</TableCell>
                    <TableCell>{item.period}</TableCell>
                    <TableCell>{item.total_amount}</TableCell>
                    <TableCell>{item.total_kwh}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="size-4" />
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑电费" : "新增电费"}</DialogTitle>
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
              <Label>周期</Label>
              <Input value={form.period} onChange={set("period")} placeholder="如: 2026-04" required />
            </div>
            <div className="space-y-2">
              <Label>金额(元)</Label>
              <Input type="number" step="0.01" value={form.total_amount} onChange={set("total_amount")} required />
            </div>
            <div className="space-y-2">
              <Label>电量(kWh)</Label>
              <Input type="number" step="0.01" value={form.total_kwh} onChange={set("total_kwh")} required />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，确定要删除该电费记录吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
