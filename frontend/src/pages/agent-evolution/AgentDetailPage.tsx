import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Play, Trash2, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { useState } from "react"
import {
  getAgent, toggleAgentStatus, deleteAgent, executeAgent,
  evolveAgent, getQualityTrend, getEvolutionHistory,
  applyEvolution, rollbackEvolution,
  type EvoAgent, type EvolutionHistoryItem, type QualityTrendPoint,
} from "@/api/agent-evolution"

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [testInput, setTestInput] = useState("")

  const { data: agent, isLoading } = useQuery({
    queryKey: ["evo-agent", id],
    queryFn: () => getAgent(id!),
    enabled: !!id,
  })

  const { data: trendData } = useQuery({
    queryKey: ["evo-trend", id],
    queryFn: () => getQualityTrend(id!, { days: 30 }),
    enabled: !!id,
  })

  const { data: historyData } = useQuery({
    queryKey: ["evo-history", id],
    queryFn: () => getEvolutionHistory(id!),
    enabled: !!id,
  })

  const toggleMut = useMutation({
    mutationFn: (status: string) => toggleAgentStatus(id!, status),
    onSuccess: () => { toast.success("状态已更新"); qc.invalidateQueries({ queryKey: ["evo-agent", id] }) },
  })

  const execMut = useMutation({
    mutationFn: () => executeAgent({ agent_id: id!, input_data: { query: testInput } }),
    onSuccess: (d) => toast.success(`执行完成: ${d?.status}, 质量${typeof d?.quality_score === "number" ? d.quality_score.toFixed(2) : "—"}`),
    onError: () => toast.error("执行失败"),
  })

  const evolveMut = useMutation({
    mutationFn: () => evolveAgent(id!, { level: 3, num_variants: 3 }),
    onSuccess: (d) => {
      const variants = d?.variants ?? []
      toast.success(`生成${variants.length}个变体`)
      qc.invalidateQueries({ queryKey: ["evo-history", id] })
    },
    onError: () => toast.error("进化失败"),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteAgent(id!),
    onSuccess: () => { toast.success("已删除"); nav("/agent-evolution") },
  })

  const applyMut = useMutation({
    mutationFn: applyEvolution,
    onSuccess: () => { toast.success("已应用"); qc.invalidateQueries({ queryKey: ["evo-history", id] }) },
  })

  const a = agent
  const history: EvolutionHistoryItem[] = historyData?.items ?? []
  const trend: QualityTrendPoint[] = trendData?.data ?? []

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="size-6 animate-spin" /></div>
  if (!a) return <div className="text-center py-12 text-muted-foreground">Agent不存在</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => nav("/agent-evolution")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{a.name}</h1>
            <p className="text-sm text-muted-foreground">v{a.version} · {a.status}</p>
          </div>
          <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
            onClick={() => toggleMut.mutate(a.status === "active" ? "disabled" : "active")}>
            {a.status === "active" ? "禁用" : "启用"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => evolveMut.mutate()} disabled={evolveMut.isPending}>
            {evolveMut.isPending && <Loader2 className="size-3 mr-1 animate-spin" />}
            触发进化
          </Button>
          <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate()}>
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 基本信息 */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Agent配置</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">描述</Label>
              <p className="text-sm">{a.description || "无"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">系统提示词 (System Prompt)</Label>
              <Textarea value={a.system_prompt || ""} readOnly rows={6} className="text-xs font-mono" />
            </div>
            {a.config && (
              <div>
                <Label className="text-xs text-muted-foreground">配置</Label>
                <pre className="text-xs bg-muted p-2 rounded mt-1">{JSON.stringify(a.config, null, 2)}</pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 统计 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">运行统计</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">质量分</span>
              <b>{a.quality_score?.toFixed(2) || "—"}</b>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">执行次数</span>
              <b>{a.execution_count}</b>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">成功次数</span>
              <b>{a.success_count}</b>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">成功率</span>
              <b>{a.execution_count ? ((a.success_count / a.execution_count) * 100).toFixed(1) + "%" : "—"}</b>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">版本</span>
              <b>v{a.version}</b>
            </div>

            <hr />

            {/* 测试执行 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">测试执行</Label>
              <Input
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="输入测试问题..."
                className="h-8 text-sm"
              />
              <Button size="sm" className="w-full" disabled={!testInput || execMut.isPending}
                onClick={() => execMut.mutate()}>
                {execMut.isPending && <Loader2 className="size-3 mr-1 animate-spin" />}
                <Play className="size-3 mr-1" />执行
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 进化历史 */}
      <Card>
        <CardHeader><CardTitle className="text-sm">进化历史</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">暂无进化记录</p>
          ) : (
            <div className="space-y-2">
              {history.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Level {h.level}</Badge>
                      <Badge variant={h.status === "approved" ? "default" : h.status === "pending" ? "secondary" : "destructive"}>
                        {h.status}
                      </Badge>
                      <span className="text-muted-foreground text-xs">{h.diff_summary}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(h.score_before ?? 0).toFixed(2)} → {(h.score_after ?? 0).toFixed(2)}
                      <span className={h.delta > 0 ? "text-green-600 ml-1" : "text-red-500 ml-1"}>
                        ({h.delta > 0 ? "+" : ""}{h.delta.toFixed(2)})
                      </span>
                    </p>
                  </div>
                  {h.status === "pending" && (
                    <Button size="sm" onClick={() => applyMut.mutate(h.id)}>应用</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
