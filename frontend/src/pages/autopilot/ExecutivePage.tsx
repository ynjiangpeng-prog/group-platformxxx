import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle, TrendingUp, Zap,
  Bell, BarChart3, PieChart, Activity,
  AlertOctagon, ChevronRight
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const API_BASE = "/api/v1";

async function getAlerts() {
  const res = await fetch(`${API_BASE}/alerts/active`, {
    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
  });
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
}

async function getProjectDashboard() {
  const res = await fetch(`${API_BASE}/project/dashboard/company/summary`, {
    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
  });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

async function getChargingROI() {
  const res = await fetch(`${API_BASE}/charging/roi/summary`, {
    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
  });
  if (!res.ok) throw new Error("Failed to fetch ROI");
  return res.json();
}

export default function ExecutivePage() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ["executive-alerts"],
    queryFn: getAlerts,
    refetchInterval: 30000,
  });

  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ["executive-projects"],
    queryFn: getProjectDashboard,
  });

  const { data: roiData, isLoading: roiLoading } = useQuery({
    queryKey: ["executive-roi"],
    queryFn: getChargingROI,
  });

  const alerts = alertsData?.alerts || [];
  const criticalAlerts = alerts.filter((a: any) => a.severity === "critical");
  const highAlerts = alerts.filter((a: any) => a.severity === "high");

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-500 text-white";
      case "high": return "bg-orange-500 text-white";
      case "medium": return "bg-yellow-500 text-black";
      default: return "bg-blue-500 text-white";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="w-8 h-8 text-purple-500" />
            经营驾驶舱
          </h1>
          <p className="text-muted-foreground mt-1">
            实时监控核心业务指标和告警
          </p>
        </div>
        <div className="flex items-center gap-2">
          {criticalAlerts.length > 0 && (
            <Badge variant="destructive" className="text-lg px-3 py-1">
              <AlertOctagon className="w-4 h-4 mr-1" />
              {criticalAlerts.length} 紧急
            </Badge>
          )}
          {highAlerts.length > 0 && (
            <Badge className="bg-orange-500 text-white text-lg px-3 py-1">
              <AlertTriangle className="w-4 h-4 mr-1" />
              {highAlerts.length} 重要
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">活跃告警</p>
                <p className="text-3xl font-bold">
                  {alertsLoading ? <Skeleton className="w-12 h-8" /> : alerts.length}
                </p>
              </div>
              <Bell className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">项目总数</p>
                <p className="text-3xl font-bold">
                  {projectLoading ? <Skeleton className="w-12 h-8" /> : projectData?.total_projects || 0}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">预算执行率</p>
                <p className="text-3xl font-bold">
                  {projectLoading ? <Skeleton className="w-12 h-8" /> : `${projectData?.overall_usage_pct || 0}%`}
                </p>
              </div>
              <PieChart className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">充电站数</p>
                <p className="text-3xl font-bold">
                  {roiLoading ? <Skeleton className="w-12 h-8" /> : roiData?.total_stations || 0}
                </p>
              </div>
              <Zap className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">总览</TabsTrigger>
          <TabsTrigger value="alerts">
            业务告警
            {alerts.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">{alerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="projects">项目看板</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  项目概况
                </CardTitle>
              </CardHeader>
              <CardContent>
                {projectLoading ? (
                  <Skeleton className="w-full h-32" />
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>总预算</span>
                      <span className="font-bold">¥{(projectData?.total_budget || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>实际成本</span>
                      <span className="font-bold">¥{(projectData?.total_actual_cost || 0).toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full" 
                        style={{ width: `${Math.min(projectData?.overall_usage_pct || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  充电站收益
                </CardTitle>
              </CardHeader>
              <CardContent>
                {roiLoading ? (
                  <Skeleton className="w-full h-32" />
                ) : roiData?.total_stations > 0 ? (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>总投资</span>
                      <span className="font-bold">¥{(roiData?.total_investment || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>月度营收</span>
                      <span className="font-bold text-green-600">¥{(roiData?.total_monthly_revenue || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>月度利润</span>
                      <span className={`font-bold ${(roiData?.total_monthly_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ¥{(roiData?.total_monthly_profit || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无充电站数据</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {alerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  最新告警
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {alerts.slice(0, 5).map((alert: any) => (
                    <div key={alert.id} className={`p-3 rounded-lg border ${getSeverityColor(alert.severity)} bg-opacity-10`}>
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-sm opacity-80">{alert.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {alertsLoading ? (
            <Skeleton className="w-full h-64" />
          ) : alerts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                <h3 className="text-xl font-semibold">所有指标正常</h3>
                <p className="text-muted-foreground mt-2">当前没有需要关注的告警</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert: any) => (
                <Card key={alert.id} className={`border-l-4 ${
                  alert.severity === 'critical' ? 'border-l-red-500' :
                  alert.severity === 'high' ? 'border-l-orange-500' :
                  alert.severity === 'medium' ? 'border-l-yellow-500' :
                  'border-l-blue-500'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{alert.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                        <Badge className={getSeverityColor(alert.severity)}>
                          {alert.severity === 'critical' ? '紧急' : 
                           alert.severity === 'high' ? '重要' : 
                           alert.severity === 'medium' ? '一般' : '提示'}
                        </Badge>
                        <p className="text-sm mt-2 text-blue-600">💡 {alert.suggestion}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          {projectLoading ? (
            <Skeleton className="w-full h-64" />
          ) : (
            <div className="space-y-4">
              {projectData?.high_risk_projects?.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-600 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      高风险项目
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {projectData.high_risk_projects.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                          <div>
                            <p className="font-medium">{p.name}</p>
                            <p className="text-sm text-muted-foreground">{p.code}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-red-600">{p.usage_pct}%</p>
                            <p className="text-xs text-muted-foreground">预算使用率</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>所有项目</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {projectData?.projects?.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{p.name}</p>
                            {p.is_delayed && (
                              <Badge variant="destructive" className="text-xs">延期</Badge>
                            )}
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                            <div 
                              className={`h-2 rounded-full ${
                                p.usage_pct > 90 ? 'bg-red-500' :
                                p.usage_pct > 70 ? 'bg-orange-500' :
                                'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(p.usage_pct, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="font-bold">{p.usage_pct}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
