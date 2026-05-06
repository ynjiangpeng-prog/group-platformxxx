import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Plane, MapPin, Calendar, Users, ChevronRight, ChevronDown, CheckCircle, FileText, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import FileUpload from "@/components/upload/FileUpload"
import { listTrips, createTrip, getTrip, submitFeedback, updateAllocations, updateTrip, createTravelExpense, type TravelTripItem, type TravelTripDetail } from "@/api/travel"
import { listProjects } from "@/api/project"
import { listUsers } from "@/api/organization"

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planned: { label: "已计划", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "出差中", color: "bg-amber-100 text-amber-700" },
  completed: { label: "已完成", color: "bg-emerald-100 text-emerald-700" },
}
const VEHICLE_MAP: Record<string, string> = { car: "自驾/打车", train: "火车", plane: "飞机", bus: "大巴" }
const EXPENSE_TYPE_MAP: Record<string, string> = {
  transport: "交通", hotel: "住宿", meal: "餐饮", other: "其他",
}

export default function TravelPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showExpense, setShowExpense] = useState(false)
  const [showAlloc, setShowAlloc] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [feedbackTripId, setFeedbackTripId] = useState<string | null>(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["trips", page, statusFilter],
    queryFn: () => listTrips({ page, page_size: 20, status: statusFilter || undefined }),
  })

  const { data: detail } = useQuery({
    queryKey: ["trip-detail", detailId],
    queryFn: () => getTrip(detailId!),
    enabled: !!detailId,
  })

  const { data: projectsData } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects({ page_size: 100 }) })
  const { data: usersData } = useQuery({ queryKey: ["users"], queryFn: listUsers })

  const createMut = useMutation({
    mutationFn: createTrip,
    onSuccess: () => { toast.success("出差已创建"); setShowCreate(false); qc.invalidateQueries({ queryKey: ["trips"] }) },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">差旅管理</h1>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => { if (!v) return; setStatusFilter(v === "all" ? "" : v); setPage(1) }}>
            <SelectTrigger className="w-32"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="planned">已计划</SelectItem>
              <SelectItem value="in_progress">出差中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreate(true)}><Plus className="size-4" />发起出差</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground animate-pulse">加载中...</div>
      ) : (
        <div className="grid gap-3">
          {(data?.items || []).map((trip) => (
            <TripCard key={trip.id} trip={trip} onClick={() => setDetailId(trip.id)} onFeedback={() => setFeedbackTripId(trip.id)} expanded={expandedIds.has(trip.id)} onToggle={() => setExpandedIds((prev) => { const next = new Set(prev); if (next.has(trip.id)) next.delete(trip.id); else next.add(trip.id); return next })} />
          ))}
          {data?.items?.length === 0 && <div className="text-center py-20 text-muted-foreground">暂无出差记录</div>}
        </div>
      )}

      {data && data.total > 20 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="py-1 px-3 text-sm text-muted-foreground">第{page}页 / 共{Math.ceil(data.total / 20)}页</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      )}

      {showCreate && (
        <CreateTripDialog
          projects={projectsData?.items || []}
          users={usersData?.items || []}
          onClose={() => setShowCreate(false)}
          onSubmit={(d) => createMut.mutate(d)}
          loading={createMut.isPending}
        />
      )}

      {detailId && detail && (
        <Dialog open={!!detailId} onOpenChange={(v) => { if (!v) setDetailId(null) }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plane className="size-5" />{detail.title}
                <Badge className={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">编号: </span>{detail.trip_no}</div>
                <div><span className="text-muted-foreground">路线: </span>{detail.origin} → {detail.destination}</div>
                <div><span className="text-muted-foreground">日期: </span>{detail.departure_date} ~ {detail.return_date}</div>
                <div><span className="text-muted-foreground">交通: </span>{VEHICLE_MAP[detail.vehicle] || detail.vehicle}</div>
                {detail.planned_budget && <div><span className="text-muted-foreground">预算: </span>¥{detail.planned_budget.toLocaleString()}</div>}
                <div><span className="text-muted-foreground">实际花费: </span>¥{detail.actual_amount.toLocaleString()}</div>
              </div>
              {detail.objectives && (
                <Card><CardContent className="p-3"><p className="text-sm font-medium mb-1">出差目标</p><p className="text-sm">{detail.objectives}</p></CardContent></Card>
              )}

              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">项目分摊 ({detail.allocations.length}个项目)</p>
                    {detail.status !== "completed" && (
                      <Button size="sm" variant="outline" onClick={() => setShowAlloc(true)}>调整比例</Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {detail.allocations.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <div className="flex-1">{a.project_name || a.project_id}</div>
                        <div className="w-32">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${a.share_ratio}%` }} />
                          </div>
                        </div>
                        <span className="text-xs w-12 text-right">{a.share_ratio}%</span>
                        <span className="text-xs w-20 text-right font-medium">¥{a.allocated_amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">费用明细 ({detail.expenses.length}笔)</p>
                    {detail.status !== "completed" && (
                      <Button size="sm" variant="outline" onClick={() => setShowExpense(true)}>记一笔</Button>
                    )}
                  </div>
                  {detail.expenses.length > 0 ? (
                    <div className="space-y-1.5">
                      {detail.expenses.map((e) => (
                        <div key={e.id} className="flex items-center gap-3 text-sm py-1 border-b last:border-0">
                          <Badge variant="outline" className="text-xs">{EXPENSE_TYPE_MAP[e.expense_type] || e.expense_type}</Badge>
                          <span className="flex-1">{e.description || "-"}</span>
                          <span className="font-mono text-xs text-muted-foreground">{e.expense_date}</span>
                          <span className="font-medium">¥{e.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">暂无费用</p>}
                </CardContent>
              </Card>

              {detail.feedback && (
                <Card><CardContent className="p-3">
                  <p className="text-sm font-medium mb-1">出差反馈</p>
                  <p className="text-sm">{detail.feedback}</p>
                  {detail.completion_summary && <p className="text-sm mt-2 text-muted-foreground">{detail.completion_summary}</p>}
                  {detail.result_rating && <p className="text-sm mt-1">评分: {"★".repeat(detail.result_rating)}{"☆".repeat(5 - detail.result_rating)}</p>}
                </CardContent></Card>
              )}

              {detail.trip_feedback && (
                <Card><CardContent className="p-3 space-y-2">
                  <p className="text-sm font-medium mb-1">出差反馈详情</p>
                  <div className="text-sm"><span className="text-muted-foreground">完成工作: </span>{detail.trip_feedback.work_completed}</div>
                  <div className="text-sm"><span className="text-muted-foreground">实际费用: </span>交通¥{detail.trip_feedback.actual_expenses.transport.toLocaleString()} + 住宿¥{detail.trip_feedback.actual_expenses.hotel.toLocaleString()} + 餐费¥{detail.trip_feedback.actual_expenses.meal.toLocaleString()} + 其他¥{detail.trip_feedback.actual_expenses.other.toLocaleString()} = ¥{(detail.trip_feedback.actual_expenses.transport + detail.trip_feedback.actual_expenses.hotel + detail.trip_feedback.actual_expenses.meal + detail.trip_feedback.actual_expenses.other).toLocaleString()}</div>
                  {detail.trip_feedback.expense_remark && <div className="text-sm"><span className="text-muted-foreground">费用说明: </span>{detail.trip_feedback.expense_remark}</div>}
                  <div className="text-sm"><span className="text-muted-foreground">出差成果: </span>{detail.trip_feedback.outcome}</div>
                  <div className="text-sm"><span className="text-muted-foreground">总体评价: </span>{detail.trip_feedback.rating}</div>
                  {detail.trip_feedback.receipt_files && detail.trip_feedback.receipt_files.length > 0 && (
                    <div className="text-sm flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground">票据: </span>
                      {detail.trip_feedback.receipt_files.map((f, i) => (
                        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><FileText className="size-3" />{f.original_filename}</a>
                      ))}
                    </div>
                  )}
                </CardContent></Card>
              )}

              {detail.status === "in_progress" && !detail.feedback && !detail.trip_feedback && (
                <Button className="w-full" onClick={() => setShowFeedback(true)}>填写反馈完成出差</Button>
              )}
              {detail.status === "in_progress" && !detail.trip_feedback && (
                <Button className="w-full" variant="outline" onClick={() => setFeedbackTripId(detail.id)}>填写结构化反馈</Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showFeedback && detailId && (
        <FeedbackDialog
          onSubmit={(d) => {
            submitFeedback(detailId, d).then(() => {
              toast.success("反馈已提交")
              setShowFeedback(false)
              qc.invalidateQueries({ queryKey: ["trip-detail", detailId] })
              qc.invalidateQueries({ queryKey: ["trips"] })
            })
          }}
          onClose={() => setShowFeedback(false)}
        />
      )}

      {feedbackTripId && (
        <TripFeedbackDialog
          onSubmit={(d) => {
            setFeedbackLoading(true)
            updateTrip(feedbackTripId, d).then(() => {
              toast.success("反馈已提交")
              setFeedbackTripId(null)
              qc.invalidateQueries({ queryKey: ["trips"] })
              qc.invalidateQueries({ queryKey: ["trip-detail", feedbackTripId] })
            }).finally(() => setFeedbackLoading(false))
          }}
          onClose={() => setFeedbackTripId(null)}
          loading={feedbackLoading}
        />
      )}

      {showExpense && detailId && (
        <ExpenseDialog
          onSubmit={(d) => {
            createTravelExpense({ ...d, trip_id: detailId }).then(() => {
              toast.success("费用已记录")
              setShowExpense(false)
              qc.invalidateQueries({ queryKey: ["trip-detail", detailId] })
              qc.invalidateQueries({ queryKey: ["trips"] })
            })
          }}
          onClose={() => setShowExpense(false)}
        />
      )}

      {showAlloc && detail && (
        <AllocationDialog
          allocations={detail.allocations}
          projects={projectsData?.items || []}
          onSubmit={(allocs) => {
            updateAllocations(detail.id, allocs).then(() => {
              toast.success("分摊比例已更新")
              setShowAlloc(false)
              qc.invalidateQueries({ queryKey: ["trip-detail", detail.id] })
            })
          }}
          onClose={() => setShowAlloc(false)}
        />
      )}
    </div>
  )
}

function TripCard({ trip, onClick, onFeedback, expanded, onToggle }: { trip: TravelTripItem; onClick: () => void; onFeedback: () => void; expanded: boolean; onToggle: () => void }) {
  const s = STATUS_MAP[trip.status] || { label: trip.status, color: "bg-slate-100" }
  const hasFeedback = !!trip.trip_feedback
  const fb = trip.trip_feedback

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={(e) => { e.stopPropagation(); onToggle() }} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
            <div className="cursor-pointer" onClick={onClick}>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{trip.title}</span>
                <Badge className={s.color}>{s.label}</Badge>
                {hasFeedback && (
                  <Badge className="bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle className="size-3" />已反馈
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="size-3" />{trip.origin} → {trip.destination}</span>
                <span className="flex items-center gap-1"><Calendar className="size-3" />{trip.departure_date} ~ {trip.return_date}</span>
                {trip.allocations.length > 0 && (
                  <span className="flex items-center gap-1"><Users className="size-3" />{trip.allocations.length}个项目</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="font-semibold">¥{trip.actual_amount.toLocaleString()}</div>
              {trip.planned_budget && <div className="text-xs text-muted-foreground">预算 ¥{trip.planned_budget.toLocaleString()}</div>}
            </div>
            {!hasFeedback && (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onFeedback() }}>反馈</Button>
            )}
            <ChevronRight className="size-4 text-muted-foreground cursor-pointer" onClick={(e) => { e.stopPropagation(); onClick() }} />
          </div>
        </div>

        {expanded && hasFeedback && fb && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="text-sm"><span className="text-muted-foreground">完成工作: </span>{fb.work_completed}</div>
            <div className="text-sm">
              <span className="text-muted-foreground">实际费用: </span>
              交通¥{fb.actual_expenses.transport.toLocaleString()} + 住宿¥{fb.actual_expenses.hotel.toLocaleString()} + 餐费¥{fb.actual_expenses.meal.toLocaleString()} + 其他¥{fb.actual_expenses.other.toLocaleString()} = ¥{(fb.actual_expenses.transport + fb.actual_expenses.hotel + fb.actual_expenses.meal + fb.actual_expenses.other).toLocaleString()}
            </div>
            {fb.expense_remark && <div className="text-sm"><span className="text-muted-foreground">费用说明: </span>{fb.expense_remark}</div>}
            <div className="text-sm"><span className="text-muted-foreground">出差成果: </span>{fb.outcome}</div>
            {fb.rating && <div className="text-sm"><span className="text-muted-foreground">总体评价: </span>{fb.rating}</div>}
            {fb.receipt_files && fb.receipt_files.length > 0 && (
              <div className="text-sm flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground">票据: </span>
                {fb.receipt_files.map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><FileText className="size-3" />{f.original_filename}</a>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CreateTripDialog({ projects, users, onClose, onSubmit, loading }: {
  projects: any[]; users: any[]; onClose: () => void; onSubmit: (d: any) => void; loading: boolean
}) {
  const [form, setForm] = useState({
    title: "", departure_date: "", return_date: "", origin: "", destination: "",
    vehicle: "car", objectives: "", planned_budget: "",
  })
  const [allocs, setAllocs] = useState<{ project_id: string; share_ratio: number }[]>([])

  const totalRatio = allocs.reduce((s, a) => s + a.share_ratio, 0)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>发起出差</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>出差标题 *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>出发日期 *</Label><Input type="date" value={form.departure_date} onChange={(e) => setForm({ ...form, departure_date: e.target.value })} /></div>
            <div><Label>返回日期 *</Label><Input type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} /></div>
            <div><Label>出发地 *</Label><Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} /></div>
            <div><Label>目的地 *</Label><Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></div>
            <div><Label>交通工具</Label>
              <Select value={form.vehicle} onValueChange={(v) => { if (v) setForm({ ...form, vehicle: v }) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="car">自驾/打车</SelectItem><SelectItem value="train">火车</SelectItem>
                  <SelectItem value="plane">飞机</SelectItem><SelectItem value="bus">大巴</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>预算金额</Label><Input type="number" value={form.planned_budget} onChange={(e) => setForm({ ...form, planned_budget: e.target.value })} /></div>
          </div>
          <div><Label>出差目标</Label><Textarea value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} rows={3} /></div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>关联项目（可多选）</Label>
              <Button size="sm" variant="outline" onClick={() => {
                if (projects.length > 0) setAllocs([...allocs, { project_id: "", share_ratio: 0 }])
              }}><Plus className="size-3" />添加项目</Button>
            </div>
            {allocs.map((a, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <Select value={a.project_id} onValueChange={(v) => {
                  if (!v) return
                  const next = [...allocs]; next[i] = { ...next[i], project_id: v }; setAllocs(next)
                }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="选择项目" /></SelectTrigger>
                  <SelectContent>
                    {projects.filter((p) => !allocs.some((al, j) => j !== i && al.project_id === p.id)).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Input type="number" className="w-20" value={a.share_ratio} onChange={(e) => {
                    const next = [...allocs]; next[i] = { ...next[i], share_ratio: Number(e.target.value) }; setAllocs(next)
                  }} />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setAllocs(allocs.filter((_, j) => j !== i))}><X className="size-3" /></Button>
              </div>
            ))}
            {allocs.length > 0 && (
              <p className={`text-xs ${totalRatio === 100 ? "text-emerald-600" : "text-amber-600"}`}>
                合计 {totalRatio}% {totalRatio !== 100 && "（建议合计100%）"}
              </p>
            )}
          </div>

          <Button className="w-full" disabled={loading || !form.title || !form.departure_date || !form.origin} onClick={() => {
            onSubmit({
              ...form,
              planned_budget: form.planned_budget ? Number(form.planned_budget) : undefined,
              project_allocations: allocs.filter((a) => a.project_id),
            })
          }}>
            {loading ? "创建中..." : "确认发起"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FeedbackDialog({ onSubmit, onClose }: { onSubmit: (d: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({ feedback: "", completion_summary: "", result_rating: 4 })
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>出差反馈</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>反馈内容 *</Label><Textarea value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} rows={3} /></div>
          <div><Label>完成总结</Label><Textarea value={form.completion_summary} onChange={(e) => setForm({ ...form, completion_summary: e.target.value })} rows={2} /></div>
          <div><Label>评分</Label>
            <Select value={String(form.result_rating)} onValueChange={(v) => setForm({ ...form, result_rating: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={String(n)}>{"★".repeat(n)}{"☆".repeat(5 - n)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" disabled={!form.feedback} onClick={() => onSubmit(form)}>提交反馈</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ExpenseDialog({ onSubmit, onClose }: { onSubmit: (d: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({ expense_type: "transport", amount: "", expense_date: new Date().toISOString().split("T")[0], description: "" })
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>记录费用</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>费用类型</Label>
            <Select value={form.expense_type} onValueChange={(v) => { if (v) setForm({ ...form, expense_type: v }) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transport">交通</SelectItem><SelectItem value="hotel">住宿</SelectItem>
                <SelectItem value="meal">餐饮</SelectItem><SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>金额 *</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>日期 *</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
          </div>
          <div><Label>说明</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <Button className="w-full" disabled={!form.amount} onClick={() => onSubmit({ ...form, amount: Number(form.amount) })}>确认记录</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AllocationDialog({ allocations, projects, onSubmit, onClose }: {
  allocations: { project_id: string; share_ratio: number }[]
  projects: any[]
  onSubmit: (a: { project_id: string; share_ratio: number }[]) => void
  onClose: () => void
}) {
  const [allocs, setAllocs] = useState(allocations.map((a) => ({ project_id: a.project_id, share_ratio: a.share_ratio })))
  const totalRatio = allocs.reduce((s, a) => s + a.share_ratio, 0)
  const getProjName = (id: string) => projects.find((p) => p.id === id)?.name || id

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>调整分摊比例</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {allocs.map((a, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="flex-1 text-sm">{getProjName(a.project_id)}</span>
              <Input type="number" className="w-24" value={a.share_ratio} onChange={(e) => {
                const next = [...allocs]; next[i] = { ...next[i], share_ratio: Number(e.target.value) }; setAllocs(next)
              }} />
              <span className="text-sm text-muted-foreground">%</span>
              <div className="w-32">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(a.share_ratio, 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
          <p className={`text-sm ${totalRatio === 100 ? "text-emerald-600" : "text-amber-600"}`}>
            合计 {totalRatio}% {totalRatio !== 100 && "（建议合计100%）"}
          </p>
          <Button className="w-full" onClick={() => onSubmit(allocs)}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TripFeedbackDialog({ onSubmit, onClose, loading }: { onSubmit: (d: any) => void; onClose: () => void; loading: boolean }) {
  const [form, setForm] = useState({
    work_completed: "",
    actual_expenses: { transport: "", hotel: "", meal: "", other: "" },
    expense_remark: "",
    outcome: "",
    rating: "良好",
  })
  const [receiptFiles, setReceiptFiles] = useState<any[]>([])

  const totalExpenses = (Number(form.actual_expenses.transport) || 0) + (Number(form.actual_expenses.hotel) || 0) + (Number(form.actual_expenses.meal) || 0) + (Number(form.actual_expenses.other) || 0)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>出差反馈</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>完成工作 *</Label><Textarea value={form.work_completed} onChange={(e) => setForm({ ...form, work_completed: e.target.value })} rows={3} /></div>

          <div>
            <Label>实际费用</Label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-sm w-14 shrink-0">交通费</span>
                <Input type="number" value={form.actual_expenses.transport} onChange={(e) => setForm({ ...form, actual_expenses: { ...form.actual_expenses, transport: e.target.value } })} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm w-14 shrink-0">住宿费</span>
                <Input type="number" value={form.actual_expenses.hotel} onChange={(e) => setForm({ ...form, actual_expenses: { ...form.actual_expenses, hotel: e.target.value } })} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm w-14 shrink-0">餐费</span>
                <Input type="number" value={form.actual_expenses.meal} onChange={(e) => setForm({ ...form, actual_expenses: { ...form.actual_expenses, meal: e.target.value } })} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm w-14 shrink-0">其他</span>
                <Input type="number" value={form.actual_expenses.other} onChange={(e) => setForm({ ...form, actual_expenses: { ...form.actual_expenses, other: e.target.value } })} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-1">合计: ¥{totalExpenses.toLocaleString()}</p>
          </div>

          <div><Label>费用说明</Label><Textarea value={form.expense_remark} onChange={(e) => setForm({ ...form, expense_remark: e.target.value })} rows={2} /></div>

          <div>
            <Label>票据上传</Label>
            <FileUpload value={receiptFiles} onChange={setReceiptFiles} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" folder="travel-receipts" />
          </div>

          <div><Label>出差成果 *</Label><Textarea value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} rows={3} /></div>

          <div><Label>总体评价</Label>
            <Select value={form.rating} onValueChange={(v) => { if (v) setForm({ ...form, rating: v }) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="优秀">优秀</SelectItem>
                <SelectItem value="良好">良好</SelectItem>
                <SelectItem value="一般">一般</SelectItem>
                <SelectItem value="不理想">不理想</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full" disabled={loading || !form.work_completed || !form.outcome} onClick={() => {
            onSubmit({
              trip_feedback: {
                work_completed: form.work_completed,
                actual_expenses: {
                  transport: Number(form.actual_expenses.transport) || 0,
                  hotel: Number(form.actual_expenses.hotel) || 0,
                  meal: Number(form.actual_expenses.meal) || 0,
                  other: Number(form.actual_expenses.other) || 0,
                },
                expense_remark: form.expense_remark,
                receipt_files: receiptFiles.map((f) => ({ file_id: f.file_id, original_filename: f.original_filename, url: f.url })),
                outcome: form.outcome,
                rating: form.rating,
              },
            })
          }}>
            {loading ? "提交中..." : "提交反馈"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
