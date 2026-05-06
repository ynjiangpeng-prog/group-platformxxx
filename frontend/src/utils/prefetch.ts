// 路由预加载工具
export function prefetchRoute(importFn: () => Promise<any>) {
  // 使用 requestIdleCallback 在浏览器空闲时预加载
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      importFn()
    }, { timeout: 2000 })
  } else {
    setTimeout(() => importFn(), 100)
  }
}

// 预加载关键路由
export function prefetchCriticalRoutes() {
  // 预加载常用页面
  const routes = [
    () => import("@/pages/autopilot/ExecutivePage"),
    () => import("@/pages/dashboard/ProjectBoard"),
    () => import("@/pages/project/ProjectCockpit"),
  ]
  
  routes.forEach((route, index) => {
    setTimeout(() => prefetchRoute(route), index * 1000)
  })
}
