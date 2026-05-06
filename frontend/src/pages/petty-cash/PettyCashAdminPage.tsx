import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Loader2, Upload, CheckCircle, XCircle, Eye } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
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

const fundStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "使用中", variant: "default" },
  settling: { label: "结清中", variant: "outline" },
  settled: { label: "已结清", variant: "secondary" },
  overdue: { label: "逾期", variant: "destructive" },
  cancelled: { label: "已取消", variant: "secondary" },
}

const expenseStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "待提交", variant: "secondary" },
  submitted: { label: "已提交", variant: "default" },
  leader_approved: { label: "领导已审", variant: "outline" },
  finance_approved: { label: "财务已审", variant: "default" },
  rejected: { label: "驳回", variant: "destructive" },
}

export default function PettyCashAdminPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState("overview")
  const [fundPage, setFundPage] = useState(1)
  const [disbursePage, setDisbursePage] = useState(1)
  const [verifyPage, setVerifyPage] = useState(1)
  const [projectFilter, setProjectFilter] = useState("all")
  const [disburseDialogOpen, setDisburseDialogOpen] = useState(false)
  const [disburseForm, setDisburseForm] = useState({ user_id: "", amount: "", disburse_date: "", payment_method: "", payment_entity: "", remark: "" })
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [receiptTarget, setReceiptTarget] = useState<pettyCashApi.PettyCashExpense | null>(null)
  const receiptFileRef = useRef<HTMLInputElement>(null)

  const { data: stats } = useQuery({ queryKey: ["petty-cash-stats"], queryFn: pettyCashApi.getFundStats })
  const { data: fundData, isLoading: fundLoading } = useQuery({
    queryKey: ["petty-cash-admin-funds", fundPage, projectFilter],
    queryFn: () => pettyCashApi.listFunds({ page: fundPage, page_size: 20, ...(projectFilter !== "all" ? { project_id: projectFilter } : {}) }),
  })
  const { data: disburseData, isLoading: disburseLoading } = useQuery({
    queryKey: ["petty-cash-disbursements", disbursePage],
    queryFn: () => pettyCashApi.listDisbursements({ page: disbursePage, page_size: 20 }),
  })
  const { data: verifyData, isLoading: verifyLoading } = useQuery({
    queryKey: ["petty-cash-pending-verify", verifyPage],
    queryFn: () => pettyCashApi.listExpenses({ status: "finance_approved", page: verifyPage, page_size: 20 }),
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

  const leaderApproveMut = useMutation({
    mutationFn: pettyCashApi.leaderApprove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-pending-verify"] }); toast.success("已通过") },
  })
  const financeApproveMut = useMutation({
    mutationFn: pettyCashApi.financeApprove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-pending-verify"] }); toast.success("已通过") },
  })

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>, expenseId: string) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const fd = new FormData()
      fd.append("file", file)
      await pettyCashApi.ocrUploadInvoice(fd)
      toast.success("票据已上传")
      qc.invalidateQueries({ queryKey: ["petty-cash-pending-verify"] })
    } catch {
      toast.error("上传失败")
    }
    if (receiptFileRef.current) receiptFileRef.current.value = ""
  }

  return (
    <Card>
      <CardHeader><CardTitle>备用金管理（管理员）</CardTitle></CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">备用金总览</TabsTrigger>
            <TabsTrigger value="disburse">发放记录</TabsTrigger>
            <TabsTrigger value="verify">待核销</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">总发放额</div><div className="text-xl font-bold">¥{(stats?.total_amount ?? 0).toLocaleString()}</div></div>
              <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">已使用额</div><div className="text-xl font-bold">¥{(stats?.total_used ?? 0).toLocaleString()}</div></div>
              <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">剩余额度</div><div className="text-xl font-bold">¥{(stats?.total_remaining ?? 0).toLocaleString()}</div></div>
              <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">逾期笔数</div><div className="text-xl font-bold text-red-600">{stats?.overdue_count ?? 0}</div></div>
            </div>

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
                      <TableHead>编号</TableHead>
                      <TableHead>员工</TableHead>
                      <TableHead>项目</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>已使用</TableHead>
                      <TableHead>剩余</TableHead>
                      <TableHead>发放日期</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fundData?.items?.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono">{f.fund_no}</TableCell>
                        <TableCell>{f.employee_name ?? f.employee_id}</TableCell>
                        <TableCell>{f.project_name ?? f.project_id}</TableCell>
                        <TableCell>¥{f.amount.toLocaleString()}</TableCell>
                        <TableCell>¥{f.used_amount.toLocaleString()}</TableCell>
                        <TableCell>¥{f.remaining_amount.toLocaleString()}</TableCell>
                        <TableCell>{f.issue_date}</TableCell>
                        <TableCell><Badge variant={fundStatusMap[f.status]?.variant ?? "secondary"}>{fundStatusMap[f.status]?.label ?? f.status}</Badge></TableCell>
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

          <TabsContent value="disburse">
            {disburseLoading ? <Skeleton className="h-64 w-full" /> : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>发放日期</TableHead>
                      <TableHead>付款方式</TableHead>
                      <TableHead>付款主体</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>备注</TableHead>
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

          <TabsContent value="verify">
            {verifyLoading ? <Skeleton className="h-64 w-full" /> : (
              <>
                {verifyData?.items?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">暂无待核销支出</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>备用金</TableHead>
                        <TableHead>员工</TableHead>
                        <TableHead>支出日期</TableHead>
                        <TableHead>分类</TableHead>
                        <TableHead>金额</TableHead>
                        <TableHead>发票数</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>票据</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {verifyData?.items?.map((ex) => (
                        <TableRow key={ex.id}>
                          <TableCell className="font-mono">{ex.fund_no ?? ex.fund_id}</TableCell>
                          <TableCell>{ex.employee_name ?? ex.project_id}</TableCell>
                          <TableCell>{ex.expense_date}</TableCell>
                          <TableCell>{ex.category}</TableCell>
                          <TableCell>¥{ex.amount.toLocaleString()}</TableCell>
                          <TableCell>{ex.invoice_count}</TableCell>
                          <TableCell><Badge variant={expenseStatusMap[ex.status]?.variant ?? "secondary"}>{expenseStatusMap[ex.status]?.label ?? ex.status}</Badge></TableCell>
                          <TableCell>
                            {ex.invoices && ex.invoices.length > 0 ? (
                              <div className="flex items-center gap-1">
                                <CheckCircle className="size-3.5 text-green-500" />
                                <span className="text-xs">{ex.invoices.length}张</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <XCircle className="size-3.5 text-muted-foreground" />
                                <Button size="sm" variant="ghost" className="h-auto p-0 text-xs" onClick={() => { setReceiptTarget(ex); setReceiptDialogOpen(true) }}>上传</Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => leaderApproveMut.mutate(ex.id)} disabled={leaderApproveMut.isPending}>
                                <CheckCircle className="size-3" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => financeApproveMut.mutate(ex.id)} disabled={financeApproveMut.isPending}>
                                <Eye className="size-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="flex items-center justify-end gap-2 mt-4">
                  <Button size="sm" variant="outline" disabled={verifyPage <= 1} onClick={() => setVerifyPage((p) => p - 1)}>上一页</Button>
                  <span className="text-sm text-muted-foreground">{verifyPage}</span>
                  <Button size="sm" variant="outline" disabled={!verifyData || verifyData.items.length < 20} onClick={() => setVerifyPage((p) => p + 1)}>下一页</Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

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

      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>上传票据</DialogTitle></DialogHeader>
          {receiptTarget && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                支出: ¥{receiptTarget.amount.toLocaleString()} · {receiptTarget.category}
                {receiptTarget.description && ` · ${receiptTarget.description}`}
              </div>
              <div className="grid gap-2">
                <Label>收据/发票文件</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => receiptFileRef.current?.click()}>
                    <Upload className="size-4 mr-1" />选择文件
                  </Button>
                  <input ref={receiptFileRef} type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => handleReceiptUpload(e, receiptTarget.id)} />
                </div>
              </div>
              {receiptTarget.invoices && receiptTarget.invoices.length > 0 && (
                <div className="space-y-2">
                  <Label>已上传票据</Label>
                  {receiptTarget.invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-2 border rounded text-sm">
                      <span>{inv.invoice_type} · ¥{inv.total_amount.toLocaleString()}</span>
                      <Badge variant={inv.is_verified ? "default" : "secondary"}>{inv.is_verified ? "已验真" : "未验真"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
