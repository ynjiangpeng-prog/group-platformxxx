import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { listContracts, createContract, listSuppliers, listPurchaseOrders, getNextContractNumber } from "@/api/erp"
import { listProjects } from "@/api/project"
import { listEntities } from "@/api/entity"
import type { FileItem } from "@/api/files"
import FileUpload from "@/components/upload/FileUpload"
import OcrUploadButton from "@/components/ocr/OcrUploadButton"
import BatchToolbar from "@/components/batch/BatchToolbar"

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

export default function ContractListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [projectFilter, setProjectFilter] = useState("all")
  const [keyword, setKeyword] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({
    contract_no: "", name: "", contract_type: "construction", party_a: "", party_b: "",
    supplier_id: "", signing_date: "", start_date: "", end_date: "", total_amount: "",
    payment_terms: "", key_clauses: "", remark: "", po_id: "", project_id: "", entity_id: "", status: "draft",
  })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<FileItem[]>([])

  const { data: projectsData } = useQuery({ queryKey: ["projects-for-filter"], queryFn: () => listProjects({ page: 1, page_size: 200 }) })
  const projects = projectsData?.items ?? []
  const { data: suppliersData } = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers({ page: 1, page_size: 200 }) })
  const suppliers = suppliersData?.items ?? []
  const { data: posData } = useQuery({ queryKey: ["purchase-orders"], queryFn: () => listPurchaseOrders({ page: 1, page_size: 200 }) })
  const purchaseOrders = posData?.items ?? []
  const { data: entitiesData } = useQuery({ queryKey: ["entities-all"], queryFn: () => listEntities({ page: 1, page_size: 100 }) })
  const entities = entitiesData?.items ?? []

  const ENGINEERING_TYPES = new Set(["epc", "civil_construction", "hv_construction", "lv_construction", "ancillary_construction", "transformer_purchase", "cable_purchase", "charging_pile_purchase", "electrical_material_purchase", "equipment_sale", "service", "supplement"])
  const OPERATION_ENTITY_CODE = "YCNE"
  const ENGINEERING_ENTITY_CODE = "YSD"

  const recommendEntity = (contractType: string) => {
    if (!entities.length) return ""
    const opEntity = entities.find((e) => e.entity_code === OPERATION_ENTITY_CODE)
    if (!ENGINEERING_TYPES.has(contractType) && opEntity) return opEntity.id
    const engEntity = entities.find((e) => e.entity_code === ENGINEERING_ENTITY_CODE)
    return engEntity?.id ?? entities.find((e) => e.is_default)?.id ?? ""
  }

  const { data, isLoading } = useQuery({
    queryKey: ["all-contracts", page, typeFilter, statusFilter, projectFilter, keyword],
    queryFn: () => listContracts({
      page, page_size: 20,
      contract_type: typeFilter !== "all" ? typeFilter : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      project_id: projectFilter !== "all" ? projectFilter : undefined,
      keyword: keyword || undefined,
    }),
  })

  const contracts = data?.items ?? []

  const createMut = useMutation({
    mutationFn: () =>
      createContract({
        contract_no: form.contract_no, name: form.name, contract_type: form.contract_type,
        party_a: form.party_a || undefined, party_b: form.party_b || undefined,
        supplier_id: form.supplier_id || undefined,
        signing_date: form.signing_date || undefined, start_date: form.start_date || undefined,
        end_date: form.end_date || undefined, total_amount: Number(form.total_amount) || undefined,
        payment_terms: form.payment_terms ? (() => { try { return JSON.parse(form.payment_terms) } catch { return undefined } })() : undefined,
        key_clauses: form.key_clauses ? (() => { try { return JSON.parse(form.key_clauses) } catch { return undefined } })() : undefined,
        remark: form.remark || undefined,
        po_id: form.po_id || undefined, project_id: form.project_id || undefined,
        entity_id: form.entity_id || undefined,
        status: form.status,
        attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
      } as Parameters<typeof createContract>[0]),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["all-contracts"] })
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: ["fleet-customers"] })
      const contract = (res as any)?.data ?? res
      const synced = (res as any)?.synced as string[] | undefined
      if (synced?.length) {
        toast.success("合同已创建\n" + synced.join("\n"), { duration: 5000 })
      } else {
        toast.success("合同已创建")
      }
      setDialogOpen(false)
      if (contract?.id) navigate(`/contracts/${contract.id}`)
    },
    onError: () => toast.error("创建失败"),
  })

  const handleOcr = (ocrData: Record<string, unknown>) => {
    const updates: Record<string, string> = {
      contract_no: (ocrData.contract_no as string) ?? "",
      name: (ocrData.contract_name as string) ?? "",
      party_a: (ocrData.party_a as string) ?? "",
      party_b: (ocrData.party_b as string) ?? "",
      total_amount: ocrData.amount != null ? String(ocrData.amount) : "",
      signing_date: (ocrData.sign_date as string) ?? "",
      start_date: (ocrData.start_date as string) ?? "",
      end_date: (ocrData.end_date as string) ?? "",
    }
    if (ocrData.payment_terms) {
      updates.payment_terms = typeof ocrData.payment_terms === "string"
        ? ocrData.payment_terms
        : JSON.stringify(ocrData.payment_terms, null, 2)
    }
    if (ocrData.key_clauses) {
      updates.key_clauses = JSON.stringify({ clauses: ocrData.key_clauses }, null, 2)
    }
    // Auto-fill entity from OCR matching
    if (ocrData.suggested_entity_id) {
      updates.entity_id = ocrData.suggested_entity_id as string
    }
    setForm((f) => ({ ...f, ...updates }))
  }

  const toggleSelect = (id: string) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const openCreateDialog = async () => {
    setForm({ contract_no: "", name: "", contract_type: "construction", party_a: "", party_b: "", supplier_id: "", signing_date: "", start_date: "", end_date: "", total_amount: "", payment_terms: "", key_clauses: "", remark: "", po_id: "", project_id: "", entity_id: "", status: "draft" })
    setUploadedFiles([])
    try { const res = await getNextContractNumber(); setForm((f) => ({ ...f, contract_no: res.number })) } catch {}
    setTimeout(() => setForm((f) => ({ ...f, entity_id: f.entity_id || recommendEntity(f.contract_type) })), 200)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">合同管理</h1>
        <Button onClick={openCreateDialog}><Plus className="size-4" />新建合同</Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="搜索合同编号/名称..." className="w-56" value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1) }} />
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="合同类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {CONTRACT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v ?? "all"); setPage(1) }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="所属项目" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部项目</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <BatchToolbar entityType="contracts" selectedIds={selectedIds} templateType="contract" onImportComplete={() => qc.invalidateQueries({ queryKey: ["all-contracts"] })} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? contracts.map((c) => c.id) : [])} /></TableHead>
                  <TableHead>合同编号</TableHead>
                  <TableHead>合同名称</TableHead>
                  <TableHead>签约主体</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>甲方</TableHead>
                  <TableHead>签订日期</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>}
                {contracts.map((c: any) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/contracts/${c.id}`)}>
                    <TableCell onClick={(e) => e.stopPropagation()}><Input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelect(c.id)} /></TableCell>
                    <TableCell className="font-mono text-xs">{c.contract_no}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entities.find((e: any) => e.id === c.entity_id)?.entity_name ?? "-"}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABELS[c.contract_type] ?? c.contract_type}</Badge></TableCell>
                    <TableCell className="max-w-[120px] truncate">{c.party_a ?? "-"}</TableCell>
                    <TableCell>{c.signing_date ?? "-"}</TableCell>
                    <TableCell>{c.total_amount != null ? `¥${Number(c.total_amount).toLocaleString()}` : "-"}</TableCell>
                    <TableCell><Badge variant={STATUS_COLORS[c.status] ?? "secondary"}>{STATUS_LABELS[c.status] ?? c.status}</Badge></TableCell>
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm">{page}</span>
          <Button variant="outline" size="sm" disabled={(data?.items?.length ?? 0) < 20} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新建合同</DialogTitle></DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="flex justify-end"><OcrUploadButton type="contract" onRecognized={handleOcr} /></div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">基本信息</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2"><Label>合同编号 *</Label><Input value={form.contract_no} onChange={(e) => setForm((f) => ({ ...f, contract_no: e.target.value }))} /></div>
                <div className="grid gap-2"><Label>合同名称 *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div className="grid gap-2">
                  <Label>合同类型</Label>
                  <Select value={form.contract_type} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, contract_type: v, entity_id: recommendEntity(v) })) }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONTRACT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>所属项目</Label>
                  <Select value={form.project_id} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, project_id: v })) }}>
                    <SelectTrigger><SelectValue placeholder="选择项目（可选）" /></SelectTrigger>
                    <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>签约主体</Label>
                  <Select value={form.entity_id} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, entity_id: v })) }}>
                    <SelectTrigger><SelectValue placeholder="选择签约公司" /></SelectTrigger>
                    <SelectContent>{entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.entity_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">甲乙方信息</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>甲方</Label><Input value={form.party_a} onChange={(e) => setForm((f) => ({ ...f, party_a: e.target.value }))} placeholder="我方/甲方公司名" /></div>
                <div className="grid gap-2"><Label>乙方</Label><Input value={form.party_b} onChange={(e) => setForm((f) => ({ ...f, party_b: e.target.value }))} placeholder="对方/乙方公司名" /></div>
                <div className="col-span-2">
                  <Label>供应商</Label>
                  <Select value={form.supplier_id} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, supplier_id: v })) }}>
                    <SelectTrigger><SelectValue placeholder="关联供应商（可选）" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">合同期限</h3>
              <div className="grid grid-cols-3 gap-4 [&>*]:min-w-0">
                <div className="grid gap-2"><Label>签订日期</Label><Input type="date" value={form.signing_date} onChange={(e) => setForm((f) => ({ ...f, signing_date: e.target.value }))} /></div>
                <div className="grid gap-2"><Label>开始日期</Label><Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
                <div className="grid gap-2"><Label>结束日期</Label><Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">金额与条款</h3>
              <div className="grid gap-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid gap-2"><Label>合同金额</Label><Input type="number" step="0.01" value={form.total_amount} onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
                </div>
                <div className="grid gap-2"><Label>付款条款</Label><Textarea value={form.payment_terms} onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))} rows={3} placeholder='例: {"installments": [{"phase":"签约","percent":30},{"phase":"到货","percent":40},{"phase":"验收","percent":30}]}' /></div>
                <div className="grid gap-2"><Label>主要条款（OCR自动提取）</Label><Textarea value={form.key_clauses} onChange={(e) => setForm((f) => ({ ...f, key_clauses: e.target.value }))} rows={3} placeholder='OCR识别后自动填充' /></div>
                <div className="grid gap-2"><Label>备注</Label><Textarea value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} rows={2} /></div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">合同附件</h3>
              <FileUpload value={uploadedFiles} onChange={setUploadedFiles} folder="contracts" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" maxFiles={10} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button disabled={createMut.isPending || !form.contract_no || !form.name} onClick={() => createMut.mutate()}>
              {createMut.isPending && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
