import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X, Download, FileText, FileSpreadsheet, Image as ImageIcon, Loader2, ZoomIn, ZoomOut } from "lucide-react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface FilePreviewProps {
  file: {
    url: string
    original_filename: string
    content_type?: string
    size?: number
  } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getExt(filename: string): string {
  return (filename.split(".").pop() || "").toLowerCase()
}

function getToken(): string {
  return localStorage.getItem("access_token") || ""
}

function getApiBase(): string {
  return import.meta.env.VITE_API_BASE || "/api/v1"
}

function fileUrlWithToken(rawUrl: string): string {
  const token = getToken()
  if (rawUrl.startsWith("http")) return `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}token=${token}`
  if (rawUrl.startsWith("/api/")) return `${rawUrl}?token=${token}`
  const base = getApiBase()
  const path = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`
  return `${base}${path}?token=${token}`
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function fetchBlob(url: string): Promise<Blob> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`)
  return resp.blob()
}

function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.0)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let revoked = false
    fetchBlob(url).then((blob) => {
      if (!revoked) setBlobUrl(URL.createObjectURL(blob))
    }).catch(() => setError(true))
    return () => { revoked = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [url])

  if (error) return <div className="text-center py-12 text-muted-foreground">PDF加载失败</div>
  if (!blobUrl) return <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background z-10 py-2">
        <Button variant="outline" size="sm" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>
          <ZoomOut className="size-4" />
        </Button>
        <span className="text-sm">{Math.round(scale * 100)}%</span>
        <Button variant="outline" size="sm" onClick={() => setScale((s) => Math.min(2, s + 0.25))}>
          <ZoomIn className="size-4" />
        </Button>
        {numPages > 0 && <span className="text-sm text-muted-foreground">{numPages} 页</span>}
      </div>
      <Document
        file={blobUrl}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        onLoadError={() => setError(true)}
        loading={<div className="py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page key={i} pageNumber={i + 1} scale={scale} className="mb-2" />
        ))}
      </Document>
    </div>
  )
}

function ImageViewer({ url }: { url: string }) {
  return (
    <div className="flex items-center justify-center p-4">
      <img src={url} alt="preview" className="max-w-full max-h-[75vh] object-contain rounded" />
    </div>
  )
}

function DocxViewer({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchBlob(url).then(async (blob) => {
      if (cancelled) return
      const mammoth = await import("mammoth")
      const arrayBuffer = await blob.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer })
      if (!cancelled) setHtml(result.value)
    }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [url])

  if (error) return <div className="text-center py-12 text-muted-foreground">文档加载失败</div>
  if (!html) return <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>

  return (
    <div className="p-6 max-w-none prose prose-sm" dangerouslySetInnerHTML={{ __html: html }} />
  )
}

function XlsxViewer({ url }: { url: string }) {
  const [tables, setTables] = useState<string[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchBlob(url).then(async (blob) => {
      if (cancelled) return
      const XLSX = await import("xlsx")
      const arrayBuffer = await blob.arrayBuffer()
      const wb = XLSX.read(arrayBuffer, { type: "array" })
      const htmls = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name]
        const html = XLSX.utils.sheet_to_html(ws, { editable: false })
        return `<div class="mb-4"><h3 class="text-sm font-medium mb-2">工作表: ${name}</h3>${html}</div>`
      })
      if (!cancelled) { setTables(htmls); setLoading(false) }
    }).catch(() => { if (!cancelled) { setError(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [url])

  if (error) return <div className="text-center py-12 text-muted-foreground">表格加载失败</div>
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>

  return (
    <div className="overflow-auto max-h-[70vh]">
      {tables.map((t, i) => (
        <div key={i} dangerouslySetInnerHTML={{ __html: t }} className="[&_table]:w-full [&_table]:text-sm [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted" />
      ))}
    </div>
  )
}

export default function FilePreview({ file, open, onOpenChange }: FilePreviewProps) {
  if (!file) return null

  const ext = getExt(file.original_filename)
  const url = fileUrlWithToken(file.url)

  const isImage = ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext)
  const isPdf = ext === "pdf"
  const isDocx = ext === "docx"
  const isDoc = ext === "doc"
  const isXlsx = ["xls", "xlsx"].includes(ext)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-4xl lg:max-w-5xl xl:max-w-6xl max-h-[95vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            <span className="truncate max-w-md">{file.original_filename}</span>
            {file.size && <span className="text-sm font-normal text-muted-foreground">({formatSize(file.size)})</span>}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <a href={url} download={file.original_filename} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              <Download className="size-4" />下载
            </a>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0">
          {isPdf && <PdfViewer url={url} />}
          {isImage && <ImageViewer url={url} />}
          {isDocx && <DocxViewer url={url} />}
          {isDoc && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <FileText className="size-12" />
              <p>.doc格式不支持在线预览，请下载后查看</p>
              <a href={url} download={file.original_filename} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">下载文件</a>
            </div>
          )}
          {isXlsx && <XlsxViewer url={url} />}
          {!isPdf && !isImage && !isDocx && !isDoc && !isXlsx && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <FileText className="size-12" />
              <p>此文件格式不支持在线预览</p>
              <a href={url} download={file.original_filename} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">下载文件</a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
