import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/api/workflow";

const businessTypeMap: Record<string, string> = {
  procurement: "采购审批",
  expense: "费用审批",
  contract: "合同审批",
  project_milestone: "里程碑审批",
  reimbursement: "报销审批",
};

const templateStatusMap: Record<string, { label: string; variant: "default" | "secondary" }> = {
  active: { label: "启用中", variant: "default" },
  inactive: { label: "已停用", variant: "secondary" },
};

const instanceStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "待审批", variant: "secondary" },
  approved: { label: "已通过", variant: "default" },
  rejected: { label: "已拒绝", variant: "destructive" },
  cancelled: { label: "已取消", variant: "outline" },
};

const urgencyMap: Record<number, string> = { 1: "普通", 2: "重要", 3: "紧急" };

const defaultNodeConfig = { steps: [{ name: "部门主管审批", approver_ids: [] as string[] }, { name: "财务审批", approver_ids: [] as string[] }] };

const emptyTemplateForm = {
  name: "",
  code: "",
  business_type: "procurement",
  description: "",
  node_config: JSON.stringify(defaultNodeConfig, null, 2),
};

export default function WorkflowConfigPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"template" | "instance">("template");
  const [templatePage, setTemplatePage] = useState(1);
  const [instancePage, setInstancePage] = useState(1);
  const [bizTypeFilter, setBizTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState({ ...emptyTemplateForm });

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ id: string; action: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");

  const templateQuery = useQuery({
    queryKey: ["wf-templates", templatePage, bizTypeFilter],
    queryFn: () => api.listWfTemplates({ page: templatePage, page_size: 20, business_type: bizTypeFilter === "all" ? undefined : bizTypeFilter }),
  });

  const instanceQuery = useQuery({
    queryKey: ["wf-instances", instancePage, statusFilter],
    queryFn: () => {
      const params: any = { page: instancePage, page_size: 20 };
      if (statusFilter !== "all") params.status = statusFilter;
      return statusFilter === "pending" ? api.listPendingInstances(params) : api.listWfInstances(params);
    },
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.createWfTemplate(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wf-templates"] }); toast.success("模板已创建"); setTemplateDialogOpen(false); },
    onError: () => { toast.error("创建失败"); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateWfTemplate(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wf-templates"] }); toast.success("模板已更新"); setTemplateDialogOpen(false); },
    onError: () => { toast.error("更新失败"); },
  });

  const deleteMut = useMutation({
    mutationFn: api.deleteWfTemplate,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wf-templates"] }); toast.success("模板已删除"); },
    onError: () => { toast.error("删除失败"); },
  });

  const approveMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { action: "approve" | "reject"; comment?: string } }) => api.approveWfInstance(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wf-instances"] }); toast.success("操作成功"); setActionDialogOpen(false); },
    onError: () => { toast.error("操作失败"); },
  });

  const cancelMut = useMutation({
    mutationFn: api.cancelWfInstance,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wf-instances"] }); toast.success("已取消"); },
    onError: () => { toast.error("取消失败"); },
  });

  function openCreateDialog() {
    setEditingId(null);
    setTemplateForm({ ...emptyTemplateForm });
    setTemplateDialogOpen(true);
  }

  function openEditDialog(t: any) {
    setEditingId(t.id);
    setTemplateForm({
      name: t.name,
      code: t.code,
      business_type: t.business_type,
      description: t.description ?? "",
      node_config: t.node_config ? JSON.stringify(t.node_config, null, 2) : JSON.stringify(defaultNodeConfig, null, 2),
    });
    setTemplateDialogOpen(true);
  }

  function handleTemplateSave() {
    let parsed: any;
    try { parsed = JSON.parse(templateForm.node_config); } catch { toast.error("节点配置JSON格式错误"); return; }
    const payload = { name: templateForm.name, code: templateForm.code, business_type: templateForm.business_type, description: templateForm.description || undefined, node_config: parsed };
    if (editingId) { updateMut.mutate({ id: editingId, data: payload }); } else { createMut.mutate(payload); }
  }

  function openActionDialog(id: string, action: "approve" | "reject") {
    setActionTarget({ id, action });
    setComment("");
    setActionDialogOpen(true);
  }

  if (tab === "template" && templateQuery.isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (tab === "instance" && instanceQuery.isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={tab === "template" ? "default" : "outline"} onClick={() => setTab("template")}>审批模板</Button>
        <Button variant={tab === "instance" ? "default" : "outline"} onClick={() => setTab("instance")}>审批实例</Button>
      </div>

      {tab === "template" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>审批流程配置</CardTitle>
            <Button onClick={openCreateDialog}><Plus className="mr-1 h-4 w-4" />新建模板</Button>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Select value={bizTypeFilter} onValueChange={(v) => { setBizTypeFilter(v ?? "all"); setTemplatePage(1); }}>
                <SelectTrigger className="w-48"><SelectValue placeholder="业务类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {Object.entries(businessTypeMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>编码</TableHead>
                  <TableHead>业务类型</TableHead>
                  <TableHead>版本</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templateQuery.data?.items?.map((t: any) => {
                  const st = templateStatusMap[t.status] ?? { label: t.status, variant: "secondary" as const };
                  return (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.code}</TableCell>
                      <TableCell>{businessTypeMap[t.business_type] ?? t.business_type}</TableCell>
                      <TableCell>{t.version}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                      <TableCell className="space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(t)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(t.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button size="sm" variant="outline" disabled={templatePage <= 1} onClick={() => setTemplatePage((p) => p - 1)}>上一页</Button>
              <span className="text-sm text-muted-foreground">{templatePage}</span>
              <Button size="sm" variant="outline" disabled={!templateQuery.data || templateQuery.data.items.length < 20} onClick={() => setTemplatePage((p) => p + 1)}>下一页</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "instance" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>审批实例</CardTitle>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setInstancePage(1); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="状态筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="pending">待审批</SelectItem>
                <SelectItem value="approved">已通过</SelectItem>
                <SelectItem value="rejected">已拒绝</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>业务类型</TableHead>
                  <TableHead>当前步骤</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>紧急度</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instanceQuery.data?.items?.map((inst: any) => {
                  const st = instanceStatusMap[inst.status] ?? { label: inst.status, variant: "secondary" as const };
                  return (
                    <TableRow key={inst.id}>
                      <TableCell>{inst.title}</TableCell>
                      <TableCell>{businessTypeMap[inst.business_type] ?? inst.business_type}</TableCell>
                      <TableCell>{inst.current_step}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                      <TableCell>{urgencyMap[inst.urgency] ?? inst.urgency}</TableCell>
                      <TableCell>{inst.created_at}</TableCell>
                      <TableCell className="space-x-1">
                        {inst.status === "pending" && (
                          <>
                            <Button size="sm" variant="default" onClick={() => openActionDialog(inst.id, "approve")}>通过</Button>
                            <Button size="sm" variant="destructive" onClick={() => openActionDialog(inst.id, "reject")}>驳回</Button>
                          </>
                        )}
                        <Button size="sm" variant="outline" onClick={() => cancelMut.mutate(inst.id)} disabled={inst.status === "cancelled"}>取消</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button size="sm" variant="outline" disabled={instancePage <= 1} onClick={() => setInstancePage((p) => p - 1)}>上一页</Button>
              <span className="text-sm text-muted-foreground">{instancePage}</span>
              <Button size="sm" variant="outline" disabled={!instanceQuery.data || instanceQuery.data.items.length < 20} onClick={() => setInstancePage((p) => p + 1)}>下一页</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "编辑模板" : "新建模板"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>名称</Label><Input value={templateForm.name} onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>编码</Label><Input value={templateForm.code} onChange={(e) => setTemplateForm((f) => ({ ...f, code: e.target.value }))} /></div>
            </div>
            <div>
              <Label>业务类型</Label>
              <Select value={templateForm.business_type} onValueChange={(v) => setTemplateForm((f) => ({ ...f, business_type: v ?? "procurement" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(businessTypeMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>描述</Label><Textarea value={templateForm.description} onChange={(e) => setTemplateForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <div><Label>节点配置 (JSON)</Label><Textarea className="font-mono min-h-[200px]" value={templateForm.node_config} onChange={(e) => setTemplateForm((f) => ({ ...f, node_config: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>取消</Button>
            <Button onClick={handleTemplateSave} disabled={createMut.isPending || updateMut.isPending}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{actionTarget?.action === "approve" ? "确认通过" : "确认驳回"}</DialogTitle></DialogHeader>
          <div><Label>审批意见</Label><Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>取消</Button>
            <Button
              variant={actionTarget?.action === "approve" ? "default" : "destructive"}
              onClick={() => { if (actionTarget) approveMut.mutate({ id: actionTarget.id, payload: { action: actionTarget.action, comment: comment || undefined } }); }}
              disabled={approveMut.isPending}
            >
              {actionTarget?.action === "approve" ? "确认通过" : "确认驳回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
