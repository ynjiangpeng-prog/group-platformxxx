import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  listExpenses,
  leaderApprove,
  leaderReject,
  financeApprove,
  financeReject,
  getOverdueFunds,
} from "@/api/petty-cash"
import { listProcurementRequests, approveProcurementRequest } from "@/api/erp"

export default function MyTodoPage() {
  const qc = useQueryClient()

  const { data: pendingExpenses, isLoading: expensesLoading } = useQuery({
    queryKey: ["pending-expenses", "leader_pending"],
    queryFn: () => listExpenses({ status: "leader_pending", page: 1, page_size: 50 }),
  })

  const { data: financePendingExpenses, isLoading: financeLoading } = useQuery({
    queryKey: ["pending-expenses", "finance_pending"],
    queryFn: () => listExpenses({ status: "finance_pending", page: 1, page_size: 50 }),
  })

  const { data: rejectedExpenses, isLoading: rejectedLoading } = useQuery({
    queryKey: ["rejected-expenses"],
    queryFn: () => listExpenses({ status: "rejected", page: 1, page_size: 50 }),
  })

  const { data: overdueFunds, isLoading: overdueLoading } = useQuery({
    queryKey: ["overdue-funds"],
    queryFn: getOverdueFunds,
  })

  const leaderApproveMut = useMutation({
    mutationFn: leaderApprove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-expenses"] })
      toast.success("已审批通过")
    },
    onError: () => toast.error("操作失败"),
  })

  const leaderRejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      leaderReject(id, { reject_reason: reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-expenses"] })
      toast.success("已驳回")
      setRejectDialog(null)
      setRejectReason("")
    },
    onError: () => toast.error("操作失败"),
  })

  const financeApproveMut = useMutation({
    mutationFn: financeApprove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-expenses"] })
      toast.success("已审批通过")
    },
    onError: () => toast.error("操作失败"),
  })

  const [rejectDialog, setRejectDialog] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const pendingItems = pendingExpenses?.items ?? []
  const financeItems = financePendingExpenses?.items ?? []
  const rejectedItems = rejectedExpenses?.items ?? []
  const overdueItems = overdueFunds ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">我的待办</h1>
        <p className="text-sm text-muted-foreground">待我审批和处理的事项</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5" />
            待我审批（备用金报销）
          </CardTitle>
          <CardDescription>
            共 {pendingItems.length + financeItems.length} 条待审批
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expensesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : pendingItems.length + financeItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无待审批项</p>
          ) : (
            <div className="space-y-3">
              {pendingItems.map((exp) => (
                <ExpenseCard
                  key={exp.id}
                  projectName={exp.project_name ?? ""}
                  category={exp.category}
                  amount={exp.amount}
                  description={exp.description ?? ""}
                  employee={exp.employee_name ?? ""}
                  date={exp.expense_date}
                  status={exp.status}
                  onApprove={() => leaderApproveMut.mutate(exp.id)}
                  onReject={() => { setRejectDialog(exp.id); setRejectReason("") }}
                  approving={leaderApproveMut.isPending}
                />
              ))}
              {financeItems.map((exp) => (
                <ExpenseCard
                  key={exp.id}
                  projectName={exp.project_name ?? ""}
                  category={exp.category}
                  amount={exp.amount}
                  description={exp.description ?? ""}
                  employee={exp.employee_name ?? ""}
                  date={exp.expense_date}
                  status={exp.status}
                  onApprove={() => financeApproveMut.mutate(exp.id)}
                  onReject={() => { setRejectDialog(exp.id); setRejectReason("") }}
                  approving={financeApproveMut.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-destructive" />
            被驳回需修改
          </CardTitle>
          <CardDescription>{rejectedItems.length} 条被驳回</CardDescription>
        </CardHeader>
        <CardContent>
          {rejectedLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : rejectedItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无被驳回项</p>
          ) : (
            <div className="space-y-3">
              {rejectedItems.map((exp) => (
                <ExpenseCard
                  key={exp.id}
                  projectName={exp.project_name ?? ""}
                  category={exp.category}
                  amount={exp.amount}
                  description={exp.description ?? ""}
                  employee={exp.employee_name ?? ""}
                  date={exp.expense_date}
                  status={exp.status}
                  rejectReason={exp.reject_reason}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            备用金即将到期
          </CardTitle>
          <CardDescription>{overdueItems.length} 笔即将到期</CardDescription>
        </CardHeader>
        <CardContent>
          {overdueLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : overdueItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">无即将到期的备用金</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>备用金编号</TableHead>
                  <TableHead>项目</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>预计归还</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueItems.map((fund) => (
                  <TableRow key={fund.id}>
                    <TableCell className="font-mono text-xs">{fund.fund_no}</TableCell>
                    <TableCell>{fund.project_name ?? "-"}</TableCell>
                    <TableCell>¥{fund.amount.toLocaleString()}</TableCell>
                    <TableCell>{fund.expected_return_date}</TableCell>
                    <TableCell><Badge variant="destructive">逾期</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>驳回原因</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>驳回原因 *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="请说明驳回原因..."
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button
              variant="destructive"
              onClick={() => rejectDialog && leaderRejectMut.mutate({ id: rejectDialog, reason: rejectReason })}
              disabled={leaderRejectMut.isPending || !rejectReason}
            >
              {leaderRejectMut.isPending && <Loader2 className="size-4 animate-spin" />}
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ExpenseCard({
  projectName,
  category,
  amount,
  description,
  employee,
  date,
  status,
  rejectReason,
  onApprove,
  onReject,
  approving,
}: {
  projectName: string
  category: string
  amount: number
  description: string
  employee: string
  date: string
  status: string
  rejectReason?: string
  onApprove?: () => void
  onReject?: () => void
  approving?: boolean
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{projectName}</span>
          <Badge variant="outline" className="text-[10px]">{category}</Badge>
          <Badge variant="secondary" className="text-[10px]">{status}</Badge>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {employee} · {date} · ¥{amount.toLocaleString()}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
        )}
        {rejectReason && (
          <p className="text-xs text-destructive mt-1">驳回原因: {rejectReason}</p>
        )}
      </div>
      {onApprove && (
        <div className="flex gap-1 shrink-0">
          <Button
            size="sm"
            onClick={onApprove}
            disabled={approving}
          >
            {approving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle className="size-3.5" />}
            通过
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReject}
          >
            <XCircle className="size-3.5" />
            驳回
          </Button>
        </div>
      )}
    </div>
  )
}
