import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminStats, useAdminTrends } from "@/hooks/use-admin";
import { Loader2, Users, CreditCard, FileText, Mail, Target, Home, Bot } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

function formatMonth(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function AdminDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: trends, isLoading: trendsLoading } = useAdminTrends(12);

  if (statsLoading || trendsLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const userTrends = (trends?.user_trends ?? []).map((t) => ({
    month: formatMonth(t.month),
    new_users: t.new_users,
  }));

  // Pivot activity trends: group by month, each metric becomes a column
  const activityByMonth = new Map<string, Record<string, number>>();
  for (const t of trends?.activity_trends ?? []) {
    const key = formatMonth(t.month);
    if (!activityByMonth.has(key)) activityByMonth.set(key, { month: key } as any);
    activityByMonth.get(key)![t.metric] = t.count;
  }
  const activityTrends = Array.from(activityByMonth.values());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Platform metrics overview</p>
        </div>
        <Link to="/admin/users">
          <Button variant="outline">Manage Users</Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.users.total_users ?? 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.users.admin_users ?? 0} admins</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subscribers</CardTitle>
            <CreditCard className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats?.users.starter_users ?? 0) + (stats?.users.pro_users ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.users.free_users ?? 0} free / {stats?.users.starter_users ?? 0} starter / {stats?.users.pro_users ?? 0} pro
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activity.total_transactions ?? 0}</div>
            <p className="text-xs text-muted-foreground">Total ingested</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reports</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activity.total_reports ?? 0}</div>
            <p className="text-xs text-muted-foreground">Total generated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
            <Mail className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activity.total_emails_sent ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Goals</CardTitle>
            <Target className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activity.total_goals ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Households</CardTitle>
            <Home className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activity.total_households ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Trend charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Signups</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={userTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="new_users" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={activityTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="transactions" fill="hsl(var(--primary))" name="Transactions" />
                <Bar dataKey="reports" fill="hsl(var(--chart-2))" name="Reports" />
                <Bar dataKey="emails" fill="hsl(var(--chart-3))" name="Emails" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* LLM Usage */}
      {(trends?.llm_stats ?? []).length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Bot className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">LLM Token Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 font-medium">Call Type</th>
                    <th className="pb-2 font-medium text-right">Calls</th>
                    <th className="pb-2 font-medium text-right">Total Tokens</th>
                    <th className="pb-2 font-medium text-right">Avg</th>
                    <th className="pb-2 font-medium text-right">Min</th>
                    <th className="pb-2 font-medium text-right">Max</th>
                    <th className="pb-2 font-medium text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(trends?.llm_stats ?? []).map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">{formatMonth(row.month)}</td>
                      <td className="py-2">{row.call_type}</td>
                      <td className="py-2 text-right">{row.call_count.toLocaleString()}</td>
                      <td className="py-2 text-right">{row.total_tokens.toLocaleString()}</td>
                      <td className="py-2 text-right">{row.avg_tokens.toLocaleString()}</td>
                      <td className="py-2 text-right">{row.min_tokens.toLocaleString()}</td>
                      <td className="py-2 text-right">{row.max_tokens.toLocaleString()}</td>
                      <td className="py-2 text-right">
                        {row.total_cost != null ? `$${row.total_cost.toFixed(4)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
