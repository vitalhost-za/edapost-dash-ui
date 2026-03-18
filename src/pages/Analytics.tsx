import { DashboardLayout } from "@/components/DashboardLayout";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";

const deliveryData = Array.from({ length: 14 }, (_, i) => ({
  day: `Mar ${i + 1}`,
  rate: 94 + Math.random() * 4,
}));

const bounceData = Array.from({ length: 14 }, (_, i) => ({
  day: `Mar ${i + 1}`,
  rate: 0.5 + Math.random() * 3,
}));

const domainData = [
  { domain: "gmail.com", count: 4500 },
  { domain: "outlook.com", count: 2600 },
  { domain: "yahoo.com", count: 1400 },
  { domain: "hotmail.com", count: 900 },
  { domain: "icloud.com", count: 700 },
];

const topBouncing = [
  { domain: "invalid.net", count: 45, rate: "12.3%" },
  { domain: "expired.org", count: 28, rate: "8.7%" },
  { domain: "old-isp.com", count: 15, rate: "5.2%" },
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

export default function Analytics() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Analytics & Deliverability</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Delivery Rate */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Delivery Rate Over Time</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={deliveryData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} domain={[90, 100]} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
                <Line type="monotone" dataKey="rate" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bounce Rate */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Bounce Rate Over Time</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={bounceData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
                <Line type="monotone" dataKey="rate" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Emails by Domain */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Emails by Domain</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={domainData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="domain" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Provider Reputation + Top Bouncing */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Provider Reputation</h3>
            <div className="space-y-3">
              <div className="bg-secondary rounded-md p-4 flex items-center justify-between">
                <span className="text-sm">Gmail Postmaster Tools</span>
                <span className="text-xs font-medium text-success bg-success/15 px-2 py-0.5 rounded">Good</span>
              </div>
              <div className="bg-secondary rounded-md p-4 flex items-center justify-between">
                <span className="text-sm">Microsoft SNDS</span>
                <span className="text-xs font-medium text-success bg-success/15 px-2 py-0.5 rounded">Good</span>
              </div>
            </div>

            <h3 className="text-sm font-medium text-foreground mt-6 mb-3">Top Bouncing Domains</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Domain</th>
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Count</th>
                  <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Rate</th>
                </tr>
              </thead>
              <tbody>
                {topBouncing.map((d) => (
                  <tr key={d.domain} className="border-b border-border last:border-0">
                    <td className="py-2.5 text-sm">{d.domain}</td>
                    <td className="py-2.5 text-sm text-muted-foreground">{d.count}</td>
                    <td className="py-2.5 text-sm font-medium text-destructive">{d.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
