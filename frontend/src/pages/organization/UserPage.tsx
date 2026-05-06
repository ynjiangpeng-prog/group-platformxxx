import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  MoreHorizontal,
  RotateCcw,
  Power,
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
import { Switch } from "@/components/ui/switch"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  resetUserPassword,
} from "@/api/organization"
import type { User } from "@/api/types"

const emptyForm: Partial<User> & { password?: string } = {
  username: "",
  password: "",
  real_name: "",
  phone: "",
  email: "",
  gender: 1,
  status: 1,
  is_super_admin: false,
}

export default function UserPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [keyword, setKeyword] = useState("")
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [resetPwOpen, setResetPwOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [form, setForm] = useState<Partial<User> & { password?: string }>(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ["users", page, pageSize, search],
    queryFn: () =>
      listUsers({ page, page_size: pageSize, keyword: search || undefined }),
  })

  const users = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success("创建成功")
      closeDialog()
    },
    onError: () => toast.error("创建失败"),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<User> }) =>
      updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success("更新成功")
      closeDialog()
    },
    onError: () => toast.error("更新失败"),
  })

  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success("删除成功")
      setDeleteOpen(false)
      setDeleting(null)
    },
    onError: () => toast.error("删除失败"),
  })

  const toggleMut = useMutation({
    mutationFn: toggleUserStatus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success("状态已切换")
    },
    onError: () => toast.error("操作失败"),
  })

  const resetPwMut = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetUserPassword(id, { password }),
    onSuccess: () => {
      toast.success("密码已重置")
      setResetPwOpen(false)
      setResetting(null)
      setNewPassword("")
    },
    onError: () => toast.error("重置失败"),
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(u: User) {
    setEditing(u)
    setForm({
      username: u.username,
      real_name: u.real_name ?? "",
      phone: u.phone ?? "",
      email: u.email ?? "",
      gender: u.gender,
      status: u.status,
      is_super_admin: u.is_super_admin,
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function handleSearch() {
    setSearch(keyword)
    setPage(1)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editing) {
      updateMut.mutate({ id: editing.id, data: form })
    } else {
      createMut.mutate(form)
    }
  }

  function handleResetPw(e: React.FormEvent) {
    e.preventDefault()
    if (resetting && newPassword) {
      resetPwMut.mutate({ id: resetting.id, password: newPassword })
    }
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>用户管理</CardTitle>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新增用户
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 pb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="搜索用户名、姓名、手机号..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Button variant="outline" onClick={handleSearch}>搜索</Button>
          </div>

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
                    <TableHead>用户名</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>手机号</TableHead>
                    <TableHead>邮箱</TableHead>
                    <TableHead>性别</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>超级管理员</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.username}</TableCell>
                        <TableCell>{u.real_name ?? "-"}</TableCell>
                        <TableCell>{u.phone ?? "-"}</TableCell>
                        <TableCell>{u.email ?? "-"}</TableCell>
                        <TableCell>
                          {u.gender === 1 ? "男" : u.gender === 2 ? "女" : "未知"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.status === 1 ? "default" : "destructive"}>
                            {u.status === 1 ? "启用" : "停用"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.is_super_admin ? (
                            <Badge variant="outline">是</Badge>
                          ) : (
                            <span className="text-muted-foreground">否</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={<Button variant="ghost" size="icon-sm" />}
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(u)}>
                                <Pencil className="size-4" />
                                编辑
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleMut.mutate(u.id)}>
                                <Power className="size-4" />
                                切换状态
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => { setResetting(u); setResetPwOpen(true) }}
                              >
                                <RotateCcw className="size-4" />
                                重置密码
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => { setDeleting(u); setDeleteOpen(true) }}
                              >
                                <Trash2 className="size-4" />
                                删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

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
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "编辑用户" : "新增用户"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>用户名 *</Label>
                  <Input
                    value={form.username ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    required
                  />
                </div>
                {!editing && (
                  <div className="grid gap-2">
                    <Label>密码 *</Label>
                    <Input
                      type="password"
                      value={form.password ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      required={!editing}
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>姓名</Label>
                  <Input
                    value={form.real_name ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, real_name: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>性别</Label>
                  <Select
                    value={String(form.gender ?? 1)}
                    onValueChange={(v) => setForm((f) => ({ ...f, gender: Number(v) }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">男</SelectItem>
                      <SelectItem value="2">女</SelectItem>
                      <SelectItem value="0">未知</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>手机号</Label>
                  <Input
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>邮箱</Label>
                  <Input
                    type="email"
                    value={form.email ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>启用状态</Label>
                <Switch
                  checked={form.status === 1}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, status: checked ? 1 : 0 }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>超级管理员</Label>
                <Switch
                  checked={form.is_super_admin ?? false}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, is_super_admin: checked }))
                  }
                />
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
              确定要删除用户「{deleting?.username}」吗？此操作不可撤销。
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

      <Dialog open={resetPwOpen} onOpenChange={setResetPwOpen}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleResetPw}>
            <DialogHeader>
              <DialogTitle>重置密码</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <p className="text-sm text-muted-foreground">
                为用户「{resetting?.username}」设置新密码
              </p>
              <div className="grid gap-2">
                <Label>新密码 *</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
              <Button type="submit" disabled={resetPwMut.isPending}>
                {resetPwMut.isPending && <Loader2 className="size-4 animate-spin" />}
                确认重置
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
