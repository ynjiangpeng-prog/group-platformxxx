import { useState, useCallback, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ChevronLeft, ChevronRight, SkipForward, Save, Loader2,
  ArrowRight, Plus, Zap, Building2, Tag, FileText, Bookmark
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  listUnannotatedTransactions,
  annotateCard,
  getExpenseTypes,
  addExpenseType,
  type UnannotatedTransaction,
} from "@/api/annotationRules"
import { listProjects, createProject } from "@/api/project"
import { listEntities } from "@/api/entity"

function fmtCurrency(v: number) {
  const prefix = v >= 0 ? "+" : ""
  return prefix + "¥" + Math.abs(v).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function TransactionCard({ tx, entities }: { tx: UnannotatedTransaction; entities: any[] }) {
  const entityName = tx.entity_id
    ? entities.find((e: any) => e.id === tx.entity_id)?.entity_name
    : null
  const isIncome = tx.tx_amount >= 0

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 ${isIncome ? "bg-green-500" : "bg-red-500"}`} />
      <CardContent className="pt-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className={`text-3xl font-bold ${isIncome ? "text-green-600" : "text-red-600"}`}>
              {isIncome ? "+" : ""}¥{Math.abs(tx.tx_amount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{tx.tx_date}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={isIncome ? "default" : "secondary"}>{isIncome ? "收入" : "支出"}</Badge>
            {entityName && <span className="text-xs text-muted-foreground">{entityName}</span>}
            {tx.fund_level != null && (
              <Badge variant="outline" className="text-[10px]">L{tx.fund_level}</Badge>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          {tx.counterparty && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-16 shrink-0">对方</span>
              <span className="font-medium truncate">{tx.counterparty}</span>
            </div>
          )}
          {tx.summary && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-16 shrink-0">摘要</span>
              <span className="truncate">{tx.summary}</span>
            </div>
          )}
          {tx.purpose && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-16 shrink-0">用途</span>
              <span className="truncate">{tx.purpose}</span>
            </div>
          )}
          {tx.account_name && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-16 shrink-0">账户</span>
              <span className="truncate text-muted-foreground">{tx.account_name}</span>
            </div>
          )}
          {tx.balance != null && tx.balance !== 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-16 shrink-0">余额</span>
              <span className="text-muted-foreground">¥{Number(tx.balance).toLocaleString()}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function CardMode() {
  const qc = useQueryClient()
  const [offset, setOffset] = useState(0)
  const [idx, setIdx] = useState(0)
  const [form, setForm] = useState({
    expense_type: "", expense_subtype: "", project_id: "",
    quickProjectName: "", remark: "", createRule: false,
  })
  const [creatingProject, setCreatingProject] = useState(false)
  const [newTypeInput, setNewTypeInput] = useState("")
  const [newSubInput, setNewSubInput] = useState("")
  const [showNewType, setShowNewType] = useState(false)
  const [showNewSub, setShowNewSub] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["unannotated-tx", offset],
    queryFn: () => listUnannotatedTransactions({ offset, limit: 50 }),
  })

  const { data: expenseTypes } = useQuery({
    queryKey: ["expense-types"],
    queryFn: getExpenseTypes,
  })

  const types = expenseTypes ?? {}

  const addTypeMut = useMutation({
    mutationFn: (name: string) => addExpenseType({ name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expense-types"] }); setNewTypeInput(""); setShowNewType(false); toast.success("类型已添加"); },
    onError: () => toast.error("添加失败"),
  })
  const addSubMut = useMutation({
    mutationFn: ({ type, subtype }: { type: string; subtype: string }) => addExpenseType({ name: type, subtypes: [subtype] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expense-types"] }); setNewSubInput(""); setShowNewSub(false); toast.success("子项已添加"); },
    onError: () => toast.error("添加失败"),
  })

  const { data: projectsData } = useQuery({
    queryKey: ["projects-quick"],
    queryFn: () => listProjects({ page: 1, page_size: 200 }),
  })

  const { data: entitiesData } = useQuery({
    queryKey: ["entities-quick"],
    queryFn: () => listEntities({ page: 1, page_size: 100 }),
  })

  const projects = projectsData?.items ?? []
  const entities = entitiesData?.items ?? []
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const currentTx = items[idx]

  const annotateMut = useMutation({
    mutationFn: () => {
      if (!currentTx) return Promise.reject()
      return annotateCard(currentTx.id, {
        expense_type: form.expense_type || undefined,
        expense_subtype: form.expense_subtype || undefined,
        project_id: form.project_id || undefined,
        quick_project_name: !form.project_id && form.quickProjectName ? form.quickProjectName : undefined,
        remark: form.remark || undefined,
        create_rule_from_this: form.createRule,
      })
    },
    onSuccess: (res) => {
      const msgs = ["标注成功"]
      if (res?.project_id) msgs.push("已创建项目")
      if (res?.rule_id) msgs.push("已保存为规则")
      toast.success(msgs.join("，"))
      setForm((f) => ({ ...f, expense_type: "", expense_subtype: "", project_id: "", quickProjectName: "", remark: "", createRule: false }))
      // Move to next
      if (idx < items.length - 1) {
        setIdx((i) => i + 1)
      } else {
        refetch()
      }
      qc.invalidateQueries({ queryKey: ["unannotated-tx"] })
    },
    onError: () => toast.error("标注失败"),
  })

  const handleSkip = () => {
    if (idx < items.length - 1) {
      setIdx((i) => i + 1)
    } else if (offset + 50 < total) {
      setOffset((o) => o + 50)
      setIdx(0)
    }
  }

  const handleQuickCreateProject = async () => {
    if (!form.quickProjectName.trim()) return
    setCreatingProject(true)
    try {
      const res = await createProject({ name: form.quickProjectName, project_type: "construction", status: "planning" } as any)
      const newId = (res as any)?.id ?? (res as any)?.data?.id
      if (newId) {
        setForm((f) => ({ ...f, project_id: newId, quickProjectName: "" }))
        qc.invalidateQueries({ queryKey: ["projects-quick"] })
        toast.success("项目已创建")
      }
    } catch {
      toast.error("创建失败")
    } finally {
      setCreatingProject(false)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault()
        if (currentTx) annotateMut.mutate()
      } else if (e.ctrlKey && e.key === "ArrowRight") {
        e.preventDefault()
        handleSkip()
      } else if (e.ctrlKey && e.key === "ArrowLeft") {
        e.preventDefault()
        if (idx > 0) setIdx((i) => i - 1)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [currentTx, idx])

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="size-16 rounded-full bg-green-100 flex items-center justify-center"><Zap className="size-8 text-green-600" /></div>
        <h2 className="text-xl font-semibold">全部标注完成</h2>
        <p className="text-muted-foreground">没有未标注的流水了</p>
      </div>
    )
  }

  const currentPos = offset + idx + 1
  const progressPct = total > 0 ? Math.round(((total - (items.length - idx)) / total) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">第 {currentPos} / {total} 笔</span>
          <div className="w-32 h-2 bg-muted rounded-full">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{progressPct}%</span>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={handleSkip} title="跳过 (Ctrl+→)">
            <SkipForward className="size-4" />
          </Button>
          <Button variant="outline" size="icon-sm" disabled={idx >= items.length - 1 && offset + 50 >= total} onClick={() => {
            if (idx < items.length - 1) setIdx((i) => i + 1)
            else { setOffset((o) => o + 50); setIdx(0) }
          }}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Card */}
      {currentTx && <TransactionCard tx={currentTx} entities={entities} />}

      {/* Annotation Panel */}
      {currentTx && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Expense Type */}
              <div className="space-y-1.5">
                <Label className="text-xs">费用类型</Label>
                <div className="flex gap-1">
                  <Select value={form.expense_type} onValueChange={(v) => {
                    if (v === "__new__") { setShowNewType(true); return; }
                    setForm((f) => ({ ...f, expense_type: v ?? "", expense_subtype: "" }));
                  }}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="选择类型" /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(types).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      <SelectItem value="__new__" className="text-primary font-medium">+ 新增...</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => setShowNewType(true)}><Plus className="size-3.5" /></Button>
                </div>
                {showNewType && (
                  <div className="flex gap-1">
                    <Input placeholder="新类型名" value={newTypeInput} onChange={(e) => setNewTypeInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && newTypeInput.trim()) { addTypeMut.mutate(newTypeInput.trim()); setForm((f) => ({ ...f, expense_type: newTypeInput.trim() })); } }}
                      className="flex-1" autoFocus />
                    <Button size="sm" disabled={!newTypeInput.trim() || addTypeMut.isPending}
                      onClick={() => { if (newTypeInput.trim()) { addTypeMut.mutate(newTypeInput.trim()); setForm((f) => ({ ...f, expense_type: newTypeInput.trim() })); } }}>
                      {addTypeMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "添加"}
                    </Button>
                  </div>
                )}
              </div>
              {/* Subtype */}
              <div className="space-y-1.5">
                <Label className="text-xs">费用子项</Label>
                <div className="flex gap-1">
                  <Select value={form.expense_subtype} onValueChange={(v) => {
                    if (v === "__new__") { setShowNewSub(true); return; }
                    setForm((f) => ({ ...f, expense_subtype: v ?? "" }));
                  }}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="选择子项" /></SelectTrigger>
                    <SelectContent>
                      {(types[form.expense_type] ?? []).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      {form.expense_type && <SelectItem value="__new__" className="text-primary font-medium">+ 新增...</SelectItem>}
                    </SelectContent>
                  </Select>
                  {form.expense_type && <Button size="sm" variant="outline" className="shrink-0" onClick={() => setShowNewSub(true)}><Plus className="size-3.5" /></Button>}
                </div>
                {showNewSub && form.expense_type && (
                  <div className="flex gap-1">
                    <Input placeholder="新子项名" value={newSubInput} onChange={(e) => setNewSubInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && newSubInput.trim()) { addSubMut.mutate({ type: form.expense_type, subtype: newSubInput.trim() }); setForm((f) => ({ ...f, expense_subtype: newSubInput.trim() })); } }}
                      className="flex-1" autoFocus />
                    <Button size="sm" disabled={!newSubInput.trim() || addSubMut.isPending}
                      onClick={() => { if (newSubInput.trim()) { addSubMut.mutate({ type: form.expense_type, subtype: newSubInput.trim() }); setForm((f) => ({ ...f, expense_subtype: newSubInput.trim() })); } }}>
                      {addSubMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "添加"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Project */}
            <div className="space-y-1.5">
              <Label className="text-xs">关联项目</Label>
              <div className="flex gap-2">
                <Select value={form.project_id} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v ?? "" }))}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="选择项目" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-1">
                  <Input
                    placeholder="快速新建项目..."
                    value={form.quickProjectName}
                    onChange={(e) => setForm((f) => ({ ...f, quickProjectName: e.target.value }))}
                    className="w-40"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!form.quickProjectName.trim() || creatingProject}
                    onClick={handleQuickCreateProject}
                  >
                    {creatingProject ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Remark */}
            <div className="space-y-1.5">
              <Label className="text-xs">备注</Label>
              <Input
                value={form.remark}
                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder="备注信息..."
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="createRule"
                  checked={form.createRule}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, createRule: !!c }))}
                />
                <Label htmlFor="createRule" className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
                  <Bookmark className="size-3" /> 保存为规则（后续自动匹配）
                </Label>
              </div>
              <Button
                onClick={() => annotateMut.mutate()}
                disabled={annotateMut.isPending || !form.expense_type || form.expense_type === "__new__"}
                size="sm"
              >
                {annotateMut.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Save className="size-4 mr-1" />}
                保存并下一笔 (Ctrl+Enter)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
