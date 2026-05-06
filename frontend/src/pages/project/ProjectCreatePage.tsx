import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowLeft, ArrowRight, Loader2, Building2, Zap, Landmark, Handshake,
  MapPin, FileText, Wrench, Cable, Battery, Package, Construction,
  Plug, Settings, Store, BarChart3, Users, CheckCircle2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createProject } from "@/api/project"
import { listUsers, listCompanies } from "@/api/organization"
import { listContracts } from "@/api/erp"
import GaodeMap from "@/components/map/GaodeMap"

const MODULE_ICONS: Record<string, React.ElementType> = {
  land_lease: MapPin,
  ndrc_filing: FileText,
  power_application: Zap,
  civil_construction: Construction,
  transformer_supply: Battery,
  cable_supply: Cable,
  charging_pile_supply: Plug,
  electrical_material_supply: Package,
  hv_installation: Zap,
  lv_installation: Settings,
  ancillary_construction: Wrench,
  operation: BarChart3,
  partner_revenue_share: Users,
}

const ALL_MODULES = [
  { code: "land_lease", name: "租地", category: "preparation" },
  { code: "ndrc_filing", name: "发改备案", category: "preparation" },
  { code: "power_application", name: "电力报装供电方案", category: "preparation" },
  { code: "civil_construction", name: "土建施工", category: "construction" },
  { code: "transformer_supply", name: "变压器供货", category: "supply" },
  { code: "cable_supply", name: "电缆供货", category: "supply" },
  { code: "charging_pile_supply", name: "充电桩供货", category: "supply" },
  { code: "electrical_material_supply", name: "电气材料供货", category: "supply" },
  { code: "hv_installation", name: "高压安装", category: "installation" },
  { code: "lv_installation", name: "低压安装", category: "installation" },
  { code: "ancillary_construction", name: "附属设施建设", category: "construction" },
  { code: "operation", name: "运营", category: "operation" },
  { code: "partner_revenue_share", name: "合作方分成", category: "operation" },
]

const PROJECT_TYPES = [
  {
    code: "pure_engineering",
    label: "纯工程",
    icon: Building2,
    desc: "纯工程EPC承包，不涉及投建运营",
    modules: ["ndrc_filing", "power_application", "civil_construction", "transformer_supply",
      "cable_supply", "electrical_material_supply", "hv_installation", "lv_installation", "ancillary_construction"],
  },
  {
    code: "charging_epc",
    label: "充电站EPC",
    icon: Zap,
    desc: "充电站交钥匙工程，建好交付",
    modules: ["land_lease", "ndrc_filing", "power_application", "civil_construction",
      "transformer_supply", "cable_supply", "charging_pile_supply", "electrical_material_supply",
      "hv_installation", "lv_installation", "ancillary_construction"],
  },
  {
    code: "self_invest_build",
    label: "自投自建",
    icon: Landmark,
    desc: "全额投资自建自营，长期运营收益",
    modules: ["land_lease", "ndrc_filing", "power_application", "civil_construction",
      "transformer_supply", "cable_supply", "charging_pile_supply", "electrical_material_supply",
      "hv_installation", "lv_installation", "ancillary_construction", "operation"],
  },
  {
    code: "cooperative_build",
    label: "合作共建",
    icon: Handshake,
    desc: "与合作方共建共运营，按比例分成",
    modules: ["land_lease", "ndrc_filing", "power_application", "civil_construction",
      "transformer_supply", "cable_supply", "charging_pile_supply", "electrical_material_supply",
      "hv_installation", "lv_installation", "ancillary_construction", "operation", "partner_revenue_share"],
  },
] as const

interface BasicForm {
  name: string
  code: string
  total_budget: string
  start_date: string
  end_date: string
  province: string
  city: string
  address: string
  lng: string
  lat: string
  priority: "high" | "normal" | "low"
  customer_id: string | null
  contract_id: string | null
  counterparty_company: string
  execution_unit_id: string | null
  partner_id: string
  project_manager_id: string | null
  description: string
}

