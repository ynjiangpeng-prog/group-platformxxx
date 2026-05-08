import { useState, useRef, useEffect, useCallback } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Brain, Camera, Mic, MicOff, Upload, Loader2, Sparkles, X,
  Check, ChevronDown, FileText, Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  quickEntryAnalyze, quickEntryAnalyzeText, quickEntrySubmit,
  type QuickEntryResult,
} from "@/api/ai"
import { listProjects } from "@/api/project"
import { useQuery } from "@tanstack/react-query"

const FORM_TYPES = [
  { value: "petty_cash_expense", label: "备用金核销" },
  { value: "invoice", label: "发票录入" },
  { value: "payment_doc", label: "付款依据存档" },
  { value: "construction_log", label: "施工日志" },
  { value: "construction_cost_record", label: "施工费用记录" },
  { value: "work_hours_record", label: "工时记录" },
  { value: "delivery_note", label: "送货单" },
  { value: "material_list", label: "材料清单" },
]

type Step = "input" | "result" | "done"

export default function AiQuickEntry() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("input")
  const [text, setText] = useState("")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [result, setResult] = useState<QuickEntryResult | null>(null)
  const [formType, setFormType] = useState("petty_cash_expense")
  const [fields, setFields] = useState<Record<string, unknown>>({})
  const [selectedProject, setSelectedProject] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  const { data: projectsData } = useQuery({
    queryKey: ["quick-entry-projects"],
    queryFn: () => listProjects({ page: 1, page_size: 200 }),
    enabled: open,
  })
  const projects = projectsData?.items ?? []

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setVoiceSupported(!!SR)
  }, [])

  const reset = useCallback(() => {
    setText("")
    setImagePreview(null)
    setImageFile(null)
    setResult(null)
    setFormType("petty_cash_expense")
    setFields({})
    setSelectedProject("")
    setStep("input")
  }, [])

  const handleOpen = (v: boolean) => {
    setOpen(v)
    if (!v) reset()
  }

  const startVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const recognition = new SR()
    recognition.lang = "zh-CN"
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join("")
      setText(t)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(f)
  }

  const analyzeMut = useMutation({
    mutationFn: async () => {
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        if (text) fd.append("text", text)
        return quickEntryAnalyze(fd) as unknown as QuickEntryResult
      }
      return quickEntryAnalyzeText(text) as unknown as QuickEntryResult
    },
    onSuccess: (data) => {
      setResult(data)
      // Use the recommended form type from AI, or fallback
      const recommended = data.possible_form_types?.find((t) => t.recommended)
      setFormType(recommended?.value || data.form_type || "petty_cash_expense")
      setFields(data.extracted_fields || {})
      if (data.suggested_project_id) setSelectedProject(data.suggested_project_id)
      setStep("result")
      toast.success(`识别为${data.form_type_label || data.form_type}，置信度${Math.round((data.confidence || 0) * 100)}%`)
    },
    onError: () => toast.error("AI识别失败，请重试"),
  })

  const submitMut = useMutation({
    mutationFn: () =>
      quickEntrySubmit({
        form_type: formType,
        form_data: { ...fields, project_id: selectedProject || undefined },
        project_id: selectedProject || undefined,
      }),
    onSuccess: () => {
      toast.success("提交成功")
      setStep("done")
    },
    onError: () => toast.error("提交失败"),
  })

  const updateField = (key: string, value: unknown) => {
    setFields((f) => ({ ...f, [key]: value }))
  }

  const canAnalyze = imageFile || text.trim().length > 0

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => handleOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
        title="AI快速录入"
      >
        <Sparkles className="size-6" />
      </button>

      {/* Sheet */}
      <Sheet open={open} onOpenChange={handleOpen}>
        <SheetContent side="bottom" className="h-[85vh] max-w-2xl mx-auto rounded-t-2xl p-0">
          <SheetHeader className="px-6 pt-5 pb-3 border-b">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Brain className="size-5 text-primary" />
              AI 快速录入
            </SheetTitle>
          </SheetHeader>

          <div className="px-6 py-4 overflow-y-auto h-[calc(85vh-64px)]">
            {step === "input" && (
              <div className="space-y-5">
                {/* Input modes */}
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <Camera className="size-8 text-primary" />
                    <span className="text-sm font-medium">拍照/上传</span>
                  </button>
                  {voiceSupported ? (
                    <button
                      onClick={startVoice}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 transition-colors ${
                        isListening ? "border-red-400 bg-red-50" : "hover:border-primary hover:bg-primary/5"
                      }`}
                    >
                      {isListening ? <MicOff className="size-8 text-red-500" /> : <Mic className="size-8 text-primary" />}
                      <span className="text-sm font-medium">{isListening ? "录音中..." : "语音输入"}</span>
                    </button>
                  ) : (
                    <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 opacity-40">
                      <Mic className="size-8" />
                      <span className="text-sm font-medium">语音(不支持)</span>
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5">
                    <FileText className="size-8 text-primary" />
                    <span className="text-sm font-medium">文字描述</span>
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={handleFileChange} />

                {/* Image preview */}
                {imagePreview && (
                  <div className="relative">
                    <img src={imagePreview} alt="preview" className="w-full max-h-48 object-contain rounded-lg border" />
                    <button onClick={() => { setImagePreview(null); setImageFile(null) }} className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1">
                      <X className="size-4" />
                    </button>
                  </div>
                )}

                {/* Text input */}
                <div className="space-y-1.5">
                  <Label>描述内容</Label>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="描述你要录入的内容，如：报销差旅费500元、材料采购发票..."
                    rows={3}
                  />
                </div>

                {/* Quick suggestions */}
                <div className="flex gap-2 flex-wrap">
                  {["报销材料费500元", "差旅报销1200元", "上传发票"].map((s) => (
                    <Button key={s} variant="outline" size="sm" className="text-xs" onClick={() => setText(s)}>
                      <Sparkles className="size-3 mr-1" />{s}
                    </Button>
                  ))}
                </div>

                <Button className="w-full" size="lg" disabled={!canAnalyze || analyzeMut.isPending} onClick={() => analyzeMut.mutate()}>
                  {analyzeMut.isPending ? <Loader2 className="size-5 animate-spin mr-2" /> : <Brain className="size-5 mr-2" />}
                  AI 识别
                </Button>
              </div>
            )}

            {step === "result" && result && (
              <div className="space-y-5">
                {/* Detection result */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge>{result.form_type_label}</Badge>
                    <span className="text-xs text-muted-foreground">置信度 {Math.round((result.confidence || 0) * 100)}%</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setStep("input")}>
                    重新识别
                  </Button>
                </div>

                {/* Form type selector — show quick picks if multiple options */}
                <div className="space-y-1.5">
                  <Label>表单类型</Label>
                  {result.possible_form_types && result.possible_form_types.length > 1 ? (
                    <div className="flex gap-2">
                      {result.possible_form_types.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setFormType(t.value)}
                          className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${
                            formType === t.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-muted hover:border-muted-foreground/30"
                          }`}
                        >
                          {t.label}
                          {t.recommended && (
                            <Badge variant="outline" className="ml-1 text-[10px] border-primary text-primary">推荐</Badge>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Select value={formType} onValueChange={(v) => { if (v) setFormType(v) }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FORM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Extracted fields */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">识别结果（可编辑）</Label>
                  {Object.entries(fields).map(([key, val]) => (
                    <div key={key} className="flex gap-3 items-center">
                      <Label className="w-20 shrink-0 text-xs text-muted-foreground">{key}</Label>
                      {key === "amount" ? (
                        <Input type="number" value={String(val ?? "")} onChange={(e) => updateField(key, e.target.value)} className="flex-1" />
                      ) : key === "category" ? (
                        <Select value={String(val ?? "")} onValueChange={(v) => updateField(key, v)}>
                          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["material", "labor", "transport", "meal", "travel", "office", "other"].map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={String(val ?? "")} onChange={(e) => updateField(key, e.target.value)} className="flex-1" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Project selector */}
                <div className="space-y-1.5">
                  <Label>关联项目（可选）</Label>
                  <Select value={selectedProject} onValueChange={(v) => setSelectedProject(v ?? "")}>                    <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {result.suggested_project_name && (
                    <p className="text-xs text-muted-foreground">AI建议: {result.suggested_project_name}</p>
                  )}
                </div>

                <Button className="w-full" size="lg" disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>
                  {submitMut.isPending ? <Loader2 className="size-5 animate-spin mr-2" /> : <Check className="size-5 mr-2" />}
                  确认提交
                </Button>
              </div>
            )}

            {step === "done" && (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="size-16 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="size-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold">提交成功</h3>
                <p className="text-sm text-muted-foreground">记录已保存，等待审批</p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={reset}>继续录入</Button>
                  <Button onClick={() => handleOpen(false)}>关闭</Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
