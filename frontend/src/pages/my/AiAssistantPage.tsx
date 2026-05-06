import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  Camera,
  Mic,
  Brain,
  Send,
  Loader2,
  Upload,
  History,
  Sparkles,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import OcrUploadButton from "@/components/ocr/OcrUploadButton"
import OcrFieldMapper from "@/components/ocr/OcrFieldMapper"
import { recognizeInvoice, recognizeReceipt, type InvoiceOcrResult, type ReceiptOcrResult } from "@/api/ocr"
import { createExpense } from "@/api/petty-cash"

interface AiHistoryEntry {
  id: string
  type: "ocr_invoice" | "ocr_receipt" | "command"
  input: string
  result: string
  created_at: Date
}

const invoiceFields = [
  { key: "invoice_type", label: "发票类型" },
  { key: "invoice_no", label: "发票号码" },
  { key: "amount", label: "金额" },
  { key: "tax_amount", label: "税额" },
  { key: "total_amount", label: "价税合计" },
  { key: "seller_name", label: "销售方" },
  { key: "buyer_name", label: "购买方" },
  { key: "invoice_date", label: "开票日期" },
]

export default function AiAssistantPage() {
  const [command, setCommand] = useState("")
  const [ocrData, setOcrData] = useState<Record<string, unknown> | null>(null)
  const [ocrType, setOcrType] = useState<"invoice" | "receipt">("invoice")
  const [showMapper, setShowMapper] = useState(false)
  const [history, setHistory] = useState<AiHistoryEntry[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCommand = () => {
    if (!command.trim()) return

    const entry: AiHistoryEntry = {
      id: Date.now().toString(),
      type: "command",
      input: command,
      result: `已处理指令: "${command}"`,
      created_at: new Date(),
    }
    setHistory((prev) => [entry, ...prev])
    toast.success("指令已处理")
    setCommand("")
  }

  const handleOcrRecognized = (data: Record<string, unknown>, type: "invoice" | "receipt") => {
    setOcrData(data)
    setOcrType(type)
    setShowMapper(true)

    const entry: AiHistoryEntry = {
      id: Date.now().toString(),
      type: type === "invoice" ? "ocr_invoice" : "ocr_receipt",
      input: "图片上传",
      result: `识别成功: ${data.invoice_no ?? data.type ?? "未知"}`,
      created_at: new Date(),
    }
    setHistory((prev) => [entry, ...prev])
  }

  const handleMapperConfirm = (mapped: Record<string, unknown>) => {
    const entry: AiHistoryEntry = {
      id: Date.now().toString(),
      type: ocrType === "invoice" ? "ocr_invoice" : "ocr_receipt",
      input: "OCR确认",
      result: `已确认: ${JSON.stringify(mapped).slice(0, 100)}`,
      created_at: new Date(),
    }
    setHistory((prev) => [entry, ...prev])
    toast.success("数据已确认保存")
    setShowMapper(false)
    setOcrData(null)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await recognizeInvoice(file)
      handleOcrRecognized(result as unknown as Record<string, unknown>, "invoice")
    } catch {
      toast.error("识别失败")
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">AI助手</h1>
        <p className="text-sm text-muted-foreground">智能识别、语音输入、快捷操作</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <button
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 hover:border-primary hover:bg-primary/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="size-10 text-primary" />
                  <span className="font-medium">拍照识别</span>
                  <span className="text-xs text-muted-foreground">发票/收据/合同</span>
                </button>
                <button
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 hover:border-primary hover:bg-primary/5 transition-colors"
                  onClick={() => toast.info("语音输入开发中")}
                >
                  <Mic className="size-10 text-primary" />
                  <span className="font-medium">语音输入</span>
                  <span className="text-xs text-muted-foreground">说一句话即可记录</span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                capture="environment"
                onChange={handleFileChange}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex gap-2">
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="输入快捷指令，如：报销差旅500元"
                  onKeyDown={(e) => e.key === "Enter" && handleCommand()}
                  className="flex-1"
                />
                <Button onClick={handleCommand} disabled={!command.trim()}>
                  <Send className="size-4" />
                </Button>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                {["报销差旅500元", "记工时8小时", "申请备用金3000元"].map((cmd) => (
                  <Button
                    key={cmd}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => { setCommand(cmd); handleCommand() }}
                  >
                    <Sparkles className="size-3" />
                    {cmd}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {showMapper && ocrData && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">
                    <Brain className="inline size-4 mr-1" />
                    AI识别结果
                  </h3>
                  <Badge variant="outline">
                    {ocrType === "invoice" ? "发票" : "收据"}
                  </Badge>
                </div>
                <OcrFieldMapper
                  ocrData={ocrData}
                  fields={invoiceFields}
                  onConfirm={handleMapperConfirm}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-5" />
              AI提交历史
            </CardTitle>
            <CardDescription>{history.length} 条记录</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Brain className="mx-auto size-12 mb-3 opacity-30" />
                <p>暂无AI提交记录</p>
                <p className="text-xs mt-1">上传图片或输入指令开始使用</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {entry.type === "ocr_invoice" ? "发票OCR" :
                       entry.type === "ocr_receipt" ? "收据OCR" : "指令"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.input}</p>
                      <p className="text-xs text-muted-foreground truncate">{entry.result}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(entry.created_at, "HH:mm:ss")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
