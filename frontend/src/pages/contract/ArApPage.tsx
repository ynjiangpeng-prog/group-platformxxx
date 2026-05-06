import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Plus, Loader2, ArrowDown, ArrowUp, AlertTriangle, Calendar, Trash2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { listArAp, createArAp, settleArAp } from "@/api/finance"
import { del } from "@/lib/http"
import { listProjects } from "@/api/project"
import type { ArAp } from "@/api/types"
import BatchToolbar from "@/components/batch/BatchToolbar"

const TYPE_MAP: Record<string, { label: string; variant: "default" | "secondary" }> = {
  ar: { label: "应收", variant: "default" },
  ap: { label: "应付", variant: "secondary" },
}
const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "待结算", variant: "outline" },
  partial: { label: "部分结算", variant: "secondary" },
  settled: { label: "已结清", variant: "default" },
  overdue: { label: "逾期", variant: "destructive" },
}
const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "银行转账" },
  { value: "cash", label: "现金" },
  { value: "acceptance_bill", label: "承兑汇票" },
  { value: "other", label: "其他" },
]
const BUSINESS_TYPES = [
  { value: "charging_service", label: "充电服务" },
  { value: "electricity", label: "电费" },
  { value: "equipment", label: "设备采购" },
  { value: "construction", label: "工程施工" },
  { value: "rent", label: "场地租赁" },
  { value: "maintenance", label: "运维服务" },
  { value: "other", label: "其他" },
]

const fmt = (v?: number | null) =>
  `¥${Number(v ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`

const PAGE_SIZE = 20

const emptyCreate = { type: "ar", business_type: "", counterparty: "", total_amount: "", due_date: "", project_id: "", remark: "" }
const emptySettle = { amount: "", payment_method: "bank_transfer", bank_account: "", settlement_date: new Date().toISOString().split("T")[0], remark: "" }

