import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Loader2, Star } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  listEntities,
  createEntity,
  updateEntity,
  deleteEntity,
} from "@/api/entity"

interface CompanyEntity {
  id: string
  entity_name: string
  entity_code?: string
  legal_person?: string
  tax_no?: string
  bank_name?: string
  bank_account?: string
  address?: string
  is_default: boolean
}

const emptyForm = {
  entity_name: "",
  entity_code: "",
  legal_person: "",
  tax_no: "",
  bank_name: "",
  bank_account: "",
  address: "",
  is_default: "否",
}

export default function EntityManagePage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<CompanyEntity | null>(null)
  const [deleting, setDeleting] = useState<CompanyEntity | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ["entities", page],
    queryFn: () => listEntities({ page, page_size: 20 }),
  })

  const createMut = useMutation({
    mutationFn: createEntity,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entities"] })
      toast.success("创建成功")
      closeDialog()
    },
    onError: () => toast.error("创建失败"),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateEntity(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entities"] })
      toast.success("更新成功")
      closeDialog()
    },
    onError: () => toast.error("更新失败"),
  })

  const deleteMut = useMutation({
    mutationFn: deleteEntity,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entities"] })
      toast.success("删除成功")
      setDeleteOpen(false)
      setDeleting(null)
    },
    onError: () => toast.error("删除失败"),
  })

  const setDefaultMut = useMutation({
    mutationFn: (id: string) => updateEntity(id, { is_default: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entities"] })
      toast.success("已设为默认主体")
    },
    onError: () => toast.error("设置失败"),
  })

  const entities = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(e: CompanyEntity) {
    setEditing(e)
    setForm({
      entity_name: e.entity_name ?? "",
      entity_code: e.entity_code ?? "",
      legal_person: e.legal_person ?? "",
      tax_no: e.tax_no ?? "",
      bank_name: e.bank_name ?? "",
      bank_account: e.bank_account ?? "",
      address: e.address ?? "",
      is_default: e.is_default ? "是" : "否",
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      entity_name: form.entity_name,
      entity_code: form.entity_code || undefined,
      legal_person: form.legal_person || undefined,
      tax_no: form.tax_no || undefined,
      bank_name: form.bank_name || undefined,
      bank_account: form.bank_account || undefined,
      address: form.address || undefined,
      is_default: form.is_default === "是",
    }
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>公司主体管理</CardTitle>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新建主体
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>主体名称</TableHead>
                    <TableHead>编码</TableHead>
                    <TableHead>法人</TableHead>
                    <TableHead>税号</TableHead>
                    <TableHead>开户银行</TableHead>
                    <TableHead>银行账号</TableHead>
                    <TableHead>默认主体</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    entities.map((e: CompanyEntity) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.entity_name}</TableCell>
                        <TableCell>{e.entity_code ?? "-"}</TableCell>
                        <TableCell>{e.legal_person ?? "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{e.tax_no ?? "-"}</TableCell>
                        <TableCell>{e.bank_name ?? "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{e.bank_account ?? "-"}</TableCell>
                        <TableCell>
                          {e.is_default ? (
                            <Badge variant="default">默认</Badge>
                          ) : (
                            <Badge variant="secondary">-</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(e)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            {!e.is_default && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setDefaultMut.mutate(e.id)}
                              >
                                <Star className="size-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => { setDeleting(e); setDeleteOpen(true) }}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    共 {total} 条
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      上一页
                    </Button>
                    <span className="text-sm">{page} / {totalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "编辑主体" : "新建主体"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="grid gap-2">
                <Label>主体名称 *</Label>
                <Input
                  value={form.entity_name}
                  onChange={(e) => setForm((f) => ({ ...f, entity_name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>编码</Label>
                <Input
                  value={form.entity_code}
                  onChange={(e) => setForm((f) => ({ ...f, entity_code: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>法人</Label>
                <Input
                  value={form.legal_person}
                  onChange={(e) => setForm((f) => ({ ...f, legal_person: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>税号</Label>
                <Input
                  value={form.tax_no}
                  onChange={(e) => setForm((f) => ({ ...f, tax_no: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>开户银行</Label>
                <Input
                  value={form.bank_name}
                  onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>银行账号</Label>
                <Input
                  value={form.bank_account}
                  onChange={(e) => setForm((f) => ({ ...f, bank_account: e.target.value }))}
                />
              </div>
              <div className="col-span-2 grid gap-2">
                <Label>地址</Label>
                <Textarea
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="grid gap-2">
                <Label>默认主体</Label>
                <Select
                  value={form.is_default}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, is_default: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="是">是</SelectItem>
                    <SelectItem value="否">否</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="size-4 animate-spin" />}
                {editing ? "更新" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleting?.entity_name}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
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
