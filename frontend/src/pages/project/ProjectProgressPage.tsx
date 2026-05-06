import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle, Circle, SkipForward, Loader2, ChevronDown, ChevronUp, Play, RotateCcw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getProjectProgress, advanceStage, skipStage, getProjectTimeline, type ProjectStage, type TimelineEntry } from "@/api/workflow"

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  pending: { label: "待处理", variant: "secondary", color: "bg-gray-300" },
  in_progress: { label: "进行中", variant: "default", color: "bg-blue-500" },
  completed: { label: "已完成", variant: "outline", color: "bg-green-500" },
  skipped: { label: "已跳过", variant: "secondary", color: "bg-gray-400" },
}

export default function ProjectProgressPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [expandedStage, setExpandedStage] = useState<string | null>(null)
  const [actionDialog, setActionDialog] = useState<{ type: "advance" | "skip"; stage: ProjectStage } | null>(null)
  const [remark, setRemark] = useState("")

  const { data: progress, isLoading } = useQuery({
    queryKey: ["project-progress", id],
    queryFn: () => getProjectProgress(id!),
    enabled: !!id,
  })

  const { data: timeline } = useQuery({
    queryKey: ["project-timeline", id],
    queryFn: () => getProjectTimeline(id!),
    enabled: !!id && !!expandedStage,
  })

  const advanceMut = useMutation({
    mutationFn: (data: { stage_code: string; action: string; remark?: string }) => advanceStage(id!, { target_stage_code: data.stage_code, action: data.action, data: { remark: data.remark } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-progress", id] })
      toast.success("阶段推进成功")
      setActionDialog(null)
      setRemark("")
    },
  })

  const skipMut = useMutation({
    mutationFn: (data: { stage_code: string; remark?: string }) => skipStage(id!, { target_stage_code: data.stage_code, remark: data.remark }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-progress", id] })
      toast.success("阶段已跳过")
      setActionDialog(null)
      setRemark("")
    },
  })

  const currentStageIndex = progress?.stages.findIndex((s) => s.status === "in_progress") ?? -1

  const handleAction = () => {
    if (!actionDialog) return
    if (actionDialog.type === "advance") {
      advanceMut.mutate({ stage_code: actionDialog.stage.code, action: "advance", remark: remark || undefined })
    } else {
      skipMut.mutate({ stage_code: actionDialog.stage.code, remark: remark || undefined })
    }
  }

  const stageTimeline = (stageCode: string) =>
    (timeline as TimelineEntry[] | undefined)?.filter((t) => t.from_stage === stageCode || t.to_stage === stageCode) ?? []

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-bold">{progress?.template_name ?? "项目进度"}</h1>
      </div>

      <div className="relative space-y-0">
        {progress?.stages.map((stage, idx) => {
          const config = STATUS_CONFIG[stage.status] ?? STATUS_CONFIG.pending
          const isCurrent = idx === currentStageIndex
          const isExpanded = expandedStage === stage.code

          return (
            <div key={stage.code} className="relative flex gap-4 pb-6">
              {idx < (progress?.stages.length ?? 0) - 1 && (
                <div className="absolute left-[15px] top-8 h-full w-0.5 bg-border" />
              )}

              <div className="relative z-10 mt-1">
                {stage.status === "completed" ? (
                  <CheckCircle className="size-8 text-green-500" />
                ) : isCurrent ? (
                  <div className={`size-8 rounded-full ${config.color} flex items-center justify-center`}>
                    <Play className="size-4 text-white" />
                  </div>
                ) : (
                  <Circle className={`size-8 ${stage.status === "skipped" ? "text-gray-400" : "text-gray-300"}`} />
                )}
              </div>

              <Card className={`flex-1 ${isCurrent ? "ring-2 ring-primary" : ""}`}>
                <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{stage.name}</CardTitle>
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {isCurrent && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setActionDialog({ type: "advance", stage })}>
                          <Play className="size-3" />
                          推进
                        </Button>
                        {!stage.code.includes("必") && (
                          <Button variant="ghost" size="sm" onClick={() => setActionDialog({ type: "skip", stage })}>
                            <SkipForward className="size-3" />
                            跳过
                          </Button>
                        )}
                      </>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => setExpandedStage(isExpanded ? null : stage.code)}>
                      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </Button>
                  </div>
                </CardHeader>
                {(isExpanded || stage.started_at) && (
                  <CardContent className="px-4 pb-4 pt-0">
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {stage.started_at && <p>开始: {stage.started_at}</p>}
                      {stage.completed_at && <p>完成: {stage.completed_at}</p>}
                      {stage.remark && <p>备注: {stage.remark}</p>}
                    </div>
                    {isExpanded && stageTimeline(stage.code).length > 0 && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        <p className="text-xs font-medium">操作记录</p>
                        {stageTimeline(stage.code).map((t) => (
                          <div key={t.id} className="text-xs text-muted-foreground">
                            <span className="font-medium">{t.operator}</span>{" "}
                            {t.action}: {t.from_stage} → {t.to_stage}
                            {t.remark && <span className="ml-1">({t.remark})</span>}
                            <span className="ml-1">{t.created_at}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            </div>
          )
        })}
      </div>

      <Dialog open={!!actionDialog} onOpenChange={(open) => !open && setActionDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{actionDialog?.type === "advance" ? "推进阶段" : "跳过阶段"} - {actionDialog?.stage.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">备注 (可选)</span>
            <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="填写备注..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>取消</Button>
            <Button onClick={handleAction} disabled={advanceMut.isPending || skipMut.isPending}>
              {(advanceMut.isPending || skipMut.isPending) && <Loader2 className="size-4 animate-spin" />}
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
