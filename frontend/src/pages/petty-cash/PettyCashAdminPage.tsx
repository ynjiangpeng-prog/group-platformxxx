import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Plus, Loader2, Upload, CheckCircle, XCircle, Eye, Wallet,
  RefreshCw, ArrowUpDown, X, FileText, Send, Ban,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import * as pettyCashApi from "@/api/petty-cash"
import { listUsers, listCompanies } from "@/api/organization"
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

const expenseStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "待提交", color: "bg-gray-100 text-gray-700" },
  submitted: { label: "已提交", color: "bg-blue-100 text-blue-700" },
  leader_approved: { label: "领导已审", color: "bg-purple-100 text-purple-700" },
  finance_approved: { label: "财务已审", color: "bg-indigo-100 text-indigo-700" },
  admin_approved: { label: "已通过", color: "bg-green-100 text-green-700" },
  rejected: { label: "已驳回", color: "bg-red-100 text-red-700" },
  cancelled: { label: "已取消", color: "bg-gray-100 text-gray-400" },
}

export default function PettyCashAdminPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState("overview")
  const [fundPage, setFundPage] = useState(1)
  const [disbursePage, setDisbursePage] = useState(1)
  const [verifyPage, setVerifyPage] = useState(1)
  const [projectFilter, setProjectFilter] = useState("all")
  const [disburseDialogOpen, setDisburseDialogOpen] = useState(false)
  const [disburseForm, setDisburseForm] = useState({
    user_id: "", amount: "", disburse_date: "", payment_method: "", payment_entity: "", remark: "",
  })
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [receiptTarget, setReceiptTarget] = useState<pettyCashApi.PettyCashExpense | null>(null)
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; name: string; balance: number } | null>(null)
  const [adjustForm, setAdjustForm] = useState({ amount: "", reason: "" })
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [detailTarget, setDetailTarget] = useState<pettyCashApi.PettyCashExpense | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { data: stats } = useQuery({ queryKey: ["petty-cash-stats"], queryFn: pettyCashApi.getFundStats })
  const { data: fundData, isLoading: fundLoading } = useQuery({
    queryKey: ["petty-cash-admin-funds", fundPage, projectFilter],
    queryFn: () => pettyCashApi.listFunds({ page: fundPage, page_size: 20, ...(projectFilter !== "all" ? { project_id: projectFilter } : {}) }),
  })
  const { data: disburseData, isLoading: disburseLoading } = useQuery({
    queryKey: ["petty-cash-disbursements", disbursePage],
    queryFn: () => pettyCashApi.listDisbursements({ page: disbursePage, page_size: 20 }),
  })
  const { data: allExpensesData, isLoading: verifyLoading } = useQuery({
    queryKey: ["petty-cash-all-expenses", verifyPage],
    queryFn: () => pettyCashApi.listExpenses({ page: verifyPage, page_size: 20 }),
  })
  const { data: usersData } = useQuery({ queryKey: ["users-select"], queryFn: () => listUsers({ page: 1, page_size: 500 }) })
  const { data: companiesData } = useQuery({ queryKey: ["companies-select"], queryFn: () => listCompanies({ page: 1, page_size: 200 }) })
  const { data: projectsData } = useQuery({ queryKey: ["projects-select"], queryFn: () => listProjects({ page: 1, page_size: 500 }) })
  const users = usersData?.items ?? []
  const companies = companiesData?.items ?? []
  const projects = projectsData?.items ?? []

  const createDisburseMut = useMutation({
    mutationFn: () => pettyCashApi.createDisbursement({
      user_id: disburseForm.user_id,
      amount: Number(disburseForm.amount) || 0,
      disburse_date: disburseForm.disburse_date,
      payment_method: disburseForm.payment_method || undefined,
      payment_entity: disburseForm.payment_entity || undefined,
      remark: disburseForm.remark || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["petty-cash-admin-funds"] })
      qc.invalidateQueries({ queryKey: ["petty-cash-disbursements"] })
      qc.invalidateQueries({ queryKey: ["petty-cash-stats"] })
      toast.success("备用金已发放")
      setDisburseDialogOpen(false)
    },
  })

  const syncMut = useMutation({
    mutationFn: pettyCashApi.syncFromBank,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["petty-cash-admin-funds"] })
      qc.invalidateQueries({ queryKey: ["petty-cash-stats"] })
      toast.success(`同步完成，已匹配 ${data?.synced_count ?? 0} 条`)
    },
    onError: () => toast.error("同步失败"),
  })

  const adjustMut = useMutation({
    mutationFn: () => pettyCashApi.adjustPool(adjustTarget!.id, {
      amount: Number(adjustForm.amount),
      reason: adjustForm.reason,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["petty-cash-admin-funds"] })
      qc.invalidateQueries({ queryKey: ["petty-cash-stats"] })
      toast.success("余额已调整")
      setAdjustDialogOpen(false)
    },
    onError: () => toast.error("调整失败"),
  })

  const leaderApproveMut = useMutation({
    mutationFn: pettyCashApi.leaderApprove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-all-expenses"] }); toast.success("领导审批通过") },
  })
  const leaderRejectMut = useMutation({
    mutationFn: (data: { id: string; reason: string }) => pettyCashApi.leaderReject(data.id, { reject_reason: data.reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-all-expenses"] }); toast.success("已驳回"); setRejectDialogOpen(false) },
  })
  const financeApproveMut = useMutation({
    mutationFn: pettyCashApi.financeApprove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-all-expenses"] }); toast.success("财务审批通过") },
  })
  const financeRejectMut = useMutation({
    mutationFn: (data: { id: string; reason: string }) => pettyCashApi.financeReject(data.id, { reject_reason: data.reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-all-expenses"] }); toast.success("已驳回"); setRejectDialogOpen(false) },
  })

  const batchLeaderMut = useMutation({
    mutationFn: pettyCashApi.batchLeaderApprove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-all-expenses"] }); toast.success("批量审批通过") },
  })
  const batchFinanceMut = useMutation({
    mutationFn: pettyCashApi.batchFinanceApprove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-all-expenses"] }); toast.success("批量审批通过") },
  })

  const pendingExpenses = (allExpensesData?.items ?? []).filter((e) => e.status === "submitted" || e.status === "leader_approved")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Wallet className="size-5" />备用金管理</h1>
          <p className="text-sm text-muted-foreground">管理员备用金发放、审批与资金池管理</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">总发放额</p>
          <p className="text-2xl font-bold">¥{(stats?.total_amount ?? 0).toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">已使用</p>
          <p className="text-2xl font-bold text-rose-500">¥{(stats?.total_used ?? 0).toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">剩余额度</p>
          <p className="text-2xl font-bold text-green-600">¥{(stats?.total_remaining ?? 0).toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">逾期笔数</p>
          <p className="text-2xl font-bold text-red-600">{stats?.overdue_count ?? 0}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <div className="border-b px-4 pt-2">
              <TabsList>
                <TabsTrigger value="overview">备用金账户</TabsTrigger>
                <TabsTrigger value="pool">资金池管理</TabsTrigger>
                <TabsTrigger value="approval">审批中心</TabsTrigger>
                <TabsTrigger value="disburse">发放记录</TabsTrigger>
              </TabsList>
            </div>

            {/* 备用金账户 */}
            <TabsContent value="overview" className="p-4">
              <div className="flex items-center justify-between mb-4">
                <Select value={projectFilter} onValueChange={(v) => { if (v) setProjectFilter(v); setFundPage(1) }}>
                  <SelectTrigger className="w-60"><SelectValue placeholder="按项目筛选" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部项目</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={() => { setDisburseForm({ user_id: "", amount: "", disburse_date: "", payment_method: "", payment_entity: "", remark: "" }); setDisburseDialogOpen(true) }}>
                  <Plus className="size-4 mr-1" />发放备用金
                </Button>
              </div>
              {fundLoading ? <Skeleton className="h-64 w-full" /> : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>编号</TableHead><TableHead>员工</TableHead><TableHead>项目</TableHead>
                        <TableHead>金额</TableHead><TableHead>已使用</TableHead><TableHead>剩余</TableHead>
                        <TableHead>发放日期</TableHead><TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fundData?.items?.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-mono text-xs">{f.fund_no}</TableCell>
                          <TableCell>{f.employee_name ?? f.employee_id}</TableCell>
                          <TableCell>{f.project_name ?? "-"}</TableCell>
                          <TableCell>¥{f.amount.toLocaleString()}</TableCell>
                          <TableCell>¥{f.used_amount.toLocaleString()}</TableCell>
                          <TableCell className="font-semibold text-green-600">¥{f.remaining_amount.toLocaleString()}</TableCell>
                          <TableCell>{f.issue_date}</TableCell>
                          <TableCell><Badge variant="outline">{f.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-end gap-2 mt-4">
                    <Button size="sm" variant="outline" disabled={fundPage <= 1} onClick={() => setFundPage((p) => p - 1)}>上一页</Button>
                    <span className="text-sm text-muted-foreground">{fundPage}</span>
                    <Button size="sm" variant="outline" disabled={!fundData || fundData.items.length < 20} onClick={() => setFundPage((p) => p + 1)}>下一页</Button>
                  </div>
                </>
              )}
            </TabsContent>

            {/* 资金池管理 */}
            <TabsContent value="pool" className="p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">管理员工备用金资金池，可手动调整余额或从银行流水同步</p>
                <Button variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
                  {syncMut.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <RefreshCw className="size-4 mr-1" />}
                  同步银行流水
                </Button>
              </div>
              {fundLoading ? <Skeleton className="h-64 w-full" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>员工</TableHead><TableHead>项目</TableHead><TableHead>总收</TableHead>
                      <TableHead>已用</TableHead><TableHead>余额</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fundData?.items?.filter((f) => f.status === "active").map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.employee_name ?? f.employee_id}</TableCell>
                        <TableCell>{f.project_name ?? "-"}</TableCell>
                        <TableCell>¥{f.amount.toLocaleString()}</TableCell>
                        <TableCell>¥{f.used_amount.toLocaleString()}</TableCell>
                        <TableCell className="font-semibold text-green-600">¥{f.remaining_amount.toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline">活跃</Badge></TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => {
                            setAdjustTarget({ id: f.id, name: f.employee_name ?? f.employee_id, balance: f.remaining_amount })
                            setAdjustForm({ amount: "", reason: "" })
                            setAdjustDialogOpen(true)
                          }}>
                            <ArrowUpDown className="size-3.5 mr-1" />调整
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* 审批中心 */}
            <TabsContent value="approval" className="p-4">
              {verifyLoading ? <Skeleton className="h-64 w-full" /> : pendingExpenses.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">暂无待审批核销</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-muted-foreground">共 {pendingExpenses.length} 条待审批</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline"
                        onClick={() => batchLeaderMut.mutate(pendingExpenses.filter((e) => e.status === "submitted").map((e) => e.id))}
                        disabled={batchLeaderMut.isPending || pendingExpenses.filter((e) => e.status === "submitted").length === 0}
                      >
                        <CheckCircle className="size-3.5 mr-1" />批量领导审批
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => batchFinanceMut.mutate(pendingExpenses.filter((e) => e.status === "leader_approved").map((e) => e.id))}
                        disabled={batchFinanceMut.isPending || pendingExpenses.filter((e) => e.status === "leader_approved").length === 0}
                      >
                        <CheckCircle className="size-3.5 mr-1" />批量财务审批
                      </Button>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead><TableHead>员工</TableHead><TableHead>项目</TableHead>
                        <TableHead>类别</TableHead><TableHead>金额</TableHead><TableHead>附件</TableHead>
                        <TableHead>状态</TableHead><TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingExpenses.map((ex) => {
                        const st = expenseStatusMap[ex.status] ?? { label: ex.status, color: "bg-gray-100" }
                        const attachCount = (ex.attachments?.length ?? 0) + (ex.invoice_files?.length ?? 0)
                        return (
                          <TableRow key={ex.id}>
                            <TableCell>{ex.expense_date}</TableCell>
                            <TableCell>{ex.employee_name ?? "-"}</TableCell>
                            <TableCell>{ex.project_name ?? "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{CATEGORY_OPTIONS.find((c) => c.value === ex.category)?.label ?? ex.category}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">¥{ex.amount.toLocaleString()}</TableCell>
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
                                <Button size="sm" variant="ghost" onClick={() => { setDetailTarget(ex); setDetailOpen(true) }}>
                                  <Eye className="size-3.5" />
                                </Button>
                                {ex.status === "submitted" && (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => leaderApproveMut.mutate(ex.id)} disabled={leaderApproveMut.isPending}>
                                      <CheckCircle className="size-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setRejectTarget(ex.id); setRejectReason(""); setRejectDialogOpen(true) }}>
                                      <XCircle className="size-3.5" />
                                    </Button>
                                  </>
                                )}
                                {ex.status === "leader_approved" && (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => financeApproveMut.mutate(ex.id)} disabled={financeApproveMut.isPending}>
                                      <CheckCircle className="size-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setRejectTarget(ex.id); setRejectReason(""); setRejectDialogOpen(true) }}>
                                      <XCircle className="size-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-end gap-2 mt-4">
                    <Button size="sm" variant="outline" disabled={verifyPage <= 1} onClick={() => setVerifyPage((p) => p - 1)}>上一页</Button>
                    <span className="text-sm text-muted-foreground">{verifyPage}</span>
                    <Button size="sm" variant="outline" disabled={!allExpensesData || allExpensesData.items.length < 20} onClick={() => setVerifyPage((p) => p + 1)}>下一页</Button>
                  </div>
                </>
              )}
            </TabsContent>

            {/* 发放记录 */}
            <TabsContent value="disburse" className="p-4">
              {disburseLoading ? <Skeleton className="h-64 w-full" /> : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>用户</TableHead><TableHead>金额</TableHead><TableHead>发放日期</TableHead>
                        <TableHead>付款方式</TableHead><TableHead>付款主体</TableHead><TableHead>状态</TableHead><TableHead>备注</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {disburseData?.items?.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>{d.user_name ?? d.user_id}</TableCell>
                          <TableCell>¥{d.amount.toLocaleString()}</TableCell>
                          <TableCell>{d.disburse_date}</TableCell>
                          <TableCell>{{ bank_transfer: "银行转账", cash: "现金", offset: "抵扣" }[d.payment_method] ?? d.payment_method}</TableCell>
                          <TableCell>{d.entity_name ?? d.payment_entity}</TableCell>
                          <TableCell><Badge variant={d.status === "completed" ? "default" : "secondary"}>{{ completed: "已完成", pending: "待处理", cancelled: "已取消" }[d.status] ?? d.status}</Badge></TableCell>
                          <TableCell className="max-w-[200px] truncate">{d.remark ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-end gap-2 mt-4">
                    <Button size="sm" variant="outline" disabled={disbursePage <= 1} onClick={() => setDisbursePage((p) => p - 1)}>上一页</Button>
                    <span className="text-sm text-muted-foreground">{disbursePage}</span>
                    <Button size="sm" variant="outline" disabled={!disburseData || disburseData.items.length < 20} onClick={() => setDisbursePage((p) => p + 1)}>下一页</Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 发放备用金 Dialog */}
      <Dialog open={disburseDialogOpen} onOpenChange={setDisburseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>发放备用金</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>选择用户</Label>
              <Select value={disburseForm.user_id} onValueChange={(v) => setDisburseForm((f) => ({ ...f, user_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择用户" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.real_name ?? u.username}{u.phone ? ` (${u.phone})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>金额</Label>
                <Input type="number" value={disburseForm.amount} onChange={(e) => setDisburseForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>发放日期</Label>
                <Input type="date" value={disburseForm.disburse_date} onChange={(e) => setDisburseForm((f) => ({ ...f, disburse_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>付款方式</Label>
                <Select value={disburseForm.payment_method} onValueChange={(v) => setDisburseForm((f) => ({ ...f, payment_method: v ?? "" }))}>
                  <SelectTrigger><SelectValue placeholder="选择方式" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">银行转账</SelectItem>
                    <SelectItem value="cash">现金</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>付款主体</Label>
                <Select value={disburseForm.payment_entity} onValueChange={(v) => setDisburseForm((f) => ({ ...f, payment_entity: v ?? "" }))}>
                  <SelectTrigger><SelectValue placeholder="选择主体" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((co) => <SelectItem key={co.id} value={co.id}>{co.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>备注</Label>
              <Textarea value={disburseForm.remark} onChange={(e) => setDisburseForm((f) => ({ ...f, remark: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisburseDialogOpen(false)}>取消</Button>
            <Button disabled={createDisburseMut.isPending || !disburseForm.user_id || !disburseForm.amount} onClick={() => createDisburseMut.mutate()}>
              {createDisburseMut.isPending && <Loader2 className="size-4 animate-spin" />}确认发放
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 余额调整 Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>调整资金池余额</DialogTitle></DialogHeader>
          {adjustTarget && (
            <div className="space-y-4 py-4">
              <div className="text-sm text-muted-foreground">
                员工：{adjustTarget.name}，当前余额：¥{adjustTarget.balance.toLocaleString()}
              </div>
              <div className="grid gap-2">
                <Label>调整金额（正数增加，负数减少）</Label>
                <Input type="number" value={adjustForm.amount} onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="grid gap-2">
                <Label>调整原因</Label>
                <Textarea value={adjustForm.reason} onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))} placeholder="请说明调整原因" rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>取消</Button>
            <Button disabled={adjustMut.isPending || !adjustForm.amount || !adjustForm.reason} onClick={() => adjustMut.mutate()}>
              {adjustMut.isPending && <Loader2 className="size-4 animate-spin mr-1" />}确认调整
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 驳回 Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>驳回核销</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>驳回原因</Label>
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="请说明驳回原因..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>取消</Button>
            <Button variant="destructive" disabled={!rejectReason} onClick={() => {
              if (rejectTarget) leaderRejectMut.mutate({ id: rejectTarget, reason: rejectReason })
            }}>
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 核销详情 Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>核销详情</DialogTitle></DialogHeader>
          {detailTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">日期：</span>{detailTarget.expense_date}</div>
                <div><span className="text-muted-foreground">金额：</span>¥{detailTarget.amount?.toLocaleString()}</div>
                <div><span className="text-muted-foreground">类别：</span>{CATEGORY_OPTIONS.find((c) => c.value === detailTarget.category)?.label ?? detailTarget.category}</div>
                <div><span className="text-muted-foreground">说明：</span>{detailTarget.description ?? "-"}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">状态：</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${expenseStatusMap[detailTarget.status]?.color ?? ""}`}>
                  {expenseStatusMap[detailTarget.status]?.label ?? detailTarget.status}
                </span>
              </div>
              {detailTarget.reject_reason && (
                <div className="p-3 bg-red-50 rounded text-sm text-red-700">
                  驳回原因：{detailTarget.reject_reason}
                </div>
              )}
              {((detailTarget.attachments?.length ?? 0) > 0 || (detailTarget.invoice_files?.length ?? 0) > 0) && (
                <div className="space-y-2">
                  <Label>附件</Label>
                  {(detailTarget.attachments ?? []).map((a: any, i: number) => (
                    <div key={`p-${i}`} className="flex items-center gap-2 text-sm p-2 border rounded">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{a.original_filename ?? a.url ?? "付款证明"}</span>
                      <Badge variant="outline" className="text-[10px]">付款证明</Badge>
                    </div>
                  ))}
                  {(detailTarget.invoice_files ?? []).map((a: any, i: number) => (
                    <div key={`i-${i}`} className="flex items-center gap-2 text-sm p-2 border rounded">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{a.original_filename ?? a.url ?? "发票"}</span>
                      <Badge variant="outline" className="text-[10px]">发票</Badge>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter>
                {detailTarget.status === "submitted" && (
                  <>
                    <Button onClick={() => { leaderApproveMut.mutate(detailTarget.id); setDetailOpen(false) }} disabled={leaderApproveMut.isPending}>
                      <CheckCircle className="size-4 mr-1" />领导审批通过
                    </Button>
                    <Button variant="destructive" onClick={() => { setDetailOpen(false); setRejectTarget(detailTarget.id); setRejectReason(""); setRejectDialogOpen(true) }}>
                      <XCircle className="size-4 mr-1" />驳回
                    </Button>
                  </>
                )}
                {detailTarget.status === "leader_approved" && (
                  <>
                    <Button onClick={() => { financeApproveMut.mutate(detailTarget.id); setDetailOpen(false) }} disabled={financeApproveMut.isPending}>
                      <CheckCircle className="size-4 mr-1" />财务审批通过
                    </Button>
                    <Button variant="destructive" onClick={() => { setDetailOpen(false); setRejectTarget(detailTarget.id); setRejectReason(""); setRejectDialogOpen(true) }}>
                      <XCircle className="size-4 mr-1" />驳回
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
