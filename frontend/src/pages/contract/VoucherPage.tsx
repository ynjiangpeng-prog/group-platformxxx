import { useState, Fragment } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Loader2, Trash2, ChevronRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { listVouchers, createVoucher, getVoucher, deleteVoucher, reviewVoucher, postVoucher, listAccounts } from "@/api/finance"
import { listProjects } from "@/api/project"
import type { Account } from "@/api/types"

const STATUS_LABELS: Record<string, string> = { draft: "草稿", reviewed: "已审核", posted: "已过账" }
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = { draft: "outline", reviewed: "secondary", posted: "default" }
const VOUCHER_TYPE_LABELS: Record<string, string> = { receipt: "收款凭证", payment: "付款凭证", transfer: "转账凭证" }

const fmt = (n: number) => `¥${n.toFixed(2)}`

interface LineInput {
  account_id: string
  account_code: string
  account_name: string
  summary: string
  debit: string
  credit: string
}

const emptyLine = (): LineInput => ({ account_id: "", account_code: "", account_name: "", summary: "", debit: "", credit: "" })

function VoucherLinesInline({ voucherId }: { voucherId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["voucher-detail", voucherId],
    queryFn: () => getVoucher(voucherId),
  })
  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
  if (!data?.lines?.length) return <div className="py-4 text-center text-sm text-muted-foreground">无分录数据</div>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>行号</TableHead>
          <TableHead>科目编码</TableHead>
          <TableHead>科目名称</TableHead>
          <TableHead>摘要</TableHead>
          <TableHead className="text-right">借方金额</TableHead>
          <TableHead className="text-right">贷方金额</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.lines.map((ln) => (
          <TableRow key={ln.id}>
            <TableCell>{ln.line_no}</TableCell>
            <TableCell className="font-mono">{ln.account_code}</TableCell>
            <TableCell>{ln.account_name}</TableCell>
            <TableCell>{ln.summary}</TableCell>
            <TableCell className="text-right">{ln.debit ? fmt(ln.debit) : ""}</TableCell>
            <TableCell className="text-right">{ln.credit ? fmt(ln.credit) : ""}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default function VoucherPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [periodFilter, setPeriodFilter] = useState("")
  const [projectFilter, setProjectFilter] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [form, setForm] = useState({
    voucher_date: new Date().toISOString().split("T")[0],
    voucher_type: "transfer",
    project_id: "",
  })
  const [lines, setLines] = useState<LineInput[]>([emptyLine(), emptyLine()])

  const { data: accountsData } = useQuery({
    queryKey: ["accounts-for-select"],
    queryFn: () => listAccounts({ page: 1, page_size: 500 }),
  })
  const allAccounts: Account[] = accountsData?.items ?? []

  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-filter"],
    queryFn: () => listProjects({ page: 1, page_size: 200 }),
  })
  const projects = projectsData?.items ?? []

  const { data, isLoading } = useQuery({
    queryKey: ["vouchers", page, keyword, statusFilter, periodFilter, projectFilter],
    queryFn: () => listVouchers({
      page,
      page_size: 20,
      keyword: keyword || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      period: periodFilter || undefined,
      project_id: projectFilter !== "all" ? projectFilter : undefined,
    }),
  })
  const vouchers = data?.items ?? []

  const { data: detailData } = useQuery({
    queryKey: ["voucher-detail", detailId],
    queryFn: () => getVoucher(detailId!),
    enabled: !!detailId,
  })

  const createMut = useMutation({
    mutationFn: () => createVoucher({
      voucher_date: form.voucher_date,
      period: form.voucher_date.slice(0, 7),
      voucher_type: form.voucher_type,
      project_id: form.project_id || undefined,
      lines: lines
        .filter((l) => l.account_id && (Number(l.debit) || Number(l.credit)))
        .map((l, idx) => ({
          line_no: idx + 1,
          account_id: l.account_id,
          account_code: l.account_code,
          account_name: l.account_name,
          summary: l.summary || undefined,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })) as any,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vouchers"] })
      toast.success("凭证已创建")
      setCreateOpen(false)
    },
    onError: () => toast.error("创建失败"),
  })

  const reviewMut = useMutation({
    mutationFn: reviewVoucher,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); toast.success("审核成功") },
  })

  const postMut = useMutation({
    mutationFn: postVoucher,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); toast.success("过账成功") },
  })

  const deleteMut = useMutation({
    mutationFn: deleteVoucher,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); toast.success("已删除"); setDeleteOpen(false) },
    onError: () => toast.error("删除失败"),
  })

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005
  const hasValidLines = lines.some((l) => l.account_id && (Number(l.debit) || Number(l.credit)))

  const updateLine = (idx: number, key: keyof LineInput, value: string) => {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [key]: value } : l))
  }

  const selectAccount = (idx: number, accountId: string) => {
    const acc = allAccounts.find((a) => a.id === accountId)
    if (acc) {
      setLines((prev) => prev.map((l, i) => i === idx ? {
        ...l,
        account_id: acc.id,
        account_code: acc.code,
        account_name: acc.name,
      } : l))
    }
  }

  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx))

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const openDetail = (id: string) => {
    setDetailId(id)
    setDetailOpen(true)
  }

  const openDelete = (id: string) => {
    setDeleteId(id)
    setDeleteOpen(true)
  }

  const openCreate = () => {
    setForm({
      voucher_date: new Date().toISOString().split("T")[0],
      voucher_type: "transfer",
      project_id: "",
    })
    setLines([emptyLine(), emptyLine()])
    setCreateOpen(true)
  }

  const resetFilters = () => {
    setKeyword("")
    setStatusFilter("all")
    setPeriodFilter("")
    setProjectFilter("all")
    setPage(1)
  }

  const hasFilters = keyword || statusFilter !== "all" || periodFilter || projectFilter !== "all"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">凭证管理</h1>
        <Button onClick={openCreate}><Plus className="size-4" />新建凭证</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="搜索凭证号..."
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
          className="w-48"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="draft">草稿</SelectItem>
            <SelectItem value="reviewed">已审核</SelectItem>
            <SelectItem value="posted">已过账</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="month"
          value={periodFilter}
          onChange={(e) => { setPeriodFilter(e.target.value); setPage(1) }}
          className="w-40"
        />
        <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="项目" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && <Button variant="ghost" size="sm" onClick={resetFilters}>清除筛选</Button>}
      </div>

      <div className="rounded-md border">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Input
                    type="checkbox"
                    checked={selectedIds.length > 0 && selectedIds.length === vouchers.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? vouchers.map((v) => v.id) : [])}
                  />
                </TableHead>
                <TableHead>凭证号</TableHead>
                <TableHead>日期</TableHead>
                <TableHead>期间</TableHead>
                <TableHead>类型</TableHead>
                <TableHead className="text-right">借方合计</TableHead>
                <TableHead className="text-right">贷方合计</TableHead>
                <TableHead className="text-center">分录数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
              )}
              {vouchers.map((v) => {
                const expanded = expandedIds.has(v.id)
                return (
                  <Fragment key={v.id}>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpand(v.id)}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Input type="checkbox" checked={selectedIds.includes(v.id)} onChange={() => toggleSelect(v.id)} />
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          {expanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                          <span
                            className="font-mono text-xs text-primary hover:underline cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); openDetail(v.id) }}
                          >
                            {v.voucher_no}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>{v.voucher_date}</TableCell>
                      <TableCell>{v.period}</TableCell>
                      <TableCell>{VOUCHER_TYPE_LABELS[v.voucher_type] ?? v.voucher_type}</TableCell>
                      <TableCell className="text-right">{fmt(v.total_debit)}</TableCell>
                      <TableCell className="text-right">{fmt(v.total_credit)}</TableCell>
                      <TableCell className="text-center">{v.line_count}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[v.status] ?? "secondary"}>{STATUS_LABELS[v.status] ?? v.status}</Badge></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {v.status === "draft" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => reviewMut.mutate(v.id)} disabled={reviewMut.isPending}>审核</Button>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => openDelete(v.id)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                          {v.status === "reviewed" && (
                            <Button size="sm" variant="outline" onClick={() => postMut.mutate(v.id)} disabled={postMut.isPending}>过账</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow>
                        <TableCell colSpan={10} className="bg-muted/30 p-4">
                          <VoucherLinesInline voucherId={v.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">共 {data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm">{page}</span>
          <Button variant="outline" size="sm" disabled={vouchers.length < 20} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新建凭证</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 gap-4 [&>*]:min-w-0">
              <div className="grid gap-2">
                <Label>凭证日期</Label>
                <Input
                  type="date"
                  value={form.voucher_date}
                  onChange={(e) => setForm((f) => ({ ...f, voucher_date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>凭证类型</Label>
                <Select value={form.voucher_type} onValueChange={(v) => setForm((f) => ({ ...f, voucher_type: v ?? "transfer" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receipt">收款凭证</SelectItem>
                    <SelectItem value="payment">付款凭证</SelectItem>
                    <SelectItem value="transfer">转账凭证</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>所属项目</Label>
                <Select value={form.project_id || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v === "__none__" ? "" : (v ?? "") }))}>
                  <SelectTrigger><SelectValue placeholder="选择项目（可选）" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">不关联项目</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base">分录编辑</Label>
                <Button variant="outline" size="sm" onClick={addLine}>添加行</Button>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">会计科目</TableHead>
                      <TableHead>摘要</TableHead>
                      <TableHead className="w-[140px]">借方金额</TableHead>
                      <TableHead className="w-[140px]">贷方金额</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select value={line.account_id} onValueChange={(v) => selectAccount(idx, v ?? "")}>
                            <SelectTrigger><SelectValue placeholder="选择科目" /></SelectTrigger>
                            <SelectContent>
                              {allAccounts.filter((a) => a.is_leaf && a.is_enabled).map((a) => (
                                <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input value={line.summary} onChange={(e) => updateLine(idx, "summary", e.target.value)} placeholder="摘要" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" value={line.debit} onChange={(e) => updateLine(idx, "debit", e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" value={line.credit} onChange={(e) => updateLine(idx, "credit", e.target.value)} />
                        </TableCell>
                        <TableCell>
                          {lines.length > 2 && (
                            <Button variant="ghost" size="icon-sm" onClick={() => removeLine(idx)}>×</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-end gap-6 text-sm pt-2">
                <span>借方合计: <span className="font-medium">{fmt(totalDebit)}</span></span>
                <span>贷方合计: <span className="font-medium">{fmt(totalCredit)}</span></span>
                <span className={balanced ? "text-green-600" : "text-red-600 font-medium"}>
                  差额: {fmt(Math.abs(totalDebit - totalCredit))}
                  {!balanced && " (借贷不平衡)"}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button disabled={createMut.isPending || !balanced || !hasValidLines} onClick={() => createMut.mutate()}>
              {createMut.isPending && <Loader2 className="size-4 animate-spin" />}确认创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span>凭证详情</span>
              {detailData && (
                <Badge variant={STATUS_VARIANT[detailData.status] ?? "secondary"}>
                  {STATUS_LABELS[detailData.status] ?? detailData.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailData && (
            <div className="grid gap-4">
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">凭证号：</span>{detailData.voucher_no}</div>
                <div><span className="text-muted-foreground">日期：</span>{detailData.voucher_date}</div>
                <div><span className="text-muted-foreground">期间：</span>{detailData.period}</div>
                <div><span className="text-muted-foreground">类型：</span>{VOUCHER_TYPE_LABELS[detailData.voucher_type] ?? detailData.voucher_type}</div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>行号</TableHead>
                      <TableHead>科目编码</TableHead>
                      <TableHead>科目名称</TableHead>
                      <TableHead>摘要</TableHead>
                      <TableHead className="text-right">借方金额</TableHead>
                      <TableHead className="text-right">贷方金额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailData.lines?.map((ln) => (
                      <TableRow key={ln.id}>
                        <TableCell>{ln.line_no}</TableCell>
                        <TableCell className="font-mono">{ln.account_code}</TableCell>
                        <TableCell>{ln.account_name}</TableCell>
                        <TableCell>{ln.summary}</TableCell>
                        <TableCell className="text-right">{ln.debit ? fmt(ln.debit) : ""}</TableCell>
                        <TableCell className="text-right">{ln.credit ? fmt(ln.credit) : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  借方合计: {fmt(detailData.total_debit)} | 贷方合计: {fmt(detailData.total_credit)}
                </div>
                <div className="flex items-center gap-2">
                  {detailData.status === "draft" && (
                    <>
                      <Button onClick={() => { reviewMut.mutate(detailData.id); setDetailOpen(false) }} disabled={reviewMut.isPending}>
                        审核
                      </Button>
                      <Button variant="destructive" onClick={() => { setDetailOpen(false); openDelete(detailData.id) }}>
                        删除
                      </Button>
                    </>
                  )}
                  {detailData.status === "reviewed" && (
                    <Button onClick={() => { postMut.mutate(detailData.id); setDetailOpen(false) }} disabled={postMut.isPending}>
                      过账
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除此凭证吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteId && deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}>
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
