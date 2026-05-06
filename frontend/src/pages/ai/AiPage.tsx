import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Brain, Lightbulb, ThumbsUp, AlertTriangle, BarChart3, Heart, ShoppingCart, MonitorSmartphone, Users, Network, Newspaper, Play, FolderKanban, X, MessageSquare, Send } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import * as api from "@/api/ai";
import { listProjects } from "@/api/project";
import type { Project } from "@/api/types";

const cards = [
  { key: "insights", label: "AI洞察", icon: Lightbulb, fn: api.getInsights },
  { key: "recommendations", label: "智能建议", icon: ThumbsUp, fn: api.getRecommendations },
  { key: "riskAlerts", label: "风险预警", icon: AlertTriangle, fn: api.getRiskAlerts },
  { key: "projectRisk", label: "项目风险", icon: AlertTriangle, fn: api.getProjectRisk },
  { key: "stationRevenue", label: "站点收入", icon: BarChart3, fn: api.getStationRevenue },
  { key: "financeHealth", label: "财务健康", icon: Heart, fn: api.getFinanceHealth },
  { key: "procurement", label: "采购分析", icon: ShoppingCart, fn: api.getProcurementAnalysis },
  { key: "deviceHealth", label: "设备健康", icon: MonitorSmartphone, fn: api.getDeviceHealth },
  { key: "customerChurn", label: "客户流失", icon: Users, fn: api.getCustomerChurn },
  { key: "crossBusiness", label: "跨业务分析", icon: Network, fn: api.getCrossBusiness },
] as const;

export default function AiPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogData, setDialogData] = useState<any>(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [taskType, setTaskType] = useState("create_alert");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectAnalysis, setProjectAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);

  const { data: briefing, isLoading: briefingLoading } = useQuery({ queryKey: ["daily-briefing"], queryFn: api.getDailyBriefing as () => Promise<any> });

  const { data: projectsData } = useQuery({
    queryKey: ["ai-projects"],
    queryFn: () => listProjects({ page_size: 50 }) as any,
  });

  const projects: Project[] = (projectsData as any)?.items ?? [];

  const taskMut = useMutation({
    mutationFn: api.executeAiTask,
    onSuccess: () => { toast.success("任务已执行"); },
    onError: () => { toast.error("任务执行失败"); },
  });

  async function openCard(label: string, fn: () => Promise<any>) {
    setDialogTitle(label);
    setDialogData(null);
    setDialogLoading(true);
    setDialogOpen(true);
    try {
      const result = await fn();
      setDialogData(result);
    } catch {
      toast.error("获取数据失败");
    } finally {
      setDialogLoading(false);
    }
  }

  async function selectProject(project: Project) {
    setSelectedProject(project);
    setProjectAnalysis(null);
    setAnalysisLoading(true);
    setChatMessages([]);
    try {
      const result = await api.getProjectAnalysis(project.id);
      setProjectAnalysis(result);
      setChatMessages([{ role: "assistant", content: typeof result === "string" ? result : JSON.stringify(result, null, 2) }]);
    } catch {
      setChatMessages([{ role: "assistant", content: "项目分析加载失败，你可以继续提问。" }]);
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !selectedProject) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    try {
      const result = await api.getProjectRisk({ project_id: selectedProject.id, question: userMsg } as Record<string, unknown>);
      const content = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      setChatMessages((prev) => [...prev, { role: "assistant", content }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "分析请求失败，请重试。" }]);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Newspaper className="h-5 w-5" />每日简报</CardTitle></CardHeader>
        <CardContent>
          {briefingLoading ? <Skeleton className="h-24 w-full" /> : (
            <div className="text-sm whitespace-pre-wrap">{briefing?.content ?? briefing?.summary ?? "暂无简报"}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            项目分析
            {selectedProject && (
              <Badge variant="secondary" className="ml-2 gap-1">
                {selectedProject.name}
                <X className="h-3 w-3 cursor-pointer" onClick={() => { setSelectedProject(null); setProjectAnalysis(null); setChatMessages([]); }} />
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedProject ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => selectProject(proj)}
                >
                  <FolderKanban className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{proj.name}</div>
                    <div className="text-xs text-muted-foreground">{proj.project_code} · {proj.status}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{proj.progress ?? 0}%</Badge>
                </div>
              ))}
              {projects.length === 0 && <p className="text-sm text-muted-foreground">暂无项目</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-1">
                  <FolderKanban className="h-4 w-4 text-primary" />
                  <span className="font-medium">{selectedProject.name}</span>
                  <Badge variant="outline">{selectedProject.project_type}</Badge>
                  <Badge variant={selectedProject.status === "active" ? "default" : "secondary"}>{selectedProject.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedProject.province}{selectedProject.province ? " " : ""}{selectedProject.city}
                  {selectedProject.start_date && ` · ${selectedProject.start_date} ~ ${selectedProject.end_date || "进行中"}`}
                  {selectedProject.total_budget && ` · 预算 ¥${(selectedProject.total_budget / 10000).toFixed(1)}万`}
                  {" · 进度 "}{selectedProject.progress ?? 0}%
                </div>
              </div>

              {analysisLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                      {msg.role === "assistant" && <MessageSquare className="h-4 w-4 mt-1 shrink-0 text-primary" />}
                      <div className={`rounded-lg px-3 py-2 text-sm max-w-[80%] whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder={`对"${selectedProject.name}"提问...`}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  className="flex-1"
                />
                <Button onClick={sendChat} disabled={!chatInput.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Card key={c.key} className="flex flex-col items-center justify-center p-4 hover:shadow-md transition-shadow">
            <c.icon className="h-8 w-8 mb-2 text-primary" />
            <CardTitle className="text-sm text-center mb-3">{c.label}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => openCard(c.label, c.fn)}>查看</Button>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5" />AI任务执行</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <Label>任务类型</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v ?? "")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_alert">创建预警</SelectItem>
                  <SelectItem value="generate_report">生成报告</SelectItem>
                  <SelectItem value="summarize_module">模块摘要</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => taskMut.mutate({ task_type: taskType })} disabled={taskMut.isPending}>
              <Play className="mr-1 h-4 w-4" />执行
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle></DialogHeader>
          {dialogLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : dialogData ? (
            <div className="space-y-4">
              {Array.isArray(dialogData.items) ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {Object.keys(dialogData.items[0] ?? {}).map((k) => (
                        <th key={k} className="text-left p-2 font-medium">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dialogData.items.map((item: any, i: number) => (
                      <tr key={i} className="border-b">
                        {Object.values(item).map((v: any, j: number) => (
                          <td key={j} className="p-2">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="whitespace-pre-wrap text-sm">{typeof dialogData === "string" ? dialogData : JSON.stringify(dialogData, null, 2)}</div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
