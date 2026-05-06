import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Loader2, Eye, Pencil, Trash2, ScanBarcode, Camera } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse,
  listInventory, createInventoryItem, createInventoryTx, listItemTransactions,
  scanLookupInventory,
} from "@/api/project"

const WH_TYPE_LABELS: Record<string, string> = { internal: "内部仓库", external: "外部仓库" }
const TX_TYPE_LABELS: Record<string, string> = { in: "入库", out: "出库", transfer: "调拨", project_apply: "项目领用" }
const CATEGORY_OPTIONS = ["原材料", "设备", "工具", "耗材", "电气材料", "其他"]

type Warehouse = { id: string; name: string; wh_type: string; location?: string; manager_id?: string; status: string }

export default function WarehousePage() {
  const qc = useQueryClient()

  const [whDialog, setWhDialog] = useState(false)
  const [whEditId, setWhEditId] = useState<string | null>(null)
  const [whForm, setWhForm] = useState({ name: "", wh_type: "internal", location: "", manager_id: "" })

  const [invPage, setInvPage] = useState(1)
  const [invWhFilter, setInvWhFilter] = useState("all")
  const [invCatFilter, setInvCatFilter] = useState("all")

  const [txDialog, setTxDialog] = useState(false)
  const [txForm, setTxForm] = useState({ item_id: "", tx_type: "in", quantity: "", target_warehouse_id: "", project_id: "", remark: "" })

  const [txHistDialog, setTxHistDialog] = useState(false)
  const [txHistItemId, setTxHistItemId] = useState("")

  // Scan state
  const [scanBarcode, setScanBarcode] = useState("")
  const [scanResult, setScanResult] = useState<Record<string, unknown> | null>(null)
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses"], queryFn: listWarehouses })

  const { data: invData, isLoading: invLoading } = useQuery({
    queryKey: ["inventory", invPage, invWhFilter, invCatFilter],
    queryFn: () => listInventory({
      page: invPage, page_size: 20,
      warehouse_id: invWhFilter !== "all" ? invWhFilter : undefined,
      category: invCatFilter !== "all" ? invCatFilter : undefined,
    }),
  })

  const { data: txHistData } = useQuery({
    queryKey: ["item-transactions", txHistItemId],
    queryFn: () => listItemTransactions(txHistItemId, { page: 1, page_size: 50 }),
    enabled: !!txHistItemId,
  })

  const inventory = invData?.items ?? []
  const whMap = Object.fromEntries((warehouses as Warehouse[]).map((w) => [w.id, w.name]))

  const createWhMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => createWarehouse(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["warehouses"] }); toast.success("仓库已创建"); setWhDialog(false) },
    onError: () => toast.error("操作失败"),
  })

  const updateWhMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateWarehouse(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["warehouses"] }); toast.success("仓库已更新"); setWhDialog(false) },
    onError: () => toast.error("操作失败"),
  })

  const deleteWhMut = useMutation({
    mutationFn: (id: string) => deleteWarehouse(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["warehouses"] }); toast.success("仓库已删除") },
    onError: () => toast.error("删除失败"),
  })

  const txMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => createInventoryTx(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); toast.success("操作成功"); setTxDialog(false) },
    onError: () => toast.error("操作失败"),
  })

  const openWhCreate = () => {
    setWhEditId(null)
    setWhForm({ name: "", wh_type: "internal", location: "", manager_id: "" })
    setWhDialog(true)
  }

  const openWhEdit = (w: Warehouse) => {
    setWhEditId(w.id)
    setWhForm({ name: w.name, wh_type: w.wh_type, location: w.location ?? "", manager_id: w.manager_id ?? "" })
    setWhDialog(true)
  }

  const submitWh = () => {
    const payload = { name: whForm.name, wh_type: whForm.wh_type, location: whForm.location || undefined, manager_id: whForm.manager_id || undefined }
    if (whEditId) updateWhMut.mutate({ id: whEditId, data: payload })
    else createWhMut.mutate(payload)
  }

  const openTxHist = (itemId: string) => {
    setTxHistItemId(itemId)
    setTxHistDialog(true)
  }

  const scanMut = useMutation({
    mutationFn: scanLookupInventory,
    onSuccess: (res) => {
      if (res.found && res.item) {
        setScanResult(res.item)
        setTxForm((f) => ({ ...f, item_id: res.item!.id as string }))
        toast.success(`识别到: ${res.item.name}`)
      } else {
        setScanResult(null)
        toast.info("未找到匹配的物料")
      }
    },
    onError: () => toast.error("查询失败"),
  })

  function doBarcodeSearch() {
    if (scanBarcode.trim()) scanMut.mutate(scanBarcode.trim())
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setScanning(true)
      // Use native BarcodeDetector if available
      const video = videoRef.current!
      const detect = async () => {
        if (!scanning || !videoRef.current) return
        if ("BarcodeDetector" in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39"] })
          try {
            const barcodes = await detector.detect(video)
            if (barcodes.length > 0) {
              setScanBarcode(barcodes[0].rawValue)
              scanMut.mutate(barcodes[0].rawValue)
              stopCamera()
              return
            }
          } catch {}
        }
        requestAnimationFrame(detect)
      }
      video.play()
      detect()
    } catch {
      toast.error("无法访问摄像头")
    }
  }

  function stopCamera() {
    setScanning(false)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">仓库与库存管理</h1>

      <Tabs defaultValue="warehouses">
        <TabsList>
          <TabsTrigger value="warehouses">仓库管理</TabsTrigger>
          <TabsTrigger value="inventory">库存管理</TabsTrigger>
          <TabsTrigger value="transaction">出入库操作</TabsTrigger>
        </TabsList>

        <TabsContent value="warehouses">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">共 {(warehouses as Warehouse[]).length} 个仓库</span>
              <Button onClick={openWhCreate}><Plus className="size-4" />新建仓库</Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>仓库名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>位置</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="w-28">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(warehouses as Warehouse[]).length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
                    )}
                    {(warehouses as Warehouse[]).map((w) => (
                      <TableRow key={w.id}>
                        <TableCell className="font-medium">{w.name}</TableCell>
                        <TableCell><Badge variant="outline">{WH_TYPE_LABELS[w.wh_type] ?? w.wh_type}</Badge></TableCell>
                        <TableCell>{w.location ?? "-"}</TableCell>
                        <TableCell><Badge variant={w.status === "active" ? "default" : "secondary"}>{w.status === "active" ? "启用" : "停用"}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openWhEdit(w)}><Pencil className="size-4" /></Button>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => deleteWhMut.mutate(w.id)}><Trash2 className="size-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="inventory">
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={invWhFilter} onValueChange={(v) => { setInvWhFilter(v ?? "all"); setInvPage(1) }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="仓库筛选" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部仓库</SelectItem>
                  {(warehouses as Warehouse[]).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={invCatFilter} onValueChange={(v) => { setInvCatFilter(v ?? "all"); setInvPage(1) }}>
                <SelectTrigger className="w-36"><SelectValue placeholder="分类筛选" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {invLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>规格型号</TableHead>
                        <TableHead>仓库</TableHead>
                        <TableHead>分类</TableHead>
                        <TableHead>数量</TableHead>
                        <TableHead>单位</TableHead>
                        <TableHead>单价</TableHead>
                        <TableHead>总价值</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="w-20">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.length === 0 && (
                        <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">暂无数据</TableCell></TableRow>
                      )}
                      {inventory.map((item: Record<string, unknown>) => {
                        const qty = Number(item.quantity ?? 0)
                        const price = Number(item.unit_price ?? 0)
                        return (
                          <TableRow key={item.id as string}>
                            <TableCell className="font-medium">{String(item.name ?? "")}</TableCell>
                            <TableCell>{String(item.model_spec ?? "-")}</TableCell>
                            <TableCell>{whMap[item.warehouse_id as string] ?? "-"}</TableCell>
                            <TableCell>{String(item.category ?? "-")}</TableCell>
                            <TableCell>{qty}</TableCell>
                            <TableCell>{String(item.unit ?? "-")}</TableCell>
                            <TableCell>{price ? `¥${price.toLocaleString()}` : "-"}</TableCell>
                            <TableCell>{qty * price ? `¥${(qty * price).toLocaleString()}` : "-"}</TableCell>
                            <TableCell><Badge variant="outline">{String(item.status ?? "-")}</Badge></TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => openTxHist(item.id as string)}><Eye className="size-4" />明细</Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">共 {invData?.total ?? 0} 条</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={invPage <= 1} onClick={() => setInvPage((p) => p - 1)}>上一页</Button>
                <span className="text-sm">{invPage}</span>
                <Button variant="outline" size="sm" disabled={inventory.length < 20} onClick={() => setInvPage((p) => p + 1)}>下一页</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transaction">
          <Card>
            <CardContent className="pt-6">
              <div className="max-w-lg space-y-4">
                <h3 className="text-lg font-semibold">出入库操作</h3>

                {/* Scan Section */}
                <div className="border rounded-lg p-4 space-y-3">
                  <Label className="text-base font-medium">扫码识别</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="输入或扫码条码..."
                      value={scanBarcode}
                      onChange={(e) => setScanBarcode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") doBarcodeSearch() }}
                      className="flex-1"
                    />
                    <Button variant="outline" onClick={doBarcodeSearch} disabled={scanMut.isPending}>
                      {scanMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <ScanBarcode className="size-4" />}
                    </Button>
                    <Button variant="outline" onClick={scanning ? stopCamera : startCamera}>
                      <Camera className="size-4" />
                    </Button>
                  </div>
                  {scanning && (
                    <video ref={videoRef} className="w-full max-w-sm rounded-lg" autoPlay playsInline muted />
                  )}
                  {scanResult && (
                    <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                      <p><span className="font-medium">名称:</span> {String(scanResult.name)}</p>
                      <p><span className="font-medium">规格:</span> {String(scanResult.model_spec ?? "-")}</p>
                      <p><span className="font-medium">库存:</span> {String(scanResult.quantity)} {String(scanResult.unit ?? "")}</p>
                      <p><span className="font-medium">条码:</span> {String(scanResult.barcode ?? "-")}</p>
                    </div>
                  )}
                </div>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>物料 *</Label>
                    <Select value={txForm.item_id} onValueChange={(v) => { if (v) setTxForm((f) => ({ ...f, item_id: v })) }}>
                      <SelectTrigger><SelectValue placeholder="选择物料" /></SelectTrigger>
                      <SelectContent>
                        {inventory.map((item: Record<string, unknown>) => (
                          <SelectItem key={item.id as string} value={item.id as string}>{String(item.name)} {String(item.model_spec ?? "")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>操作类型 *</Label>
                    <Select value={txForm.tx_type} onValueChange={(v) => { if (v) setTxForm((f) => ({ ...f, tx_type: v })) }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TX_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>数量 *</Label>
                    <Input type="number" value={txForm.quantity} onChange={(e) => setTxForm((f) => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  {(txForm.tx_type === "transfer" || txForm.tx_type === "in") && (
                    <div className="grid gap-2">
                      <Label>目标仓库</Label>
                      <Select value={txForm.target_warehouse_id} onValueChange={(v) => { if (v) setTxForm((f) => ({ ...f, target_warehouse_id: v })) }}>
                        <SelectTrigger><SelectValue placeholder="选择仓库" /></SelectTrigger>
                        <SelectContent>
                          {(warehouses as Warehouse[]).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {txForm.tx_type === "project_apply" && (
                    <div className="grid gap-2">
                      <Label>项目ID</Label>
                      <Input value={txForm.project_id} onChange={(e) => setTxForm((f) => ({ ...f, project_id: e.target.value }))} placeholder="输入项目ID" />
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label>备注</Label>
                    <Textarea value={txForm.remark} onChange={(e) => setTxForm((f) => ({ ...f, remark: e.target.value }))} rows={2} />
                  </div>
                  <Button
                    className="w-full"
                    disabled={txMut.isPending || !txForm.item_id || !txForm.quantity}
                    onClick={() => txMut.mutate({
                      item_id: txForm.item_id,
                      tx_type: txForm.tx_type,
                      quantity: Number(txForm.quantity),
                      target_warehouse_id: txForm.target_warehouse_id || undefined,
                      project_id: txForm.project_id || undefined,
                      remark: txForm.remark || undefined,
                    })}
                  >
                    {txMut.isPending && <Loader2 className="size-4 animate-spin" />}确认操作
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={whDialog} onOpenChange={setWhDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{whEditId ? "编辑仓库" : "新建仓库"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label>仓库名称 *</Label><Input value={whForm.name} onChange={(e) => setWhForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid gap-2">
              <Label>仓库类型</Label>
              <Select value={whForm.wh_type} onValueChange={(v) => { if (v) setWhForm((f) => ({ ...f, wh_type: v })) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">内部仓库</SelectItem>
                  <SelectItem value="external">外部仓库</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>位置</Label><Input value={whForm.location} onChange={(e) => setWhForm((f) => ({ ...f, location: e.target.value }))} /></div>
            <div className="grid gap-2"><Label>负责人ID</Label><Input value={whForm.manager_id} onChange={(e) => setWhForm((f) => ({ ...f, manager_id: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhDialog(false)}>取消</Button>
            <Button disabled={!whForm.name || createWhMut.isPending || updateWhMut.isPending} onClick={submitWh}>
              {(createWhMut.isPending || updateWhMut.isPending) && <Loader2 className="size-4 animate-spin" />}确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={txHistDialog} onOpenChange={setTxHistDialog}>
        <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>出入库明细</DialogTitle></DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>数量</TableHead>
                <TableHead>目标仓库</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!txHistData?.items || txHistData.items.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无记录</TableCell></TableRow>
              )}
              {txHistData?.items?.map((tx: Record<string, unknown>) => (
                <TableRow key={tx.id as string}>
                  <TableCell>{String(tx.created_at ?? "-").slice(0, 19)}</TableCell>
                  <TableCell><Badge variant="outline">{TX_TYPE_LABELS[String(tx.tx_type)] ?? String(tx.tx_type)}</Badge></TableCell>
                  <TableCell>{String(tx.quantity ?? "-")}</TableCell>
                  <TableCell>{whMap[tx.target_warehouse_id as string] ?? "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{String(tx.remark ?? "-")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  )
}
