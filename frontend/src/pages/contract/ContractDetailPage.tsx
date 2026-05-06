import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Pencil, Trash2, Loader2, FileText, FileSpreadsheet, Image as ImageIcon, Eye, Plus, Link2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { getContract, updateContract, deleteContract, changeContractStatus, listSuppliers } from "@/api/erp"
import { listArAp, createArAp, listSettlements, listVouchers, deleteSettlement } from "@/api/finance"
import { listProjects } from "@/api/project"
import { listCompanies } from "@/api/organization"
import { listEntities } from "@/api/entity"
import type { FileItem } from "@/api/files"
import FileUpload from "@/components/upload/FileUpload"
import FilePreview from "@/components/preview/FilePreview"

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", pending_review: "secondary", active: "default", performing: "default", completed: "secondary", terminated: "destructive",
}
const STATUS_LABELS: Record<string, string> = {
  draft: "草稿", pending_review: "待审批", active: "已生效", performing: "履约中", completed: "已完成", terminated: "已终止",
}
const CONTRACT_TYPES: { value: string; label: string }[] = [
  { value: "land_lease", label: "租地合同" },
  { value: "epc", label: "EPC总承包合同" },
  { value: "civil_construction", label: "土建施工合同" },
  { value: "hv_construction", label: "高压工程施工" },
  { value: "lv_construction", label: "低压工程施工" },
  { value: "ancillary_construction", label: "附属设施施工" },
  { value: "transformer_purchase", label: "变压器采购合同" },
  { value: "cable_purchase", label: "电缆采购合同" },
  { value: "charging_pile_purchase", label: "充电桩采购合同" },
  { value: "electrical_material_purchase", label: "电气材料采购合同" },
  { value: "equipment_sale", label: "设备销售合同" },
  { value: "service", label: "服务合同" },
  { value: "cooperation", label: "合作协议" },
  { value: "supplement", label: "补充协议" },
  { value: "other", label: "其他" },
]
const TYPE_LABELS = Object.fromEntries(CONTRACT_TYPES.map((t) => [t.value, t.label]))

