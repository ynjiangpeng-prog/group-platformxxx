import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Wallet, Plus, Upload, Loader2, Camera, FileText,
  CheckCircle, XCircle, Clock, Send, Eye, X,
} from "lucide-react"
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  listFunds, listExpenses, createExpense, getFundStats,
  submitExpense, cancelExpense, uploadExpenseAttachment,
} from "@/api/petty-cash"
import { listProjects } from "@/api/project"

const CATEGORY_OPTIONS = [
  { value: "material", label: "材料费" },
  { value: "labor", label: "人工费" },
  { value: "transport", label: "运输费" },
  { value: "meal", label: "餐费" },
  { value: "travel", label: "差旅费" },
  { value: "office", label: "办公费" },
  { value: "other", label: "其他" },
]

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "待提交", color: "bg-gray-100 text-gray-700" },
  submitted: { label: "已提交", color: "bg-blue-100 text-blue-700" },
  finance_approved: { label: "财务已审", color: "bg-purple-100 text-purple-700" },
  admin_approved: { label: "已通过", color: "bg-green-100 text-green-700" },
  rejected: { label: "已驳回", color: "bg-red-100 text-red-700" },
  cancelled: { label: "已取消", color: "bg-gray-100 text-gray-400" },
}

export default function MyPettyCashPage() {
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<"create" | "detail" | null>(null)
  const [form, setForm] = useState({
    fund_id: "", category: "other", amount: "", description: "", expense_date: new Date().toISOString().split("T")[0],
  })
  const [selectedExpense, setSelectedExpense] = useState<any>(null)
  const [paymentFiles, setPaymentFiles] = useState<File[]>([])
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const paymentRef = useRef<HTMLInputElement>(null)
  const invoiceRef = useRef<HTMLInputElement>(null)
  const statusFilter = useState("")[0]

  const { data: stats } = useQuery({
    queryKey: ["petty-cash", "stats"],
    queryFn: getFundStats,
  })

  const { data: fundsData, isLoading: fundsLoading } = useQuery({
    queryKey: ["petty-cash", "my-funds"],
    queryFn: () => listFunds({ page: 1, page_size: 100 }),
  })

  const { data: expensesData, isLoading: expensesLoading } = useQuery({
    queryKey: ["petty-cash", "my-expenses"],
    queryFn: () => listExpenses({ page: 1, page_size: 100 }),
  })

  const { data: projectsData } = useQuery({
    queryKey: ["quick-projects"],
    queryFn: () => listProjects({ page: 1, page_size: 200 }),
  })

  const funds = fundsData?.items ?? []
  const expenses = expensesData?.items ?? []
  const projects = projectsData?.items ?? []

  const createMut = useMutation({
    mutationFn: async () => {
      const expense = await createExpense({
        fund_id: form.fund_id,
        project_id: "",
        category: form.category,
        amount: Number(form.amount),
        description: form.description,
        expense_date: form.expense_date,
      }) as any
      const expenseId = expense?.id ?? expense?.data?.id
      if (expenseId) {
        for (const f of paymentFiles) {
          await uploadExpenseAttachment(expenseId, f, "payment_proof")
        }
        for (const f of invoiceFiles) {
          await uploadExpenseAttachment(expenseId, f, "invoice")
        }
      }
      return expense
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["petty-cash"] })
      toast.success("费用已记录")
      setDialog(null)
      setForm({ fund_id: "", category: "other", amount: "", description: "", expense_date: new Date().toISOString().split("T")[0] })
      setPaymentFiles([])
      setInvoiceFiles([])
    },
    onError: () => toast.error("记录失败"),
  })

  const submitMut = useMutation({
    mutationFn: submitExpense,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash"] }); toast.success("已提交审批") },
  })

  const cancelMut = useMutation({
    mutationFn: cancelExpense,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash"] }); toast.success("已取消") },
  })

  const openDetail = (exp: any) => {
    setSelectedExpense(exp)
    setDialog("detail")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">我的备用金</h1>
          <p className="text-sm text-muted-foreground">管理我的备用金和报销核销</p>
        </div>
        <Button size="sm" onClick={() => setDialog("create")}>
          <Plus className="size-3.5 mr-1" />新建核销
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">剩余金额</p>
            <p className="text-2xl font-bold text-green-600">¥{(stats?.total_remaining ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">总金额</p>
            <p className="text-2xl font-bold">¥{(stats?.total_amount ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">已使用</p>
            <p className="text-2xl font-bold text-rose-500">¥{(stats?.total_used ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">待结算</p>
            <p className="text-2xl font-bold text-amber-500">{stats?.settling_count ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Funds Table */}
      <Card>
        <CardHeader><CardTitle>备用金账户</CardTitle></CardHeader>
        <CardContent>
          {fundsLoading ? <Skeleton className="h-32 w-full" /> : funds.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无备用金</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>编号</TableHead><TableHead>项目</TableHead><TableHead>金额</TableHead><TableHead>已使用</TableHead><TableHead>剩余</TableHead><TableHead>预计归还</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
              <TableBody>
                {funds.filter((f: any) => f.status === "active").map((fund: any) => (
                  <TableRow key={fund.id}>
                    <TableCell className="font-mono text-xs">{fund.fund_no}</TableCell>
                    <TableCell>{fund.project_name ?? "-"}</TableCell>
                    <TableCell>¥{fund.amount.toLocaleString()}</TableCell>
                    <TableCell>¥{fund.used_amount.toLocaleString()}</TableCell>
                    <TableCell className="font-semibold text-green-600">¥{fund.remaining_amount.toLocaleString()}</TableCell>
                    <TableCell>{fund.expected_return_date}</TableCell>
                    <TableCell><Badge variant="outline">{fund.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader><CardTitle>核销记录</CardTitle><CardDescription>我的报销核销明细</CardDescription></CardHeader>
        <CardContent>
          {expensesLoading ? <Skeleton className="h-32 w-full" /> : expenses.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无核销记录</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>项目</TableHead><TableHead>类别</TableHead><TableHead>金额</TableHead><TableHead>说明</TableHead><TableHead>附件</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {expenses.map((exp: any) => {
                  const st = statusMap[exp.status] ?? { label: exp.status, color: "bg-gray-100" }
                  const attachCount = (exp.attachments?.length ?? 0) + (exp.invoice_files?.length ?? 0)
                  return (
                    <TableRow key={exp.id}>
                      <TableCell>{exp.expense_date}</TableCell>
                      <TableCell>{exp.project_name ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{CATEGORY_OPTIONS.find(c => c.value === exp.category)?.label ?? exp.category}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">¥{exp.amount.toLocaleString()}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{exp.description ?? "-"}</TableCell>
                      <TableCell>
                        {attachCount > 0 ? (
                          <Badge variant="secondary">{attachCount}个</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">无</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(exp)}><Eye className="size-3.5" /></Button>
                          {exp.status === "pending" && (
                            <Button size="sm" variant="outline" onClick={() => submitMut.mutate(exp.id)} disabled={submitMut.isPending}>
                              <Send className="size-3 mr-1" />提交
                            </Button>
                          )}
                          {(exp.status === "pending" || exp.status === "rejected") && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelMut.mutate(exp.id)}>
                              <X className="size-3.5" />
                            </Button>
                          )}
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

      {/* Create Expense Dialog */}
      <Dialog open={dialog === "create"} onOpenChange={(v) => { if (!v) setDialog(null) }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新建核销</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>备用金账户</Label>
              <Select value={form.fund_id} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, fund_id: v })) }}>
                <SelectTrigger><SelectValue placeholder="选择备用金" /></SelectTrigger>
                <SelectContent>
                  {funds.filter((f: any) => f.status === "active" && f.remaining_amount > 0).map((fund: any) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      {fund.fund_no} - ¥{fund.remaining_amount.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>费用日期</Label>
                <Input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>费用类别</Label>
                <Select value={form.category} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, category: v })) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>金额</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="grid gap-2">
              <Label>说明</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="费用说明..." />
            </div>

            {/* Payment Proof Upload */}
            <div className="grid gap-2">
              <Label>付款证明（可选）</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => paymentRef.current?.click()}>
                  <Upload className="size-3.5 mr-1" />选择文件
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const input = paymentRef.current
                  if (input) { input.setAttribute("capture", "environment"); input.click() }
                }}>
                  <Camera className="size-3.5 mr-1" />拍照
                </Button>
              </div>
              <input ref={paymentRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => {
                const files = Array.from(e.target.files || [])
                setPaymentFiles((prev) => [...prev, ...files])
              }} />
              {paymentFiles.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {paymentFiles.map((f, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{f.name}
                      <button onClick={() => setPaymentFiles((prev) => prev.filter((_, j) => j !== i))} className="ml-1"><X className="size-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Invoice Upload */}
            <div className="grid gap-2">
              <Label>发票（可选）</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => invoiceRef.current?.click()}>
                  <Upload className="size-3.5 mr-1" />选择文件
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const input = invoiceRef.current
                  if (input) { input.setAttribute("capture", "environment"); input.click() }
                }}>
                  <Camera className="size-3.5 mr-1" />拍照
                </Button>
              </div>
              <input ref={invoiceRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => {
                const files = Array.from(e.target.files || [])
                setInvoiceFiles((prev) => [...prev, ...files])
              }} />
              {invoiceFiles.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {invoiceFiles.map((f, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{f.name}
                      <button onClick={() => setInvoiceFiles((prev) => prev.filter((_, j) => j !== i))} className="ml-1"><X className="size-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>取消</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.amount || !form.fund_id}>
              {createMut.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={dialog === "detail"} onOpenChange={(v) => { if (!v) setDialog(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>核销详情</DialogTitle></DialogHeader>
          {selectedExpense && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">日期：</span>{selectedExpense.expense_date}</div>
                <div><span className="text-muted-foreground">金额：</span>¥{selectedExpense.amount?.toLocaleString()}</div>
                <div><span className="text-muted-foreground">类别：</span>{selectedExpense.category}</div>
                <div><span className="text-muted-foreground">说明：</span>{selectedExpense.description ?? "-"}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">状态：</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusMap[selectedExpense.status]?.color ?? ""}`}>
                  {statusMap[selectedExpense.status]?.label ?? selectedExpense.status}
                </span>
              </div>
              {selectedExpense.reject_reason && (
                <div className="p-3 bg-red-50 rounded text-sm text-red-700">
                  驳回原因：{selectedExpense.reject_reason}
                </div>
              )}
              {/* Attachments */}
              {(selectedExpense.attachments?.length > 0 || selectedExpense.invoice_files?.length > 0) && (
                <div className="space-y-2">
                  <Label>附件</Label>
                  {(selectedExpense.attachments ?? []).map((a: any, i: number) => (
                    <div key={`p-${i}`} className="flex items-center gap-2 text-sm p-2 border rounded">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{a.original_filename ?? a.url ?? "付款证明"}</span>
                      <Badge variant="outline" className="text-[10px]">付款证明</Badge>
                    </div>
                  ))}
                  {(selectedExpense.invoice_files ?? []).map((a: any, i: number) => (
                    <div key={`i-${i}`} className="flex items-center gap-2 text-sm p-2 border rounded">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{a.original_filename ?? a.url ?? "发票"}</span>
                      <Badge variant="outline" className="text-[10px]">发票</Badge>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter>
                {selectedExpense.status === "pending" && (
                  <Button onClick={() => { submitMut.mutate(selectedExpense.id); setDialog(null) }}>
                    <Send className="size-4 mr-1" />提交审批
                  </Button>
                )}
                {(selectedExpense.status === "pending" || selectedExpense.status === "rejected") && (
                  <Button variant="destructive" onClick={() => { cancelMut.mutate(selectedExpense.id); setDialog(null) }}>
                    取消核销
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
