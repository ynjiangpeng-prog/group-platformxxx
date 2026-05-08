import { useState, useRef, useMemo, useCallback, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Wand, Trash2, Link, Loader2, FileUp, Tag, GitBranch, CheckSquare, Filter, ChevronUp, ChevronDown, X, CreditCard, BookOpen, Plus } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as api from "@/api/finance";
import * as entityApi from "@/api/entity";
import * as projectApi from "@/api/project";
import * as erpApi from "@/api/erp";
import * as chargingApi from "@/api/charging";
import type { BankTransaction, AnnotationSuggestion } from "@/api/finance";
import type { FundFlowNode } from "@/api/finance";

const CardMode = lazy(() => import("./bank/CardMode"))
const RuleMode = lazy(() => import("./bank/RuleMode"))

type ViewMode = "table" | "card" | "rule"

const FUND_LEVEL_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "公户", color: "bg-blue-100 text-blue-700" },
  2: { label: "个人卡", color: "bg-orange-100 text-orange-700" },
  3: { label: "第三方", color: "bg-purple-100 text-purple-700" },
};

type SortKey = string;
type SortDir = "asc" | "desc";

export default function BankTransactionPage() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [entityId, setEntityId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tx_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // WPS-style column filters
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});

  // Import
  const [importOpen, setImportOpen] = useState(false);
  const [importEntityId, setImportEntityId] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; batch: string | null; linked?: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Match
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchTxId, setMatchTxId] = useState<string | null>(null);
  const [arapId, setArapId] = useState("");

  // Annotation
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotateTxId, setAnnotateTxId] = useState<string | null>(null);
  const [annExpenseType, setAnnExpenseType] = useState("");
  const [annExpenseSubtype, setAnnExpenseSubtype] = useState("");
  const [annProjectId, setAnnProjectId] = useState("");
  const [annContractId, setAnnContractId] = useState("");
  const [annRemark, setAnnRemark] = useState("");
  const [annIsProxy, setAnnIsProxy] = useState(false);
  const [annProxyEntityId, setAnnProxyEntityId] = useState("");
  const [annTaxBearer, setAnnTaxBearer] = useState("");
  const [annTaxAmount, setAnnTaxAmount] = useState("");
  const [annTaxRate, setAnnTaxRate] = useState("");
  const [annInvoiceAmount, setAnnInvoiceAmount] = useState("");
  const [annTaxLoss, setAnnTaxLoss] = useState("");
  const [suggestions, setSuggestions] = useState<AnnotationSuggestion[]>([]);

  // Batch
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAnnotateOpen, setBatchAnnotateOpen] = useState(false);

  // Fund flow
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowData, setFlowData] = useState<FundFlowNode[]>([]);

  // Contract filter
  const [showAllContracts, setShowAllContracts] = useState(false);

  // Data loading — fetch all at once (no pagination)
  const { data: entityData } = useQuery({ queryKey: ["entities-list"], queryFn: () => entityApi.listEntities({ page: 1, page_size: 100 }) });
  const entities = entityData?.items ?? [];

  const { data: expenseTypesData } = useQuery({ queryKey: ["bank-expense-types"], queryFn: api.listExpenseTypes });
  const expenseTypes = expenseTypesData ?? {};
  const expenseSubtypes = useMemo(() => {
    if (!annExpenseType || !expenseTypes[annExpenseType]) return [];
    return expenseTypes[annExpenseType];
  }, [annExpenseType, expenseTypes]);

  // 新增费用类型
  const [newTypeInput, setNewTypeInput] = useState("");
  const [showNewType, setShowNewType] = useState(false);
  const addTypeMut = useMutation({
    mutationFn: (name: string) => (import("@/lib/http")).then(({ post }) => post("/finance/bank/expense-types", { name })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-expense-types"] }); setNewTypeInput(""); setShowNewType(false); toast.success("类型已添加"); },
    onError: () => toast.error("添加失败"),
  });

  // 新增费用子项
  const [newSubInput, setNewSubInput] = useState("");
  const [showNewSub, setShowNewSub] = useState(false);
  const addSubMut = useMutation({
    mutationFn: ({ type, subtype }: { type: string; subtype: string }) => (import("@/lib/http")).then(({ post }) => post("/finance/bank/expense-types", { name: type, subtypes: [subtype] })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-expense-types"] }); setNewSubInput(""); setShowNewSub(false); toast.success("子项已添加"); },
    onError: () => toast.error("添加失败"),
  });

  const { data: projectData } = useQuery({ queryKey: ["projects-list-short"], queryFn: () => projectApi.listProjects({ page: 1, page_size: 200 }) });
  const projects = projectData?.items ?? [];

  const { data: contractData } = useQuery({ queryKey: ["contracts-list-short"], queryFn: () => erpApi.listContracts({ page: 1, page_size: 200 }) });
  const contracts = contractData?.items ?? [];
  const filteredContracts = useMemo(() => {
    if (showAllContracts || !annProjectId) return contracts;
    return contracts.filter((c: any) => !c.project_id || c.project_id === annProjectId);
  }, [contracts, annProjectId, showAllContracts]);

  const { data: stationData } = useQuery({ queryKey: ["stations-list-short"], queryFn: () => chargingApi.listStations({ page: 1, page_size: 200 }) });
  const stations = stationData?.items ?? [];

  const { data: fleetData } = useQuery({ queryKey: ["fleet-customers-short"], queryFn: () => chargingApi.listFleetCustomers({ page: 1, page_size: 200 }) });
  const fleetCustomers = fleetData?.items ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["bank-transactions", { entity_id: entityId || undefined }],
    queryFn: () => api.listBankTransactions({ page: 1, page_size: 500, ...(entityId ? { entity_id: entityId } : {}) }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const rawItems: BankTransaction[] = data?.items ?? [];

  // Apply keyword search + date range + column filters + sorting — all client-side
  const items = useMemo(() => {
    let filtered = rawItems;

    // Keyword
    if (keyword) {
      const kw = keyword.toLowerCase();
      filtered = filtered.filter((tx) =>
        [tx.counterparty, tx.summary, tx.remark, tx.account_name, tx.source_ref, tx.counterparty_account]
          .some((f) => f?.toLowerCase().includes(kw))
      );
    }

    // Date range
    if (startDate) filtered = filtered.filter((tx) => tx.tx_date >= startDate);
    if (endDate) filtered = filtered.filter((tx) => tx.tx_date <= endDate);

    // Column filters
    for (const [col, vals] of Object.entries(colFilters)) {
      if (vals.length === 0) continue;
      filtered = filtered.filter((tx) => {
        const v = getCellValue(tx, col);
        return vals.includes(v);
      });
    }

    // Sort — use getCellValue for all columns
    const col = sortKey;
    filtered = [...filtered].sort((a, b) => {
      let va: any, vb: any;
      // Numeric columns
      if (col === "tx_amount") { va = a.tx_amount; vb = b.tx_amount; }
      else if (col === "balance") { va = a.balance ?? 0; vb = b.balance ?? 0; }
      else { va = getCellValue(a, col); vb = getCellValue(b, col); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [rawItems, keyword, startDate, endDate, colFilters, sortKey, sortDir]);

  // Mutations
  const fileImportMut = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData()
      fd.append("file", f)
      const url = importEntityId ? `/finance/bank/import-file?entity_id=${importEntityId}` : "/finance/bank/import-file"
      const { post } = await import("@/lib/http")
      return post<{ imported: number; skipped: number; batch: string | null; linked?: number }>(url, fd)
    },
    onSuccess: (res) => {
      setImportResult(res)
      if (res.imported > 0) toast.success(`已导入 ${res.imported} 条${res.skipped > 0 ? `，跳过 ${res.skipped} 条重复` : ""}${res.linked ? `，自动关联 ${res.linked} 条穿透链路` : ""}`)
      else toast.info("所有记录均已存在，无新导入")
      // 延迟刷新避免弹窗卡顿
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["bank-transactions"] })
      }, 800)
    },
  });

  const autoMatchMut = useMutation({
    mutationFn: api.autoMatchBank,
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["bank-transactions"] }); toast.success(`已匹配 ${res.matched} 条`); },
  });

  const manualMatchMut = useMutation({
    mutationFn: ({ txId, arapId }: { txId: string; arapId: string }) => api.manualMatchBank(txId, arapId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bank-transactions"] }); toast.success("已匹配"); setMatchOpen(false); setMatchTxId(null); setArapId(""); },
  });

  const deleteMut = useMutation({
    mutationFn: api.deleteBankTransaction,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["cross-entity-flow"] });
      toast.success("已删除" + (res.reversed?.length ? `\n${res.reversed.join("\n")}` : ""));
    },
  });

  const annotateMut = useMutation({
    mutationFn: ({ txId, data }: { txId: string; data: Parameters<typeof api.annotateBankTx>[1] }) => api.annotateBankTx(txId, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["cross-entity-flow"] });
      if (res.synced?.length) {
        toast.success("标注成功\n" + res.synced.join("\n"), { duration: 5000 });
      } else {
        toast.success("标注成功");
      }
      setAnnotateOpen(false);
    },
  });

  const batchAnnotateMut = useMutation({
    mutationFn: api.batchAnnotateBankTx,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast.success(`已批量标注 ${res.updated} 条`);
      setBatchAnnotateOpen(false);
      setSelectedIds(new Set());
    },
  });

  const fundFlowMut = useMutation({
    mutationFn: api.getFundFlow,
    onSuccess: (res) => { setFlowData(res.chain); setFlowOpen(true); },
  });

  function openManualMatch(txId: string) { setMatchTxId(txId); setArapId(""); setMatchOpen(true); }

  function openAnnotate(tx: BankTransaction) {
    setAnnotateTxId(tx.id);
    setAnnExpenseType(tx.expense_type ?? "");
    setAnnExpenseSubtype(tx.expense_subtype ?? "");
    setAnnProjectId(tx.project_id ?? "");
    setAnnContractId(tx.contract_id ?? "");
    setAnnRemark(tx.remark ?? "");
    setAnnIsProxy(tx.is_proxy_payment ?? false);
    setAnnProxyEntityId(tx.proxy_for_entity_id ?? "");
    setAnnTaxBearer(tx.tax_bearer ?? "");
    setAnnTaxAmount(tx.tax_amount?.toString() ?? "");
    setAnnTaxRate(tx.tax_rate?.toString() ?? "");
    setAnnInvoiceAmount(tx.invoice_amount?.toString() ?? "");
    setAnnTaxLoss(tx.tax_loss?.toString() ?? "");
    setSuggestions([]);
    setAnnotateOpen(true);
    api.suggestAnnotation(tx.id).then(res => setSuggestions(res.suggestions ?? [])).catch(() => {});
  }

  function openBatchAnnotate() {
    setAnnExpenseType(""); setAnnExpenseSubtype(""); setAnnProjectId(""); setAnnContractId(""); setAnnRemark("");
    setBatchAnnotateOpen(true);
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 text-muted-foreground/40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  if (isLoading) return <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>;

  // Stats
  const totalIncome = items.reduce((s, t) => s + (t.tx_amount > 0 ? t.tx_amount : 0), 0);
  const totalExpense = items.reduce((s, t) => s + (t.tx_amount < 0 ? Math.abs(t.tx_amount) : 0), 0);

  // Tab view modes
  if (viewMode === "card") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">银行流水</h1>
          <div className="flex gap-1 border rounded-lg p-1 ml-4">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("table")}>表格</Button>
            <Button variant="default" size="sm"><CreditCard className="size-3.5 mr-1" />卡片标注</Button>
            <Button variant="ghost" size="sm" onClick={() => setViewMode("rule")}>规则管理</Button>
          </div>
        </div>
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin" /></div>}>
          <CardMode />
        </Suspense>
      </div>
    )
  }

  if (viewMode === "rule") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">银行流水</h1>
          <div className="flex gap-1 border rounded-lg p-1 ml-4">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("table")}>表格</Button>
            <Button variant="ghost" size="sm" onClick={() => setViewMode("card")}>卡片标注</Button>
            <Button variant="default" size="sm"><BookOpen className="size-3.5 mr-1" />规则管理</Button>
          </div>
        </div>
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin" /></div>}>
          <RuleMode />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">银行流水</h1>
          <div className="flex gap-1 border rounded-lg p-1 ml-4">
            <Button variant="default" size="sm">表格</Button>
            <Button variant="ghost" size="sm" onClick={() => setViewMode("card")}><CreditCard className="size-3.5 mr-1" />卡片标注</Button>
            <Button variant="ghost" size="sm" onClick={() => setViewMode("rule")}><BookOpen className="size-3.5 mr-1" />规则管理</Button>
          </div>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={openBatchAnnotate}>
              <CheckSquare className="mr-1 h-4 w-4" />批量标注({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" />导入</Button>
          <Button variant="outline" onClick={() => autoMatchMut.mutate()} disabled={autoMatchMut.isPending}><Wand className="mr-1 h-4 w-4" />自动匹配</Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-[320px]">
          <Label className="text-xs text-muted-foreground">搜索</Label>
          <div className="flex gap-1">
            <Input placeholder="对手名/摘要/备注/账号..." value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setKeyword(keywordInput); } }} className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setKeyword(keywordInput)}>搜索</Button>
            {keyword && <Button size="sm" variant="ghost" onClick={() => { setKeyword(""); setKeywordInput(""); }}><X className="h-3 w-3" /></Button>}
          </div>
        </div>
        <div><Label className="text-xs text-muted-foreground">起始</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[130px]" /></div>
        <div><Label className="text-xs text-muted-foreground">截止</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[130px]" /></div>
        <div>
          <Label className="text-xs text-muted-foreground">公司主体</Label>
          <Select value={entityId} onValueChange={(v) => { setEntityId(v === "all" || v === null ? "" : v) }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="全部主体" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部主体</SelectItem>
              {entities.map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.entity_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Active filter tags */}
        {(startDate || endDate || keyword || entityId || Object.keys(colFilters).some(k => colFilters[k].length > 0)) && (
          <Button variant="ghost" size="sm" onClick={() => { setStartDate(""); setEndDate(""); setKeyword(""); setKeywordInput(""); setEntityId(""); setColFilters({}); }}>
            <X className="h-3 w-3 mr-1" />清除筛选
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <span>共 <b>{items.length}</b> 条</span>
        <span className="text-green-600">收入 <b>{totalIncome.toLocaleString("zh-CN", { style: "currency", currency: "CNY" })}</b></span>
        <span className="text-red-600">支出 <b>{totalExpense.toLocaleString("zh-CN", { style: "currency", currency: "CNY" })}</b></span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36px] sticky left-0 bg-background z-10">
                    <Checkbox checked={!!items.length && items.every((tx) => selectedIds.has(tx.id))}
                      onCheckedChange={(v) => { if (v) setSelectedIds(new Set(items.map((tx) => tx.id))); else setSelectedIds(new Set()); }} />
                  </TableHead>
                  <FilterableHeader col="fund_level" label="层级" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("fund_level")} sortIcon={<SortIcon col="fund_level" />} />
                  <FilterableHeader col="tx_date" label="交易日期" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("tx_date")} sortIcon={<SortIcon col="tx_date" />} />
                  <FilterableHeader col="account_name" label="账户" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("account_name")} sortIcon={<SortIcon col="account_name" />} />
                  <FilterableHeader col="counterparty" label="交易对手" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("counterparty")} sortIcon={<SortIcon col="counterparty" />} />
                  <FilterableHeader col="summary" label="摘要" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("summary")} sortIcon={<SortIcon col="summary" />} />
                  <FilterableHeader col="purpose" label="用途" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("purpose")} sortIcon={<SortIcon col="purpose" />} />
                  <FilterableHeader col="remark" label="备注" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("remark")} sortIcon={<SortIcon col="remark" />} />
                  <FilterableHeader col="tx_amount_dir" label="收入" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("tx_amount")} sortIcon={<SortIcon col="tx_amount" />} />
                  <FilterableHeader col="tx_amount_dir" label="支出" items={rawItems} filters={colFilters} onFilter={setColFilters} />
                  <FilterableHeader col="balance" label="余额" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("balance")} sortIcon={<SortIcon col="balance" />} />
                  <FilterableHeader col="expense_type" label="费用类型" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("expense_type")} sortIcon={<SortIcon col="expense_type" />} />
                  <FilterableHeader col="project_id" label="关联项目" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("project_id")} sortIcon={<SortIcon col="project_id" />} />
                  <FilterableHeader col="matched" label="匹配" items={rawItems} filters={colFilters} onFilter={setColFilters} onSort={() => toggleSort("matched")} sortIcon={<SortIcon col="matched" />} />
                  <TableHead className="w-[100px] sticky right-0 bg-background z-10">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((tx) => {
                  const fl = tx.fund_level ?? 1;
                  const flInfo = FUND_LEVEL_LABELS[fl] ?? FUND_LEVEL_LABELS[1];
                  const proj = projects.find((p: any) => p.id === tx.project_id);
                  return (
                    <TableRow key={tx.id} className={selectedIds.has(tx.id) ? "bg-muted/50" : ""}>
                      <TableCell className="sticky left-0 bg-background">
                        <Checkbox checked={selectedIds.has(tx.id)} onCheckedChange={() => toggleSelect(tx.id)} />
                      </TableCell>
                      <TableCell><Badge variant="outline" className={flInfo.color}>{flInfo.label}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap">{tx.tx_date ? format(new Date(tx.tx_date), "yyyy-MM-dd") : ""}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{tx.account_name ?? ""}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{tx.counterparty ?? ""}</TableCell>
                      <TableCell className="max-w-[100px] truncate text-xs text-muted-foreground">{tx.summary ?? ""}</TableCell>
                      <TableCell className="max-w-[60px] truncate text-xs text-blue-600">{tx.purpose ?? ""}</TableCell>
                      <TableCell className="max-w-[100px] truncate text-xs text-orange-600">{tx.remark ?? ""}</TableCell>
                      <TableCell className={tx.tx_amount > 0 ? "text-green-600 whitespace-nowrap" : ""}>{tx.tx_amount > 0 ? tx.tx_amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : ""}</TableCell>
                      <TableCell className={tx.tx_amount < 0 ? "text-red-600 whitespace-nowrap" : ""}>{tx.tx_amount < 0 ? Math.abs(tx.tx_amount).toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : ""}</TableCell>
                      <TableCell className="whitespace-nowrap">{tx.balance?.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) ?? ""}</TableCell>
                      <TableCell>{tx.expense_type ? <span className="text-xs">{tx.expense_type}{tx.expense_subtype ? `/${tx.expense_subtype}` : ""}</span> : ""}</TableCell>
                      <TableCell className="max-w-[80px] truncate">{proj?.name ?? ""}</TableCell>
                      <TableCell>{tx.matched ? <Badge variant="secondary" className="text-xs">已匹配</Badge> : <Badge variant="outline" className="text-xs">-</Badge>}</TableCell>
                      <TableCell className="sticky right-0 bg-background">
                        <div className="flex gap-0.5">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openAnnotate(tx)} title="标注"><Tag className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => fundFlowMut.mutate(tx.id)} title="穿透"><GitBranch className="h-3 w-3" /></Button>
                          {!tx.matched && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openManualMatch(tx.id)} title="匹配"><Link className="h-3 w-3" /></Button>}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteMut.mutate(tx.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) setImportResult(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>导入银行流水</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">支持：招商银行CSV、兴业银行XLS/XLSX、中国银行CSV、微信支付账单、其他银行流水</p>
            <div>
              <Label>归属主体</Label>
              <Select value={importEntityId} onValueChange={(v) => { if (v) setImportEntityId(v) }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="选择公司主体（可选）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不指定</SelectItem>
                  {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.entity_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors" onClick={() => fileRef.current?.click()}>
              <FileUp className="size-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">点击选择文件或拖拽文件到此处</p>
              <p className="text-xs text-muted-foreground mt-1">.csv / .xls / .xlsx</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) fileImportMut.mutate(f); e.target.value = ""; }} />
            {fileImportMut.isPending && <div className="flex justify-center py-4"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
            {importResult && (
              <div className="border rounded-lg p-4 space-y-1">
                <p className="font-medium">导入结果</p>
                <p className="text-sm">新增: <span className="font-medium text-green-600">{importResult.imported}</span> 条</p>
                <p className="text-sm">跳过: <span className="font-medium text-orange-600">{importResult.skipped}</span> 条</p>
                {importResult.linked ? <p className="text-sm">穿透关联: <span className="font-medium text-blue-600">{importResult.linked}</span> 条</p> : null}
                {importResult.batch && <p className="text-sm text-muted-foreground">批次号: {importResult.batch}</p>}
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setImportOpen(false); setImportResult(null) }}>关闭</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Match Dialog */}
      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>手动匹配</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>应收应付ID</Label><Input value={arapId} onChange={(e) => setArapId(e.target.value)} placeholder="输入arap_id" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchOpen(false)}>取消</Button>
            <Button onClick={() => matchTxId && arapId && manualMatchMut.mutate({ txId: matchTxId, arapId })} disabled={manualMatchMut.isPending || !arapId}>匹配</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Annotate Dialog */}
      <Dialog open={annotateOpen} onOpenChange={setAnnotateOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>标注流水</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            {suggestions.length > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">检测到可能的用途：</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s, i) => (
                    <Button key={i} variant="outline" size="sm" className="text-xs" onClick={() => {
                      setAnnExpenseType(s.expense_type); setAnnExpenseSubtype("");
                      if (s.project_id) setAnnProjectId(s.project_id);
                    }}>{s.label}</Button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>费用类型</Label>
              <div className="flex gap-1">
                <Select value={annExpenseType} onValueChange={(v) => { if (v) setAnnExpenseType(v); setAnnExpenseSubtype(""); }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="选择费用大类" /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(expenseTypes).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    <SelectItem value="__new__" className="text-primary font-medium">+ 新增类型...</SelectItem>
                  </SelectContent>
                </Select>
                {annExpenseType === "__new__" && (
                  <div className="flex gap-1 flex-1">
                    <Input placeholder="输入新类型名" value={newTypeInput} onChange={(e) => setNewTypeInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && newTypeInput.trim()) addTypeMut.mutate(newTypeInput.trim()) }}
                      className="flex-1" autoFocus />
                    <Button size="sm" disabled={!newTypeInput.trim() || addTypeMut.isPending}
                      onClick={() => { if (newTypeInput.trim()) { addTypeMut.mutate(newTypeInput.trim()); setAnnExpenseType(newTypeInput.trim()); } }}>
                      {addTypeMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "添加"}
                    </Button>
                  </div>
                )}
                {annExpenseType !== "__new__" && (
                  <Button size="sm" variant="outline" onClick={() => { setShowNewType(true); setAnnExpenseType("__new__"); }} title="新增类型">
                    <Plus className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {annExpenseType && annExpenseType !== "__new__" && (
              <div><Label>费用子类</Label>
                <div className="flex gap-1">
                  <Select value={annExpenseSubtype} onValueChange={(v: string | null) => { if (v === "__new__") { setShowNewSub(true); } else if (v) setAnnExpenseSubtype(v); }}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="选择子类" /></SelectTrigger>
                    <SelectContent>
                      {expenseSubtypes.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      <SelectItem value="__new__" className="text-primary font-medium">+ 新增子项...</SelectItem>
                    </SelectContent>
                  </Select>
                  {showNewSub && (
                    <div className="flex gap-1 flex-1">
                      <Input placeholder="输入新子项名" value={newSubInput} onChange={(e) => setNewSubInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && newSubInput.trim()) { addSubMut.mutate({ type: annExpenseType, subtype: newSubInput.trim() }); setAnnExpenseSubtype(newSubInput.trim()); } }}
                        className="flex-1" autoFocus />
                      <Button size="sm" disabled={!newSubInput.trim() || addSubMut.isPending}
                        onClick={() => { if (newSubInput.trim()) { addSubMut.mutate({ type: annExpenseType, subtype: newSubInput.trim() }); setAnnExpenseSubtype(newSubInput.trim()); } }}>
                        {addSubMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "添加"}
                      </Button>
                    </div>
                  )}
                  {!showNewSub && (
                    <Button size="sm" variant="outline" onClick={() => setShowNewSub(true)} title="新增子项">
                      <Plus className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
            {annExpenseType === "电费" && stations.length > 0 && (
              <div><Label>充电站</Label>
                <Select value="" onValueChange={(v) => { if (v) { const st = stations.find((s: any) => s.id === v); if (st) setAnnProjectId(st.project_id ?? ""); } }}>
                  <SelectTrigger><SelectValue placeholder="选择充电站（自动关联项目）" /></SelectTrigger>
                  <SelectContent>{stations.filter((s: any) => !s.is_deleted).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}{s.electricity_payee ? ` (${s.electricity_payee})` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {annExpenseType === "车队收款" && fleetCustomers.length > 0 && (
              <div><Label>车队客户</Label>
                <Select value="" onValueChange={() => {}}>
                  <SelectTrigger><SelectValue placeholder="选择车队客户" /></SelectTrigger>
                  <SelectContent>{fleetCustomers.filter((f: any) => !f.is_deleted).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.fleet_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div><Label>关联项目</Label>
              <Select value={annProjectId} onValueChange={(v) => { if (v !== null) setAnnProjectId(v) }}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不指定</SelectItem>
                  {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.project_code} {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>关联合同</Label>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <input type="checkbox" checked={showAllContracts} onChange={(e) => setShowAllContracts(e.target.checked)} className="size-3" />显示全部
                </label>
              </div>
              <Select value={annContractId} onValueChange={(v) => { if (v !== null) setAnnContractId(v) }}>
                <SelectTrigger><SelectValue placeholder="选择合同" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不指定</SelectItem>
                  {filteredContracts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.contract_no} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>备注</Label><Textarea value={annRemark} onChange={(e) => setAnnRemark(e.target.value)} placeholder="备注信息" rows={2} /></div>
            <div className="border-t pt-3 space-y-3">
              <Label className="text-base font-medium">代收代付 / 税务</Label>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={annIsProxy} onChange={(e) => setAnnIsProxy(e.target.checked)} className="size-4" />
                <Label className="text-sm">代收代付</Label>
              </div>
              {annIsProxy && (
                <>
                  <div><Label>代收付对象</Label>
                    <Select value={annProxyEntityId} onValueChange={(v) => { if (v !== null) setAnnProxyEntityId(v) }}>
                      <SelectTrigger><SelectValue placeholder="选择代收付对象" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">不指定</SelectItem>
                        {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.entity_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>税务承担方</Label>
                    <Select value={annTaxBearer} onValueChange={(v) => { if (v) setAnnTaxBearer(v) }}>
                      <SelectTrigger><SelectValue placeholder="选择承担方" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">本公司承担</SelectItem>
                        {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.entity_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>开票金额</Label><Input type="number" value={annInvoiceAmount} onChange={(e) => setAnnInvoiceAmount(e.target.value)} placeholder="0.00" /></div>
                <div><Label>税额</Label><Input type="number" value={annTaxAmount} onChange={(e) => setAnnTaxAmount(e.target.value)} placeholder="0.00" /></div>
                <div><Label>税率(%)</Label><Input type="number" step="0.01" value={annTaxRate} onChange={(e) => setAnnTaxRate(e.target.value)} placeholder="6, 9, 13..." /></div>
                <div><Label>税务损失</Label><Input type="number" value={annTaxLoss} onChange={(e) => setAnnTaxLoss(e.target.value)} placeholder="0.00" /></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnotateOpen(false)}>取消</Button>
            <Button onClick={() => annotateTxId && annotateMut.mutate({
              txId: annotateTxId, data: {
                expense_type: annExpenseType || undefined, expense_subtype: annExpenseSubtype || undefined,
                project_id: annProjectId || undefined, contract_id: annContractId || undefined, remark: annRemark || undefined,
                is_proxy_payment: annIsProxy || undefined, proxy_for_entity_id: annProxyEntityId || undefined,
                tax_bearer: annTaxBearer || undefined, tax_amount: annTaxAmount ? Number(annTaxAmount) : undefined,
                tax_rate: annTaxRate ? Number(annTaxRate) : undefined, invoice_amount: annInvoiceAmount ? Number(annInvoiceAmount) : undefined,
                tax_loss: annTaxLoss ? Number(annTaxLoss) : undefined,
              }
            })} disabled={annotateMut.isPending}>保存标注</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Annotate Dialog */}
      <Dialog open={batchAnnotateOpen} onOpenChange={setBatchAnnotateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>批量标注 ({selectedIds.size} 条)</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>费用类型</Label>
              <div className="flex gap-1">
                <Select value={annExpenseType} onValueChange={(v) => { if (v === "__new__") { setShowNewType(true); } else { if (v) setAnnExpenseType(v); setAnnExpenseSubtype(""); } }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="选择费用大类" /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(expenseTypes).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    <SelectItem value="__new__" className="text-primary font-medium">+ 新增类型...</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => setShowNewType(true)} title="新增类型"><Plus className="size-3.5" /></Button>
              </div>
              {showNewType && (
                <div className="flex gap-1 mt-1">
                  <Input placeholder="输入新类型名" value={newTypeInput} onChange={(e) => setNewTypeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newTypeInput.trim()) { addTypeMut.mutate(newTypeInput.trim()); setAnnExpenseType(newTypeInput.trim()); } }}
                    className="flex-1" autoFocus />
                  <Button size="sm" disabled={!newTypeInput.trim() || addTypeMut.isPending}
                    onClick={() => { if (newTypeInput.trim()) { addTypeMut.mutate(newTypeInput.trim()); setAnnExpenseType(newTypeInput.trim()); } }}>
                    {addTypeMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "添加"}
                  </Button>
                </div>
              )}
            </div>
            <div><Label>关联项目</Label>
              <Select value={annProjectId} onValueChange={(v) => { if (v !== null) setAnnProjectId(v) }}>
                <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不指定</SelectItem>
                  {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.project_code} {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>关联合同</Label>
              <Select value={annContractId} onValueChange={(v) => { if (v !== null) setAnnContractId(v) }}>
                <SelectTrigger><SelectValue placeholder="选择合同" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不指定</SelectItem>
                  {filteredContracts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.contract_no} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>备注</Label><Textarea value={annRemark} onChange={(e) => setAnnRemark(e.target.value)} placeholder="备注信息" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchAnnotateOpen(false)}>取消</Button>
            <Button onClick={() => batchAnnotateMut.mutate({
              ids: Array.from(selectedIds), expense_type: annExpenseType || undefined,
              project_id: annProjectId || undefined, contract_id: annContractId || undefined, remark: annRemark || undefined,
            })} disabled={batchAnnotateMut.isPending}>批量标注</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fund Flow Dialog */}
      <Dialog open={flowOpen} onOpenChange={setFlowOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>穿透链路</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {flowData.length === 0 && <p className="text-sm text-muted-foreground">无穿透关联记录</p>}
            {flowData.map((node) => <FundFlowTreeNode key={node.id} node={node} />)}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFlowOpen(false)}>关闭</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers ───

function getCellValue(tx: BankTransaction, col: string): string {
  switch (col) {
    case "tx_date": return tx.tx_date ?? "";
    case "account_name": return tx.account_name ?? "";
    case "counterparty": return tx.counterparty ?? "";
    case "summary": return tx.summary ?? "";
    case "purpose": return tx.purpose ?? "";
    case "remark": return tx.remark ?? "";
    case "fund_level": return String(tx.fund_level ?? 1);
    case "expense_type": return tx.expense_type ? `${tx.expense_type}${tx.expense_subtype ? "/" + tx.expense_subtype : ""}` : "";
    case "project_id": return tx.project_id ?? "";
    case "tx_amount_dir": return tx.tx_amount >= 0 ? "收入" : "支出";
    case "balance": return tx.balance?.toString() ?? "";
    case "matched": return tx.matched ? "已匹配" : "未匹配";
    default: return "";
  }
}

function getUniqueValues(items: BankTransaction[], col: string): string[] {
  const set = new Set<string>();
  for (const tx of items) set.add(getCellValue(tx, col));
  return Array.from(set).sort();
}

// WPS-style filterable header with sort
function FilterableHeader({ col, label, items, filters, onFilter, onSort, sortIcon }: {
  col: string; label: string; items: BankTransaction[];
  filters: Record<string, string[]>; onFilter: (f: Record<string, string[]>) => void;
  onSort?: () => void; sortIcon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [uniqueVals, setUniqueVals] = useState<string[]>([]);
  const selected = filters[col] ?? [];
  const hasFilter = selected.length > 0;

  // 懒计算：只在 Popover 打开时计算筛选列表，避免每次数据变化都遍历1000+条
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setUniqueVals(getUniqueValues(items, col));
    }, 0);
    return () => clearTimeout(timer);
  }, [open, items, col]);

  const toggleVal = (val: string) => {
    const next = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val];
    onFilter({ ...filters, [col]: next });
  };

  const clearFilter = () => {
    const next = { ...filters };
    delete next[col];
    onFilter(next);
  };

  return (
    <TableHead>
      <div className="inline-flex items-center gap-1">
        {onSort ? (
          <span className="cursor-pointer select-none inline-flex items-center gap-0.5" onClick={onSort}>{label}{sortIcon}</span>
        ) : label}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            className={`p-0.5 rounded hover:bg-muted ${hasFilter ? "text-primary" : "text-muted-foreground/50"}`}
          >
            <Filter className="h-3 w-3" />
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0" align="start">
            <div className="p-2 border-b flex items-center justify-between">
              <span className="text-xs font-medium">{label} 筛选</span>
              {hasFilter && <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={clearFilter}>清除</Button>}
            </div>
            <div className="max-h-[300px] overflow-y-auto p-1">
              {uniqueVals.length === 0 && open ? (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">加载中...</div>
              ) : (
                uniqueVals.map((val) => (
                  <label key={val} className="flex items-center gap-2 px-2 py-1 hover:bg-muted rounded cursor-pointer text-sm">
                    <Checkbox checked={selected.length === 0 || selected.includes(val)} onCheckedChange={() => toggleVal(val)} className="size-3.5" />
                    <span className="truncate">{val || "(空)"}</span>
                  </label>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TableHead>
  );
}

function FundFlowTreeNode({ node, depth = 0 }: { node: FundFlowNode; depth?: number }) {
  const fl = node.fund_level ?? 1;
  const flInfo = FUND_LEVEL_LABELS[fl] ?? FUND_LEVEL_LABELS[1];
  return (
    <div style={{ marginLeft: depth * 24 }}>
      <div className="flex items-center gap-2 border rounded-lg p-2 text-sm">
        <Badge variant="outline" className={flInfo.color}>{flInfo.label}</Badge>
        <span className="text-muted-foreground">{node.tx_date}</span>
        <span className={node.tx_amount > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
          {node.tx_amount > 0 ? "+" : ""}{node.tx_amount}
        </span>
        <span className="truncate max-w-[120px]">{node.counterparty ?? node.summary ?? ""}</span>
        {node.account_name && <span className="text-xs text-muted-foreground">({node.account_name})</span>}
      </div>
      {node.children?.map((child) => (
        <div key={child.id} className="relative ml-3 border-l-2 border-muted pl-2">
          <FundFlowTreeNode node={child} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}
