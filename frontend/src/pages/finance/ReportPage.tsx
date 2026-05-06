import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import * as api from "@/api/finance";

export default function ReportPage() {
  const [tab, setTab] = useState("trial");
  const [period, setPeriod] = useState("");
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});

  const trialQuery = useQuery<any>({ queryKey: ["trial-balance", queryParams.period], queryFn: () => api.getTrialBalance(queryParams), enabled: tab === "trial" && !!queryParams.period });
  const agingQuery = useQuery<any>({ queryKey: ["arap-aging", queryParams.period], queryFn: () => api.getArApAging(queryParams), enabled: tab === "aging" && !!queryParams.period });
  const plQuery = useQuery<any>({ queryKey: ["profit-loss", queryParams.period], queryFn: () => api.getProfitLoss(queryParams), enabled: tab === "pl" && !!queryParams.period });

  function query() {
    if (!period) { toast.error("请选择期间"); return; }
    setQueryParams({ period });
  }

  return (
    <Card>
      <CardHeader><CardTitle>财务报表</CardTitle></CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="trial">科目余额表</TabsTrigger>
            <TabsTrigger value="aging">账龄分析</TabsTrigger>
            <TabsTrigger value="pl">利润表</TabsTrigger>
          </TabsList>

          <TabsContent value="trial">
            <div className="flex items-end gap-3 mb-4">
              <div><Label>期间</Label><Input placeholder="如 2026-04" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
              <Button onClick={query}><Search className="h-4 w-4 mr-1" />查询</Button>
            </div>
            {trialQuery.isLoading ? <Skeleton className="h-64 w-full" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>科目编码</TableHead><TableHead>科目名称</TableHead><TableHead>期初借方</TableHead><TableHead>期初贷方</TableHead><TableHead>本期借方</TableHead><TableHead>本期贷方</TableHead><TableHead>期末借方</TableHead><TableHead>期末贷方</TableHead></TableRow></TableHeader>
                <TableBody>
                  {trialQuery.data?.items?.map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{r.account_code}</TableCell><TableCell>{r.account_name}</TableCell>
                      <TableCell>{r.opening_debit}</TableCell><TableCell>{r.opening_credit}</TableCell>
                      <TableCell>{r.current_debit}</TableCell><TableCell>{r.current_credit}</TableCell>
                      <TableCell>{r.closing_debit}</TableCell><TableCell>{r.closing_credit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="aging">
            <div className="flex items-end gap-3 mb-4">
              <div><Label>期间</Label><Input placeholder="如 2026-04" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
              <Button onClick={query}><Search className="h-4 w-4 mr-1" />查询</Button>
            </div>
            {agingQuery.isLoading ? <Skeleton className="h-64 w-full" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>交易方</TableHead><TableHead>未到期</TableHead><TableHead>1-30天</TableHead><TableHead>31-60天</TableHead><TableHead>61-90天</TableHead><TableHead>90天以上</TableHead><TableHead>合计</TableHead></TableRow></TableHeader>
                <TableBody>
                  {agingQuery.data?.items?.map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{r.counterparty}</TableCell><TableCell>{r.not_due}</TableCell>
                      <TableCell>{r.day_1_30}</TableCell><TableCell>{r.day_31_60}</TableCell>
                      <TableCell>{r.day_61_90}</TableCell><TableCell>{r.over_90}</TableCell>
                      <TableCell>{r.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="pl">
            <div className="flex items-end gap-3 mb-4">
              <div><Label>期间</Label><Input placeholder="如 2026-04" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
              <Button onClick={query}><Search className="h-4 w-4 mr-1" />查询</Button>
            </div>
            {plQuery.isLoading ? <Skeleton className="h-64 w-full" /> : (
              <>
                <div className="h-80 mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={plQuery.data?.chart_data ?? []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="revenue" name="收入" fill="#22c55e" />
                      <Bar dataKey="expense" name="支出" fill="#ef4444" />
                      <Bar dataKey="profit" name="利润" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Table>
                  <TableHeader><TableRow><TableHead>项目</TableHead><TableHead>本期金额</TableHead><TableHead>累计金额</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {plQuery.data?.items?.map((r: any, i: number) => (
                      <TableRow key={i}><TableCell>{r.item}</TableCell><TableCell>{r.current_amount}</TableCell><TableCell>{r.ytd_amount}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