export default function ArApPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [projectFilter, setProjectFilter] = useState("all")
  const [keyword, setKeyword] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [settleTarget, setSettleTarget] = useState<ArAp | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState(emptyCreate)
  const [settleForm, setSettleForm] = useState(emptySettle)

  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-filter"],
    queryFn: () => listProjects({ page: 1, page_size: 200 }),
  })
  const projects = projectsData?.items ?? []

  const { data: summaryAll } = useQuery({
    queryKey: ["arap-summary", projectFilter],
    queryFn: () => listArAp({ page: 1, page_size: 500, project_id: projectFilter !== "all" ? projectFilter : undefined }),
  })

  const summaryItems = summaryAll?.items ?? []
  const totalReceivable = useMemo(() => summaryItems.filter(r => r.type === "ar").reduce((s, r) => s + (r.remaining_amount ?? 0), 0), [summaryItems])
  const totalPayable = useMemo(() => summaryItems.filter(r => r.type === "ap").reduce((s, r) => s + (r.remaining_amount ?? 0), 0), [summaryItems])
  const overdueReceivable = useMemo(() => summaryItems.filter(r => r.type === "ar" && r.status === "overdue").reduce((s, r) => s + (r.remaining_amount ?? 0), 0), [summaryItems])
  const dueThisMonth = useMemo(() => {
    const now = new Date()
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    return summaryItems.filter(r => r.due_date?.startsWith(prefix) && r.status !== "settled").reduce((s, r) => s + (r.remaining_amount ?? 0), 0)
  }, [summaryItems])

  const { data, isLoading } = useQuery({
    queryKey: ["arap", page, typeFilter, statusFilter, projectFilter, keyword],
    queryFn: () => listArAp({
      page, page_size: PAGE_SIZE,
      type: typeFilter !== "all" ? typeFilter : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      project_id: projectFilter !== "all" ? projectFilter : undefined,
      keyword: keyword || undefined,
    }),
  })

  const records = data?.items ?? []
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleAll = () => setSelectedIds(prev => prev.length === records.length ? [] : records.map(r => r.id))

  const createMut = useMutation({
    mutationFn: () => createArAp({
      type: createForm.type,
      business_type: createForm.business_type || undefined,
      counterparty: createForm.counterparty,
      total_amount: Number(createForm.total_amount) || 0,
      remaining_amount: Number(createForm.total_amount) || 0,
      due_date: createForm.due_date || undefined,
      project_id: createForm.project_id || undefined,
      remark: createForm.remark || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arap"] })
      qc.invalidateQueries({ queryKey: ["arap-summary"] })
      toast.success("记录已创建")
      setCreateOpen(false)
      setCreateForm(emptyCreate)
    },
  })

  const settleMut = useMutation({
    mutationFn: () => settleArAp(settleTarget!.id, {
      amount: Number(settleForm.amount),
      payment_method: settleForm.payment_method,
      bank_account: settleForm.bank_account || undefined,
      settlement_date: settleForm.settlement_date || undefined,
      remark: settleForm.remark || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arap"] })
      qc.invalidateQueries({ queryKey: ["arap-summary"] })
      toast.success("结算成功")
      setSettleTarget(null)
      setSettleForm(emptySettle)
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => del<void>(`/finance/ar-ap/${deleteTarget}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arap"] })
      qc.invalidateQueries({ queryKey: ["arap-summary"] })
      toast.success("已删除")
      setDeleteTarget(null)
    },
  })

  const settleRemaining = settleTarget ? (settleTarget.remaining_amount ?? 0) - (Number(settleForm.amount) || 0) : 0

  const summaryCards = [
    { title: "应收总额", value: fmt(totalReceivable), Icon: ArrowDown, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "应付总额", value: fmt(totalPayable), Icon: ArrowUp, color: "text-red-600", bg: "bg-red-50" },
    { title: "逾期应收", value: fmt(overdueReceivable), Icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50" },
    { title: "本月到期", value: fmt(dueThisMonth), Icon: Calendar, color: "text-green-600", bg: "bg-green-50" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">应收应付管理</h1>
        <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />新建</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {summaryCards.map(({ title, value, Icon, color, bg }) => (
          <Card key={title}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`size-5 ${color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-28"><SelectValue placeholder="类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="ar">应收</SelectItem>
            <SelectItem value="ap">应付</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={v => { setProjectFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="所属项目" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="搜索交易方/摘要..." className="w-52" value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1) }} />
        <BatchToolbar
          entityType="ar-ap"
          selectedIds={selectedIds}
          templateType="ar_ap"
          onImportComplete={() => { qc.invalidateQueries({ queryKey: ["arap"] }); qc.invalidateQueries({ queryKey: ["arap-summary"] }) }}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={selectedIds.length > 0 && selectedIds.length === records.length} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>交易方</TableHead>
                  <TableHead>摘要/来源单号</TableHead>
                  <TableHead className="text-right">原始金额(¥)</TableHead>
                  <TableHead className="text-right">已结算(¥)</TableHead>
                  <TableHead className="text-right">剩余金额(¥)</TableHead>
                  <TableHead>到期日</TableHead>
                  <TableHead>逾期天数</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
                )}
                {records.map(r => {
                  const ti = TYPE_MAP[r.type] ?? { label: r.type, variant: "outline" as const }
                  const si = STATUS_MAP[r.status] ?? { label: r.status, variant: "secondary" as const }
                  return (
                    <TableRow key={r.id}>
                      <TableCell><Checkbox checked={selectedIds.includes(r.id)} onCheckedChange={() => toggleSelect(r.id)} /></TableCell>
                      <TableCell><Badge variant={ti.variant}>{ti.label}</Badge></TableCell>
                      <TableCell className="font-medium">{r.counterparty ?? "-"}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{r.remark ?? r.source_no ?? "-"}</TableCell>
                      <TableCell className="text-right">{fmt(r.total_amount)}</TableCell>
                      <TableCell className="text-right">{fmt(r.settled_amount)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.remaining_amount)}</TableCell>
                      <TableCell>{r.due_date ?? "-"}</TableCell>
                      <TableCell>{r.overdue_days > 0 ? <span className="text-orange-600 font-medium">{r.overdue_days}天</span> : "-"}</TableCell>
                      <TableCell><Badge variant={si.variant}>{si.label}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(r.remaining_amount ?? 0) > 0 && (
                            <Button size="sm" variant="outline" onClick={() => { setSettleTarget(r); setSettleForm(emptySettle) }}>结算</Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(r.id)}><Trash2 className="size-4" /></Button>
                        </div>
                      </TableCell>
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span className="text-sm">{page} / {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>新建应收/应付</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
              <div className="grid gap-2">
                <Label>类型 *</Label>
                <Select value={createForm.type} onValueChange={v => { if (v) setCreateForm(f => ({ ...f, type: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">应收</SelectItem>
                    <SelectItem value="ap">应付</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>业务类型</Label>
                <Select value={createForm.business_type} onValueChange={v => { if (v) setCreateForm(f => ({ ...f, business_type: v })) }}>
                  <SelectTrigger><SelectValue placeholder="选择业务类型" /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>交易方 *</Label>
              <Input value={createForm.counterparty} onChange={e => setCreateForm(f => ({ ...f, counterparty: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
              <div className="grid gap-2">
                <Label>金额 *</Label>
                <Input type="number" step="0.01" value={createForm.total_amount} onChange={e => setCreateForm(f => ({ ...f, total_amount: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>到期日</Label>
                <Input type="date" value={createForm.due_date} onChange={e => setCreateForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>所属项目</Label>
              <Select value={createForm.project_id} onValueChange={v => { if (v) setCreateForm(f => ({ ...f, project_id: v })) }}>
                <SelectTrigger><SelectValue placeholder="选择项目（可选）" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>备注</Label>
              <Textarea value={createForm.remark} onChange={e => setCreateForm(f => ({ ...f, remark: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button disabled={createMut.isPending || !createForm.counterparty || !createForm.total_amount} onClick={() => createMut.mutate()}>
              {createMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!settleTarget} onOpenChange={open => { if (!open) setSettleTarget(null) }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>结算</DialogTitle></DialogHeader>
          {settleTarget && (
            <div className="grid gap-4 py-4">
              <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">交易方</span>
                  <span className="font-medium">{settleTarget.counterparty ?? "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">剩余金额</span>
                  <span className="font-bold text-lg">{fmt(settleTarget.remaining_amount)}</span>
                </div>
                {settleTarget.due_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">到期日</span>
                    <span>{settleTarget.due_date}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>结算金额 *</Label>
                  <Input type="number" step="0.01" value={settleForm.amount} onChange={e => setSettleForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>结算方式</Label>
                  <Select value={settleForm.payment_method} onValueChange={v => { if (v) setSettleForm(f => ({ ...f, payment_method: v })) }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {settleForm.payment_method === "bank_transfer" && (
                <div className="grid gap-2">
                  <Label>银行账号</Label>
                  <Input value={settleForm.bank_account} onChange={e => setSettleForm(f => ({ ...f, bank_account: e.target.value }))} />
                </div>
              )}
              <div className="grid gap-2">
                <Label>结算日期</Label>
                <Input type="date" value={settleForm.settlement_date} onChange={e => setSettleForm(f => ({ ...f, settlement_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>备注</Label>
                <Textarea value={settleForm.remark} onChange={e => setSettleForm(f => ({ ...f, remark: e.target.value }))} rows={2} />
              </div>
              {Number(settleForm.amount) > 0 && (
                <div className="rounded-lg border p-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">结算后剩余</span>
                  <span className={`font-bold ${settleRemaining < 0 ? "text-destructive" : settleRemaining === 0 ? "text-green-600" : ""}`}>
                    {fmt(settleRemaining)}
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleTarget(null)}>取消</Button>
            <Button disabled={settleMut.isPending || !settleForm.amount || Number(settleForm.amount) <= 0} onClick={() => settleMut.mutate()}>
              {settleMut.isPending && <Loader2 className="size-4 animate-spin" />}确认结算
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该应收/应付记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
