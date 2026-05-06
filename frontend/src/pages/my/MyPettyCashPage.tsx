import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Wallet,
  Plus,
  Upload,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  listFunds,
  listExpenses,
  createExpense,
  getFundStats,
} from "@/api/petty-cash"
import OcrUploadButton from "@/components/ocr/OcrUploadButton"

const CATEGORY_OPTIONS = [
  { value: "travel", label: "差旅" },
  { value: "material", label: "材料" },
  { value: "equipment", label: "设备" },
  { value: "labor", label: "人工" },
  { value: "other", label: "其他" },
]

export default function MyPettyCashPage() {
  const qc = useQueryClient()
  const [expenseDialog, setExpenseDialog] = useState(false)
  const [ocrExpenseData, setOcrExpenseData] = useState<Record<string, unknown> | null>(null)
  const [expenseForm, setExpenseForm] = useState({
    fund_id: "",
    category: "travel",
    amount: "",
    description: "",
  })

  const { data: stats } = useQuery({
    queryKey: ["petty-cash", "my-stats"],
    queryFn: getFundStats,
  })

  const { data: fundsData, isLoading: fundsLoading } = useQuery({
    queryKey: ["petty-cash", "my-funds"],
    queryFn: () => listFunds({ page: 1, page_size: 100 }),
  })

  const { data: expensesData, isLoading: expensesLoading } = useQuery({
    queryKey: ["petty-cash", "my-expenses"],
    queryFn: () => listExpenses({ page: 1, page_size: 100 }),
  })

  const createExpenseMut = useMutation({
    mutationFn: () =>
      createExpense({
        fund_id: expenseForm.fund_id,
        project_id: "",
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        description: expenseForm.description,
        expense_date: new Date().toISOString().split("T")[0],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["petty-cash"] })
      toast.success("费用已记录")
      setExpenseDialog(false)
      setExpenseForm({ fund_id: "", category: "travel", amount: "", description: "" })
    },
    onError: () => toast.error("记录失败"),
  })

  const funds = fundsData?.items ?? []
  const expenses = expensesData?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">我的备用金</h1>
          <p className="text-sm text-muted-foreground">管理我的备用金和报销</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setExpenseDialog(true)}>
            <Plus className="size-3.5" />
            记一笔
          </Button>
          <OcrUploadButton
            type="invoice"
            onRecognized={(data) => {
              setOcrExpenseData(data)
              setExpenseDialog(true)
              if (data.total_amount) {
                setExpenseForm((f) => ({ ...f, amount: String(data.total_amount) }))
              }
              if (data.description) {
                setExpenseForm((f) => ({ ...f, description: String(data.description) }))
              }
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">剩余金额</p>
            <p className="text-2xl font-bold">¥{(stats?.total_remaining ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">总金额</p>
            <p className="text-2xl font-bold">¥{(stats?.total_amount ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">已使用</p>
            <p className="text-2xl font-bold text-rose-500">¥{(stats?.total_used ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">待结算</p>
            <p className="text-2xl font-bold text-amber-500">{stats?.settling_count ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>我的备用金</CardTitle>
          <CardDescription>活跃的备用金账户</CardDescription>
        </CardHeader>
        <CardContent>
          {fundsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : funds.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无备用金</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>编号</TableHead>
                  <TableHead>项目</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>已使用</TableHead>
                  <TableHead>剩余</TableHead>
                  <TableHead>预计归还</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funds.map((fund) => (
                  <TableRow key={fund.id}>
                    <TableCell className="font-mono text-xs">{fund.fund_no}</TableCell>
                    <TableCell>{fund.project_name ?? "-"}</TableCell>
                    <TableCell>¥{fund.amount.toLocaleString()}</TableCell>
                    <TableCell>¥{fund.used_amount.toLocaleString()}</TableCell>
                    <TableCell>¥{fund.remaining_amount.toLocaleString()}</TableCell>
                    <TableCell>{fund.expected_return_date}</TableCell>
                    <TableCell><Badge variant="outline">{fund.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>报销记录</CardTitle>
          <CardDescription>我的报销明细</CardDescription>
        </CardHeader>
        <CardContent>
          {expensesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无报销记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>项目</TableHead>
                  <TableHead>类别</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>说明</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell>{exp.expense_date}</TableCell>
                    <TableCell>{exp.project_name ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{exp.category}</Badge>
                    </TableCell>
                    <TableCell>¥{exp.amount.toLocaleString()}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{exp.description ?? "-"}</TableCell>
                    <TableCell><Badge variant="secondary">{exp.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={expenseDialog} onOpenChange={setExpenseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>记一笔费用</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>备用金账户</Label>
              <Select
                value={expenseForm.fund_id}
                onValueChange={(v) => { if (v) setExpenseForm((f) => ({ ...f, fund_id: v })) }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择备用金" />
                </SelectTrigger>
                <SelectContent>
                  {funds.filter((f) => f.status === "active").map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      {fund.fund_no} - ¥{fund.remaining_amount.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>费用类别</Label>
              <Select
                value={expenseForm.category}
                onValueChange={(v) => { if (v) setExpenseForm((f) => ({ ...f, category: v })) }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>金额</Label>
              <Input
                type="number"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label>说明</Label>
              <Textarea
                value={expenseForm.description}
                onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="费用说明..."
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button
              onClick={() => createExpenseMut.mutate()}
              disabled={createExpenseMut.isPending || !expenseForm.amount}
            >
              {createExpenseMut.isPending && <Loader2 className="size-4 animate-spin" />}
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
