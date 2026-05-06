import { useRef, useState } from "react"
import { toast } from "sonner"
import { Upload, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { recognizeContract, recognizeInvoice, recognizeReceipt, contractAutoSave, invoiceAutoSave } from "@/api/ocr"

interface OcrUploadButtonProps {
  type: "contract" | "invoice" | "receipt"
  onRecognized: (data: Record<string, unknown>) => void
  autoSave?: boolean
}

const recognizeFns = {
  contract: recognizeContract,
  invoice: recognizeInvoice,
  receipt: recognizeReceipt,
}

const autoSaveFns = {
  contract: contractAutoSave,
  invoice: invoiceAutoSave,
  receipt: undefined,
}

export default function OcrUploadButton({ type, onRecognized, autoSave }: OcrUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      if (autoSave && autoSaveFns[type]) {
        const result = await autoSaveFns[type]!(file)
        toast.success("识别并保存成功")
        onRecognized(result as unknown as Record<string, unknown>)
      } else {
        const result = await recognizeFns[type](file)
        toast.success("识别成功")
        onRecognized(result as unknown as Record<string, unknown>)
      }
    } catch {
      toast.error("识别失败")
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={loading} onClick={() => inputRef.current?.click()}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {loading ? "识别中..." : "OCR识别"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf"
        capture="environment"
        onChange={handleFile}
      />
    </>
  )
}
