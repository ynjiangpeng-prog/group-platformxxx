import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface OcrFieldMapperProps {
  ocrData: Record<string, unknown>
  fields: { key: string; label: string }[]
  onConfirm: (mapped: Record<string, unknown>) => void
}

function autoMap(ocrData: Record<string, unknown>, fields: { key: string; label: string }[]): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const field of fields) {
    for (const [ocrKey, ocrVal] of Object.entries(ocrData)) {
      const keyMatch = ocrKey.toLowerCase().replace(/[_-]/g, "") === field.key.toLowerCase().replace(/[_-]/g, "")
      const labelMatch = ocrKey.toLowerCase().includes(field.label.toLowerCase()) || field.label.toLowerCase().includes(ocrKey.toLowerCase())
      if ((keyMatch || labelMatch) && ocrVal != null && ocrVal !== "") {
        mapped[field.key] = ocrVal
        break
      }
    }
  }
  return mapped
}

export default function OcrFieldMapper({ ocrData, fields, onConfirm }: OcrFieldMapperProps) {
  const initial = useMemo(() => autoMap(ocrData, fields), [ocrData, fields])
  const [mapped, setMapped] = useState<Record<string, unknown>>(initial)

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setMapped((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>OCR识别值</TableHead>
            <TableHead>表单字段</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => (
            <TableRow key={field.key}>
              <TableCell className="font-mono text-sm">
                {ocrData[field.key] != null ? String(ocrData[field.key]) : "-"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">{field.label}</span>
                  <Input
                    value={mapped[field.key] != null ? String(mapped[field.key]) : ""}
                    onChange={set(field.key)}
                    className="h-8"
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex justify-end">
        <Button onClick={() => onConfirm(mapped)}>确认填入</Button>
      </div>
    </div>
  )
}
