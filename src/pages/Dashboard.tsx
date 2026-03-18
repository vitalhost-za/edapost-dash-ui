import { DashboardLayout } from "@/components/DashboardLayout";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Mail, CheckCircle, AlertTriangle, XCircle, ListOrdered, TrendingUp } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Progress } from "@/components/ui/progress";

const sparkline = [12, 19, 14, 25, 22, 30, 28, 35, 40, 38, 42, 45];

const lineData = Array.from({ length: 30 }, (_, i) => ({
  day: `${i + 1}`,
  sent: Math.floor(Math.random() * 3000 + 2000),
}));

const donutData = [
  { name: "Delivered", value: 8420, color: "hsl(142, 71%, 45%)" },
  { name: "Bounced", value: 320, color: "hsl(0, 72%, 51%)" },
  { name: "Deferred", value: 180, color: "hsl(25, 95%, 53%)" },
  { name: "Failed", value: 80, color: "hsl(0, 62%, 30%)" },
];

const recentActivity = [
  { type: "sent" as const, email: "user@company.com", subject: "Welcome Email", time: "2 min ago" },
  { type: "delivered" as const, email: "john@example.com", subject: "Invoice #1234", time: "5 min ago" },
  { type: "bounced" as const, email: "invalid@test.com", subject: "Newsletter March", time: "8 min ago" },
  { type: "sent" as const, email: "alice@startup.io", subject: "Password Reset", time: "12 min ago" },
  { type: "delivered" as const, email: "bob@corp.com", subject: "Order Confirmation", time: "15 min ago" },
  { type: "complained" as const, email: "mark@mail.com", subject: "Promo Blast", time: "20 min ago" },
  { type: "sent" as const, email: "sara@dev.co", subject: "Verification Code", time: "25 min ago" },
  { type: "delivered" as const, email: "team@acme.io", subject: "Weekly Digest", time: "30 min ago" },
  { type: "bounced" as const, email: "no-reply@old.com", subject: "Alert Notification", time: "35 min ago" },
  { type: "sent" as const, email: "kate@design.co", subject: "Onboarding Guide", time: "40 min ago" },
];

export default function Dashboard() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor your email infrastructure at a glance.</p>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard title="Emails Sent Today" value="4,281" change="+12% from yesterday" changeType="positive" icon={Mail} sparkline={sparkline} />
          <MetricCard title="Delivery Rate" value="98.2%" change="+0.3%" changeType="positive" icon={CheckCircle} />
          <MetricCard title="Bounce Rate" value="1.2%" change="-0.1%" changeType="positive" icon={AlertTriangle} />
          <MetricCard title="Complaint Rate" value="0.02%" change="No change" changeType="neutral" icon={XCircle} />
          <MetricCard title="Queue Depth" value="142" change="Processing" changeType="neutral" icon={ListOrdered} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Emails Sent — Last 30 Days</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224, 14%, 16%)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(224, 18%, 10%)", border: "1px solid hsl(224, 14%, 16%)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(210, 20%, 92%)" }}
                />
                <Line type="monotone" dataKey="sent" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Delivery Breakdown</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donutData} innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value) => <span style={{ color: "hsl(210, 20%, 92%)", fontSize: 12 }}>{value}</span>}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity + Warmup */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {recentActivity.map((event, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusBadge status={event.type} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{event.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">{event.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">{event.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">IP Warmup Progress</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Day 14 of 30</span>
                <span className="text-sm font-medium text-primary">47%</span>
              </div>
              <Progress value={47} className="h-2" />
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-secondary rounded-md p-3">
                  <p className="text-xs text-muted-foreground">Daily Limit</p>
                  <p className="text-lg font-semibold">5,000</p>
                </div>
                <div className="bg-secondary rounded-md p-3">
                  <p className="text-xs text-muted-foreground">Sent Today</p>
                  <p className="text-lg font-semibold">4,281</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-xs text-muted-foreground">On track — limit increases tomorrow to 6,000</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
