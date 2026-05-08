import { get, post } from '@/lib/http'

// ─── 类型定义 ───

export interface BizEvent {
  id: string
  event_type: string
  source_module: string
  source_id: string | null
  event_data: Record<string, unknown> | null
  event_date: string | null
  amount: number | null
  entity_ids: string[] | null
  created_at: string | null
}

export interface BizEntity {
  id: string
  entity_type: string
  entity_name: string
  source_id: string | null
  properties: Record<string, unknown> | null
  status: string
  tags: string[] | null
}

export interface BizRelation {
  id: string
  source_entity_id: string
  target_entity_id: string
  relation_type: string
  properties: Record<string, unknown> | null
  confidence: number
}

export interface BizMetric {
  id: string
  metric_type: string
  period: string
  period_type: string
  value: number
  dimensions: Record<string, unknown> | null
}

export interface TimelineItem {
  id: string
  event_type: string
  source_module: string
  event_data: Record<string, unknown> | null
  event_date: string | null
  amount: number | null
  importance: 'high' | 'medium' | 'normal'
}

// ─── API函数 ───

export async function listEvents(params?: {
  event_type?: string
  source_module?: string
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
}) {
  return get<{ items: BizEvent[]; total: number; page: number; page_size: number }>(
    '/business-twin/events',
    params as Record<string, string>,
  )
}

export async function listEntities(params?: {
  entity_type?: string
  search?: string
}) {
  return get<{ items: BizEntity[]; total: number }>(
    '/business-twin/entities',
    params as Record<string, string>,
  )
}

export async function listRelations(params?: {
  entity_id?: string
  relation_type?: string
}) {
  return get<{ items: BizRelation[]; total: number }>(
    '/business-twin/relations',
    params as Record<string, string>,
  )
}

export async function listMetrics(params?: {
  metric_type?: string
  period_type?: string
  period?: string
}) {
  return get<{ items: BizMetric[]; total: number }>(
    '/business-twin/metrics',
    params as Record<string, string>,
  )
}

export async function replayEvents(start_date: string, end_date: string) {
  return post<{ events: BizEvent[]; count: number }>(
    '/business-twin/replay',
    { start_date, end_date },
  )
}

export async function getTimeline(params?: {
  start_date?: string
  end_date?: string
  event_types?: string
  limit?: number
}) {
  return get<{ items: TimelineItem[]; total: number }>(
    '/business-twin/timeline',
    params as Record<string, string>,
  )
}
