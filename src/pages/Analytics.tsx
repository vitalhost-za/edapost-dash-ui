import { DashboardLayout } from "@/components/DashboardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";

const deliveryData = Array.from({ length: 30 }, (_, i) => ({
  day: `${i + 1}`,
  delivery: 96 + Math.random() * 3,
  bounce: 0.5 + Math.random() * 1.5,
  complaint: Math.random() * 0.1,
}));

const domainData = [
  { domain: "gmail.com", count: 4200 },
  { domain: "outlook.com", count: 2800 },
  { domain: "yahoo.com", count: 1500 },
  { domain: "proton.me", count: 800 },
  { domain: "icloud.com", count: 600 },
  { domain: "other", count: 1100 },
];

const topBouncing = [
  { domain: "old-isp.net", count: 45, rate: "8.2%" },
  { domain: "defunct-mail.com", count: 32, rate: "12.5%" },
  { domain: "legacy-corp.io", count: 21, rate: "5.1%" },
  { domain: "temp-mail.xyz", count: 18, rate: "22.3%" },
  { domain: "expired-host.org", count: 12, rate: "9.8%" },
];

const tooltipStyle = {
  backgroundColor: "hsl(224, 18%, 10%)",
  border: "1px solid hsl(224, 14%, 16%)",
  borderRadius: 8,
  fontSize: 12,
};

export default function Analytics() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">Deliverability metrics and domain insights.</p>
          </div>
          <Select defaultValue="30d">
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Rate charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            { title: "Delivery Rate %", key: "delivery" as const, color: "hsl(142, 71%, 45%)" },
            { title: "Bounce Rate %", key: "bounce" as const, color: "hsl(0, 72%, 51%)" },
            { title: "Complaint Rate %", key: "complaint" as const, color: "hsl(25, 95%, 53%)" },
          ].map((chart) => (
            <div key={chart.key} className="bg-card border border-border rounded-lg p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">{chart.title}</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={deliveryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224, 14%, 16%)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(220, 10%, 55%)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(220, 10%, 55%)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "hsl(210, 20%, 92%)" }} />
                  <Line type="monotone" dataKey={chart.key} stroke={chart.color} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>

        {/* Domain breakdown + Reputation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Emails by Domain</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={domainData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224, 14%, 16%)" />
                <XAxis dataKey="domain" tick={{ fontSize: 10, fill: "hsl(220, 10%, 55%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(220, 10%, 55%)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "hsl(210, 20%, 92%)" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {domainData.map((_, i) => (
                    <Cell key={i} fill={`hsl(217, 91%, ${50 + i * 5}%)`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Provider Reputation</h3>
            <div className="space-y-4">
              <div className="bg-secondary rounded-md p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Gmail Postmaster Tools</p>
                  <p className="text-xs text-muted-foreground">Domain reputation</p>
                </div>
                <span className="text-sm font-medium text-success">High</span>
              </div>
              <div className="bg-secondary rounded-md p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Microsoft SNDS</p>
                  <p className="text-xs text-muted-foreground">IP reputation status</p>
                </div>
                <span className="text-sm font-medium text-success">Normal</span>
              </div>
            </div>

            <h3 className="text-sm font-medium text-muted-foreground mt-6 mb-3">Top Bouncing Domains</h3>
            <div className="space-y-2">
              {topBouncing.map((d) => (
                <div key={d.domain} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm font-mono">{d.domain}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">{d.count} bounces</span>
                    <span className="text-xs font-medium text-destructive">{d.rate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