const EMPTY_FORM: BasicForm = {
  name: "", code: "", total_budget: "", start_date: "", end_date: "",
  province: "", city: "", address: "", lng: "", lat: "",
  priority: "normal", customer_id: null, contract_id: null,
  counterparty_company: "", execution_unit_id: "", partner_id: "",
  project_manager_id: "", description: "",
}

const CATEGORY_LABELS: Record<string, string> = {
  preparation: "前期准备",
  construction: "土建施工",
  supply: "设备供货",
  installation: "安装调试",
  operation: "运营管理",
}

const DEFAULT_BUDGET_ITEMS = [
  { code: "transformer", name: "变压器", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
  { code: "hv_construction", name: "高压施工", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
  { code: "charging_pile", name: "充电桩", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
  { code: "lv_construction", name: "低压施工", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
  { code: "site_preparation", name: "场地整理", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
  { code: "ancillary", name: "附属设施", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
  { code: "custom_1", name: "", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
  { code: "custom_2", name: "", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
  { code: "custom_3", name: "", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
  { code: "custom_4", name: "", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
  { code: "custom_5", name: "", model: "", quantity: 1, unit_price: 0, amount: 0, remark: "" },
]

export default function ProjectCreatePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [selectedType, setSelectedType] = useState<string>("")
  const [form, setForm] = useState<BasicForm>(EMPTY_FORM)
  const [budgetItems, setBudgetItems] = useState(DEFAULT_BUDGET_ITEMS)
  const [location, setLocation] = useState<{ lng: number; lat: number; address?: string } | undefined>(undefined)
  const typeConfig = useMemo(() => PROJECT_TYPES.find((t) => t.code === selectedType), [selectedType])
  const defaultModules = useMemo(() => typeConfig ? (typeConfig.modules as readonly string[]).slice() : [], [typeConfig])
  const [removedDefaults, setRemovedDefaults] = useState<string[]>([])
  const [addedExtras, setAddedExtras] = useState<string[]>([])
  const activeModules = useMemo(() => {
    if (!typeConfig) return addedExtras
    return [...defaultModules.filter((m) => !removedDefaults.includes(m)), ...addedExtras.filter((m) => !defaultModules.includes(m))]
  }, [typeConfig, defaultModules, removedDefaults, addedExtras])

  const toggleModule = (code: string) => {
    const isDefault = defaultModules.includes(code)
    if (isDefault) {
      setRemovedDefaults((prev) => prev.includes(code) ? prev.filter((m) => m !== code) : [...prev, code])
    } else {
      setAddedExtras((prev) => prev.includes(code) ? prev.filter((m) => m !== code) : [...prev, code])
    }
  }

  const { data: companiesData } = useQuery({ queryKey: ["companies"], queryFn: () => listCompanies({ page_size: 200 }) })
  const { data: contractsData } = useQuery({ queryKey: ["contracts"], queryFn: () => listContracts({ page_size: 200 }) })
  const { data: usersData } = useQuery({ queryKey: ["users"], queryFn: () => listUsers({ page_size: 200 }) })

  const createMut = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      toast.success("项目创建成功")
      navigate("/engineering/projects")
    },
  })

  const updateBudgetItem = (idx: number, field: string, value: string | number) => {
    setBudgetItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [field]: value }
      if (field === "quantity" || field === "unit_price") {
        updated.amount = Number(updated.quantity) * Number(updated.unit_price)
      }
      return updated
    }))
  }

  const set = (key: keyof BasicForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
  }

  const handleNext = () => {
    if (step === 0 && !selectedType) return toast.warning("请选择项目类型")
    if (step === 2 && (!form.name || !form.code)) return toast.warning("请填写项目名称和编号")
    setStep((s) => Math.min(s + 1, 3))
  }

  const handleSubmit = () => {
    createMut.mutate({
      project_code: form.code,
      name: form.name,
      project_type: selectedType,
      priority: form.priority === "high" ? 1 : form.priority === "low" ? 3 : 2,
      customer_id: form.customer_id || undefined,
      contract_id: form.contract_id || undefined,
      counterparty_company: form.counterparty_company || undefined,
      execution_unit_id: form.execution_unit_id || undefined,
      partner_id: form.partner_id || undefined,
      enabled_modules: activeModules.length > 0 ? activeModules : undefined,
      total_budget: budgetItems.reduce((s, it) => s + (it.amount || 0), 0) || undefined,
      budget_items: budgetItems.filter(it => it.name || it.amount > 0),
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      province: form.province || undefined,
      city: form.city || undefined,
      address: (location?.address ?? form.address) || undefined,
      longitude: location?.lng ?? (form.lng ? Number(form.lng) : undefined),
      latitude: location?.lat ?? (form.lat ? Number(form.lat) : undefined),
      description: form.description || undefined,
      project_manager_id: form.project_manager_id || undefined,
    })
  }

  const STEP_LABELS = ["选择类型", "模块配置", "基本信息", "确认创建"]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">新建项目</h1>
        <div className="flex items-center gap-2 text-sm">
          {STEP_LABELS.map((label, i) => (
            <span key={i} className={i === step ? "font-semibold text-primary" : "text-muted-foreground"}>
              {i + 1}. {label}
              {i < 3 && <ArrowRight className="mx-1 inline size-3" />}
            </span>
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="grid grid-cols-2 gap-4">
          {PROJECT_TYPES.map((pt) => (
            <Card
              key={pt.code}
              className={`cursor-pointer transition-all hover:shadow-md ${selectedType === pt.code ? "ring-2 ring-primary" : ""}`}
              onClick={() => {
                setSelectedType(pt.code)
                setRemovedDefaults([])
                setAddedExtras([])
              }}
            >
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex items-center gap-3">
                  <pt.icon className={`size-8 ${selectedType === pt.code ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <span className="font-semibold text-lg">{pt.label}</span>
                    <p className="text-xs text-muted-foreground">{pt.desc}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {pt.modules.slice(0, 6).map((m) => {
                    const mod = ALL_MODULES.find((a) => a.code === m)
                    return (
                      <Badge key={m} variant="secondary" className="text-xs">
                        {mod?.name}
                      </Badge>
                    )
                  })}
                  {pt.modules.length > 6 && (
                    <Badge variant="outline" className="text-xs">+{pt.modules.length - 6}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {step === 1 && typeConfig && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-lg font-semibold">模块配置 — {typeConfig.label}</h3>
            <p className="text-sm text-muted-foreground">
              默认已选择 {typeConfig.modules.length} 个模块，可增减
            </p>
            {Object.entries(CATEGORY_LABELS).map(([cat, catLabel]) => {
              const catMods = ALL_MODULES.filter((m) => m.category === cat)
              if (catMods.length === 0) return null
              return (
                <div key={cat}>
                  <h4 className="font-medium text-sm mb-2 text-muted-foreground">{catLabel}</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {catMods.map((mod) => {
                      const isDefault = (typeConfig.modules as readonly string[]).includes(mod.code)
                      const isChecked = activeModules.includes(mod.code)
                      const Icon = MODULE_ICONS[mod.code] || FileText
                      return (
                        <div
                          key={mod.code}
                          className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                            isChecked ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
                          }`}
                          onClick={() => toggleModule(mod.code)}
                        >
                          <div className={`size-4 rounded border flex items-center justify-center ${
                            isChecked ? "bg-primary border-primary" : "border-muted-foreground"
                          }`}>
                            {isChecked && <CheckCircle2 className="size-3 text-primary-foreground" />}
                          </div>
                          <Icon className={`size-4 ${isChecked ? "text-primary" : "text-muted-foreground"}`} />
                          <span className="text-sm">{mod.name}</span>
                          {isDefault && isChecked && <span className="text-[10px] text-muted-foreground ml-auto">默认</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {selectedType === "cooperative_build" && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                <p className="text-sm font-medium text-amber-800">合作共建项目：请选择合作方</p>
                <Select value={form.partner_id || "__none__"} onValueChange={(v) => { if (v) setForm((p) => ({ ...p, partner_id: v === "__none__" ? "" : v })) }}>
                  <SelectTrigger><SelectValue placeholder="选择合作方" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">请选择合作方</SelectItem>
                    {companiesData?.items?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="space-y-6 p-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">基本信息</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>项目名称 *</Label>
                  <Input value={form.name} onChange={set("name")} required />
                </div>
                <div className="space-y-2">
                  <Label>项目编号 *</Label>
                  <Input value={form.code} onChange={set("code")} required />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base font-semibold">预算明细</Label>
                    <span className="text-sm text-muted-foreground">
                      合计: ¥{budgetItems.reduce((s, it) => s + (it.amount || 0), 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted">
                          <th className="px-2 py-2 text-left w-28">费用项</th>
                          <th className="px-2 py-2 text-left w-32">型号/规格</th>
                          <th className="px-2 py-2 text-center w-16">数量</th>
                          <th className="px-2 py-2 text-right w-28">单价</th>
                          <th className="px-2 py-2 text-right w-28">金额</th>
                          <th className="px-2 py-2 text-left">备注</th>
                        </tr>
                      </thead>
                      <tbody>
                        {budgetItems.map((it, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-2 py-1"><Input className="h-7 text-xs" value={it.name} onChange={e => updateBudgetItem(idx, "name", e.target.value)} placeholder="自定义项" /></td>
                            <td className="px-2 py-1"><Input className="h-7 text-xs" value={it.model} onChange={e => updateBudgetItem(idx, "model", e.target.value)} placeholder="型号" /></td>
                            <td className="px-2 py-1"><Input type="number" className="h-7 text-xs text-center" value={it.quantity} onChange={e => updateBudgetItem(idx, "quantity", Number(e.target.value))} /></td>
                            <td className="px-2 py-1"><Input type="number" className="h-7 text-xs text-right" value={it.unit_price} onChange={e => updateBudgetItem(idx, "unit_price", Number(e.target.value))} /></td>
                            <td className="px-2 py-1 text-right font-mono text-xs">{(it.amount || 0).toLocaleString()}</td>
                            <td className="px-2 py-1"><Input className="h-7 text-xs" value={it.remark} onChange={e => updateBudgetItem(idx, "remark", e.target.value)} placeholder="备注" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>优先级</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">高</SelectItem>
                      <SelectItem value="normal">普通</SelectItem>
                      <SelectItem value="low">低</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">项目方信息</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>对方公司</Label>
                  <Input
                    value={form.counterparty_company}
                    onChange={set("counterparty_company")}
                    placeholder="甲方/客户公司名称"
                  />
                </div>
                <div className="space-y-2">
                  <Label>我方执行单位</Label>
                  <Select value={form.execution_unit_id ?? ""} onValueChange={(v) => setForm((p) => ({ ...p, execution_unit_id: v || null }))}>
                    <SelectTrigger><SelectValue placeholder="选择执行单位" /></SelectTrigger>
                    <SelectContent>
                      {companiesData?.items?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedType === "cooperative_build" && (
                  <div className="space-y-2">
                    <Label>合作方 *</Label>
                    <Select value={form.partner_id || "__none__"} onValueChange={(v) => { if (v) setForm((p) => ({ ...p, partner_id: v === "__none__" ? "" : v })) }}>
                      <SelectTrigger><SelectValue placeholder="选择合作方" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">请选择合作方</SelectItem>
                        {companiesData?.items?.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>项目经理</Label>
                  <Select value={form.project_manager_id ?? ""} onValueChange={(v) => setForm((p) => ({ ...p, project_manager_id: v || null }))}>
                    <SelectTrigger><SelectValue placeholder="选择项目经理" /></SelectTrigger>
                    <SelectContent>
                      {usersData?.items?.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.real_name || u.username}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">项目描述</h3>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="输入项目描述..."
                rows={3}
              />
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">时间与地点</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>开始日期</Label>
                  <Input type="date" value={form.start_date} onChange={set("start_date")} />
                </div>
                <div className="space-y-2">
                  <Label>结束日期</Label>
                  <Input type="date" value={form.end_date} onChange={set("end_date")} />
                </div>
                <div className="space-y-2">
                  <Label>省份</Label>
                  <Input value={form.province} onChange={set("province")} />
                </div>
                <div className="space-y-2">
                  <Label>城市</Label>
                  <Input value={form.city} onChange={set("city")} />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label>地址</Label>
                <Input value={form.address} onChange={set("address")} />
              </div>
              <div className="space-y-2 mt-4">
                <Label>项目位置</Label>
                <GaodeMap value={location} onChange={setLocation} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-3">
              <h3 className="font-semibold">项目信息</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">名称:</span><span>{form.name}</span>
                <span className="text-muted-foreground">编号:</span><span>{form.code}</span>
                <span className="text-muted-foreground">类型:</span><span>{PROJECT_TYPES.find((t) => t.code === selectedType)?.label}</span>
                {form.counterparty_company && <><span className="text-muted-foreground">对方公司:</span><span>{form.counterparty_company}</span></>}
                <span className="text-muted-foreground">我方执行单位:</span>
                <span>{companiesData?.items?.find((c: any) => c.id === form.execution_unit_id)?.name || "-"}</span>
                {selectedType === "cooperative_build" && (
                  <>
                    <span className="text-muted-foreground">合作方:</span>
                    <span>{companiesData?.items?.find((c: any) => c.id === form.partner_id)?.name || "-"}</span>
                  </>
                )}
                {(() => {
                  const total = budgetItems.reduce((s, it) => s + (it.amount || 0), 0)
                  return total > 0 ? <><span className="text-muted-foreground">预算:</span><span>{total.toLocaleString()}元</span></> : null
                })()}
                <span className="text-muted-foreground">优先级:</span>
                <span>{form.priority === "high" ? "高" : form.priority === "low" ? "低" : "普通"}</span>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold">启用模块 ({activeModules.length})</h3>
              <div className="flex flex-wrap gap-2">
                {activeModules.map((m) => {
                  const mod = ALL_MODULES.find((a) => a.code === m)
                  return (
                    <Badge key={m} variant="outline">{mod?.name || m}</Badge>
                  )
                })}
              </div>
            </div>
            {form.description && (
              <div className="space-y-3">
                <h3 className="font-semibold">描述</h3>
                <p className="text-sm">{form.description}</p>
              </div>
            )}
            {(form.start_date || form.end_date || form.province || location?.address) && (
              <div className="space-y-3">
                <h3 className="font-semibold">时间与地点</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {form.start_date && <><span className="text-muted-foreground">开始:</span><span>{form.start_date}</span></>}
                  {form.end_date && <><span className="text-muted-foreground">结束:</span><span>{form.end_date}</span></>}
                  {(location?.address || form.address) && <><span className="text-muted-foreground">地址:</span><span>{location?.address || form.address}</span></>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={step === 0 ? () => navigate(-1) : () => setStep((s) => s - 1)}>
          <ArrowLeft className="size-4" />
          {step === 0 ? "返回" : "上一步"}
        </Button>
        {step < 3 ? (
          <Button onClick={handleNext}>
            下一步
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending && <Loader2 className="size-4 animate-spin" />}
            确认创建
          </Button>
        )}
      </div>
    </div>
  )
}