const STATUS_FLOW: Record<string, { label: string; next: string }[]> = {
  draft: [{ label: "提交审批", next: "pending_review" }],
  pending_review: [{ label: "审批通过", next: "active" }, { label: "退回", next: "draft" }],
  active: [{ label: "开始履约", next: "performing" }, { label: "终止", next: "terminated" }],
  performing: [{ label: "完结", next: "completed" }, { label: "终止", next: "terminated" }],
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editUploadedFiles, setEditUploadedFiles] = useState<FileItem[]>([])
  const [previewFile, setPreviewFile] = useState<{ url: string; original_filename: string; content_type?: string; size?: number } | null>(null)
  const [arApDialogOpen, setArApDialogOpen] = useState(false)
  const [arApForm, setArApForm] = useState({ type: "ap", counterparty: "", total_amount: "", due_date: "", payment_entity: "", remark: "" })
  const { data: contract, isLoading } = useQuery({
    queryKey: ["contract", id],
    queryFn: () => getContract(id!),
    enabled: !!id,
  })

  const { data: projectsData } = useQuery({ queryKey: ["projects-select"], queryFn: () => listProjects({ page: 1, page_size: 200 }) })
  const { data: suppliersData } = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers({ page: 1, page_size: 200 }) })
  const { data: arApData } = useQuery({ queryKey: ["contract-arap", id], queryFn: () => listArAp({ contract_id: id!, page: 1, page_size: 100 }), enabled: !!id })
  const { data: settlementData } = useQuery({ queryKey: ["contract-settlements", id], queryFn: () => listSettlements({ contract_id: id!, page: 1, page_size: 100 }), enabled: !!id })
  const { data: companiesData } = useQuery({ queryKey: ["companies-select"], queryFn: () => listCompanies({ page: 1, page_size: 200 }) })
  const { data: entitiesData } = useQuery({ queryKey: ["entities-all"], queryFn: () => listEntities({ page: 1, page_size: 100 }) })
  const arApRecords = arApData?.items ?? []
  const settlementRecords = settlementData?.items ?? []
  const companies = companiesData?.items ?? []
  const entities = entitiesData?.items ?? []
  const entityMap = new Map(entities.map((e: any) => [e.id, e.entity_name]))
  const arApVoucherIds = arApRecords.filter((r: any) => r.voucher_id).map((r: any) => r.voucher_id)
  const settlementVoucherIds = settlementRecords.filter((r: any) => r.voucher_id).map((r: any) => r.voucher_id)
  const allVoucherIds = [...new Set([...arApVoucherIds, ...settlementVoucherIds])]
  const { data: vouchersData } = useQuery({ queryKey: ["contract-vouchers", allVoucherIds], queryFn: () => listVouchers({ ids: allVoucherIds.join(","), page: 1, page_size: 100 }), enabled: allVoucherIds.length > 0 })
  const suppliers = suppliersData?.items ?? []
  const projects = projectsData?.items ?? []

  const statusMut = useMutation({
    mutationFn: (status: string) => changeContractStatus(id!, status),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["contract", id] })
      qc.invalidateQueries({ queryKey: ["all-contracts"] })
      const synced = (res as any)?.synced as string[] | undefined
      if (synced?.length) {
        toast.success("状态已更新\n" + synced.join("\n"), { duration: 5000 })
      } else {
        toast.success("状态已更新")
      }
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteContract(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-contracts"] }); toast.success("已删除"); navigate("/contracts") },
  })

  const updateMut = useMutation({
    mutationFn: () => {
      const data: Record<string, unknown> = {}
      if (editForm.name) data.name = editForm.name
      if (editForm.contract_type) data.contract_type = editForm.contract_type
      if (editForm.party_a !== undefined) data.party_a = editForm.party_a || null
      if (editForm.party_b !== undefined) data.party_b = editForm.party_b || null
      if (editForm.signing_date) data.signing_date = editForm.signing_date
      if (editForm.start_date) data.start_date = editForm.start_date
      if (editForm.end_date) data.end_date = editForm.end_date
      if (editForm.total_amount) data.total_amount = Number(editForm.total_amount)
      if (editForm.remark !== undefined) data.remark = editForm.remark || null
      if (editUploadedFiles.length > 0) data.attachments = editUploadedFiles
      return updateContract(id!, data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contract", id] }); toast.success("已保存"); setEditOpen(false) },
  })

  const createArApMut = useMutation({
    mutationFn: () => createArAp({
      type: arApForm.type,
      counterparty: arApForm.counterparty || undefined,
      total_amount: Number(arApForm.total_amount) || 0,
      remaining_amount: Number(arApForm.total_amount) || 0,
      due_date: arApForm.due_date || undefined,
      contract_id: id,
      business_type: "contract",
      status: "pending",
      remark: [arApForm.remark, arApForm.payment_entity ? `付款主体: ${companies.find((c: any) => c.id === arApForm.payment_entity)?.name ?? arApForm.payment_entity}` : ""].filter(Boolean).join("; ") || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contract-arap", id] }); toast.success("付款记录已创建"); setArApDialogOpen(false) },
  })

  const openEdit = () => {
    if (!contract) return
    setEditForm({
      name: contract.name ?? "", contract_type: contract.contract_type ?? "construction",
      party_a: contract.party_a ?? "", party_b: contract.party_b ?? "",
      signing_date: contract.signing_date ?? "", start_date: contract.start_date ?? "", end_date: contract.end_date ?? "",
      total_amount: contract.total_amount != null ? String(contract.total_amount) : "",
      remark: (contract as any).remark ?? "",
    })
    setEditUploadedFiles(Array.isArray(contract.attachments) ? contract.attachments as unknown as FileItem[] : [])
    setEditOpen(true)
  }

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
  if (!contract) return <div className="text-center py-20 text-muted-foreground">合同不存在</div>

  const c = contract as any
  const paidRate = c.total_amount ? Math.min(100, Math.round((c.paid_amount / c.total_amount) * 100)) : 0
  const invoicedRate = c.total_amount ? Math.min(100, Math.round((c.invoiced_amount / c.total_amount) * 100)) : 0
  const projectName = projects.find((p) => p.id === c.project_id)?.name
  const supplierName = suppliers.find((s) => s.id === c.supplier_id)?.name
  const paymentTerms = c.payment_terms
  const keyClauses = c.key_clauses

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/contracts")}><ArrowLeft className="size-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              {c.name}
              <Badge variant={STATUS_COLORS[c.status] ?? "secondary"} className="text-sm">{STATUS_LABELS[c.status] ?? c.status}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{c.contract_no} · {TYPE_LABELS[c.contract_type] ?? c.contract_type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(STATUS_FLOW[c.status] ?? []).map((s) => (
            <Button key={s.next} size="sm" onClick={() => statusMut.mutate(s.next)} disabled={statusMut.isPending}>
              {statusMut.isPending && <Loader2 className="size-3 animate-spin mr-1" />}{s.label}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="size-3.5" />编辑</Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="size-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader><CardTitle>合同信息</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div><span className="text-sm text-muted-foreground">合同编号</span><p className="font-mono">{c.contract_no}</p></div>
            <div><span className="text-sm text-muted-foreground">合同类型</span><p>{TYPE_LABELS[c.contract_type] ?? c.contract_type}</p></div>
            {(() => {
              const entityName = (c as any).entity_id ? (entityMap.get((c as any).entity_id) ?? "") : ""
              const isPartyA = entityName && c.party_a === entityName
              const isPartyB = entityName && c.party_b === entityName
              if (!entityName) return null
              return (
                <div className="col-span-2">
                  <span className="text-sm text-muted-foreground">签约主体</span>
                  <p>{entityName} {isPartyA ? "(甲方)" : isPartyB ? "(乙方)" : ""}</p>
                </div>
              )
            })()}
            <div>
              <span className="text-sm text-muted-foreground">{(() => {
                const entityName = (c as any).entity_id ? (entityMap.get((c as any).entity_id) ?? "") : ""
                if (entityName && c.party_a === entityName) return "对方（乙方）"
                if (entityName && c.party_b === entityName) return "对方（甲方）"
                return "甲方"
              })()}</span>
              <p>{(() => {
                const entityName = (c as any).entity_id ? (entityMap.get((c as any).entity_id) ?? "") : ""
                if (entityName && c.party_a === entityName) return c.party_b ?? "-"
                return c.party_a ?? "-"
              })()}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">{(() => {
                const entityName = (c as any).entity_id ? (entityMap.get((c as any).entity_id) ?? "") : ""
                if (entityName && c.party_b === entityName) return "对方（甲方）"
                if (entityName && c.party_a === entityName) return "对方（乙方）"
                return "乙方"
              })()}</span>
              <p>{(() => {
                const entityName = (c as any).entity_id ? (entityMap.get((c as any).entity_id) ?? "") : ""
                if (entityName && c.party_b === entityName) return c.party_a ?? "-"
                return c.party_b ?? "-"
              })()}</p>
            </div>
            {supplierName && <div><span className="text-sm text-muted-foreground">关联供应商</span><p>{supplierName}</p></div>}
            {projectName && <div><span className="text-sm text-muted-foreground">所属项目</span><p><span className="text-primary cursor-pointer hover:underline" onClick={() => navigate(`/project/${c.project_id}`)}>{projectName}</span></p></div>}
            <div><span className="text-sm text-muted-foreground">签订日期</span><p>{c.signing_date ?? "-"}</p></div>
            <div><span className="text-sm text-muted-foreground">合同期限</span><p>{c.start_date ?? "?"} ~ {c.end_date ?? "?"}</p></div>
            {c.remark && <div className="col-span-2"><span className="text-sm text-muted-foreground">备注</span><p className="whitespace-pre-wrap">{c.remark}</p></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>金额与进度</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div>
              <span className="text-sm text-muted-foreground">合同金额</span>
              <p className="text-2xl font-bold">¥{c.total_amount != null ? Number(c.total_amount).toLocaleString() : "未填写"}</p>
            </div>
            <div>
              <div className="flex justify-between text-sm"><span>已付款</span><span>¥{Number(c.paid_amount).toLocaleString()} ({paidRate}%)</span></div>
              <div className="h-2 bg-muted rounded-full mt-1"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${paidRate}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-sm"><span>已开票</span><span>¥{Number(c.invoiced_amount).toLocaleString()} ({invoicedRate}%)</span></div>
              <div className="h-2 bg-muted rounded-full mt-1"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${invoicedRate}%` }} /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {paymentTerms && (
        <Card>
          <CardHeader><CardTitle>付款条款</CardTitle></CardHeader>
          <CardContent>
            {paymentTerms.installments ? (
              <div className="space-y-2">
                {(paymentTerms.installments as { phase: string; percent: number; amount?: number }[]).map((inst, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg border">
                    <span className="font-medium w-24">{inst.phase}</span>
                    <span className="text-muted-foreground">{inst.percent}%</span>
                    {inst.amount && <span className="text-muted-foreground">¥{inst.amount.toLocaleString()}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <pre className="text-sm bg-muted p-4 rounded-lg whitespace-pre-wrap">{JSON.stringify(paymentTerms, null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      )}

      {keyClauses && (
        <Card>
          <CardHeader><CardTitle>主要条款（OCR提取）</CardTitle></CardHeader>
          <CardContent>
            {keyClauses.clauses ? (
              <ul className="space-y-2">
                {(keyClauses.clauses as string[]).map((cl: string, i: number) => (
                  <li key={i} className="p-3 rounded-lg border flex gap-3"><span className="text-muted-foreground shrink-0">{i + 1}.</span><span>{cl}</span></li>
                ))}
              </ul>
            ) : (
              <pre className="text-sm bg-muted p-4 rounded-lg whitespace-pre-wrap">{JSON.stringify(keyClauses, null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>实际付款记录</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/finance/ar-ap")}>
              管理应收应付
            </Button>
            <Button size="sm" onClick={() => { setArApForm({ type: "ap", counterparty: c.party_b ?? "", total_amount: "", due_date: "", payment_entity: "", remark: "" }); setArApDialogOpen(true) }}>
              <Plus className="size-3.5 mr-1" />新建应付账款
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {settlementRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">暂无付款记录，请在应收应付管理中结算</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>结算单号</TableHead>
                  <TableHead>方向</TableHead>
                  <TableHead>交易方</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>结算方式</TableHead>
                  <TableHead>结算日期</TableHead>
                  <TableHead>关联凭证</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlementRecords.map((r: any) => {
                  const voucher = vouchersData?.items?.find((v: any) => v.id === r.voucher_id)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.settlement_no}</TableCell>
                      <TableCell>
                        <Badge variant={r.direction === "receive" ? "default" : "secondary"}>
                          {r.direction === "receive" ? "收款" : "付款"}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.counterparty ?? "-"}</TableCell>
                      <TableCell>¥{Number(r.amount ?? 0).toLocaleString()}</TableCell>
                      <TableCell>
                        {({ bank_transfer: "银行转账", cash: "现金", acceptance_bill: "承兑汇票", other: "其他" } as Record<string,string>)[r.payment_method] ?? r.payment_method ?? "-"}
                      </TableCell>
                      <TableCell>{r.settlement_date ?? "-"}</TableCell>
                      <TableCell>
                        {voucher ? (
                          <span className="inline-flex items-center gap-1 text-xs text-primary cursor-pointer hover:underline" onClick={() => navigate(`/finance/vouchers`)}>
                            <Link2 className="size-3" />{voucher.voucher_no}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {arApRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>应付账款明细</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead>
                  <TableHead>交易方</TableHead>
                  <TableHead>总金额</TableHead>
                  <TableHead>已结算</TableHead>
                  <TableHead>剩余金额</TableHead>
                  <TableHead>到期日</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {arApRecords.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell><Badge variant={r.type === "ar" ? "default" : "secondary"}>{r.type === "ar" ? "应收" : "应付"}</Badge></TableCell>
                    <TableCell>{r.counterparty ?? "-"}</TableCell>
                    <TableCell>¥{Number(r.total_amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell>¥{Number(r.settled_amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell>¥{Number(r.remaining_amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell>{r.due_date ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "pending" ? "outline" : r.status === "overdue" ? "destructive" : r.status === "settled" ? "default" : "secondary"}>
                        {({ pending: "待结算", partial: "部分结算", partial_paid: "部分结算", settled: "已结清", overdue: "已逾期", written_off: "已核销" } as Record<string,string>)[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {Array.isArray(c.attachments) && c.attachments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>合同附件</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {c.attachments.map((rawFile: any, i: number) => {
                const file = rawFile.data ? rawFile.data : rawFile
                const ext = (file.original_filename || "").split(".").pop()?.toLowerCase() || ""
                const isImage = ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext)
                const isPdf = ext === "pdf"
                const isDoc = ["doc", "docx"].includes(ext)
                const isXls = ["xls", "xlsx"].includes(ext)
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 hover:border-primary/30 transition-all cursor-pointer group"
                    onClick={() => setPreviewFile(file)}
                  >
                    <div className="relative">
                      {isPdf ? (
                        <div className="size-14 rounded-lg bg-red-50 flex items-center justify-center"><FileText className="size-8 text-red-500" /></div>
                      ) : isDoc ? (
                        <div className="size-14 rounded-lg bg-blue-50 flex items-center justify-center"><FileText className="size-8 text-blue-500" /></div>
                      ) : isXls ? (
                        <div className="size-14 rounded-lg bg-green-50 flex items-center justify-center"><FileSpreadsheet className="size-8 text-green-600" /></div>
                      ) : isImage ? (
                        <div className="size-14 rounded-lg bg-purple-50 flex items-center justify-center"><ImageIcon className="size-8 text-purple-500" /></div>
                      ) : (
                        <div className="size-14 rounded-lg bg-gray-50 flex items-center justify-center"><FileText className="size-8 text-gray-400" /></div>
                      )}
                    </div>
                    <div className="text-center w-full">
                      <p className="text-sm font-medium truncate w-full" title={file.original_filename}>
                        {file.original_filename || `附件${i + 1}`}
                      </p>
                      {file.size && <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="size-3.5" /><span className="text-xs">预览</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <FilePreview file={previewFile} open={!!previewFile} onOpenChange={(open) => { if (!open) setPreviewFile(null) }} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>编辑合同</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4 [&>*]:min-w-0">
              <div className="grid gap-2"><Label>合同名称</Label><Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="grid gap-2">
                <Label>合同类型</Label>
                <Select value={editForm.contract_type} onValueChange={(v) => { if (v) setEditForm((f) => ({ ...f, contract_type: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTRACT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>甲方</Label><Input value={editForm.party_a} onChange={(e) => setEditForm((f) => ({ ...f, party_a: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>乙方</Label><Input value={editForm.party_b} onChange={(e) => setEditForm((f) => ({ ...f, party_b: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>签订日期</Label><Input type="date" value={editForm.signing_date} onChange={(e) => setEditForm((f) => ({ ...f, signing_date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>开始日期</Label><Input type="date" value={editForm.start_date} onChange={(e) => setEditForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>结束日期</Label><Input type="date" value={editForm.end_date} onChange={(e) => setEditForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>合同金额</Label><Input type="number" value={editForm.total_amount} onChange={(e) => setEditForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>备注</Label><Textarea value={editForm.remark} onChange={(e) => setEditForm((f) => ({ ...f, remark: e.target.value }))} rows={3} /></div>
            <div className="space-y-2">
              <Label>合同附件</Label>
              <FileUpload value={editUploadedFiles} onChange={setEditUploadedFiles} folder="contracts" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" maxFiles={10} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button disabled={updateMut.isPending} onClick={() => updateMut.mutate()}>
              {updateMut.isPending && <Loader2 className="size-4 animate-spin" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>删除后无法恢复，确定要删除合同 {c.name} 吗？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={arApDialogOpen} onOpenChange={setArApDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>新建付款记录</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>类型</Label>
                <Select value={arApForm.type} onValueChange={(v) => setArApForm((f) => ({ ...f, type: v ?? "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">应收</SelectItem>
                    <SelectItem value="ap">应付</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>金额</Label>
                <Input type="number" value={arApForm.total_amount} onChange={(e) => setArApForm((f) => ({ ...f, total_amount: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>交易方</Label>
              <Input value={arApForm.counterparty} onChange={(e) => setArApForm((f) => ({ ...f, counterparty: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>到期日</Label>
                <Input type="date" value={arApForm.due_date} onChange={(e) => setArApForm((f) => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>付款主体</Label>
                <Select value={arApForm.payment_entity} onValueChange={(v) => setArApForm((f) => ({ ...f, payment_entity: v ?? "" }))}>
                  <SelectTrigger><SelectValue placeholder="选择付款主体" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((co: any) => <SelectItem key={co.id} value={co.id}>{co.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>备注</Label>
              <Textarea value={arApForm.remark} onChange={(e) => setArApForm((f) => ({ ...f, remark: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArApDialogOpen(false)}>取消</Button>
            <Button disabled={createArApMut.isPending} onClick={() => createArApMut.mutate()}>
              {createArApMut.isPending && <Loader2 className="size-4 animate-spin" />}创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
