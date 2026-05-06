import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <h1 className="text-7xl font-bold text-muted-foreground/30">404</h1>
      <p className="text-lg text-muted-foreground">页面不存在</p>
      <Button render={<Link to="/" />}>返回首页</Button>
    </div>
  )
}
