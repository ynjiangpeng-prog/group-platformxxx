import { useState, useRef, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Upload, Loader2, CheckSquare, XSquare, Eye, Send } from "lucide-react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/petty-cash";

const fundStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "使用中", variant: "default" },
  settling: { label: "结清中", variant: "outline" },
  settled: { label: "已结清", variant: "secondary" },
  overdue: { label: "逾期", variant: "destructive" },
  cancelled: { label: "已取消", variant: "secondary" },
};

const expenseStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "待提交", variant: "secondary" },
  submitted: { label: "已提交", variant: "default" },
  leader_approved: { label: "领导已审", variant: "outline" },
  finance_approved: { label: "财务已审", variant: "default" },
  rejected: { label: "驳回", variant: "destructive" },
};

const expenseCategories = [
  { value: "material", label: "材料费" },
  { value: "labor", label: "人工费" },
  { value: "transport", label: "运输费" },
  { value: "meal", label: "餐费" },
  { value: "travel", label: "差旅费" },
  { value: "office", label: "办公费" },
  { value: "other", label: "其他" },
];

const invoiceTypes = [
  { value: "vat_special", label: "增值税专用发票" },
  { value: "vat_normal", label: "增值税普通发票" },
  { value: "receipt", label: "收据" },
  { value: "other", label: "其他" },
];

