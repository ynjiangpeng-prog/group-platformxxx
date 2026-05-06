import { useCallback, useState, useRef } from "react"
import { Upload, X, FileIcon, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { post } from "@/lib/http"
import { toast } from "sonner"

interface FileItem {
  file_id: string
  object_name: string
  original_filename: string
  size: number
  content_type: string
  url: string
}

interface FileUploadProps {
  value?: FileItem[]
  onChange: (files: FileItem[]) => void
  accept?: string
  maxFiles?: number
  maxSizeMB?: number
  folder?: string
  required?: boolean
}

const MAX_SIZE_DEFAULT = 50

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
  ".zip", ".rar", ".7z",
]

function validateFile(file: File, maxSizeMB: number): string | null {
  const ext = "." + file.name.split(".").pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) return `不支持的文件类型: ${ext}`
  if (file.size > maxSizeMB * 1024 * 1024) return `文件过大: ${formatSize(file.size)}，上限 ${maxSizeMB}MB`
  return null
}

export default function FileUpload({ value = [], onChange, accept, maxFiles = 5, maxSizeMB = MAX_SIZE_DEFAULT, folder, required }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const remaining = maxFiles - value.length
    const toUpload = Array.from(files).slice(0, remaining)
    if (toUpload.length === 0) return

    const validationErrors: string[] = []
    const validFiles: File[] = []
    for (const file of toUpload) {
      const err = validateFile(file, maxSizeMB)
      if (err) {
        validationErrors.push(`${file.name}: ${err}`)
      } else {
        validFiles.push(file)
      }
    }
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      toast.error(`${validationErrors.length}个文件验证失败`)
    }
    if (validFiles.length === 0) return

    setUploading(true)
    setErrors([])
    try {
      const results: FileItem[] = []
      for (const file of validFiles) {
        const fd = new FormData()
        fd.append("file", file)
        if (folder) fd.append("folder", folder)
        const res = await post<FileItem>("/files/upload", fd)
        results.push(res)
      }
      onChange([...value, ...results])
      toast.success(`已上传 ${results.length} 个文件`)
    } catch {
      toast.error("上传失败")
    } finally {
      setUploading(false)
    }
  }, [value, onChange, maxFiles, maxSizeMB, folder])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
  }, [uploadFiles])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files)
      e.target.value = ""
    }
  }, [uploadFiles])

  const removeFile = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const canAdd = value.length < maxFiles

  return (
    <div className="space-y-3">
      {canAdd && (
        <div
          className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer ${
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            multiple={maxFiles > 1}
            onChange={handleInputChange}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">上传中...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="size-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">拖拽文件到此处或点击上传</span>
              <span className="text-xs text-muted-foreground">最多 {maxFiles} 个文件，单文件最大 {maxSizeMB}MB</span>
              {required && <span className="text-xs text-destructive">* 必须上传附件</span>}
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-1">
          {errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}

      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((file, index) => (
            <div key={file.file_id || index} className="flex items-center gap-3 rounded-lg border p-2">
              <FileIcon className="size-5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.original_filename}</p>
                <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
              </div>
              {file.url && (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  查看
                </a>
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => removeFile(index)} className="shrink-0">
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export type { FileItem, FileUploadProps }
