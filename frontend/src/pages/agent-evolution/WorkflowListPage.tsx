import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { GitBranch, Play, Loader2, Plus, Sparkles, Pencil } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { useState } from "react"
import {
  listWorkflowTemplates, initPresetWorkflows, autoGenerateWorkflow,
  type WorkflowTemplate,
} from "@/api/agent-evolution"

export default function WorkflowListPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const [genDesc, setGenDesc] = useState("")
  const [genName, setGenName] = useState("")

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ["evo-workflows"],
    queryFn: () => listWorkflowTemplates(),
  })

  const initMut = useMutation({
    mutationFn: initPresetWorkflows,
    onSuccess: (d) => { toast.success(`已创建${d?.created || 0}个预置工作流`); qc.invalidateQueries({ queryKey: ["evo-workflows"] }) },
  })

  const genMut = useMutation({
    mutationFn: () => autoGenerateWorkflow({ description: genDesc, name: genName || undefined }),
    onSuccess: () => { toast.success("工作流已生成"); setGenDesc(""); setGenName(""); qc.invalidateQueries({ queryKey: ["evo-workflows"] }) },
    onError: () => toast.error("生成失败"),
  })

  const templates: WorkflowTemplate[] = templatesData?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="size-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">工作流引擎</h1>
            <p className="text-sm text-muted-foreground">多Agent协作编排 · 自动生成 · 进化优化</p>
          </div>
        </div>
        <Button onClick={() => initMut.mutate()} disabled={initMut.isPending}>
          {initMut.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
          初始化预置工作流
        </Button>
      </div>

      {/* 自动生成 */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="size-4" />AI自动生成工作流</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">工作流名称（可选）</Label>
              <Input value={genName} onChange={(e) => setGenName(e.target.value)} placeholder="如：设备巡检流程" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">描述你想要的工作流</Label>
              <div className="flex gap-2">
                <Input value={genDesc} onChange={(e) => setGenDesc(e.target.value)} placeholder="如：帮我创建一个充电站异常监控和自动派单流程" className="h-8" />
                <Button size="sm" disabled={!genDesc || genMut.isPending} onClick={() => genMut.mutate()}>
                  {genMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 工作流列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="size-6 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{t.name}</CardTitle>
                  <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <p className="text-muted-foreground line-clamp-2">{t.description}</p>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex gap-2">
                    <span>节点: {t.node_count}</span>
                    <span>适应度: {t.fitness_score?.toFixed(2) || "—"}</span>
                    <span>v{t.version}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => nav(`/agent-evolution/workflow-editor/${t.id}`)}>
                    <Pencil className="size-3" />
                  </Button>
                </div>
                {t.category && (
                  <Badge variant="outline" className="mt-1">{t.category}</Badge>
                )}
              </CardContent>
            </Card>
          ))}
          {templates.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              暂无工作流模板，点击"初始化预置工作流"或使用AI自动生成
            </div>
          )}
        </div>
      )}
    </div>
  )
}
