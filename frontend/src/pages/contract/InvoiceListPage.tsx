import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, ShieldCheck, Trash2, Loader2, Pencil } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { listInvoices, createInvoice, updateInvoice, deleteInvoice, checkInvoice, listAccounts } from "@/api/finance"
import { listProjects } from "@/api/project"
import OcrUploadButton from "@/components/ocr/OcrUploadButton"
import FileUpload, { type FileItem } from "@/components/upload/FileUpload"
import BatchToolbar from "@/components/batch/BatchToolbar"
import type { Invoice } from "@/api/types"

const TYPE_OPTIONS = [
  { value: "special", label: "增值税专用发票" },
  { value: "normal", label: "增值税普通发票" },
  { value: "receipt", label: "收据" },
  { value: "other", label: "其他" },
]

const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((t) => [t.value, t.label]))

const DIRECTION_LABELS: Record<string, string> = { in: "进项", out: "销项" }

const STATUS_LABELS: Record<string, string> = {
  unchecked: "待查验",
  checked: "已查验",
  certified: "已认证",
}

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  unchecked: "outline",
  checked: "secondary",
  certified: "default",
}

const fmt = (n: number | null | undefined) =>
  `¥${Number(n ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`

interface FormState {
  invoice_type: string
  direction: string
  invoice_code: string
  invoice_no: string
  issue_date: string
  seller_name: string
  buyer_name: string
  amount_before_tax: string
  tax_rate: string
  tax_amount: string
  total_amount: string
  project_id: string
}

const emptyForm: FormState = {
  invoice_type: "special",
  direction: "in",
  invoice_code: "",
  invoice_no: "",
  issue_date: "",
  seller_name: "",
  buyer_name: "",
  amount_before_tax: "",
  tax_rate: "",
  tax_amount: "",
  total_amount: "",
  project_id: "",
}

function invoiceToForm(inv: Invoice): FormState {
  return {
    invoice_type: inv.invoice_type ?? "special",
    direction: inv.direction ?? "in",
    invoice_code: inv.invoice_code ?? "",
    invoice_no: inv.invoice_no ?? "",
    issue_date: inv.issue_date ?? "",
    seller_name: inv.seller_name ?? "",
    buyer_name: inv.buyer_name ?? "",
    amount_before_tax: inv.amount_before_tax != null ? String(inv.amount_before_tax) : "",
    tax_rate: inv.tax_rate != null ? String(inv.tax_rate) : "",
    tax_amount: inv.tax_amount != null ? String(inv.tax_amount) : "",
    total_amount: inv.total_amount != null ? String(inv.total_amount) : "",
    project_id: inv.project_id ?? "",
  }
}

function formToPayload(form: FormState) {
  return {
    invoice_type: form.invoice_type,
    direction: form.direction,
    invoice_code: form.invoice_code || undefined,
    invoice_no: form.invoice_no || undefined,
    issue_date: form.issue_date || undefined,
    seller_name: form.seller_name || undefined,
    buyer_name: form.buyer_name || undefined,
    amount_before_tax: Number(form.amount_before_tax) || undefined,
    tax_rate: Number(form.tax_rate) || undefined,
    tax_amount: Number(form.tax_amount) || undefined,
    total_amount: Number(form.total_amount) || undefined,
    project_id: form.project_id || undefined,
  }
}

