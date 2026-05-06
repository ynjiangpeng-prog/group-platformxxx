import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Pencil, Trash2, Loader2, ChevronRight, ChevronDown } from "lucide-react"
import { toast } from "sonner"
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
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "@/api/organization"
import type { Department } from "@/api/types"

interface TreeNode extends Department {
  children: TreeNode[]
}

function buildTree(items: Department[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  for (const item of items) {
    map.set(item.id, { ...item, children: [] })
  }

  for (const item of items) {
    const node = map.get(item.id)!
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function flattenTree(nodes: TreeNode[], depth = 0): (TreeNode & { depth: number })[] {
  const result: (TreeNode & { depth: number })[] = []
  for (const node of nodes) {
    result.push({ ...node, depth })
    result.push(...flattenTree(node.children, depth + 1))
  }
  return result
}

const emptyForm: Partial<Department> = {
  name: "",
  code: "",
  parent_id: undefined,
  manager_id: undefined,
  sort_order: 0,
  status: 1,
}

export default function DepartmentPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [deleting, setDeleting] = useState<Department | null>(null)
  const [form, setForm] = useState<Partial<Department>>(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: () => listDepartments({ page: 1, page_size: 500 }),
  })

  const departments = data?.items ?? []

  const flatList = useMemo(() => {
    const tree = buildTree(departments)
    return flattenTree(tree)
  }, [departments])

  const parentOptions = useMemo(() => {
    if (editing) {
      const excludeIds = new Set<string>()
      const collectChildren = (id: string) => {
        excludeIds.add(id)
        for (const d of departments) {
          if (d.parent_id === id) collectChildren(d.id)
        }
      }
      if (editing.id) collectChildren(editing.id)
      return departments.filter((d) => !excludeIds.has(d.id))
    }
    return departments
  }, [departments, editing])

  const createMut = useMutation({
    mutationFn: createDepartment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] })
      toast.success("创建成功")
      closeDialog()
    },
    onError: () => toast.error("创建失败"),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Department> }) =>
      updateDepartment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] })
      toast.success("更新成功")
      closeDialog()
    },
    onError: () => toast.error("更新失败"),
  })

  const deleteMut = useMutation({
    mutationFn: deleteDepartment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] })
      toast.success("删除成功")
      setDeleteOpen(false)
      setDeleting(null)
    },
    onError: () => toast.error("删除失败"),
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(d: Department) {
    setEditing(d)
    setForm({
      name: d.name,
      code: d.code ?? "",
      parent_id: d.parent_id,
      manager_id: d.manager_id,
      sort_order: d.sort_order,
      status: d.status,
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
    if (editing) {
      updateMut.mutate({ id: editing.id, data: form })
    } else {
      createMut.mutate(form)
    }
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>部门管理</CardTitle>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新增部门
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>部门名称</TableHead>
                  <TableHead>编码</TableHead>
                  <TableHead>负责人</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  flatList.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div
                          className="flex items-center gap-1"
                          style={{ paddingLeft: `${d.depth * 24}px` }}
                        >
                          {d.children.length > 0 ? (
                            <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground shrink-0 opacity-0" />
                          )}
                          <span className="font-medium">{d.name}</span>
                        </div>
                      </TableCell>
                      <TableCell><code className="text-xs">{d.code ?? "-"}</code></TableCell>
                      <TableCell>{d.manager_id ?? "-"}</TableCell>
                      <TableCell>{d.sort_order}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === 1 ? "default" : "secondary"}>
                          {d.status === 1 ? "启用" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(d)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => { setDeleting(d); setDeleteOpen(true) }}
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
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "编辑部门" : "新增部门"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>部门名称 *</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>编码</Label>
                  <Input
                    value={form.code ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>上级部门</Label>
                  <Select
                    value={form.parent_id ?? "__none__"}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, parent_id: v === "__none__" ? undefined : (v ?? undefined) }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="无" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">无（顶级）</SelectItem>
                      {parentOptions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>排序</Label>
                  <Input
                    type="number"
                    value={form.sort_order ?? 0}
                    onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>状态</Label>
                  <Select
                    value={String(form.status ?? 1)}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: Number(v) }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">启用</SelectItem>
                      <SelectItem value="0">停用</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              确定要删除「{deleting?.name}」吗？子部门也将被删除，此操作不可撤销。
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
