import { useCallback, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Save, Play, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { getWorkflowTemplate, updateWorkflowTemplate, executeWorkflow, type WorkflowTemplate } from "@/api/agent-evolution"

// Agent节点
function AgentNode({ data }: NodeProps) {
  return (
    <div className="px-3 py-2 rounded-lg border-2 border-blue-400 bg-white shadow-md min-w-[140px]">
      <Handle type="target" position={Position.Top} className="!bg-blue-400 !w-2 !h-2" />
      <div className="text-xs font-bold text-blue-700">{data.label as string || "Agent"}</div>
      {data.agentId ? <div className="text-[10px] text-muted-foreground">{String(data.agentId)}</div> : null}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-2 !h-2" />
    </div>
  )
}

// 起始节点
function StartNode({ data }: NodeProps) {
  return (
    <div className="px-3 py-2 rounded-full bg-green-500 text-white text-xs font-bold shadow-md">
      <Handle type="source" position={Position.Bottom} className="!bg-green-300 !w-2 !h-2" />
      {data.label as string || "开始"}
    </div>
  )
}

// 结束节点
function EndNode({ data }: NodeProps) {
  return (
    <div className="px-3 py-2 rounded-full bg-red-500 text-white text-xs font-bold shadow-md">
      <Handle type="target" position={Position.Top} className="!bg-red-300 !w-2 !h-2" />
      {data.label as string || "结束"}
    </div>
  )
}

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  start: StartNode,
  end: EndNode,
}

let nodeId = 10
function getNextId() {
  return `node_${nodeId++}`
}

export default function WorkflowEditor() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [editAgentId, setEditAgentId] = useState("")

  const { data: template, isLoading } = useQuery({
    queryKey: ["evo-workflow", id],
    queryFn: () => getWorkflowTemplate(id!),
    enabled: !!id,
  })

  // Load template data into graph
  const loadTemplate = useCallback((t: WorkflowTemplate | Record<string, unknown>) => {
    const tAny = t as Record<string, unknown>
    const config = (tAny.graph_config || { nodes: [], edges: [] }) as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }
    const flowNodes: Node[] = (config.nodes || []).map((n: Record<string, unknown>, i: number) => ({
      id: (n.id as string) || `node_${i}`,
      type: (n.type as string) || "agent",
      position: { x: (n.x as number) || i * 200, y: (n.y as number) || i * 120 },
      data: { label: n.name || "Agent", agentId: n.agent_id || "" },
    }))
    const flowEdges: Edge[] = (config.edges || []).map((e: Record<string, unknown>) => ({
      id: `e-${e.source}-${e.target}`,
      source: e.source as string,
      target: e.target as string,
      animated: true,
    }))
    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [setNodes, setEdges])

  // Initialize when template loads
  if (template && nodes.length === 0) {
    loadTemplate(template as Record<string, unknown>)
  }

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    setEditLabel(node.data.label as string || "")
    setEditAgentId((node.data.agentId as string) || "")
  }, [])

  const updateSelectedNode = () => {
    if (!selectedNode) return
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, label: editLabel, agentId: editAgentId } }
          : n,
      ),
    )
    setSelectedNode(null)
  }

  const deleteSelectedNode = () => {
    if (!selectedNode) return
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  const addAgentNode = () => {
    const newId = getNextId()
    setNodes((nds) => [
      ...nds,
      {
        id: newId,
        type: "agent",
        position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
        data: { label: `Agent ${nds.length}`, agentId: "" },
      },
    ])
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const graphConfig = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          name: n.data.label,
          agent_id: n.data.agentId || null,
          x: n.position.x,
          y: n.position.y,
        })),
        edges: edges.map((e) => ({
          source: e.source,
          target: e.target,
        })),
      }
      return updateWorkflowTemplate(id!, { graph_config: graphConfig })
    },
    onSuccess: () => { toast.success("已保存"); qc.invalidateQueries({ queryKey: ["evo-workflow", id] }) },
    onError: () => toast.error("保存失败"),
  })

  const execMut = useMutation({
    mutationFn: () => executeWorkflow(id!, { input_data: {} }),
    onSuccess: () => toast.success("工作流已执行"),
    onError: () => toast.error("执行失败"),
  })

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="size-6 animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => nav("/agent-evolution/workflows")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{String(template?.name || "工作流编辑器")}</h1>
            <p className="text-xs text-muted-foreground">拖拽节点 · 连线编排 · 保存执行</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addAgentNode}>+ Agent</Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Save className="size-3 mr-1" />}
            保存
          </Button>
          <Button size="sm" variant="outline" onClick={() => execMut.mutate()} disabled={execMut.isPending}>
            {execMut.isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Play className="size-3 mr-1" />}
            执行
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{ height: "calc(100vh - 200px)" }}>
        {/* 画布 */}
        <div className="lg:col-span-3 border rounded-lg overflow-hidden" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {/* 属性面板 */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">节点属性</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedNode ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">节点类型</Label>
                    <Badge variant="outline">{selectedNode.type}</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">名称</Label>
                    <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-7 text-xs" />
                  </div>
                  {selectedNode.type === "agent" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Agent ID</Label>
                      <Input value={editAgentId} onChange={(e) => setEditAgentId(e.target.value)} className="h-7 text-xs" placeholder="UUID" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={updateSelectedNode}>更新</Button>
                    <Button size="sm" variant="ghost" onClick={deleteSelectedNode}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">点击节点查看属性</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">工作流信息</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">节点数</span>
                <b>{nodes.length}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">连线数</span>
                <b>{edges.length}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">版本</span>
                <b>v{String(template?.version ?? 1)}</b>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
