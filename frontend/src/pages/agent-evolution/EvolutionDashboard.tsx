import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Brain, Activity, TrendingUp, AlertTriangle, Zap, ArrowUpRight, ArrowDownRight, Loader2, Check, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { toast } from "sonner"
import {
  getAgentStats, listAgents, listEvolutionTargets, getEvolutionHistory,
  applyEvolution, rollbackEvolution, initBuiltinAgents, getQualityTrend,
  type AgentItem, type EvolutionHistoryItem,
} from "@/api/agent-evolution"

export default function EvolutionDashboard() {
  const qc = useQueryClient()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const { data: stats } = useQuery({ queryKey: ["evo-stats"], queryFn: () => getAgentStats() })
  const { data: agentsData } = useQuery({ queryKey: ["evo-agents"], queryFn: () => listAgents() })
  const { data: targetsData } = useQuery({ queryKey: ["evo-targets"], queryFn: () => listEvolutionTargets() })
  const { data: historyData } = useQuery({
    queryKey: ["evo-history", selectedAgent],
    queryFn: () => getEvolutionHistory(selectedAgent!),
    enabled: !!selectedAgent,
  })
  const { data: trendData } = useQuery({
    queryKey: ["evo-trend", selectedAgent],
    queryFn: () => getQualityTrend(selectedAgent!, { days: 30 }),
    enabled: !!selectedAgent,
  })

  const initMut = useMutation({
    mutationFn: initBuiltinAgents,
    onSuccess: (d) => { toast.success(`已初始化: ${d?.agents_created || 0}个Agent`); qc.invalidateQueries({ queryKey: ["evo"] }) },
  })

  const applyMut = useMutation({
    mutationFn: applyEvolution,
    onSuccess: () => { toast.success("进化已应用"); qc.invalidateQueries({ queryKey: ["evo"] }) },
    onError: () => toast.error("应用失败"),
  })

  const rollbackMut = useMutation({
    mutationFn: rollbackEvolution,
    onSuccess: () => { toast.success("已回滚"); qc.invalidateQueries({ queryKey: ["evo"] }) },
    onError: () => toast.error("回滚失败"),
  })

  const agents: AgentItem[] = agentsData?.items ?? []
  const targets = targetsData?.targets ?? []
  const history: EvolutionHistoryItem[] = historyData?.items ?? []
  const trend = trendData?.data ?? []
  const s = stats

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="size-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold">智能进化中心</h1>
            <p className="text-sm text-muted-foreground">Agent自动优化 · 工作流编排 · 闭环学习</p>
          </div>
        </div>
        <Button onClick={() => initMut.mutate()} disabled={initMut.isPending}>
          {initMut.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
          初始化预置Agent
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{s?.total_agents || 0}</div>
            <p className="text-xs text-muted-foreground">Agent总数</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{s?.active_agents || 0}</div>
            <p className="text-xs text-muted-foreground">活跃Agent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{s?.avg_quality?.toFixed(2) || "—"}</div>
            <p className="text-xs text-muted-foreground">平均质量分</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{s?.total_executions || 0}</div>
            <p className="text-xs text-muted-foreground">总执行次数</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agents">Agent列表</TabsTrigger>
          <TabsTrigger value="targets">进化候选</TabsTrigger>
          <TabsTrigger value="history">进化历史</TabsTrigger>
        </TabsList>

        {/* Agent列表 */}
        <TabsContent value="agents">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((a) => (
              <Card key={a.id} className={`cursor-pointer hover:shadow-md transition-shadow ${selectedAgent === a.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelectedAgent(a.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{a.name}</CardTitle>
                    <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs space-y-1">
                  <p className="text-muted-foreground line-clamp-2">{a.description}</p>
                  <div className="flex items-center justify-between pt-2">
                    <span>质量: <b>{a.quality_score?.toFixed(2) || "—"}</b></span>
                    <span>执行: {a.execution_count}次</span>
                    <span>v{a.version}</span>
                  </div>
                  {a.quality_score !== null && (
                    <div className="flex items-center gap-1 pt-1">
                      {a.quality_score >= 0.7 ? <ArrowUpRight className="size-3 text-green-500" /> : <ArrowDownRight className="size-3 text-red-500" />}
                      <span className={a.quality_score >= 0.7 ? "text-green-600" : "text-red-500"}>
                        {a.quality_score >= 0.7 ? "健康" : "需优化"}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {agents.length === 0 && (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                暂无Agent，点击右上角"初始化预置Agent"开始
              </div>
            )}
          </div>
        </TabsContent>

        {/* 进化候选 */}
        <TabsContent value="targets">
          <Card>
            <CardHeader><CardTitle className="text-sm">待进化目标</CardTitle></CardHeader>
            <CardContent>
              {targets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">当前没有需要进化的Agent</p>
              ) : (
                <div className="space-y-3">
                  {targets.map((t, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{t.agent_name}</p>
                        <p className="text-xs text-muted-foreground">
                          当前得分: {t.current_score?.toFixed(2) || "—"} · {t.reasons?.join("、")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="size-4 text-yellow-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 进化历史 */}
        <TabsContent value="history">
          <div className="space-y-4">
            {selectedAgent && trend.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">质量趋势</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="avg_score" stroke="#8884d8" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-sm">进化记录</CardTitle></CardHeader>
              <CardContent>
                {!selectedAgent ? (
                  <p className="text-sm text-muted-foreground text-center py-8">点击Agent卡片查看其进化历史</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">暂无进化记录</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Level {h.level}</Badge>
                            <Badge variant={h.status === "approved" ? "default" : h.status === "pending" ? "secondary" : "destructive"}>
                              {h.status}
                            </Badge>
                            <span className="text-muted-foreground">{h.diff_summary}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {h.score_before?.toFixed(2) || "—"} → {h.score_after?.toFixed(2) || "—"}
                            <span className={h.delta > 0 ? "text-green-600 ml-1" : "text-red-500 ml-1"}>
                              ({h.delta > 0 ? "+" : ""}{h.delta.toFixed(2)})
                            </span>
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {h.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => applyMut.mutate(h.id)}>
                                <Check className="size-3 mr-1" />应用
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => rollbackMut.mutate(h.id)}>
                                <X className="size-3 mr-1" />拒绝
                              </Button>
                            </>
                          )}
                          {h.status === "approved" && (
                            <Button size="sm" variant="ghost" onClick={() => rollbackMut.mutate(h.id)}>
                              回滚
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
