import { useState, useMemo, useEffect, Fragment } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronRight,
  ChevronDown,
  Search,
  MoreHorizontal,
  RotateCcw,
  Power,
  CheckCircle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import {
  listCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  resetUserPassword,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  assignRolePermissions,
  listPermissions,
} from "@/api/organization"
import type { Company, Department, User, Role, Permission } from "@/api/types"

export default function OrganizationPage() {
  const [activeTab, setActiveTab] = useState("company")

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">组织架构</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="company">公司</TabsTrigger>
          <TabsTrigger value="department">部门</TabsTrigger>
          <TabsTrigger value="user">用户</TabsTrigger>
          <TabsTrigger value="role">角色</TabsTrigger>
        </TabsList>
        <TabsContent value="company">
          <CompanyTab />
        </TabsContent>
        <TabsContent value="department">
          <DepartmentTab />
        </TabsContent>
        <TabsContent value="user">
          <UserTab />
        </TabsContent>
        <TabsContent value="role">
          <RoleTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CompanyTab() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [deleting, setDeleting] = useState<Company | null>(null)
  const [form, setForm] = useState<Partial<Company>>({
    name: "", short_name: "", code: "", company_type: "group",
    unified_credit_code: "", legal_person: "", address: "",
  })

  const { data, isLoading } = useQuery({
    queryKey: ["companies", page, pageSize],
    queryFn: () => listCompanies({ page, page_size: pageSize }),
  })

  const companies = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const createMut = useMutation({
    mutationFn: createCompany,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["companies"] }); toast.success("创建成功"); closeDialog() },
    onError: () => toast.error("创建失败"),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Company> }) => updateCompany(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["companies"] }); toast.success("更新成功"); closeDialog() },
    onError: () => toast.error("更新失败"),
  })

  const deleteMut = useMutation({
    mutationFn: deleteCompany,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["companies"] }); toast.success("删除成功"); setDeleteOpen(false); setDeleting(null) },
    onError: () => toast.error("删除失败"),
  })

  function openCreate() { setEditing(null); setForm({ name: "", short_name: "", code: "", company_type: "group", unified_credit_code: "", legal_person: "", address: "" }); setDialogOpen(true) }
  function openEdit(c: Company) { setEditing(c); setForm({ name: c.name, short_name: c.short_name ?? "", code: c.code, company_type: c.company_type, unified_credit_code: c.unified_credit_code ?? "", legal_person: c.legal_person ?? "", address: c.address ?? "" }); setDialogOpen(true) }
  function closeDialog() { setDialogOpen(false); setEditing(null) }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); editing ? updateMut.mutate({ id: editing.id, data: form }) : createMut.mutate(form) }
  const isPending = createMut.isPending || updateMut.isPending

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>公司管理</CardTitle>
        <Button onClick={openCreate}><Plus className="size-4" />新增公司</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead><TableHead>简称</TableHead><TableHead>编码</TableHead><TableHead>类型</TableHead><TableHead>状态</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
                ) : companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.short_name ?? "-"}</TableCell>
                    <TableCell><code className="text-xs">{c.code}</code></TableCell>
                    <TableCell>{c.company_type === "group" ? "集团" : c.company_type === "subsidiary" ? "子公司" : "分公司"}</TableCell>
                    <TableCell><Badge variant={c.status === 1 ? "default" : "secondary"}>{c.status === 1 ? "启用" : "停用"}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{c.created_at ? format(new Date(c.created_at), "yyyy-MM-dd") : "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)}><Pencil className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => { setDeleting(c); setDeleteOpen(true) }}><Trash2 className="size-3.5 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">共 {total} 条</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
                  <span className="text-sm">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader><DialogTitle>{editing ? "编辑公司" : "新增公司"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2"><Label>公司名称 *</Label><Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>简称</Label><Input value={form.short_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))} /></div>
                <div className="grid gap-2"><Label>编码 *</Label><Input value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>公司类型 *</Label><Select value={form.company_type ?? "group"} onValueChange={(v) => setForm((f) => ({ ...f, company_type: v }) as Partial<Company>)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="group">集团</SelectItem><SelectItem value="subsidiary">子公司</SelectItem><SelectItem value="branch">分公司</SelectItem></SelectContent></Select></div>
                <div className="grid gap-2"><Label>统一信用代码</Label><Input value={form.unified_credit_code ?? ""} onChange={(e) => setForm((f) => ({ ...f, unified_credit_code: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>法人</Label><Input value={form.legal_person ?? ""} onChange={(e) => setForm((f) => ({ ...f, legal_person: e.target.value }))} /></div>
                <div className="grid gap-2"><Label>状态</Label><Select value={String(form.status ?? 1)} onValueChange={(v) => setForm((f) => ({ ...f, status: Number(v) }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">启用</SelectItem><SelectItem value="0">停用</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid gap-2"><Label>地址</Label><Input value={form.address ?? ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
              <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="size-4 animate-spin" />}{editing ? "更新" : "创建"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除「{deleting?.name}」吗？此操作不可撤销。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && deleteMut.mutate(deleting.id)}>{deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function DepartmentTab() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [deleting, setDeleting] = useState<Department | null>(null)
  const [form, setForm] = useState<Partial<Department>>({ name: "", code: "", parent_id: undefined, manager_id: undefined, sort_order: 0, status: 1 })

  const { data, isLoading } = useQuery({ queryKey: ["departments"], queryFn: () => listDepartments({ page: 1, page_size: 500 }) })
  const departments = data?.items ?? []

  interface TreeNode extends Department { children: TreeNode[] }
  const flatList = useMemo(() => {
    const map = new Map<string, TreeNode>()
    const roots: TreeNode[] = []
    for (const item of departments) map.set(item.id, { ...item, children: [] })
    for (const item of departments) {
      const node = map.get(item.id)!
      if (item.parent_id && map.has(item.parent_id)) map.get(item.parent_id)!.children.push(node)
      else roots.push(node)
    }
    const result: (TreeNode & { depth: number })[] = []
    function flatten(nodes: TreeNode[], depth: number) { for (const n of nodes) { result.push({ ...n, depth }); flatten(n.children, depth + 1) } }
    flatten(roots, 0)
    return result
  }, [departments])

  const parentOptions = useMemo(() => {
    if (!editing) return departments
    const excludeIds = new Set<string>()
    function collect(id: string) { excludeIds.add(id); for (const d of departments) { if (d.parent_id === id) collect(d.id) } }
    if (editing.id) collect(editing.id)
    return departments.filter((d) => !excludeIds.has(d.id))
  }, [departments, editing])

  const createMut = useMutation({ mutationFn: createDepartment, onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); toast.success("创建成功"); closeDialog() }, onError: () => toast.error("创建失败") })
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: Partial<Department> }) => updateDepartment(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); toast.success("更新成功"); closeDialog() }, onError: () => toast.error("更新失败") })
  const deleteMut = useMutation({ mutationFn: deleteDepartment, onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); toast.success("删除成功"); setDeleteOpen(false); setDeleting(null) }, onError: () => toast.error("删除失败") })

  function openCreate() { setEditing(null); setForm({ name: "", code: "", sort_order: 0, status: 1 }); setDialogOpen(true) }
  function openEdit(d: Department) { setEditing(d); setForm({ name: d.name, code: d.code ?? "", parent_id: d.parent_id, manager_id: d.manager_id, sort_order: d.sort_order, status: d.status }); setDialogOpen(true) }
  function closeDialog() { setDialogOpen(false); setEditing(null) }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); editing ? updateMut.mutate({ id: editing.id, data: form }) : createMut.mutate(form) }
  const isPending = createMut.isPending || updateMut.isPending

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>部门管理</CardTitle>
        <Button onClick={openCreate}><Plus className="size-4" />新增部门</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>部门名称</TableHead><TableHead>编码</TableHead><TableHead>排序</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
            <TableBody>
              {flatList.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
              ) : flatList.map((d) => (
                <TableRow key={d.id}>
                  <TableCell><div className="flex items-center gap-1" style={{ paddingLeft: `${d.depth * 24}px` }}>{d.children.length > 0 ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0 opacity-0" />}<span className="font-medium">{d.name}</span></div></TableCell>
                  <TableCell><code className="text-xs">{d.code ?? "-"}</code></TableCell>
                  <TableCell>{d.sort_order}</TableCell>
                  <TableCell><Badge variant={d.status === 1 ? "default" : "secondary"}>{d.status === 1 ? "启用" : "停用"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(d)}><Pencil className="size-3.5" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => { setDeleting(d); setDeleteOpen(true) }}><Trash2 className="size-3.5 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader><DialogTitle>{editing ? "编辑部门" : "新增部门"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2"><Label>部门名称 *</Label><Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>编码</Label><Input value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>
                <div className="grid gap-2"><Label>上级部门</Label><Select value={form.parent_id ?? "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v === "__none__" ? undefined : (v ?? undefined) }))}><SelectTrigger className="w-full"><SelectValue placeholder="无" /></SelectTrigger><SelectContent><SelectItem value="__none__">无（顶级）</SelectItem>{parentOptions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>排序</Label><Input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} /></div>
                <div className="grid gap-2"><Label>状态</Label><Select value={String(form.status ?? 1)} onValueChange={(v) => setForm((f) => ({ ...f, status: Number(v) }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">启用</SelectItem><SelectItem value="0">停用</SelectItem></SelectContent></Select></div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
              <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="size-4 animate-spin" />}{editing ? "更新" : "创建"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除「{deleting?.name}」吗？子部门也将被删除。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && deleteMut.mutate(deleting.id)}>{deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function UserTab() {
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
  const [form, setForm] = useState<Partial<User> & { password?: string }>({ username: "", password: "", real_name: "", phone: "", email: "", gender: 1, status: 1, is_super_admin: false })

  const { data, isLoading } = useQuery({ queryKey: ["users", page, pageSize, search], queryFn: () => listUsers({ page, page_size: pageSize, keyword: search || undefined }) })
  const users = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const createMut = useMutation({ mutationFn: createUser, onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("创建成功"); closeDialog() }, onError: () => toast.error("创建失败") })
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: Partial<User> }) => updateUser(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("更新成功"); closeDialog() }, onError: () => toast.error("更新失败") })
  const deleteMut = useMutation({ mutationFn: deleteUser, onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("删除成功"); setDeleteOpen(false); setDeleting(null) }, onError: () => toast.error("删除失败") })
  const toggleMut = useMutation({ mutationFn: toggleUserStatus, onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("状态已切换") }, onError: () => toast.error("操作失败") })
  const resetPwMut = useMutation({ mutationFn: ({ id, password }: { id: string; password: string }) => resetUserPassword(id, { password }), onSuccess: () => { toast.success("密码已重置"); setResetPwOpen(false); setResetting(null); setNewPassword("") }, onError: () => toast.error("重置失败") })

  function openCreate() { setEditing(null); setForm({ username: "", password: "", real_name: "", phone: "", email: "", gender: 1, status: 1, is_super_admin: false }); setDialogOpen(true) }
  function openEdit(u: User) { setEditing(u); setForm({ username: u.username, real_name: u.real_name ?? "", phone: u.phone ?? "", email: u.email ?? "", gender: u.gender, status: u.status, is_super_admin: u.is_super_admin }); setDialogOpen(true) }
  function closeDialog() { setDialogOpen(false); setEditing(null) }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); editing ? updateMut.mutate({ id: editing.id, data: form }) : createMut.mutate(form) }
  const isPending = createMut.isPending || updateMut.isPending

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>用户管理</CardTitle>
        <Button onClick={openCreate}><Plus className="size-4" />新增用户</Button>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 pb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="搜索用户名、姓名..." value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setSearch(keyword), setPage(1))} />
          </div>
          <Button variant="outline" onClick={() => { setSearch(keyword); setPage(1) }}>搜索</Button>
        </div>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <Table>
              <TableHeader><TableRow><TableHead>用户名</TableHead><TableHead>姓名</TableHead><TableHead>手机号</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
                ) : users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.real_name ?? "-"}</TableCell>
                    <TableCell>{u.phone ?? "-"}</TableCell>
                    <TableCell><Badge variant={u.status === 1 ? "default" : "destructive"}>{u.status === 1 ? "启用" : "停用"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(u)}><Pencil className="size-4" />编辑</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleMut.mutate(u.id)}><Power className="size-4" />切换状态</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setResetting(u); setResetPwOpen(true) }}><RotateCcw className="size-4" />重置密码</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => { setDeleting(u); setDeleteOpen(true) }}><Trash2 className="size-4" />删除</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">共 {total} 条</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
                  <span className="text-sm">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader><DialogTitle>{editing ? "编辑用户" : "新增用户"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>用户名 *</Label><Input value={form.username ?? ""} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required /></div>
                {!editing && <div className="grid gap-2"><Label>密码 *</Label><Input type="password" value={form.password ?? ""} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required={!editing} /></div>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>姓名</Label><Input value={form.real_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, real_name: e.target.value }))} /></div>
                <div className="grid gap-2"><Label>手机号</Label><Input value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div className="flex items-center justify-between"><Label>启用状态</Label><Switch checked={form.status === 1} onCheckedChange={(checked) => setForm((f) => ({ ...f, status: checked ? 1 : 0 }))} /></div>
              <div className="flex items-center justify-between"><Label>超级管理员</Label><Switch checked={form.is_super_admin ?? false} onCheckedChange={(checked) => setForm((f) => ({ ...f, is_super_admin: checked }))} /></div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
              <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="size-4 animate-spin" />}{editing ? "更新" : "创建"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除用户「{deleting?.username}」吗？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && deleteMut.mutate(deleting.id)}>{deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={resetPwOpen} onOpenChange={setResetPwOpen}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={(e) => { e.preventDefault(); resetting && newPassword && resetPwMut.mutate({ id: resetting.id, password: newPassword }) }}>
            <DialogHeader><DialogTitle>重置密码</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <p className="text-sm text-muted-foreground">为用户「{resetting?.username}」设置新密码</p>
              <div className="grid gap-2"><Label>新密码 *</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} /></div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
              <Button type="submit" disabled={resetPwMut.isPending}>{resetPwMut.isPending && <Loader2 className="size-4 animate-spin" />}确认重置</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function RoleTab() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const [form, setForm] = useState<Partial<Role>>({ name: "", code: "", description: "", status: 1 })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({ queryKey: ["roles", page, pageSize], queryFn: () => listRoles({ page, page_size: pageSize }) })
  const { data: allPermissions } = useQuery({ queryKey: ["permissions"], queryFn: listPermissions })
  const { data: rolePerms, isLoading: permsLoading } = useQuery({ queryKey: ["role-permissions", expandedId], queryFn: () => getRolePermissions(expandedId!), enabled: !!expandedId })

  useEffect(() => { if (rolePerms) setSelectedPermIds(new Set(rolePerms.map((p: Permission) => p.id))) }, [rolePerms])

  const groupedPerms = useMemo(() => {
    const groups = new Map<string, Permission[]>()
    for (const p of allPermissions ?? []) { if (!groups.has(p.module)) groups.set(p.module, []); groups.get(p.module)!.push(p) }
    return groups
  }, [allPermissions])

  const roles = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const createMut = useMutation({ mutationFn: createRole, onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); toast.success("创建成功"); closeDialog() }, onError: () => toast.error("创建失败") })
  const updateMut = useMutation({ mutationFn: ({ id, data }: { id: string; data: Partial<Role> }) => updateRole(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); toast.success("更新成功"); closeDialog() }, onError: () => toast.error("更新失败") })
  const deleteMut = useMutation({ mutationFn: deleteRole, onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); toast.success("删除成功"); setDeleteOpen(false); setDeleting(null) }, onError: () => toast.error("删除失败") })
  const assignMut = useMutation({ mutationFn: ({ id, permission_ids }: { id: string; permission_ids: string[] }) => assignRolePermissions(id, { permission_ids }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["role-permissions", expandedId] }); toast.success("权限已更新") }, onError: () => toast.error("权限更新失败") })

  function openCreate() { setEditing(null); setForm({ name: "", code: "", description: "", status: 1 }); setDialogOpen(true) }
  function openEdit(r: Role) { setEditing(r); setForm({ name: r.name, code: r.code, description: r.description ?? "", status: r.status }); setDialogOpen(true) }
  function closeDialog() { setDialogOpen(false); setEditing(null) }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); editing ? updateMut.mutate({ id: editing.id, data: form }) : createMut.mutate(form) }
  function toggleExpand(id: string) { expandedId === id ? (setExpandedId(null), setSelectedPermIds(new Set())) : setExpandedId(id) }
  function togglePerm(permId: string) { setSelectedPermIds((prev) => { const next = new Set(prev); next.has(permId) ? next.delete(permId) : next.add(permId); return next }) }
  function toggleModuleAll(modulePerms: Permission[]) {
    const allSelected = modulePerms.every((p) => selectedPermIds.has(p.id))
    setSelectedPermIds((prev) => { const next = new Set(prev); for (const p of modulePerms) { allSelected ? next.delete(p.id) : next.add(p.id) } return next })
  }
  const isPending = createMut.isPending || updateMut.isPending

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>角色管理</CardTitle>
        <Button onClick={openCreate}><Plus className="size-4" />新增角色</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <Table>
              <TableHeader><TableRow><TableHead className="w-8" /><TableHead>角色名称</TableHead><TableHead>编码</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {roles.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
                ) : roles.map((r) => (
                  <Fragment key={r.id}>
                    <TableRow>
                      <TableCell><Button variant="ghost" size="icon-xs" onClick={() => toggleExpand(r.id)}>{expandedId === r.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</Button></TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><code className="text-xs">{r.code}</code></TableCell>
                      <TableCell><Badge variant={r.status === 1 ? "default" : "secondary"}>{r.status === 1 ? "启用" : "停用"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)}><Pencil className="size-3.5" /></Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => { setDeleting(r); setDeleteOpen(true) }}><Trash2 className="size-3.5 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === r.id && (
                      <TableRow key={`${r.id}-perms`}>
                        <TableCell colSpan={5} className="bg-muted/30 p-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">权限配置</p>
                              <Button size="sm" onClick={() => assignMut.mutate({ id: expandedId, permission_ids: Array.from(selectedPermIds) })} disabled={assignMut.isPending}>{assignMut.isPending && <Loader2 className="size-4 animate-spin" />}保存权限</Button>
                            </div>
                            {permsLoading ? (
                              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                            ) : Array.from(groupedPerms.entries()).map(([module, perms]) => (
                              <div key={module} className="space-y-2">
                                <div className="flex items-center gap-2"><Checkbox checked={perms.every((p) => selectedPermIds.has(p.id))} onCheckedChange={() => toggleModuleAll(perms)} /><span className="text-sm font-medium">{module}</span></div>
                                <div className="flex flex-wrap gap-3 pl-6">{perms.map((p) => <label key={p.id} className="flex items-center gap-1.5 text-sm cursor-pointer"><Checkbox checked={selectedPermIds.has(p.id)} onCheckedChange={() => togglePerm(p.id)} />{p.name}</label>)}</div>
                                <Separator />
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">共 {total} 条</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
                  <span className="text-sm">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <DialogHeader><DialogTitle>{editing ? "编辑角色" : "新增角色"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>角色名称 *</Label><Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
                <div className="grid gap-2"><Label>编码 *</Label><Input value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} required /></div>
              </div>
              <div className="grid gap-2"><Label>描述</Label><Textarea value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>状态</Label><Select value={String(form.status ?? 1)} onValueChange={(v) => setForm((f) => ({ ...f, status: Number(v) }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">启用</SelectItem><SelectItem value="0">停用</SelectItem></SelectContent></Select></div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
              <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="size-4 animate-spin" />}{editing ? "更新" : "创建"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle><AlertDialogDescription>确定要删除角色「{deleting?.name}」吗？</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && deleteMut.mutate(deleting.id)}>{deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
