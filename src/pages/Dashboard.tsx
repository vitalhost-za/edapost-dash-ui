import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Mail, TrendingUp, CheckCircle, AlertTriangle, XCircle, ListOrdered, ArrowUp, ArrowDown } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const lineData = Array.from({ length: 30 }, (_, i) => ({
  day: `${i + 1}`,
  sent: Math.floor(Math.random() * 3000 + 2500),
}));

const donutData = [
  { name: "Delivered", value: 8542, color: "hsl(142, 71%, 45%)" },
  { name: "Bounced", value: 234, color: "hsl(0, 72%, 51%)" },
  { name: "Deferred", value: 128, color: "hsl(25, 95%, 53%)" },
  { name: "Failed", value: 45, color: "hsl(0, 62%, 40%)" },
];

const metrics = [
  { title: "Emails Sent Today", value: "8,949", change: "+12.5%", changeType: "positive" as const, icon: Mail },
  { title: "Delivery Rate", value: "95.4%", change: "+0.8%", changeType: "positive" as const, icon: TrendingUp },
  { title: "Bounce Rate", value: "2.6%", change: "-0.3%", changeType: "negative" as const, icon: AlertTriangle },
  { title: "Complaint Rate", value: "0.02%", change: "-0.01%", changeType: "negative" as const, icon: XCircle },
  { title: "Queue Depth", value: "342", change: null, changeType: "neutral" as const, icon: ListOrdered },
];

const recentActivity = [
  { type: "sent" as const, email: "user@gmail.com", subject: "Welcome aboard!", time: "2 min ago" },
  { type: "bounced" as const, email: "bad@invalid.com", subject: "Newsletter #45", time: "5 min ago" },
  { type: "sent" as const, email: "client@company.co", subject: "Invoice #1234", time: "8 min ago" },
  { type: "complained" as const, email: "person@yahoo.com", subject: "Promo offer", time: "12 min ago" },
  { type: "sent" as const, email: "dev@startup.io", subject: "API key reset", time: "15 min ago" },
  { type: "sent" as const, email: "team@corp.com", subject: "Weekly digest", time: "20 min ago" },
  { type: "bounced" as const, email: "old@expired.net", subject: "Re-engagement", time: "25 min ago" },
  { type: "sent" as const, email: "admin@site.org", subject: "Security alert", time: "30 min ago" },
  { type: "sent" as const, email: "hello@brand.com", subject: "Order confirmation", time: "35 min ago" },
  { type: "sent" as const, email: "support@help.io", subject: "Ticket update", time: "40 min ago" },
];

export default function Dashboard() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {metrics.map((m) => (
            <div key={m.title} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">{m.title}</p>
                <div className="p-1.5 rounded-md bg-muted">
                  <m.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight mt-2">{m.value}</p>
              {m.change && (
                <div className={cn(
                  "flex items-center gap-1 mt-1 text-xs font-medium",
                  m.changeType === "positive" && m.title !== "Bounce Rate" && m.title !== "Complaint Rate" ? "text-success" : "",
                  m.changeType === "negative" && (m.title === "Bounce Rate" || m.title === "Complaint Rate") ? "text-success" : "",
                  m.changeType === "positive" && (m.title === "Bounce Rate" || m.title === "Complaint Rate") ? "text-destructive" : "",
                  m.changeType === "negative" && m.title !== "Bounce Rate" && m.title !== "Complaint Rate" ? "text-destructive" : "",
                )}>
                  {m.change.startsWith("+") ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {m.change}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Emails Sent — Last 30 Days</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 11, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "hsl(var(--foreground))",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Line type="monotone" dataKey="sent" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Delivery Breakdown</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={donutData} innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Custom inline legend */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
              {donutData.map((d) => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-xs text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{d.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity + Warmup */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Recent Activity</h3>
            <div className="space-y-1">
              {recentActivity.map((event, i) => (
                <div key={i} className="flex items-center gap-4 py-2 border-b border-border last:border-0">
                  <StatusBadge status={event.type} />
                  <span className="text-sm text-foreground min-w-0 truncate flex-shrink-0 w-40">{event.email}</span>
                  <span className="text-sm text-muted-foreground min-w-0 truncate flex-1">{event.subject}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{event.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">IP Warmup Progress</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Day 12 of 30</span>
                <span className="font-medium text-primary">40%</span>
              </div>
              <Progress value={40} className="h-2" />
              <div className="space-y-3 mt-2">
                {[
                  { label: "Daily Limit", value: "5,000" },
                  { label: "Sent Today", value: "3,847" },
                  { label: "Remaining", value: "1,153" },
                  { label: "IP Address", value: "198.51.100.42", mono: true },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className={cn("text-sm font-semibold", row.mono && "font-mono")}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