export default function InvoiceListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [directionFilter, setDirectionFilter] = useState("all")
  const [projectFilter, setProjectFilter] = useState("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [uploadedFiles, setUploadedFiles] = useState<FileItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-filter"],
    queryFn: () => listProjects({ page: 1, page_size: 200 }),
  })
  const projects = projectsData?.items ?? []

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", page, keyword, statusFilter, directionFilter, projectFilter, startDate, endDate],
    queryFn: () =>
      listInvoices({
        page,
        page_size: 20,
        keyword: keyword || undefined,
        check_status: statusFilter !== "all" ? statusFilter : undefined,
        direction: directionFilter !== "all" ? directionFilter : undefined,
        project_id: projectFilter !== "all" ? projectFilter : undefined,
        issue_date_start: startDate || undefined,
        issue_date_end: endDate || undefined,
      }),
  })

  const invoices = data?.items ?? []
  const totalAmount = useMemo(
    () => invoices.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0),
    [invoices],
  )

  const resetFilters = () => {
    setKeyword("")
    setStatusFilter("all")
    setDirectionFilter("all")
    setProjectFilter("all")
    setStartDate("")
    setEndDate("")
    setPage(1)
  }

  const setF = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  const openEdit = (inv: Invoice) => {
    setEditingInvoice(inv)
    setForm(invoiceToForm(inv))
    setEditOpen(true)
  }

  const openDelete = (inv: Invoice) => {
    setDeleteTarget(inv)
    setDeleteOpen(true)
  }

  const handleOcr = (ocrData: Record<string, unknown>) => {
    setForm((f) => ({
      ...f,
      invoice_code: (ocrData.invoice_code as string) ?? f.invoice_code,
      invoice_no: (ocrData.invoice_no as string) ?? f.invoice_no,
      issue_date: (ocrData.invoice_date as string) ?? f.issue_date,
      seller_name: (ocrData.seller_name as string) ?? f.seller_name,
      buyer_name: (ocrData.buyer_name as string) ?? f.buyer_name,
      amount_before_tax: ocrData.amount_without_tax != null ? String(ocrData.amount_without_tax) : f.amount_before_tax,
      tax_rate: ocrData.tax_rate != null ? String(ocrData.tax_rate) : f.tax_rate,
      tax_amount: ocrData.tax_amount != null ? String(ocrData.tax_amount) : f.tax_amount,
      total_amount: ocrData.total_amount != null ? String(ocrData.total_amount) : f.total_amount,
    }))
  }

  const createMut = useMutation({
    mutationFn: () => createInvoice(formToPayload(form) as Parameters<typeof createInvoice>[0]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("发票已创建")
      setCreateOpen(false)
      setForm(emptyForm)
      setUploadedFiles([])
    },
    onError: () => toast.error("创建失败"),
  })

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editingInvoice) throw new Error()
      return updateInvoice(editingInvoice.id, formToPayload(form) as Parameters<typeof updateInvoice>[1])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("发票已更新")
      setEditOpen(false)
      setEditingInvoice(null)
    },
    onError: () => toast.error("更新失败"),
  })

  const deleteMut = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error()
      return deleteInvoice(deleteTarget.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("发票已删除")
      setDeleteOpen(false)
      setDeleteTarget(null)
    },
    onError: () => toast.error("删除失败"),
  })

  const checkMut = useMutation({
    mutationFn: checkInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("查验成功")
    },
    onError: () => toast.error("查验失败"),
  })

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const renderForm = (mode: "create" | "edit") => {
    const busy = mode === "create" ? createMut.isPending : updateMut.isPending
    const onSubmit = mode === "create" ? () => createMut.mutate() : () => updateMut.mutate()
    return (
      <div className="grid gap-6 py-4">
        <div className="flex justify-end">
          <OcrUploadButton type="invoice" onRecognized={handleOcr} />
        </div>

        <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
          <div className="grid gap-2">
            <Label>发票类型</Label>
            <Select value={form.invoice_type} onValueChange={(v) => { if (v) setF({ invoice_type: v }) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>方向</Label>
            <Select value={form.direction} onValueChange={(v) => { if (v) setF({ direction: v }) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">进项</SelectItem>
                <SelectItem value="out">销项</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>发票代码</Label>
            <Input value={form.invoice_code} onChange={(e) => setF({ invoice_code: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>发票号码 *</Label>
            <Input value={form.invoice_no} onChange={(e) => setF({ invoice_no: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>开票日期</Label>
            <Input type="date" value={form.issue_date} onChange={(e) => setF({ issue_date: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>所属项目</Label>
            <Select value={form.project_id} onValueChange={(v) => { if (v) setF({ project_id: v }) }}>
              <SelectTrigger><SelectValue placeholder="选择项目（可选）" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>销方名称</Label>
            <Input value={form.seller_name} onChange={(e) => setF({ seller_name: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>买方名称</Label>
            <Input value={form.buyer_name} onChange={(e) => setF({ buyer_name: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>金额（不含税）</Label>
            <Input type="number" step="0.01" value={form.amount_before_tax} onChange={(e) => setF({ amount_before_tax: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>税率 (%)</Label>
            <Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setF({ tax_rate: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>税额</Label>
            <Input type="number" step="0.01" value={form.tax_amount} onChange={(e) => setF({ tax_amount: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>价税合计</Label>
            <Input type="number" step="0.01" value={form.total_amount} onChange={(e) => setF({ total_amount: e.target.value })} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>发票扫描件/附件</Label>
          <FileUpload
            value={uploadedFiles}
            onChange={setUploadedFiles}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            maxFiles={5}
            folder="invoices"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => (mode === "create" ? setCreateOpen(false) : setEditOpen(false))}>取消</Button>
          <Button disabled={busy || !form.invoice_no} onClick={onSubmit}>
            {busy && <Loader2 className="size-4 animate-spin" />}确认
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">发票管理</h1>
        <Button onClick={() => { setForm(emptyForm); setCreateOpen(true) }}>
          <Plus className="size-4" />新建发票
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="搜索发票号码..."
          className="w-52"
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={directionFilter} onValueChange={(v) => { setDirectionFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-28"><SelectValue placeholder="方向" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部方向</SelectItem>
            {Object.entries(DIRECTION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="所属项目" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-40" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1) }} />
        <span className="text-sm text-muted-foreground">至</span>
        <Input type="date" className="w-40" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1) }} />
        <Button variant="ghost" size="sm" onClick={resetFilters}>重置</Button>
        <BatchToolbar entityType="invoices" selectedIds={selectedIds} templateType="invoice" onImportComplete={() => qc.invalidateQueries({ queryKey: ["invoices"] })} />
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
                  <TableHead className="w-10">
                    <Input
                      type="checkbox"
                      onChange={(e) => setSelectedIds(e.target.checked ? invoices.map((i) => i.id) : [])}
                    />
                  </TableHead>
                  <TableHead>发票号码</TableHead>
                  <TableHead>发票类型</TableHead>
                  <TableHead>方向</TableHead>
                  <TableHead>开票日期</TableHead>
                  <TableHead>销方</TableHead>
                  <TableHead>买方</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>税额</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">暂无数据</TableCell>
                  </TableRow>
                )}
                {invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openEdit(inv)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => toggleSelect(inv.id)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{inv.invoice_no ?? "-"}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABELS[inv.invoice_type] ?? inv.invoice_type}</Badge></TableCell>
                    <TableCell>{DIRECTION_LABELS[inv.direction] ?? inv.direction}</TableCell>
                    <TableCell>{inv.issue_date ?? "-"}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{inv.seller_name ?? "-"}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{inv.buyer_name ?? "-"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{fmt(inv.amount_before_tax)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{fmt(inv.tax_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[inv.check_status] ?? "secondary"}>
                        {STATUS_LABELS[inv.check_status] ?? inv.check_status}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {inv.check_status === "unchecked" && (
                          <Button size="sm" variant="outline" disabled={checkMut.isPending} onClick={() => checkMut.mutate(inv.id)}>
                            <ShieldCheck className="size-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openEdit(inv)}>
                          <Pencil className="size-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => openDelete(inv)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">共 {data?.total ?? 0} 条</span>
          <span className="text-sm text-muted-foreground">
            当前页合计：{fmt(totalAmount)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm">{page}</span>
          <Button variant="outline" size="sm" disabled={(data?.items?.length ?? 0) < 20} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新建发票</DialogTitle></DialogHeader>
          {renderForm("create")}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>编辑发票</DialogTitle></DialogHeader>
          {renderForm("edit")}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除发票 {deleteTarget?.invoice_no ?? ""} 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