export default function PettyCashPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("funds");
  const [fundPage, setFundPage] = useState(1);
  const [expensePage, setExpensePage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);

  const [fundDialogOpen, setFundDialogOpen] = useState(false);
  const [fundEditId, setFundEditId] = useState<string | null>(null);
  const [fundForm, setFundForm] = useState({ project_id: "", employee_id: "", amount: "", purpose: "", issue_date: "", expected_return_date: "" });
  const [fundStatusFilter, setFundStatusFilter] = useState("");
  const [fundProjectFilter, setFundProjectFilter] = useState("");
  const [fundEmployeeFilter, setFundEmployeeFilter] = useState("");
  const [expandedFund, setExpandedFund] = useState<string | null>(null);

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseEditId, setExpenseEditId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({ fund_id: "", expense_date: "", category: "", amount: "", description: "" });
  const [expenseStatusFilter, setExpenseStatusFilter] = useState("");
  const [expenseFundFilter, setExpenseFundFilter] = useState("");
  const [expenseProjectFilter, setExpenseProjectFilter] = useState("");
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectRole, setRejectRole] = useState<"leader" | "finance">("leader");
  const [viewRejectDialogOpen, setViewRejectDialogOpen] = useState(false);
  const [viewRejectReason, setViewRejectReason] = useState("");

  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceEditId, setInvoiceEditId] = useState<string | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ expense_id: "", fund_id: "", invoice_type: "", invoice_no: "", invoice_date: "", seller_name: "", amount_without_tax: "", tax_amount: "", total_amount: "" });
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<Record<string, unknown> | null>(null);
  const ocrFileRef = useRef<HTMLInputElement>(null);

  const { data: stats } = useQuery({ queryKey: ["petty-cash-stats"], queryFn: api.getFundStats });
  const { data: fundData, isLoading: fundLoading } = useQuery({
    queryKey: ["petty-cash-funds", fundPage, fundStatusFilter, fundProjectFilter, fundEmployeeFilter],
    queryFn: () => api.listFunds({ page: fundPage, page_size: 20, status: fundStatusFilter || undefined, project_id: fundProjectFilter || undefined, employee_keyword: fundEmployeeFilter || undefined }),
  });
  const { data: fundExpenses } = useQuery({
    queryKey: ["petty-cash-fund-expenses", expandedFund],
    queryFn: () => api.listExpenses({ fund_id: expandedFund!, page: 1, page_size: 100 }),
    enabled: !!expandedFund,
  });
  const { data: expenseData, isLoading: expenseLoading } = useQuery({
    queryKey: ["petty-cash-expenses", expensePage, expenseStatusFilter, expenseFundFilter, expenseProjectFilter],
    queryFn: () => api.listExpenses({ page: expensePage, page_size: 20, status: expenseStatusFilter || undefined, fund_id: expenseFundFilter || undefined, project_id: expenseProjectFilter || undefined }),
  });
  const { data: invoiceData, isLoading: invoiceLoading } = useQuery({
    queryKey: ["petty-cash-invoices", invoicePage],
    queryFn: () => api.listInvoices({ page: invoicePage, page_size: 20 }),
  });

  const createFundMut = useMutation({ mutationFn: api.createFund, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-funds"] }); qc.invalidateQueries({ queryKey: ["petty-cash-stats"] }); toast.success("已创建"); setFundDialogOpen(false); } });
  const cancelFundMut = useMutation({ mutationFn: api.cancelFund, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-funds"] }); qc.invalidateQueries({ queryKey: ["petty-cash-stats"] }); toast.success("已取消"); } });
  const settleFundMut = useMutation({ mutationFn: api.settleFund, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-funds"] }); qc.invalidateQueries({ queryKey: ["petty-cash-stats"] }); toast.success("已结清"); } });

  const createExpenseMut = useMutation({ mutationFn: api.createExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-expenses"] }); qc.invalidateQueries({ queryKey: ["petty-cash-funds"] }); toast.success("已创建"); setExpenseDialogOpen(false); } });
  const updateExpenseMut = useMutation({ mutationFn: ({ id, ...d }: { id: string; [k: string]: unknown }) => api.updateExpense(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-expenses"] }); toast.success("已更新"); setExpenseDialogOpen(false); } });
  const deleteExpenseMut = useMutation({ mutationFn: api.deleteExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-expenses"] }); toast.success("已删除"); } });
  const submitExpenseMut = useMutation({ mutationFn: api.submitExpense, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-expenses"] }); toast.success("已提交"); } });
  const leaderApproveMut = useMutation({ mutationFn: api.leaderApprove, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-expenses"] }); toast.success("已通过"); } });
  const leaderRejectMut = useMutation({ mutationFn: ({ id, ...d }: { id: string; reject_reason: string }) => api.leaderReject(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-expenses"] }); toast.success("已驳回"); setRejectDialogOpen(false); } });
  const financeApproveMut = useMutation({ mutationFn: api.financeApprove, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-expenses"] }); toast.success("已通过"); } });
  const financeRejectMut = useMutation({ mutationFn: ({ id, ...d }: { id: string; reject_reason: string }) => api.financeReject(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-expenses"] }); toast.success("已驳回"); setRejectDialogOpen(false); } });
  const batchLeaderApproveMut = useMutation({ mutationFn: api.batchLeaderApprove, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-expenses"] }); setSelectedExpenseIds([]); toast.success("批量审批完成"); } });
  const batchFinanceApproveMut = useMutation({ mutationFn: api.batchFinanceApprove, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-expenses"] }); setSelectedExpenseIds([]); toast.success("批量审批完成"); } });

  const createInvoiceMut = useMutation({ mutationFn: api.createInvoice, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-invoices"] }); toast.success("已创建"); setInvoiceDialogOpen(false); } });
  const updateInvoiceMut = useMutation({ mutationFn: ({ id, ...d }: { id: string; [k: string]: unknown }) => api.updateInvoice(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-invoices"] }); toast.success("已更新"); setInvoiceDialogOpen(false); } });
  const deleteInvoiceMut = useMutation({ mutationFn: api.deleteInvoice, onSuccess: () => { qc.invalidateQueries({ queryKey: ["petty-cash-invoices"] }); toast.success("已删除"); } });

  function openCreateFund() { setFundEditId(null); setFundForm({ project_id: "", employee_id: "", amount: "", purpose: "", issue_date: "", expected_return_date: "" }); setFundDialogOpen(true); }
  function openCreateExpense() { setExpenseEditId(null); setExpenseForm({ fund_id: "", expense_date: "", category: "", amount: "", description: "" }); setExpenseDialogOpen(true); }
  function openEditExpense(e: api.PettyCashExpense) { setExpenseEditId(e.id); setExpenseForm({ fund_id: e.fund_id ?? "", expense_date: e.expense_date ?? "", category: e.category ?? "", amount: String(e.amount ?? ""), description: e.description ?? "" }); setExpenseDialogOpen(true); }
  function openCreateInvoice() { setInvoiceEditId(null); setInvoiceForm({ expense_id: "", fund_id: "", invoice_type: "", invoice_no: "", invoice_date: "", seller_name: "", amount_without_tax: "", tax_amount: "", total_amount: "" }); setInvoiceDialogOpen(true); }
  function openEditInvoice(inv: api.PettyCashInvoice) { setInvoiceEditId(inv.id); setInvoiceForm({ expense_id: inv.expense_id, fund_id: inv.fund_id, invoice_type: inv.invoice_type, invoice_no: inv.invoice_no ?? "", invoice_date: inv.invoice_date ?? "", seller_name: inv.seller_name ?? "", amount_without_tax: String(inv.amount_without_tax ?? ""), tax_amount: String(inv.tax_amount ?? ""), total_amount: String(inv.total_amount ?? "") }); setInvoiceDialogOpen(true); }

  function openReject(id: string, role: "leader" | "finance") { setRejectTargetId(id); setRejectRole(role); setRejectReason(""); setRejectDialogOpen(true); }
  function confirmReject() { if (!rejectTargetId) return; if (rejectRole === "leader") leaderRejectMut.mutate({ id: rejectTargetId, reject_reason: rejectReason }); else financeRejectMut.mutate({ id: rejectTargetId, reject_reason: rejectReason }); }

  function toggleExpenseSelect(id: string) { setSelectedExpenseIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]); }

  async function handleOcrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await api.ocrUploadInvoice(fd);
      setOcrResult(result as unknown as Record<string, unknown>);
      setOcrDialogOpen(true);
      toast.success("OCR识别成功");
    } catch {
      toast.error("OCR识别失败");
    } finally {
      setOcrLoading(false);
      if (ocrFileRef.current) ocrFileRef.current.value = "";
    }
  }

  function applyOcrResult() {
    if (!ocrResult) return;
    setInvoiceForm((f) => ({
      ...f,
      invoice_type: (ocrResult.invoice_type as string) ?? f.invoice_type,
      invoice_no: (ocrResult.invoice_no as string) ?? f.invoice_no,
      invoice_date: (ocrResult.invoice_date as string) ?? f.invoice_date,
      seller_name: (ocrResult.seller_name as string) ?? f.seller_name,
      amount_without_tax: String(ocrResult.amount_without_tax ?? f.amount_without_tax),
      tax_amount: String(ocrResult.tax_amount ?? f.tax_amount),
      total_amount: String(ocrResult.total_amount ?? f.total_amount),
    }));
    setOcrDialogOpen(false);
    setInvoiceDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader><CardTitle>备用金管理</CardTitle></CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => { setTab(v); }}>
          <TabsList>
            <TabsTrigger value="funds" onClick={() => { setTab("funds"); setFundPage(1); }}>备用金台账</TabsTrigger>
            <TabsTrigger value="expenses" onClick={() => { setTab("expenses"); setExpensePage(1); }}>支出销账</TabsTrigger>
            <TabsTrigger value="invoices" onClick={() => { setTab("invoices"); setInvoicePage(1); }}>发票管理</TabsTrigger>
          </TabsList>

          <TabsContent value="funds">
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">总发放额</div><div className="text-xl font-bold">{stats?.total_amount ?? 0}</div></div>
              <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">已使用额</div><div className="text-xl font-bold">{stats?.total_used ?? 0}</div></div>
              <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">待销账笔数</div><div className="text-xl font-bold">{stats?.settling_count ?? 0}</div></div>
              <div className="border rounded-lg p-3 text-center"><div className="text-sm text-muted-foreground">逾期笔数</div><div className="text-xl font-bold text-red-600">{stats?.overdue_count ?? 0}</div></div>
            </div>

            <div className="flex items-end gap-3 mb-4">
              <div><Label>状态</Label><Select value={fundStatusFilter} onValueChange={(v) => { setFundStatusFilter(v === "_all" ? "" : (v ?? "")); setFundPage(1); }}><SelectTrigger className="w-32"><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="_all">全部</SelectItem><SelectItem value="active">使用中</SelectItem><SelectItem value="settling">结清中</SelectItem><SelectItem value="settled">已结清</SelectItem><SelectItem value="overdue">逾期</SelectItem><SelectItem value="cancelled">已取消</SelectItem></SelectContent></Select></div>
              <div><Label>项目</Label><Input placeholder="项目ID" value={fundProjectFilter} onChange={(e) => { setFundProjectFilter(e.target.value); setFundPage(1); }} className="w-36" /></div>
              <div><Label>员工</Label><Input placeholder="姓名关键词" value={fundEmployeeFilter} onChange={(e) => { setFundEmployeeFilter(e.target.value); setFundPage(1); }} className="w-36" /></div>
              <Button onClick={openCreateFund}><Plus className="mr-1 h-4 w-4" />新建备用金</Button>
            </div>

            {fundLoading ? <Skeleton className="h-64 w-full" /> : (
              <>
                <Table>
                  <TableHeader><TableRow><TableHead className="w-8" /><TableHead>编号</TableHead><TableHead>项目</TableHead><TableHead>员工</TableHead><TableHead>发放金额</TableHead><TableHead>已使用</TableHead><TableHead>剩余</TableHead><TableHead>发放日期</TableHead><TableHead>预计归还</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {fundData?.items?.map((f) => (
                      <Fragment key={f.id}>
                        <TableRow className="cursor-pointer" onClick={() => setExpandedFund((prev) => (prev === f.id ? null : f.id))}>
                          <TableCell>{expandedFund === f.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                          <TableCell>{f.fund_no}</TableCell>
                          <TableCell>{f.project_name ?? f.project_id}</TableCell>
                          <TableCell>{f.employee_name ?? f.employee_id}</TableCell>
                          <TableCell>{f.amount}</TableCell>
                          <TableCell>{f.used_amount}</TableCell>
                          <TableCell>{f.remaining_amount}</TableCell>
                          <TableCell>{f.issue_date ? format(new Date(f.issue_date), "yyyy-MM-dd") : ""}</TableCell>
                          <TableCell>{f.expected_return_date ? format(new Date(f.expected_return_date), "yyyy-MM-dd") : ""}</TableCell>
                          <TableCell><Badge variant={fundStatusMap[f.status]?.variant ?? "secondary"}>{fundStatusMap[f.status]?.label ?? f.status}</Badge></TableCell>
                          <TableCell className="space-x-1" onClick={(e) => e.stopPropagation()}>
                            {f.status === "active" && <Button size="sm" variant="outline" onClick={() => settleFundMut.mutate(f.id)}>结清</Button>}
                            {(f.status === "active" || f.status === "overdue") && <Button size="sm" variant="outline" onClick={() => cancelFundMut.mutate(f.id)}>取消</Button>}
                          </TableCell>
                        </TableRow>
                        {expandedFund === f.id && (
                          <TableRow>
                            <TableCell colSpan={11} className="bg-muted/50 px-8">
                              <div className="text-sm font-medium mb-2">支出记录</div>
                              {fundExpenses?.items?.length ? (
                                <Table>
                                  <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>分类</TableHead><TableHead>金额</TableHead><TableHead>发票数</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
                                  <TableBody>
                                    {fundExpenses.items.map((ex) => (
                                      <TableRow key={ex.id}>
                                        <TableCell>{ex.expense_date ? format(new Date(ex.expense_date), "yyyy-MM-dd") : ""}</TableCell>
                                        <TableCell>{ex.category}</TableCell>
                                        <TableCell>{ex.amount}</TableCell>
                                        <TableCell>{ex.invoice_count}</TableCell>
                                        <TableCell><Badge variant={expenseStatusMap[ex.status]?.variant ?? "secondary"}>{expenseStatusMap[ex.status]?.label ?? ex.status}</Badge></TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              ) : <div className="text-sm text-muted-foreground">暂无支出记录</div>}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
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

          <TabsContent value="expenses">
            <div className="flex items-end gap-3 mb-4">
              <div><Label>备用金</Label><Input placeholder="备用金ID" value={expenseFundFilter} onChange={(e) => { setExpenseFundFilter(e.target.value); setExpensePage(1); }} className="w-36" /></div>
              <div><Label>项目</Label><Input placeholder="项目ID" value={expenseProjectFilter} onChange={(e) => { setExpenseProjectFilter(e.target.value); setExpensePage(1); }} className="w-36" /></div>
              <div><Label>状态</Label><Select value={expenseStatusFilter} onValueChange={(v) => { setExpenseStatusFilter(v === "_all" ? "" : (v ?? "")); setExpensePage(1); }}><SelectTrigger className="w-36"><SelectValue placeholder="全部" /></SelectTrigger><SelectContent><SelectItem value="_all">全部</SelectItem><SelectItem value="pending">待提交</SelectItem><SelectItem value="submitted">已提交</SelectItem><SelectItem value="leader_approved">领导已审</SelectItem><SelectItem value="finance_approved">财务已审</SelectItem><SelectItem value="rejected">驳回</SelectItem></SelectContent></Select></div>
              <Button onClick={openCreateExpense}><Plus className="mr-1 h-4 w-4" />新建支出</Button>
            </div>

            {selectedExpenseIds.length > 0 && (
              <div className="flex items-center gap-2 mb-4 p-2 bg-muted rounded">
                <span className="text-sm">已选 {selectedExpenseIds.length} 项</span>
                <Button size="sm" onClick={() => batchLeaderApproveMut.mutate(selectedExpenseIds)} disabled={batchLeaderApproveMut.isPending}>批量领导审批</Button>
                <Button size="sm" onClick={() => batchFinanceApproveMut.mutate(selectedExpenseIds)} disabled={batchFinanceApproveMut.isPending}>批量财务审批</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedExpenseIds([])}>取消选择</Button>
              </div>
            )}

            {expenseLoading ? <Skeleton className="h-64 w-full" /> : (
              <>
                <Table>
                  <TableHeader><TableRow><TableHead className="w-10" /><TableHead>备用金编号</TableHead><TableHead>项目</TableHead><TableHead>支出日期</TableHead><TableHead>分类</TableHead><TableHead>金额</TableHead><TableHead>发票数</TableHead><TableHead>发票总额</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {expenseData?.items?.map((ex) => (
                      <TableRow key={ex.id}>
                        <TableCell>
                          {(ex.status === "submitted" || ex.status === "leader_approved") && (
                            <Checkbox checked={selectedExpenseIds.includes(ex.id)} onCheckedChange={() => toggleExpenseSelect(ex.id)} />
                          )}
                        </TableCell>
                        <TableCell>{ex.fund_no ?? ex.fund_id}</TableCell>
                        <TableCell>{ex.project_name ?? ex.project_id}</TableCell>
                        <TableCell>{ex.expense_date ? format(new Date(ex.expense_date), "yyyy-MM-dd") : ""}</TableCell>
                        <TableCell>{ex.category}</TableCell>
                        <TableCell>{ex.amount}</TableCell>
                        <TableCell>{ex.invoice_count}</TableCell>
                        <TableCell>{ex.invoice_total}</TableCell>
                        <TableCell><Badge variant={expenseStatusMap[ex.status]?.variant ?? "secondary"}>{expenseStatusMap[ex.status]?.label ?? ex.status}</Badge></TableCell>
                        <TableCell className="space-x-1">
                          {ex.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => openEditExpense(ex)}><Pencil className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => deleteExpenseMut.mutate(ex.id)}><Trash2 className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => submitExpenseMut.mutate(ex.id)}><Send className="h-3 w-3" /></Button>
                            </>
                          )}
                          {ex.status === "submitted" && (
                            <>
                              <span className="text-xs text-muted-foreground">等待领导审核</span>
                              <Button size="sm" variant="outline" onClick={() => leaderApproveMut.mutate(ex.id)}><CheckSquare className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => openReject(ex.id, "leader")}><XSquare className="h-3 w-3" /></Button>
                            </>
                          )}
                          {ex.status === "leader_approved" && (
                            <>
                              <span className="text-xs text-muted-foreground">等待财务审核</span>
                              <Button size="sm" variant="outline" onClick={() => financeApproveMut.mutate(ex.id)}><CheckSquare className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => openReject(ex.id, "finance")}><XSquare className="h-3 w-3" /></Button>
                            </>
                          )}
                          {ex.status === "rejected" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => { setViewRejectReason(ex.reject_reason ?? "无"); setViewRejectDialogOpen(true); }}><Eye className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => openEditExpense(ex)}><Pencil className="h-3 w-3" /></Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-end gap-2 mt-4">
                  <Button size="sm" variant="outline" disabled={expensePage <= 1} onClick={() => setExpensePage((p) => p - 1)}>上一页</Button>
                  <span className="text-sm text-muted-foreground">{expensePage}</span>
                  <Button size="sm" variant="outline" disabled={!expenseData || expenseData.items.length < 20} onClick={() => setExpensePage((p) => p + 1)}>下一页</Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="invoices">
            <div className="flex items-end gap-3 mb-4">
              <Button onClick={openCreateInvoice}><Plus className="mr-1 h-4 w-4" />手动录入</Button>
              <Button variant="outline" disabled={ocrLoading} onClick={() => ocrFileRef.current?.click()}>
                {ocrLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                {ocrLoading ? "识别中..." : "OCR上传"}
              </Button>
              <input ref={ocrFileRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleOcrFile} />
            </div>

            {invoiceLoading ? <Skeleton className="h-64 w-full" /> : (
              <>
                <Table>
                  <TableHeader><TableRow><TableHead>所属支出</TableHead><TableHead>发票类型</TableHead><TableHead>发票号码</TableHead><TableHead>开票日期</TableHead><TableHead>销方</TableHead><TableHead>金额</TableHead><TableHead>税额</TableHead><TableHead>价税合计</TableHead><TableHead>验真</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {invoiceData?.items?.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.expense_id}</TableCell>
                        <TableCell>{invoiceTypes.find((t) => t.value === inv.invoice_type)?.label ?? inv.invoice_type}</TableCell>
                        <TableCell>{inv.invoice_no}</TableCell>
                        <TableCell>{inv.invoice_date ? format(new Date(inv.invoice_date), "yyyy-MM-dd") : ""}</TableCell>
                        <TableCell>{inv.seller_name}</TableCell>
                        <TableCell>{inv.amount_without_tax}</TableCell>
                        <TableCell>{inv.tax_amount}</TableCell>
                        <TableCell>{inv.total_amount}</TableCell>
                        <TableCell><Badge variant={inv.is_verified ? "default" : "secondary"}>{inv.is_verified ? "已验真" : "未验真"}</Badge></TableCell>
                        <TableCell className="space-x-1">
                          <Button size="sm" variant="outline" onClick={() => openEditInvoice(inv)}><Pencil className="h-3 w-3" /></Button>
                          <Button size="sm" variant="outline" onClick={() => deleteInvoiceMut.mutate(inv.id)}><Trash2 className="h-3 w-3" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-end gap-2 mt-4">
                  <Button size="sm" variant="outline" disabled={invoicePage <= 1} onClick={() => setInvoicePage((p) => p - 1)}>上一页</Button>
                  <span className="text-sm text-muted-foreground">{invoicePage}</span>
                  <Button size="sm" variant="outline" disabled={!invoiceData || invoiceData.items.length < 20} onClick={() => setInvoicePage((p) => p + 1)}>下一页</Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={fundDialogOpen} onOpenChange={setFundDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新建备用金</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>项目ID</Label><Input value={fundForm.project_id} onChange={(e) => setFundForm((f) => ({ ...f, project_id: e.target.value }))} /></div>
            <div><Label>员工ID</Label><Input value={fundForm.employee_id} onChange={(e) => setFundForm((f) => ({ ...f, employee_id: e.target.value }))} /></div>
            <div><Label>金额</Label><Input type="number" value={fundForm.amount} onChange={(e) => setFundForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            <div><Label>用途</Label><Input value={fundForm.purpose} onChange={(e) => setFundForm((f) => ({ ...f, purpose: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>发放日期</Label><Input type="date" value={fundForm.issue_date} onChange={(e) => setFundForm((f) => ({ ...f, issue_date: e.target.value }))} /></div>
              <div><Label>预计归还</Label><Input type="date" value={fundForm.expected_return_date} onChange={(e) => setFundForm((f) => ({ ...f, expected_return_date: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundDialogOpen(false)}>取消</Button>
            <Button onClick={() => createFundMut.mutate({ ...fundForm, amount: Number(fundForm.amount) || 0 })} disabled={createFundMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{expenseEditId ? "编辑支出" : "新建支出"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>备用金</Label>
              <Select value={expenseForm.fund_id} onValueChange={(v) => setExpenseForm((f) => ({ ...f, fund_id: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择备用金" /></SelectTrigger>
                <SelectContent>
                  {fundData?.items?.filter((f) => f.status === "active").map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.fund_no} - {f.project_name ?? f.project_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>支出日期</Label><Input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm((f) => ({ ...f, expense_date: e.target.value }))} /></div>
            <div><Label>分类</Label>
              <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm((f) => ({ ...f, category: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                <SelectContent>{expenseCategories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>金额</Label><Input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            <div><Label>说明</Label><Textarea value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>取消</Button>
            <Button onClick={() => {
              const payload = { ...expenseForm, amount: Number(expenseForm.amount) || 0 };
              expenseEditId ? updateExpenseMut.mutate({ id: expenseEditId, ...payload }) : createExpenseMut.mutate(payload);
            }} disabled={createExpenseMut.isPending || updateExpenseMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{invoiceEditId ? "编辑发票" : "录入发票"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>支出ID</Label><Input value={invoiceForm.expense_id} onChange={(e) => setInvoiceForm((f) => ({ ...f, expense_id: e.target.value }))} /></div>
              <div><Label>备用金ID</Label><Input value={invoiceForm.fund_id} onChange={(e) => setInvoiceForm((f) => ({ ...f, fund_id: e.target.value }))} /></div>
            </div>
            <div><Label>发票类型</Label>
              <Select value={invoiceForm.invoice_type} onValueChange={(v) => setInvoiceForm((f) => ({ ...f, invoice_type: v ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
                <SelectContent>{invoiceTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>发票号码</Label><Input value={invoiceForm.invoice_no} onChange={(e) => setInvoiceForm((f) => ({ ...f, invoice_no: e.target.value }))} /></div>
              <div><Label>开票日期</Label><Input type="date" value={invoiceForm.invoice_date} onChange={(e) => setInvoiceForm((f) => ({ ...f, invoice_date: e.target.value }))} /></div>
            </div>
            <div><Label>销方名称</Label><Input value={invoiceForm.seller_name} onChange={(e) => setInvoiceForm((f) => ({ ...f, seller_name: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>金额(不含税)</Label><Input type="number" value={invoiceForm.amount_without_tax} onChange={(e) => setInvoiceForm((f) => ({ ...f, amount_without_tax: e.target.value }))} /></div>
              <div><Label>税额</Label><Input type="number" value={invoiceForm.tax_amount} onChange={(e) => setInvoiceForm((f) => ({ ...f, tax_amount: e.target.value }))} /></div>
              <div><Label>价税合计</Label><Input type="number" value={invoiceForm.total_amount} onChange={(e) => setInvoiceForm((f) => ({ ...f, total_amount: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>取消</Button>
            <Button onClick={() => {
              const payload = { ...invoiceForm, amount_without_tax: Number(invoiceForm.amount_without_tax) || 0, tax_amount: Number(invoiceForm.tax_amount) || 0, total_amount: Number(invoiceForm.total_amount) || 0 };
              invoiceEditId ? updateInvoiceMut.mutate({ id: invoiceEditId, ...payload }) : createInvoiceMut.mutate(payload);
            }} disabled={createInvoiceMut.isPending || updateInvoiceMut.isPending}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ocrDialogOpen} onOpenChange={setOcrDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>OCR识别结果</DialogTitle></DialogHeader>
          {ocrResult && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>发票类型</Label><Input value={String(ocrResult.invoice_type ?? "")} readOnly /></div>
                <div><Label>发票号码</Label><Input value={String(ocrResult.invoice_no ?? "")} readOnly /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>开票日期</Label><Input value={String(ocrResult.invoice_date ?? "")} readOnly /></div>
                <div><Label>销方名称</Label><Input value={String(ocrResult.seller_name ?? "")} readOnly /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>金额(不含税)</Label><Input value={String(ocrResult.amount_without_tax ?? "")} readOnly /></div>
                <div><Label>税额</Label><Input value={String(ocrResult.tax_amount ?? "")} readOnly /></div>
                <div><Label>价税合计</Label><Input value={String(ocrResult.total_amount ?? "")} readOnly /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOcrDialogOpen(false)}>取消</Button>
            <Button onClick={applyOcrResult}>确认并录入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>驳回原因</DialogTitle></DialogHeader>
          <div><Label>请输入驳回原因</Label><Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={!rejectReason.trim() || leaderRejectMut.isPending || financeRejectMut.isPending}>确认驳回</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewRejectDialogOpen} onOpenChange={setViewRejectDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>驳回原因</DialogTitle></DialogHeader>
          <div className="p-3 bg-muted rounded text-sm">{viewRejectReason}</div>
          <DialogFooter><Button onClick={() => setViewRejectDialogOpen(false)}>关闭</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
