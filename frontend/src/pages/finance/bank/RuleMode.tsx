import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Plus, Trash2, Edit, Eye, Play, Zap, Loader2, Power, PowerOff,
  Filter, ArrowRight, Bookmark
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import {
  listAnnotationRules,
  createAnnotationRule,
  deleteAnnotationRule,
  applySingleRule,
  applyAllRules,
  previewAnnotationRule,
  getExpenseTypes,
  type AnnotationRule,
  type RuleConditions,
  type RuleActions,
} from "@/api/annotationRules"
import { listProjects } from "@/api/project"

const CONDITION_FIELDS = [
  { value: "counterparty", label: "对方名称" },
  { value: "summary", label: "摘要" },
  { value: "purpose", label: "用途" },
  { value: "counterparty_account", label: "对方账号" },
  { value: "account_name", label: "账户名" },
]

const OPERATORS = [
  { value: "contains", label: "包含" },
  { value: "equals", label: "等于" },
  { value: "starts_with", label: "开头是" },
  { value: "ends_with", label: "结尾是" },
  { value: "not_equals", label: "不等于" },
  { value: "not_contains", label: "不包含" },
]

interface ConditionRow {
  field: string
  operator: string
  value: string
}

function RuleEditor({
  open, onClose, expenseTypes, projects, editRule,
}: {
  open: boolean
  onClose: () => void
  expenseTypes: Record<string, string[]>
  projects: any[]
  editRule: AnnotationRule | null
}) {
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [conditions, setConditions] = useState<ConditionRow[]>([{ field: "counterparty", operator: "contains", value: "" }])
  const [amountMin, setAmountMin] = useState("")
  const [amountMax, setAmountMax] = useState("")
  const [txType, setTxType] = useState("")
  const [expType, setExpType] = useState("")
  const [expSubtype, setExpSubtype] = useState("")
  const [projectId, setProjectId] = useState("")
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewing, setPreviewing] = useState(false)

  // Reset form when opening
  const handleOpen = (val: boolean) => {
    if (val) {
      if (editRule) {
        setName(editRule.rule_name || "")
        const conds = editRule.conditions
        const rows: ConditionRow[] = []
        for (const [field, cond] of Object.entries(conds)) {
          if (typeof cond === "object" && cond !== null && "operator" in (cond as any)) {
            rows.push({ field, operator: (cond as any).operator || "contains", value: (cond as any).value || "" })
          }
        }
        if (rows.length === 0) rows.push({ field: "counterparty", operator: "contains", value: "" })
        setConditions(rows)
        setAmountMin(conds.tx_amount_min != null ? String(conds.tx_amount_min) : "")
        setAmountMax(conds.tx_amount_max != null ? String(conds.tx_amount_max) : "")
        setTxType(conds.tx_type || "")
        setExpType(editRule.actions.expense_type || "")
        setExpSubtype(editRule.actions.expense_subtype || "")
        setProjectId(editRule.actions.project_id || "")
      } else {
        setName("")
        setConditions([{ field: "counterparty", operator: "contains", value: "" }])
        setAmountMin("")
        setAmountMax("")
        setTxType("")
        setExpType("")
        setExpSubtype("")
        setProjectId("")
      }
      setPreviewCount(null)
    }
  }

  const buildConditions = (): RuleConditions => {
    const result: RuleConditions = {}
    for (const row of conditions) {
      if (row.value.trim()) {
        (result as any)[row.field] = { operator: row.operator, value: row.value }
      }
    }
    if (amountMin) result.tx_amount_min = parseFloat(amountMin)
    if (amountMax) result.tx_amount_max = parseFloat(amountMax)
    if (txType) result.tx_type = txType
    return result
  }

  const buildActions = (): RuleActions => {
    const result: RuleActions = {}
    if (expType) result.expense_type = expType
    if (expSubtype) result.expense_subtype = expSubtype
    if (projectId) result.project_id = projectId
    return result
  }

  const createMut = useMutation({
    mutationFn: () =>
      createAnnotationRule({
        rule_name: name || `规则 ${Date.now()}`,
        conditions: buildConditions(),
        actions: buildActions(),
        priority: 0,
        is_active: true,
      }),
    onSuccess: () => {
      toast.success("规则已创建")
      qc.invalidateQueries({ queryKey: ["annotation-rules"] })
      onClose()
    },
    onError: () => toast.error("创建失败"),
  })

  const handlePreview = async () => {
    // For preview, we create the rule first, then preview it
    // Actually, let's just show estimated count
    setPreviewing(true)
    try {
      // Quick estimation: save then preview
      const result = await createAnnotationRule({
        rule_name: `__preview__${Date.now()}`,
        conditions: buildConditions(),
        actions: buildActions(),
      })
      const ruleId = (result as any)?.data?.rule_id
      if (ruleId) {
        // Delete the preview rule and show count
        await deleteAnnotationRule(ruleId)
        setPreviewCount((result as any)?.data?.preview_count ?? 0)
      }
    } catch {
      setPreviewCount(null)
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { handleOpen(v); if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editRule ? "编辑规则" : "新建标注规则"}</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          {/* Rule Name */}
          <div className="space-y-1.5">
            <Label>规则名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：某公司租金自动标注" />
          </div>

          {/* Conditions */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">匹配条件</Label>
            {conditions.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Select value={row.field} onValueChange={(v) => {
                  const next = [...conditions]
                  next[i] = { ...next[i], field: v ?? "" }
                  setConditions(next)
                }}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITION_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={row.operator} onValueChange={(v) => {
                  const next = [...conditions]
                  next[i] = { ...next[i], operator: v ?? "" }
                  setConditions(next)
                }}>
                  <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...conditions]
                    next[i] = { ...next[i], value: e.target.value }
                    setConditions(next)
                  }}
                  placeholder="匹配值..."
                />
                <Button variant="ghost" size="icon-sm" disabled={conditions.length <= 1} onClick={() => {
                  setConditions((prev) => prev.filter((_, j) => j !== i))
                }}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setConditions((p) => [...p, { field: "summary", operator: "contains", value: "" }])}>
              <Plus className="size-3.5 mr-1" />添加条件
            </Button>

            {/* Amount Range */}
            <div className="flex gap-3 items-center">
              <Label className="text-xs shrink-0">金额范围</Label>
              <Input type="number" placeholder="最小" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} className="w-28" />
              <span className="text-muted-foreground">~</span>
              <Input type="number" placeholder="最大" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} className="w-28" />
            </div>

            {/* Tx Type */}
            <div className="flex gap-3 items-center">
              <Label className="text-xs shrink-0">收支方向</Label>
              <Select value={txType} onValueChange={(v) => setTxType(v ?? "")}>
                <SelectTrigger className="w-32"><SelectValue placeholder="不限" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">仅收入</SelectItem>
                  <SelectItem value="expense">仅支出</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm font-semibold">标注动作</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">用途分类</Label>
                <Select value={expType} onValueChange={(v) => { setExpType(v ?? ""); setExpSubtype("") }}>
                  <SelectTrigger><SelectValue placeholder="选择用途" /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(expenseTypes).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">细分类</Label>
                <Select value={expSubtype} onValueChange={(v) => setExpSubtype(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="选择细分" /></SelectTrigger>
                  <SelectContent>
                    {(expenseTypes[expType] ?? []).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">关联项目</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="选择项目（可选）" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview Count */}
          {previewCount !== null && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Eye className="size-4 text-muted-foreground" />
              <span className="text-sm">预计匹配 <strong>{previewCount}</strong> 笔未标注交易</span>
            </div>
          )}
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handlePreview} disabled={previewing}>
            {previewing ? <Loader2 className="size-4 animate-spin mr-1" /> : <Eye className="size-4 mr-1" />}预览匹配
          </Button>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !expType}>
            {createMut.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Bookmark className="size-4 mr-1" />}
            保存规则
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RuleCard({
  rule, onApply, onDelete,
}: {
  rule: AnnotationRule
  onApply: () => void
  onDelete: () => void
}) {
  const conds = rule.conditions
  const chips: string[] = []
  for (const [field, cond] of Object.entries(conds)) {
    if (typeof cond === "object" && cond !== null && "value" in (cond as any)) {
      const fieldLabel = CONDITION_FIELDS.find((f) => f.value === field)?.label ?? field
      const opLabel = OPERATORS.find((o) => o.value === (cond as any).operator)?.label ?? (cond as any).operator
      chips.push(`${fieldLabel} ${opLabel} "${(cond as any).value}"`)
    }
  }
  if (conds.tx_amount_min != null) chips.push(`最低 ¥${conds.tx_amount_min}`)
  if (conds.tx_amount_max != null) chips.push(`最高 ¥${conds.tx_amount_max}`)

  return (
    <Card className={!rule.is_active ? "opacity-60" : ""}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium truncate">{rule.rule_name}</span>
              <Badge variant={rule.is_active ? "default" : "secondary"} className="text-[10px]">
                {rule.is_active ? "启用" : "停用"}
              </Badge>
              {rule.match_count > 0 && (
                <Badge variant="outline" className="text-[10px]">已匹配 {rule.match_count} 笔</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {chips.map((chip, i) => (
                <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">{chip}</span>
              ))}
            </div>
            {rule.actions.expense_type && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowRight className="size-3" />
                <span>{rule.actions.expense_type}</span>
                {rule.actions.expense_subtype && <span> / {rule.actions.expense_subtype}</span>}
                {rule.actions.project_id && <span> → 关联项目</span>}
              </div>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon-sm" onClick={onApply} title="应用此规则">
              <Play className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onDelete} title="删除">
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function RuleMode() {
  const qc = useQueryClient()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editRule, setEditRule] = useState<AnnotationRule | null>(null)

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ["annotation-rules"],
    queryFn: listAnnotationRules,
  })

  const { data: expenseTypes } = useQuery({
    queryKey: ["expense-types"],
    queryFn: getExpenseTypes,
  })

  const { data: projectsData } = useQuery({
    queryKey: ["projects-rules"],
    queryFn: () => listProjects({ page: 1, page_size: 200 }),
  })

  const rules = ((rulesData as any)?.data ?? []) as AnnotationRule[]
  const types = (expenseTypes as any)?.data ?? {}
  const projects = projectsData?.items ?? []

  const applyAllMut = useMutation({
    mutationFn: applyAllRules,
    onSuccess: (res: any) => {
      toast.success(`已应用 ${res?.rules_applied ?? 0} 条规则，标注 ${res?.transactions_annotated ?? 0} 笔交易`)
      qc.invalidateQueries({ queryKey: ["annotation-rules"] })
      qc.invalidateQueries({ queryKey: ["unannotated-tx"] })
    },
    onError: () => toast.error("应用失败"),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAnnotationRule(id),
    onSuccess: () => {
      toast.success("规则已删除")
      qc.invalidateQueries({ queryKey: ["annotation-rules"] })
    },
  })

  const handleApplySingle = useMutation({
    mutationFn: (id: string) => applySingleRule(id),
    onSuccess: (res: any) => {
      toast.success(`已标注 ${res?.transactions_annotated ?? 0} 笔交易`)
      qc.invalidateQueries({ queryKey: ["annotation-rules"] })
    },
  })

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">标注规则管理</h2>
          <Badge variant="outline">{rules.length} 条规则</Badge>
          <Badge variant="outline" className="text-green-600">
            {rules.filter((r) => r.is_active).length} 条启用
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyAllMut.mutate()}
            disabled={applyAllMut.isPending}
          >
            {applyAllMut.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Zap className="size-4 mr-1" />}
            一键应用全部规则
          </Button>
          <Button size="sm" onClick={() => { setEditRule(null); setEditorOpen(true) }}>
            <Plus className="size-4 mr-1" />新建规则
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        定义匹配条件，系统会自动为符合条件的银行流水标注用途和关联项目。新导入的流水也会自动应用规则。
      </p>

      {/* Rule List */}
      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center"><Filter className="size-8 text-muted-foreground" /></div>
          <h3 className="text-lg font-medium">暂无规则</h3>
          <p className="text-sm text-muted-foreground">创建第一条规则，自动标注银行流水</p>
          <Button onClick={() => { setEditRule(null); setEditorOpen(true) }}>
            <Plus className="size-4 mr-1" />新建规则
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule._rule_id}
              rule={rule}
              onApply={() => handleApplySingle.mutate(rule._rule_id)}
              onDelete={() => deleteMut.mutate(rule._rule_id)}
            />
          ))}
        </div>
      )}

      <RuleEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        expenseTypes={types}
        projects={projects}
        editRule={editRule}
      />
    </div>
  )
}
