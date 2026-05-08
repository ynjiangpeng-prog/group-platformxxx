import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/http'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, ComposedChart,
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  ShieldCheck, Activity,
} from 'lucide-react'

interface Prediction {
  period: string
  amount: number
}

interface ForecastData {
  metric_type: string
  method: string
  historical: Array<{ period: string; value: number }>
  predictions: Prediction[]
  confidence_interval: {
    lower: Prediction[]
    upper: Prediction[]
  }
}

interface RiskData {
  risk_score: number
  risk_level: 'high' | 'medium' | 'low'
  delay_rate: number
  completion_rate: number
  total_projects: number
  delayed_projects: number
}

interface DashboardData {
  summary: {
    total_predicted_revenue: number
    total_predicted_cost: number
    predicted_net: number
    risk_score: number
    risk_level: 'high' | 'medium' | 'low'
  }
  revenue_prediction: ForecastData
  cost_prediction: ForecastData
  cash_flow_prediction: ForecastData & { revenue_forecast: ForecastData; cost_forecast: ForecastData }
  project_risk: RiskData
}

function formatAmount(v: number): string {
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}万`
  return v.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })
}

function RiskBadge({ level }: { level: string }) {
  const variants: Record<string, { variant: 'destructive' | 'secondary' | 'outline'; label: string; icon: React.ElementType }> = {
    high: { variant: 'destructive', label: '高风险', icon: AlertTriangle },
    medium: { variant: 'secondary', label: '中风险', icon: Activity },
    low: { variant: 'outline', label: '低风险', icon: ShieldCheck },
  }
  const config = variants[level] || variants.low
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="size-3" />
      {config.label}
    </Badge>
  )
}

function ForecastChart({ data, title, color }: { data: ForecastData; title: string; color: string }) {
  // 合并历史和预测数据
  const chartData = [
    ...data.historical.map(h => ({
      period: h.period,
      value: h.value,
      type: 'historical' as const,
    })),
    ...data.predictions.map(p => ({
      period: p.period,
      value: p.amount,
      type: 'predicted' as const,
    })),
  ]

  const lowerMap = Object.fromEntries(
    (data.confidence_interval?.lower || []).map(l => [l.period, l.amount])
  )
  const upperMap = Object.fromEntries(
    (data.confidence_interval?.upper || []).map(u => [u.period, u.amount])
  )

  const chartDataWithInterval = chartData.map(d => ({
    ...d,
    lower: lowerMap[d.period] ?? undefined,
    upper: upperMap[d.period] ?? undefined,
  }))

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">预测方法: {data.method === 'prophet' ? 'Prophet模型' : data.method === 'simple_extrapolation' ? '趋势外推' : data.method}</p>
      </CardHeader>
      <CardContent>
        {chartDataWithInterval.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            暂无数据，需要积累至少1个月的历史指标
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={chartDataWithInterval}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)} />
              <Tooltip formatter={(v: unknown) => formatAmount(Number(v))} />
              <Legend />
              {/* 置信区间阴影 */}
              <Area dataKey="upper" fill={color} fillOpacity={0.1} stroke="none" name="上界" />
              <Area dataKey="lower" fill="#fff" fillOpacity={1} stroke="none" name="下界" />
              {/* 历史实线 */}
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="金额"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export default function PredictionDashboard() {
  const [months, setMonths] = useState<'3' | '6' | '12'>('6')

  const { data, isLoading } = useQuery({
    queryKey: ['predictions', 'dashboard', months],
    queryFn: () => get<DashboardData>(`/predictions/dashboard?months_ahead=${months}`),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        加载预测数据中...
      </div>
    )
  }

  const summary = data?.summary
  const revenue = data?.revenue_prediction
  const cost = data?.cost_prediction
  const cashFlow = data?.cash_flow_prediction
  const risk = data?.project_risk

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">预测中心</h1>
        <Tabs value={months} onValueChange={(v) => setMonths(v as '3' | '6' | '12')}>
          <TabsList>
            <TabsTrigger value="3">3个月</TabsTrigger>
            <TabsTrigger value="6">6个月</TabsTrigger>
            <TabsTrigger value="12">12个月</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 概览卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">预测总收入</CardTitle>
            <TrendingUp className="size-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary ? formatAmount(summary.total_predicted_revenue) : '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">预测总成本</CardTitle>
            <TrendingDown className="size-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary ? formatAmount(summary.total_predicted_cost) : '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">预测净利润</CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(summary?.predicted_net ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary ? formatAmount(summary.predicted_net) : '-'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">财务风险</CardTitle>
            {summary && <RiskBadge level={summary.risk_level} />}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.risk_score.toFixed(0) ?? '-'}分</div>
          </CardContent>
        </Card>
      </div>

      {/* 预测图表 */}
      <div className="grid gap-4 md:grid-cols-2">
        {revenue && <ForecastChart data={revenue} title="收入预测" color="#22c55e" />}
        {cost && <ForecastChart data={cost} title="成本预测" color="#ef4444" />}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cashFlow && <ForecastChart data={cashFlow} title="现金流预测" color="#3b82f6" />}

        {/* 项目风险 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              项目风险评估
              {risk && <RiskBadge level={risk.risk_level} />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {risk ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-muted rounded">
                    <div className="text-2xl font-bold">{risk.delay_rate * 100}%</div>
                    <div className="text-xs text-muted-foreground">延期率</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded">
                    <div className="text-2xl font-bold">{risk.completion_rate * 100}%</div>
                    <div className="text-xs text-muted-foreground">完成率</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>总项目数</span>
                    <span className="font-medium">{risk.total_projects}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>延期项目</span>
                    <span className="font-medium text-red-500">{risk.delayed_projects}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>风险评分</span>
                    <span className="font-medium">{risk.risk_score}/100</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                暂无项目风险数据
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
