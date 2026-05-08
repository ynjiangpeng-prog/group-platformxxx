import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { get, post } from '@/lib/http'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

interface GraphNode {
  id: string
  name: string
  type: string
  status?: string
  properties?: Record<string, unknown>
}

interface GraphEdge {
  id: string
  source: string
  target: string
  type: string
  confidence?: number
}

interface EntityProfile {
  entity: {
    id: string
    name: string
    type: string
    status: string
    properties: Record<string, unknown> | null
    tags: string[] | null
  }
  stats: {
    total_relations: number
    outgoing: number
    incoming: number
    related_entities: number
  }
  relations: Array<{
    id: string
    direction: 'outgoing' | 'incoming'
    type: string
    target_entity: string
    confidence: number
  }>
  related_entities: Array<{ id: string; name: string; type: string }>
}

const TYPE_COLORS: Record<string, string> = {
  company: '#3b82f6',
  project: '#22c55e',
  contract: '#f97316',
  supplier: '#a855f7',
  customer: '#eab308',
  station: '#06b6d4',
}

const TYPE_LABELS: Record<string, string> = {
  company: '公司',
  project: '项目',
  contract: '合同',
  supplier: '供应商',
  customer: '客户',
  station: '充电站',
}

export default function KnowledgeGraphPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<unknown>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)

  const { data: graphData, isLoading } = useQuery({
    queryKey: ['business-twin', 'graph'],
    queryFn: () => get<{ nodes: GraphNode[]; edges: GraphEdge[] }>('/business-twin/graph'),
  })

  const { data: subGraph } = useQuery({
    queryKey: ['business-twin', 'graph', 'query', searchText],
    queryFn: () => get<{ nodes: GraphNode[]; edges: GraphEdge[]; center: GraphNode }>(
      '/business-twin/graph/query',
      { entity_name: searchText, depth: '2' },
    ),
    enabled: searchText.length >= 2,
  })

  const { data: profile } = useQuery({
    queryKey: ['business-twin', 'graph', 'profile', selectedEntity],
    queryFn: () => get<EntityProfile>(`/business-twin/graph/profile/${selectedEntity}`),
    enabled: !!selectedEntity,
  })

  const nodes = (searchText.length >= 2 ? subGraph?.nodes : graphData?.nodes) ?? []
  const edges = (searchText.length >= 2 ? subGraph?.edges : graphData?.edges) ?? []

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return

    const renderGraph = async () => {
      const G6 = await import('@antv/g6')

      if (graphRef.current) {
        (graphRef.current as { destroy: () => void }).destroy()
      }

      const width = containerRef.current!.clientWidth
      const height = containerRef.current!.clientHeight

      const graph = new G6.Graph({
        container: containerRef.current!,
        width,
        height,
        autoFit: 'view',
        data: {
          nodes: nodes.map(n => ({
            id: n.id,
            data: {
              type: 'circle',
              ...getTypeStyle(n.type),
              labelText: n.name.length > 6 ? n.name.slice(0, 6) + '...' : n.name,
              labelPlacement: 'bottom',
              labelTextBaseline: 'top',
              labelFontSize: 10,
              size: n.type === 'company' ? 40 : 30,
            },
            style: {
              fill: TYPE_COLORS[n.type] || '#6b7280',
              stroke: TYPE_COLORS[n.type] || '#6b7280',
            },
          })),
          edges: edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            data: {
              type: 'line',
              labelText: e.type,
              labelFontSize: 8,
              labelBackground: true,
              labelBackgroundFill: '#fff',
              labelBackgroundOpacity: 0.8,
            },
            style: {
              stroke: '#94a3b8',
              lineWidth: 1,
            },
          })),
        },
        layout: {
          type: 'd3-force',
          preventOverlap: true,
          nodeSize: 40,
        },
        behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element', 'click-select'],
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      graph.on('node:click', (evt: any) => {
        const id = evt?.target?.id
        if (typeof id === 'string') {
          setSelectedEntity(id)
        }
      })

      await graph.render()
      graphRef.current = graph
    }

    renderGraph()

    return () => {
      if (graphRef.current) {
        (graphRef.current as { destroy: () => void }).destroy()
        graphRef.current = null
      }
    }
  }, [nodes, edges])

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* 图谱画布 */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-2xl font-bold">业务知识图谱</h1>
          <div className="flex items-center gap-2 ml-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="搜索实体..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <Badge key={type} variant="outline" className="text-xs gap-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                {TYPE_LABELS[type] || type}
              </Badge>
            ))}
          </div>
        </div>

        <Card className="flex-1">
          <CardContent className="p-0 h-full relative">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                加载图谱中...
              </div>
            ) : nodes.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <p className="text-lg font-medium">暂无图谱数据</p>
                  <p className="text-sm mt-1">业务事件积累后会自动构建知识图谱</p>
                </div>
              </div>
            ) : (
              <div ref={containerRef} className="w-full h-full" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 右侧详情面板 */}
      {selectedEntity && profile && (
        <Card className="w-80 shrink-0">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{profile.entity.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEntity(null)}>
                x
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                style={{
                  backgroundColor: TYPE_COLORS[profile.entity.type] || '#6b7280',
                  color: '#fff',
                }}
              >
                {TYPE_LABELS[profile.entity.type] || profile.entity.type}
              </Badge>
              <Badge variant="outline">{profile.entity.status}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 统计 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center p-2 bg-muted rounded">
                  <div className="text-lg font-bold">{profile.stats.total_relations}</div>
                  <div className="text-xs text-muted-foreground">关联数</div>
                </div>
                <div className="text-center p-2 bg-muted rounded">
                  <div className="text-lg font-bold">{profile.stats.related_entities}</div>
                  <div className="text-xs text-muted-foreground">关联实体</div>
                </div>
              </div>

              {/* 关系列表 */}
              <div>
                <h3 className="text-sm font-medium mb-2">关系列表</h3>
                <ScrollArea className="h-48">
                  <div className="space-y-1">
                    {profile.relations.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                        <Badge variant={r.direction === 'outgoing' ? 'default' : 'secondary'} className="text-[10px]">
                          {r.direction === 'outgoing' ? '出' : '入'}
                        </Badge>
                        <span className="text-muted-foreground">{r.type}</span>
                        <span className="ml-auto truncate max-w-24">{r.target_entity.slice(0, 8)}...</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* 关联实体 */}
              <div>
                <h3 className="text-sm font-medium mb-2">关联实体</h3>
                <div className="space-y-1">
                  {profile.related_entities.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted cursor-pointer"
                      onClick={() => setSelectedEntity(e.id)}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: TYPE_COLORS[e.type] || '#6b7280' }}
                      />
                      <span className="truncate">{e.name}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">
                        {TYPE_LABELS[e.type] || e.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function getTypeStyle(type: string): Record<string, unknown> {
  return {
    key: type,
  }
}
