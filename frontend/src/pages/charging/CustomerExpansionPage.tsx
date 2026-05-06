import { useState } from "react"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

const STATUS_LABELS: Record<string, string> = {
  initial: "初步接触",
  contacting: "沟通中",
  negotiating: "谈判中",
  signed: "已签约",
  lost: "已流失",
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  initial: "outline",
  contacting: "secondary",
  negotiating: "default",
  signed: "default",
  lost: "destructive",
}

const EMPTY_FORM = {
  customer_name: "",
  contact_person: "",
  phone: "",
  company: "",
  station_id: "",
  status: "initial",
  expected_revenue: "",
  remark: "",
}

type FormType = typeof EMPTY_FORM

interface Customer {
  id: string
  customer_name: string
  contact_person: string
  phone: string
  company: string
  station_id: string
  status: string
  expected_revenue: string
  remark: string
}

const PAGE_SIZE = 20

export default function CustomerExpansionPage() {
  const [data, setData] = useState<Customer[]>([])
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState("all")
  const [stationFilter, setStationFilter] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [form, setForm] = useState<FormType>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const filtered = data.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false
    if (stationFilter && item.station_id !== stationFilter) return false
    return true
  })

  const total = filtered.length
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const stationSet = new Set(data.map((item) => item.station_id).filter(Boolean))

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (item: Customer) => {
    setForm({
      customer_name: item.customer_name,
      contact_person: item.contact_person,
      phone: item.phone,
      company: item.company,
      station_id: item.station_id,
      status: item.status,
      expected_revenue: item.expected_revenue,
      remark: item.remark,
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setTimeout(() => {
      if (editing) {
        setData((prev) =>
          prev.map((item) =>
            item.id === editing.id ? { ...item, ...form } : item
          )
        )
      } else {
        const newItem: Customer = {
          id: crypto.randomUUID(),
          ...form,
        }
        setData((prev) => [newItem, ...prev])
      }
      setSubmitting(false)
      setDialogOpen(false)
    }, 300)
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    setData((prev) => prev.filter((item) => item.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  const set = (key: keyof FormType) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-bold">客户拓展</CardTitle>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新增客户
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            接口开发中，当前数据仅保存在本地
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ""); setPage(1) }}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stationFilter || "all"} onValueChange={(v) => { setStationFilter(v === "all" ? "" : v ?? ""); setPage(1) }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="全部站点" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部站点</SelectItem>
                {Array.from(stationSet).map((sid) => (
                  <SelectItem key={sid} value={sid}>{sid}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户名称</TableHead>
                <TableHead>联系人</TableHead>
                <TableHead>电话</TableHead>
                <TableHead>所属公司</TableHead>
                <TableHead>意向站点</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">预期收入</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">暂无数据</TableCell>
                </TableRow>
              )}
              {paged.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.customer_name}</TableCell>
                  <TableCell>{item.contact_person || "-"}</TableCell>
                  <TableCell>{item.phone || "-"}</TableCell>
                  <TableCell>{item.company || "-"}</TableCell>
                  <TableCell>{item.station_id || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[item.status] ?? "secondary"}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.expected_revenue ? `¥${Number(item.expected_revenue).toLocaleString()}` : "-"}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">{item.remark || "-"}</TableCell>
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

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">共 {total} 条</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <span className="text-sm">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑客户" : "新增客户"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>客户名称</Label>
                <Input value={form.customer_name} onChange={set("customer_name")} required />
              </div>
              <div className="space-y-2">
                <Label>所属公司</Label>
                <Input value={form.company} onChange={set("company")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>联系人</Label>
                <Input value={form.contact_person} onChange={set("contact_person")} required />
              </div>
              <div className="space-y-2">
                <Label>电话</Label>
                <Input value={form.phone} onChange={set("phone")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>意向站点ID</Label>
                <Input value={form.station_id} onChange={set("station_id")} placeholder="站点ID（可选）" />
              </div>
              <div className="space-y-2">
                <Label>预期收入（元）</Label>
                <Input type="number" step="0.01" value={form.expected_revenue} onChange={set("expected_revenue")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v ?? "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea rows={3} value={form.remark} onChange={set("remark")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
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
            <AlertDialogDescription>确定要删除客户「{deleteTarget?.customer_name}」吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
