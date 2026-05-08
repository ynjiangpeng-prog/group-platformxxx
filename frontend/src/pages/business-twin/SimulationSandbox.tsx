import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { post, get } from '@/lib/http'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { AlertTriangle, Play, Loader2 } from 'lucide-react'

interface TemplateField {
  key: string
  label: string
  type: string
  default: number | string
}

interface Template {
  name: string
  description: string
  fields: TemplateField[]
}

interface SimulationResult {
  scenario: { name: string; assumptions: Record<string, unknown> }
  baseline: { revenue: Array<{ period: string; amount: number }>; cost: Array<{ period: string; amount: number }> }
  simulated: { revenue: Array<{ period: string; amount: number }>; cost: Array<{ period: string; amount: number }> }
  comparison: {
    baseline_net: number
    simulated_net: number
    revenue_delta: number
    cost_delta: number
    net_delta: number
    [key: string]: unknown
  }
  explanation: string
  risk_assessment: { level: string; message: string }
}

function formatAmount(v: number): string {
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}万`
  return v.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })
}

export default function SimulationSandbox() {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [assumptions, setAssumptions] = useState<Record<string, number | string>>({})
  const [scenarioName, setScenarioName] = useState("自定义模拟")
  const [result, setResult] = useState<SimulationResult | null>(null)

  const { data: templates } = useQuery({
    queryKey: ['business-twin', 'simulation-templates'],
    queryFn: () => get<Record<string, Template>>('/business-twin/simulations/templates'),
  })

  const simulateMutation = useMutation({
    mutationFn: (scenario: Record<string, unknown>) => post<SimulationResult>('/business-twin/simulate', scenario),
    onSuccess: (data) => setResult(data),
  })

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey)
    const tmpl = templates?.[templateKey]
    if (tmpl) {
      setScenarioName(tmpl.name)
      const defaults: Record<string, number | string> = {}
      for (const f of tmpl.fields) {
        defaults[f.key] = f.default
      }
      setAssumptions(defaults)
    }
  }

  const handleRun = () => {
    simulateMutation.mutate({
      name: scenarioName,
      template_type: selectedTemplate || "custom",
      assumptions,
      time_horizon_months: 12,
    })
  }

  const currentTemplate = templates?.[selectedTemplate]

  // 构建对比图表数据
  const chartData = result ? result.baseline.revenue.map((br, i) => {
    const sr = result.simulated.revenue[i]
    const bc = result.baseline.cost[i]
    const sc = result.simulated.cost[i]
    return {
      period: br.period,
      baseRevenue: br.amount,
      simRevenue: sr?.amount ?? 0,
      baseCost: bc?.amount ?? 0,
      simCost: sc?.amount ?? 0,
    }
  }) : []

  return (
    <div className="flex gap-6">
      {/* 左侧参数面板 */}
      <div className="w-80 shrink-0 space-y-4">
        <h1 className="text-2xl font-bold">模拟沙盘</h1>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">选择场景模板</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedTemplate} onValueChange={(v) => { if (v) handleTemplateChange(v) }}>
              <SelectTrigger>
                <SelectValue placeholder="选择模板..." />
              </SelectTrigger>
              <SelectContent>
                {templates && Object.entries(templates).map(([key, tmpl]) => (
                  <SelectItem key={key} value={key}>{tmpl.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentTemplate && (
              <p className="text-xs text-muted-foreground mt-2">{currentTemplate.description}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">场景参数</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">场景名称</Label>
              <Input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
            </div>

            {currentTemplate ? (
              currentTemplate.fields.map((f) => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    type={f.type}
                    value={assumptions[f.key] ?? f.default}
                    onChange={(e) => setAssumptions(prev => ({
                      ...prev,
                      [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                    }))}
                  />
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">选择模板后显示参数</p>
            )}

            <Button onClick={handleRun} disabled={simulateMutation.isPending} className="w-full">
              {simulateMutation.isPending ? (
                <><Loader2 className="size-4 mr-2 animate-spin" />模拟中...</>
              ) : (
                <><Play className="size-4 mr-2" />运行模拟</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 右侧结果面板 */}
      <div className="flex-1 space-y-4">
        {result ? (
          <>
            {/* 对比图表 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">收入对比（基准 vs 模拟）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)} />
                    <Tooltip formatter={(v: unknown) => formatAmount(Number(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="baseRevenue" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" name="基准收入" />
                    <Line type="monotone" dataKey="simRevenue" stroke="#22c55e" strokeWidth={2} name="模拟收入" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">成本对比</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)} />
                    <Tooltip formatter={(v: unknown) => formatAmount(Number(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="baseCost" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" name="基准成本" />
                    <Line type="monotone" dataKey="simCost" stroke="#ef4444" strokeWidth={2} name="模拟成本" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 对比分析 */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">收入变化</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-xl font-bold ${result.comparison.revenue_delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {result.comparison.revenue_delta >= 0 ? '+' : ''}{formatAmount(result.comparison.revenue_delta)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">成本变化</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-xl font-bold ${result.comparison.cost_delta <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {result.comparison.cost_delta >= 0 ? '+' : ''}{formatAmount(result.comparison.cost_delta)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">净利润变化</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-xl font-bold ${result.comparison.net_delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {result.comparison.net_delta >= 0 ? '+' : ''}{formatAmount(result.comparison.net_delta)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* AI解读 + 风险评估 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  AI解读
                  <Badge variant={result.risk_assessment.level === 'high' ? 'destructive' : result.risk_assessment.level === 'medium' ? 'secondary' : 'outline'}>
                    {result.risk_assessment.level === 'high' ? '高风险' : result.risk_assessment.level === 'medium' ? '中风险' : '低风险'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{result.explanation}</p>
                <p className="text-xs text-muted-foreground mt-2">{result.risk_assessment.message}</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="flex items-center justify-center h-96 text-muted-foreground">
            <div className="text-center">
              <AlertTriangle className="size-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg">选择场景模板，设置参数后点击运行模拟</p>
              <p className="text-sm mt-1">What-If分析帮你预测不同决策的财务影响</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
