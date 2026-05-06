import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  getDashboard, getAlerts, sendCommand, getDailyBriefing,
  type Dashboard, type Alert, type CommandResult, type DailyReport,
} from '@/api/autopilot'
import {
  TrendingUp, TrendingDown, DollarSign, Zap, AlertTriangle,
  Send, Bot, BarChart3, Calendar, Package, FileText, Activity,
} from 'lucide-react'

function MetricCard({ title, value, sub, icon: Icon, trend, color = 'text-foreground' }: {
  title: string; value: string; sub?: string; icon: React.ElementType;
  trend?: number; color?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            {trend !== undefined && (
              <span className={`text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {trend >= 0 ? <TrendingUp className="inline w-3 h-3" /> : <TrendingDown className="inline w-3 h-3" />}
                {trend >= 0 ? '+' : ''}{trend}%
              </span>
            )}
          </div>
          <Icon className="w-8 h-8 text-muted-foreground/30" />
        </div>
      </CardContent>
    </Card>
  )
}

function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  const severityColor = { critical: 'bg-red-500', warning: 'bg-yellow-500', info: 'bg-blue-500' }
  const severityBadge = { critical: 'destructive', warning: 'secondary', info: 'outline' } as const
  return (
    <Card className="col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> 智能告警
          {alerts.length > 0 && <Badge variant="destructive">{alerts.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无告警</p>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {alerts.map(a => (
                <div key={a.id} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${severityColor[a.severity]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.message}</p>
                    <p className="text-xs text-blue-600 mt-1">{a.suggestion}</p>
                  </div>
                  <Badge variant={severityBadge[a.severity]} className="shrink-0 text-[10px]">
                    {a.severity === 'critical' ? '严重' : a.severity === 'warning' ? '警告' : '提示'}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

function CommandPanel() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<CommandResult[]>([])

  const handleSend = useCallback(async () => {
    if (!input.trim()) return
    const cmd = input.trim()
    setInput('')
    setLoading(true)
    try {
      const result = await sendCommand(cmd) as unknown as CommandResult
      setHistory(prev => [result, ...prev])
    } catch { /* ignore */ }
    setLoading(false)
  }, [input])

  const quickCommands = ['本月收入多少', '有哪些项目延期了', '应收有多少没收回来', '充电站运营状况']

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bot className="w-4 h-4" /> AI 指令中心
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3">
          <Input
            placeholder="问我任何经营数据... 例：本月收入多少"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <Button onClick={handleSend} disabled={loading} size="icon">
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-2 mb-3 flex-wrap">
          {quickCommands.map(cmd => (
            <Button key={cmd} variant="outline" size="sm" onClick={() => { setInput(cmd) }}
              className="text-xs h-7">
              {cmd}
            </Button>
          ))}
        </div>
        <ScrollArea className="h-[250px]">
          <div className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className="border rounded p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">{h.intent}</Badge>
                  <span className="text-xs text-muted-foreground">{h.command}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{h.answer}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function BriefingPanel() {
  const [briefing, setBriefing] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(false)

  const loadBriefing = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getDailyBriefing() as unknown as DailyReport
      setBriefing(data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadBriefing() }, [loadBriefing])

  return (
    <Card className="col-span-1 md:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" /> 每日经营简报
          <Button variant="ghost" size="sm" onClick={loadBriefing} disabled={loading} className="ml-auto text-xs h-6">
            刷新
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {briefing ? (
          <ScrollArea className="h-[200px]">
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{briefing.briefing}</div>
          </ScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground">{loading ? 'AI 正在生成简报...' : '点击刷新生成简报'}</p>
        )}
      </CardContent>
    </Card>
  )
}

function UpcomingPanel({ items }: { items: Dashboard['upcoming'] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calendar className="w-4 h-4" /> 即将到期
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无待办</p>
        ) : (
          <div className="space-y-2">
            {items.items.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Badge variant={item.type.includes('receivable') ? 'default' : 'outline'} className="text-[10px]">
                  {item.type.includes('receivable') ? '应收' : item.type.includes('payable') ? '应付' : '合同'}
                </Badge>
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.date}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AutopilotPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [d, a] = await Promise.all([
        getDashboard() as unknown as Dashboard,
        getAlerts() as unknown as { alerts: Alert[]; total: number },
      ])
      setDashboard(d)
      setAlerts(a.alerts)
    } catch (e) {
      console.error('Failed to load autopilot data', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  if (loading || !dashboard) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const m = dashboard.quick_metrics
  const fmt = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
  const p = dashboard.projects
  const s = dashboard.stations
  const arap = dashboard.finance.arap

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">自动驾驶中心</h1>
          <Badge variant={dashboard.company_status === 'green' ? 'default' : 'secondary'}
            className="text-xs">
            {dashboard.company_status === 'green' ? '一切正常' : '需要关注'}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="text-xs">
          <Activity className="w-3 h-3 mr-1" /> 刷新
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          title="现金余额" value={`¥${fmt(m.cash_balance)}`}
          icon={DollarSign} color={m.cash_balance < 50000 ? 'text-red-600' : 'text-green-600'}
        />
        <MetricCard
          title="本月利润" value={`¥${fmt(m.month_profit)}`}
          sub={`收入 ¥${fmt(m.month_income)} | 支出 ¥${fmt(m.month_expense)}`}
          icon={BarChart3} trend={m.income_change_pct}
          color={m.month_profit >= 0 ? 'text-green-600' : 'text-red-600'}
        />
        <MetricCard
          title="充电营收(本月)" value={`¥${fmt(dashboard.charging.this_month.revenue)}`}
          sub={`${dashboard.charging.this_month.orders} 单 | ${dashboard.charging.this_month.kwh} kWh`}
          icon={Zap}
        />
        <MetricCard
          title="运营充电站" value={`${s.status_counts.operating || 0}`}
          sub={`进行中项目: ${p.by_status.in_progress?.count || 0} 个`}
          icon={Activity}
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          title="应收余额" value={`¥${fmt(arap.receivable.remaining)}`}
          sub={`逾期 ${arap.receivable.overdue_count} 笔 / ¥${fmt(arap.receivable.overdue_amount)}`}
          icon={TrendingUp} color={arap.receivable.overdue_amount > 0 ? 'text-yellow-600' : 'text-foreground'}
        />
        <MetricCard
          title="应付余额" value={`¥${fmt(arap.payable.remaining)}`}
          icon={TrendingDown} color="text-orange-600"
        />
        <MetricCard
          title="项目预算" value={`¥${fmt(p.total_budget)}`}
          sub={`已用 ${p.budget_usage_pct}% | 延期 ${p.delayed_count} 个`}
          icon={Package}
        />
        <MetricCard
          title="库存总值" value={`¥${fmt(dashboard.inventory.total_value)}`}
          sub={`${dashboard.inventory.total_items} 项 | 低库存 ${dashboard.inventory.low_stock_count} 项`}
          icon={Package}
        />
      </div>

      {/* Alerts + Command */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AlertsPanel alerts={alerts} />
        <CommandPanel />
      </div>

      {/* Briefing + Upcoming */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BriefingPanel />
        <UpcomingPanel items={dashboard.upcoming} />
      </div>

      {/* Top Stations */}
      {s.top_revenue_stations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4" /> 充电站30日收益排名
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              {s.top_revenue_stations.map((st, i) => (
                <div key={i} className="border rounded p-2">
                  <p className="text-sm font-medium truncate">{st.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {st.orders_30d} 单 | ¥{fmt(st.revenue_30d)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
