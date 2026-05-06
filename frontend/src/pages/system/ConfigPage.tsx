import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Save, Brain, Settings, Eye, EyeOff, TestTube, Loader2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import * as api from "@/api/system"

const GENERAL_FIELDS = [
  { key: "company_name", label: "公司名称", type: "text" },
  { key: "enable_workflow", label: "工作流模块", type: "text" },
  { key: "enable_erp", label: "ERP模块", type: "text" },
  { key: "enable_finance", label: "财务模块", type: "text" },
  { key: "enable_charging", label: "充电站模块", type: "text" },
]

// NVIDIA model categories
const MODEL_CATEGORIES: Record<string, string> = {
  chat: "对话模型",
  vision: "视觉模型",
  code: "代码模型",
  embedding: "嵌入模型",
}

function ModelSelector({ models, categoryFilter, value, onChange, placeholder }: {
  models: any[]
  categoryFilter?: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const filtered = categoryFilter
    ? models.filter((m) => m.category === categoryFilter)
    : models
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {filtered.map((m: any) => (
          <SelectItem key={m.id} value={m.id}>
            <div className="flex flex-col items-start">
              <span className="font-medium">{m.name}</span>
              <span className="text-xs text-muted-foreground">{m.provider} · {m.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ModelTestButton({ model, label, testPrompt }: {
  model: string | null
  label: string
  testPrompt: string
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; reply?: string; error?: string } | null>(null)

  const handleTest = async () => {
    if (!model) {
      toast.error("请先选择模型")
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const token = localStorage.getItem("access_token")
      const resp = await fetch("/api/v1/ai/gateway/test-model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ model, prompt: testPrompt }),
      })
      const data = await resp.json()
      if (data.success) {
        setResult({ success: true, reply: data.reply })
        toast.success(`${label}成功`)
      } else {
        setResult({ success: false, error: data.detail || "未知错误" })
        toast.error(`${label}失败`)
      }
    } catch (e: any) {
      setResult({ success: false, error: e.message })
      toast.error(`${label}失败: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={loading || !model}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <TestTube className="size-4" />}
          {label}
        </Button>
      </div>
      {result && (
        <div className={`p-3 rounded-lg text-sm ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          {result.success ? (
            <div>
              <div className="font-medium text-green-700 mb-1">测试成功</div>
              <div className="text-green-800">{result.reply}</div>
            </div>
          ) : (
            <div className="text-red-700">
              <div className="font-medium mb-1">测试失败</div>
              <div>{result.error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ConfigPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["config"], queryFn: api.getConfig })
  const [values, setValues] = useState<Record<string, string | null> | undefined>(undefined)
  const [showKey, setShowKey] = useState(false)
  const [modelFilter, setModelFilter] = useState("all")
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; reply?: string; error?: string } | null>(null)

  const initialized = data && !values
  if (initialized) setValues(data)

  // Fetch available models from NVIDIA API
  const { data: modelsData } = useQuery({
    queryKey: ["ai-models"],
    queryFn: async () => {
      const resp = await fetch("/api/v1/ai/gateway/models")
      const data = await resp.json()
      return data.data || []
    },
  })

  const availableModels = modelsData || []

  const filteredModels = useMemo(() => {
    if (modelFilter === "all") return availableModels
    return availableModels.filter((m: any) => m.category === modelFilter)
  }, [availableModels, modelFilter])

  const updateMut = useMutation({
    mutationFn: api.updateConfig,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["config"] }); toast.success("配置已保存") },
  })

  if (isLoading || !values) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>

  const aiConfigured = !!values.ai_api_key

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Brain className="size-5" />AI大模型配置</CardTitle>
          <CardDescription>配置NVIDIA API的模型参数，用于OCR识别、智能分析等功能</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={aiConfigured ? "default" : "destructive"}>
              {aiConfigured ? "已配置" : "未配置"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {aiConfigured ? "AI功能可用" : "请配置API Key后AI功能才能使用"}
            </span>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">AI API Key</Label>
            <p className="text-xs text-muted-foreground">NVIDIA API Key (nvapi-...)</p>
            <div className="relative">
              <Input
                type={!showKey ? "password" : "text"}
                value={values.ai_api_key || ""}
                onChange={(e) => setValues((v) => ({ ...v, ai_api_key: e.target.value }))}
                placeholder="nvapi-..."
              />
              <Button variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>

          {/* API Base */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">API地址</Label>
            <p className="text-xs text-muted-foreground">NVIDIA API基础地址</p>
            <Input
              value={values.ai_api_base || "https://integrate.api.nvidia.com/v1"}
              onChange={(e) => setValues((v) => ({ ...v, ai_api_base: e.target.value }))}
              placeholder="https://integrate.api.nvidia.com/v1"
            />
          </div>

          {/* Vision Model */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">视觉模型 (OCR识别)</Label>
            <p className="text-xs text-muted-foreground">用于合同、发票、票据的图片识别</p>
            <ModelSelector
              models={availableModels}
              categoryFilter="vision"
              value={values.ai_vision_model || ""}
              onChange={(v) => setValues((prev) => ({ ...prev!, ai_vision_model: v }))}
              placeholder="选择视觉模型..."
            />
            {values.ai_vision_model && (
              <p className="text-xs text-muted-foreground">
                当前: <span className="font-mono text-primary">{values.ai_vision_model}</span>
              </p>
            )}
            <ModelTestButton
              model={values.ai_vision_model}
              label="测试视觉模型"
              testPrompt="请描述这张图片的内容"
            />
          </div>

          {/* Reasoning Model */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">推理模型 (智能分析)</Label>
            <p className="text-xs text-muted-foreground">用于文档分析、报告生成、智能对话</p>
            <ModelSelector
              models={availableModels}
              categoryFilter="chat"
              value={values.ai_reasoning_model || ""}
              onChange={(v) => setValues((prev) => ({ ...prev!, ai_reasoning_model: v }))}
              placeholder="选择推理模型..."
            />
            {values.ai_reasoning_model && (
              <p className="text-xs text-muted-foreground">
                当前: <span className="font-mono text-primary">{values.ai_reasoning_model}</span>
              </p>
            )}
            <ModelTestButton
              model={values.ai_reasoning_model}
              label="测试推理模型"
              testPrompt="你是什么模型？请简短回答。"
            />
          </div>

          {/* Legacy default model (for backward compatibility) */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">默认模型 (兼容)</Label>
            <p className="text-xs text-muted-foreground">通用默认模型，未单独配置时使用</p>
            <ModelSelector
              models={availableModels}
              value={values.ai_model || ""}
              onChange={(v) => setValues((prev) => ({ ...prev!, ai_model: v }))}
              placeholder="选择默认模型..."
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => updateMut.mutate(values)}
              disabled={updateMut.isPending}
            >
              <Save className="mr-1 h-4 w-4" />保存AI配置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="size-5" />系统设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {GENERAL_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-3 gap-4 items-center">
              <Label className="text-sm">{f.label}</Label>
              <div className="col-span-2">
                <Input value={values[f.key] || ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => updateMut.mutate(values)} disabled={updateMut.isPending}>
              <Save className="mr-1 h-4 w-4" />保存设置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
