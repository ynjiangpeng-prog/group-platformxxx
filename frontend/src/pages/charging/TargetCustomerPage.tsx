import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { listTargetCustomers, createTargetCustomer, updateTargetCustomer, deleteTargetCustomer } from "@/api/charging"
import type { TargetCustomer } from "@/api/types"

const EMPTY_FORM = { customer_name: "", contact_person: "", contact_phone: "" }
const PAGE_SIZE = 20

export default function TargetCustomerPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TargetCustomer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TargetCustomer | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const { data, isLoading } = useQuery({
    queryKey: ["charging-target-customers", page],
    queryFn: () => listTargetCustomers({ page, page_size: PAGE_SIZE }),
  })

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE)

  const createMut = useMutation({
    mutationFn: (d: Partial<TargetCustomer>) => createTargetCustomer(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-target-customers"] })
      toast.success("创建成功")
      setDialogOpen(false)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TargetCustomer> }) => updateTargetCustomer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-target-customers"] })
      toast.success("更新成功")
      setDialogOpen(false)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTargetCustomer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-target-customers"] })
      toast.success("删除成功")
      setDeleteTarget(null)
    },
  })

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setDialogOpen(true) }

  const openEdit = (item: TargetCustomer) => {
    setForm({
      customer_name: item.customer_name ?? "",
      contact_person: item.contact_person ?? "",
      contact_phone: item.contact_phone ?? "",
    })
    setEditing(item)
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Partial<TargetCustomer> = { ...form }
    if (editing) updateMut.mutate({ id: editing.id, data: payload })
    else createMut.mutate(payload)
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">目标客户管理</h1>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          新增
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>联系人</TableHead>
                  <TableHead>联系电话</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无数据</TableCell>
                  </TableRow>
                )}
                {data?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.customer_name}</TableCell>
                    <TableCell>{item.contact_person}</TableCell>
                    <TableCell>{item.contact_phone}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === "active" ? "default" : "secondary"}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">共 {data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <span className="text-sm">{page} / {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑客户" : "新增客户"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={form.customer_name} onChange={set("customer_name")} required />
            </div>
            <div className="space-y-2">
              <Label>联系人</Label>
              <Input value={form.contact_person} onChange={set("contact_person")} required />
            </div>
            <div className="space-y-2">
              <Label>联系电话</Label>
              <Input value={form.contact_phone} onChange={set("contact_phone")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="size-4 animate-spin" />}
                确定
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，确定要删除该客户吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
