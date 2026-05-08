import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ShieldCheck, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  listEvolutionHistory, applyEvolution, rollbackEvolution,
  type EvolutionHistoryItem,
} from "@/api/agent-evolution"

export default function EvolutionApprovals() {
  const qc = useQueryClient()

  const { data: historyData, isLoading } = useQuery({
    queryKey: ["evo-approvals"],
    queryFn: () => listEvolutionHistory({ status: "pending" }),
  })

  const applyMut = useMutation({
    mutationFn: applyEvolution,
    onSuccess: (d) => {
      if (d?.regression_rolled_back) {
        toast.warning(`回归测试失败，已自动回滚: ${d.reason}`)
      } else {
        toast.success("已应用")
      }
      qc.invalidateQueries({ queryKey: ["evo-approvals"] })
    },
    onError: () => toast.error("应用失败"),
  })

  const rollbackMut = useMutation({
    mutationFn: rollbackEvolution,
    onSuccess: () => { toast.success("已回滚"); qc.invalidateQueries({ queryKey: ["evo-approvals"] }) },
    onError: () => toast.error("回滚失败"),
  })

  const items: EvolutionHistoryItem[] = historyData?.items ?? []

  const levelLabel = (l: number) => {
    const m: Record<number, string> = { 1: "技能描述", 2: "工具描述", 3: "系统提示词", 4: "代码逻辑" }
    return m[l] || `Level ${l}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">进化审批</h1>
          <p className="text-sm text-muted-foreground">Level 3+ 进化需人工审批 · 回归测试自动保障</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="size-6 animate-spin" /></div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            暂无待审批的进化记录
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((h) => (
            <Card key={h.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Level {h.level}</Badge>
                      <Badge variant="secondary">{levelLabel(h.level)}</Badge>
                      <Badge variant="secondary">{h.evolution_type || "prompt_mutate"}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{h.diff_summary || "无变更描述"}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>评分: {(h.score_before ?? 0).toFixed(2)} → {(h.score_after ?? 0).toFixed(2)}</span>
                      <span className={h.delta > 0 ? "text-green-600" : "text-red-500"}>
                        ({h.delta > 0 ? "+" : ""}{h.delta?.toFixed(2) || "0.00"})
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => applyMut.mutate(h.id)} disabled={applyMut.isPending}>
                      {applyMut.isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : null}
                      批准应用
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rollbackMut.mutate(h.id)} disabled={rollbackMut.isPending}>
                      拒绝回滚
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
