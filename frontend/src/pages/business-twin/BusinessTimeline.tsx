import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTimeline, listMetrics } from '@/api/business-twin'
import type { TimelineItem, BizMetric } from '@/api/business-twin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  FileSignature,
  DollarSign,
  Building2,
  Zap,
  Package,
  TrendingUp,
  TrendingDown,
  Calendar,
} from 'lucide-react'

const EVENT_ICONS: Record<string, React.ElementType> = {
  contract_signed: FileSignature,
  payment_made: DollarSign,
  payment_received: DollarSign,
  project_created: Building2,
  project_started: Building2,
  charging_order: Zap,
  invoice_received: Package,
}

const IMPORTANCE_COLORS = {
  high: 'border-l-red-500',
  medium: 'border-l-yellow-500',
  normal: 'border-l-gray-300',
}

const IMPORTANCE_BADGES = {
  high: 'destructive' as const,
  medium: 'secondary' as const,
  normal: 'outline' as const,
}

function formatAmount(amount: number | null | undefined): string {
  if (!amount) return ''
  if (amount >= 10000) return `${(amount / 10000).toFixed(1)}万`
  return amount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function formatFullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN')
}

function MetricCard({ title, value, trend, icon: Icon }: {
  title: string
  value: string
  trend?: 'up' | 'down'
  icon: React.ElementType
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend && (
          <div className="flex items-center gap-1 mt-1 text-xs">
            {trend === 'up' ? (
              <TrendingUp className="size-3 text-green-500" />
            ) : (
              <TrendingDown className="size-3 text-red-500" />
            )}
            <span className={trend === 'up' ? 'text-green-500' : 'text-red-500'}>
              {trend === 'up' ? '上升' : '下降'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function BusinessTimeline() {
  const [view, setView] = useState<'month' | 'quarter'>('month')
  const [filterModule, setFilterModule] = useState<string>('all')
  const [search, setSearch] = useState('')

  const now = new Date()
  const startDate = view === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    : new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString()

  const { data: timelineData, isLoading } = useQuery({
    queryKey: ['business-twin', 'timeline', view, filterModule],
    queryFn: () => getTimeline({
      start_date: startDate,
      event_types: filterModule !== 'all' ? filterModule : undefined,
      limit: 100,
    }),
  })

  const { data: metricsData } = useQuery({
    queryKey: ['business-twin', 'metrics', 'monthly'],
    queryFn: () => listMetrics({ period_type: 'monthly' }),
  })

  const timeline = timelineData?.items ?? []
  const metrics = metricsData?.items ?? []

  const revenueMetric = metrics.find(m => m.metric_type === 'revenue')
  const costMetric = metrics.find(m => m.metric_type === 'cost')
  const profitMetric = metrics.find(m => m.metric_type === 'net_profit')
  const contractMetric = metrics.find(m => m.metric_type === 'contract_count')

  const filteredTimeline = search
    ? timeline.filter(t =>
        JSON.stringify(t.event_data).toLowerCase().includes(search.toLowerCase()) ||
        t.event_type.toLowerCase().includes(search.toLowerCase())
      )
    : timeline

  // 按日期分组
  const grouped = filteredTimeline.reduce<Record<string, TimelineItem[]>>((acc, item) => {
    const day = formatDate(item.event_date)
    if (!acc[day]) acc[day] = []
    acc[day].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">业务时间轴</h1>
        <Tabs value={view} onValueChange={(v) => setView(v as 'month' | 'quarter')}>
          <TabsList>
            <TabsTrigger value="month">本月</TabsTrigger>
            <TabsTrigger value="quarter">本季度</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 指标卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="收入"
          value={revenueMetric ? formatAmount(revenueMetric.value) : '暂无数据'}
          trend={revenueMetric && revenueMetric.value > 0 ? 'up' : undefined}
          icon={TrendingUp}
        />
        <MetricCard
          title="成本"
          value={costMetric ? formatAmount(costMetric.value) : '暂无数据'}
          trend={costMetric && costMetric.value > 0 ? 'down' : undefined}
          icon={TrendingDown}
        />
        <MetricCard
          title="净利润"
          value={profitMetric ? formatAmount(profitMetric.value) : '暂无数据'}
          trend={profitMetric && profitMetric.value > 0 ? 'up' : profitMetric ? 'down' : undefined}
          icon={DollarSign}
        />
        <MetricCard
          title="合同数"
          value={contractMetric ? String(contractMetric.value) : '暂无数据'}
          icon={FileSignature}
        />
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="搜索事件..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterModule} onValueChange={(v) => setFilterModule(v ?? 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="来源模块" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部模块</SelectItem>
            <SelectItem value="contract_signed">合同签约</SelectItem>
            <SelectItem value="payment_made">付款</SelectItem>
            <SelectItem value="payment_received">收款</SelectItem>
            <SelectItem value="project_created">项目创建</SelectItem>
            <SelectItem value="charging_order">充电订单</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 时间轴 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          加载中...
        </div>
      ) : filteredTimeline.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <div className="text-center">
              <Calendar className="size-12 mx-auto mb-4 opacity-50" />
              <p>暂无业务事件</p>
              <p className="text-sm mt-1">业务操作后会自动记录到这里</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="relative pl-8">
            {/* 时间轴竖线 */}
            <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />

            {Object.entries(grouped).map(([day, items]) => (
              <div key={day} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative z-10 size-6 rounded-full bg-primary flex items-center justify-center">
                    <div className="size-2 rounded-full bg-primary-foreground" />
                  </div>
                  <span className="font-semibold text-sm">{day}</span>
                </div>

                <div className="space-y-2 ml-2">
                  {items.map((item) => {
                    const Icon = EVENT_ICONS[item.event_type] || Calendar
                    return (
                      <div
                        key={item.id}
                        className={`border-l-4 ${IMPORTANCE_COLORS[item.importance]} bg-card rounded-r-lg p-3 shadow-sm`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4 text-muted-foreground" />
                            <span className="font-medium text-sm">{item.event_type}</span>
                            <Badge variant={IMPORTANCE_BADGES[item.importance]} className="text-xs">
                              {item.importance === 'high' ? '重要' : item.importance === 'medium' ? '一般' : '普通'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            {item.amount && (
                              <span className="text-sm font-medium text-green-600">
                                {formatAmount(item.amount)}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatFullDate(item.event_date)}
                            </span>
                          </div>
                        </div>
                        {item.event_data && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {item.event_data.description as string ||
                              item.event_data.contract_name as string ||
                              item.event_data.project_name as string ||
                              item.event_data.supplier_name as string ||
                              JSON.stringify(item.event_data).slice(0, 100)}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
