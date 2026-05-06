import { useRef, useState } from "react"
import { toast } from "sonner"
import { Download, Upload, FileDown, CheckCircle, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { downloadTemplate, batchImport, batchApprove, batchDelete, batchExport } from "@/api/batch"
import type { BatchImportResult } from "@/api/batch"

interface BatchToolbarProps {
  entityType: string
  selectedIds: string[]
  templateType: string
  onImportComplete: () => void
  onExportComplete?: () => void
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function BatchToolbar({ entityType, selectedIds, templateType, onImportComplete, onExportComplete }: BatchToolbarProps) {
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<BatchImportResult | null>(null)
  const [actionType, setActionType] = useState<"approve" | "delete" | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const handleDownloadTemplate = async () => {
    setDownloading(true)
    try {
      const blob = await downloadTemplate(templateType)
      triggerDownload(blob as unknown as Blob, `${templateType}_template.xlsx`)
      toast.success("模板下载成功")
    } catch {
    } finally {
      setDownloading(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const result = await batchImport(entityType, file)
      setImportResult(result)
      onImportComplete()
      if (result.failed === 0) toast.success(`全部导入成功，共${result.total}条`)
      else toast.warning(`导入完成：成功${result.success}条，失败${result.failed}条`)
    } catch {
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ""
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await batchExport(entityType)
      triggerDownload(blob as unknown as Blob, `${entityType}_export.xlsx`)
      toast.success("导出成功")
      onExportComplete?.()
    } catch {
    } finally {
      setExporting(false)
    }
  }

  const handleAction = async () => {
    if (!actionType) return
    setActionLoading(true)
    try {
      if (actionType === "approve") {
        await batchApprove(entityType, selectedIds)
        toast.success("批量审批成功")
      } else {
        await batchDelete(entityType, selectedIds)
        toast.success("批量删除成功")
      }
      onImportComplete()
    } catch {
    } finally {
      setActionLoading(false)
      setActionType(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" disabled={downloading} onClick={handleDownloadTemplate}>
          {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          模板下载
        </Button>

        <Button variant="outline" size="sm" disabled={importing} onClick={() => importRef.current?.click()}>
          {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          批量导入
        </Button>
        <input ref={importRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleImport} />

        <Button variant="outline" size="sm" disabled={exporting} onClick={handleExport}>
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
          批量导出
        </Button>

        {selectedIds.length > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={() => setActionType("approve")}>
              <CheckCircle className="size-4" />
              批量审批 ({selectedIds.length})
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setActionType("delete")}>
              <Trash2 className="size-4" />
              批量删除 ({selectedIds.length})
            </Button>
          </>
        )}
      </div>

      <Dialog open={!!importResult} onOpenChange={(open) => !open && setImportResult(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>导入结果</DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span>总计: {importResult.total}</span>
                <span className="text-green-600">成功: {importResult.success}</span>
                <span className="text-red-600">失败: {importResult.failed}</span>
              </div>
              {importResult.errors.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>行号</TableHead>
                      <TableHead>错误信息</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResult.errors.map((err, i) => (
                      <TableRow key={i}>
                        <TableCell>{err.row}</TableCell>
                        <TableCell className="text-destructive">{err.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!actionType} onOpenChange={(open) => !open && setActionType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认{actionType === "approve" ? "审批" : "删除"}？</AlertDialogTitle>
            <AlertDialogDescription>
              即将{actionType === "approve" ? "审批" : "删除"} {selectedIds.length} 条记录，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={actionLoading}>
              {actionLoading && <Loader2 className="size-4 animate-spin" />}
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
