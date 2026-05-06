import { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
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
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  assignRolePermissions,
  listPermissions,
} from "@/api/organization"
import type { Role, Permission } from "@/api/types"

const emptyForm: Partial<Role> = {
  name: "",
  code: "",
  description: "",
  status: 1,
}

export default function RolePage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const [form, setForm] = useState<Partial<Role>>(emptyForm)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ["roles", page, pageSize],
    queryFn: () => listRoles({ page, page_size: pageSize }),
  })

  const { data: allPermissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => listPermissions(),
  })

  const { data: rolePerms, isLoading: permsLoading } = useQuery({
    queryKey: ["role-permissions", expandedId],
    queryFn: () => getRolePermissions(expandedId!),
    enabled: !!expandedId,
  })

  useEffect(() => {
    if (rolePerms) {
      setSelectedPermIds(new Set(rolePerms.map((p: Permission) => p.id)))
    }
  }, [rolePerms])

  const groupedPerms = useMemo(() => {
    const groups = new Map<string, Permission[]>()
    for (const p of allPermissions ?? []) {
      if (!groups.has(p.module)) groups.set(p.module, [])
      groups.get(p.module)!.push(p)
    }
    return groups
  }, [allPermissions])

  const roles = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const createMut = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] })
      toast.success("创建成功")
      closeDialog()
    },
    onError: () => toast.error("创建失败"),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Role> }) =>
      updateRole(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] })
      toast.success("更新成功")
      closeDialog()
    },
    onError: () => toast.error("更新失败"),
  })

  const deleteMut = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] })
      toast.success("删除成功")
      setDeleteOpen(false)
      setDeleting(null)
    },
    onError: () => toast.error("删除失败"),
  })

  const assignMut = useMutation({
    mutationFn: ({ id, permission_ids }: { id: string; permission_ids: string[] }) =>
      assignRolePermissions(id, { permission_ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-permissions", expandedId] })
      toast.success("权限已更新")
    },
    onError: () => toast.error("权限更新失败"),
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(r: Role) {
    setEditing(r)
    setForm({
      name: r.name,
      code: r.code,
      description: r.description ?? "",
      status: r.status,
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

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setSelectedPermIds(new Set())
    } else {
      setExpandedId(id)
    }
  }

  function togglePerm(permId: string) {
    setSelectedPermIds((prev) => {
      const next = new Set(prev)
      if (next.has(permId)) next.delete(permId)
      else next.add(permId)
      return next
    })
  }

  function toggleModuleAll(modulePerms: Permission[]) {
    const allSelected = modulePerms.every((p) => selectedPermIds.has(p.id))
    setSelectedPermIds((prev) => {
      const next = new Set(prev)
      for (const p of modulePerms) {
        if (allSelected) next.delete(p.id)
        else next.add(p.id)
      }
      return next
    })
  }

  function savePermissions() {
    if (expandedId) {
      assignMut.mutate({ id: expandedId, permission_ids: Array.from(selectedPermIds) })
    }
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>角色管理</CardTitle>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新增角色
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
                  <TableHead className="w-8" />
                  <TableHead>角色名称</TableHead>
                  <TableHead>编码</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  roles.map((r) => (
                    <>
                      <TableRow key={r.id}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => toggleExpand(r.id)}
                          >
                            {expandedId === r.id ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell><code className="text-xs">{r.code}</code></TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {r.description ?? "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === 1 ? "default" : "secondary"}>
                            {r.status === 1 ? "启用" : "停用"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => { setDeleting(r); setDeleteOpen(true) }}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedId === r.id && (
                        <TableRow key={`${r.id}-perms`}>
                          <TableCell colSpan={6} className="bg-muted/30 p-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">权限配置</p>
                                <Button
                                  size="sm"
                                  onClick={savePermissions}
                                  disabled={assignMut.isPending}
                                >
                                  {assignMut.isPending && (
                                    <Loader2 className="size-4 animate-spin" />
                                  )}
                                  保存权限
                                </Button>
                              </div>
                              {permsLoading ? (
                                <div className="space-y-2">
                                  {Array.from({ length: 3 }).map((_, i) => (
                                    <Skeleton key={i} className="h-8 w-full" />
                                  ))}
                                </div>
                              ) : (
                                Array.from(groupedPerms.entries()).map(([module, perms]) => (
                                  <div key={module} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        checked={perms.every((p) => selectedPermIds.has(p.id))}
                                        onCheckedChange={() => toggleModuleAll(perms)}
                                      />
                                      <span className="text-sm font-medium">{module}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-3 pl-6">
                                      {perms.map((p) => (
                                        <label
                                          key={p.id}
                                          className="flex items-center gap-1.5 text-sm cursor-pointer"
                                        >
                                          <Checkbox
                                            checked={selectedPermIds.has(p.id)}
                                            onCheckedChange={() => togglePerm(p.id)}
                                          />
                                          {p.name}
                                        </label>
                                      ))}
                                    </div>
                                    <Separator />
                                  </div>
                                ))
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))
                )}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">共 {total} 条</p>
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
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "编辑角色" : "新增角色"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>角色名称 *</Label>
                  <Input
                    value={form.name ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label>编码 *</Label>
                  <Input
                    value={form.code ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>描述</Label>
                <Textarea
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
              确定要删除角色「{deleting?.name}」吗？此操作不可撤销。
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
