import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import {
  Send, CheckCircle, XCircle, Eye, MousePointerClick, Loader2, TrendingUp, TrendingDown,
} from "lucide-react";
import { format, subDays, subHours, startOfHour, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(142, 71%, 45%)",
  "hsl(0, 72%, 51%)",
  "hsl(38, 92%, 50%)",
  "hsl(262, 83%, 58%)",
  "hsl(200, 98%, 39%)",
];

export default function Analytics() {
  const [timeRange, setTimeRange] = useState("7d");

  const since = useMemo(() => {
    switch (timeRange) {
      case "24h": return subHours(new Date(), 24);
      case "7d": return subDays(new Date(), 7);
      case "30d": return subDays(new Date(), 30);
      case "90d": return subDays(new Date(), 90);
      default: return subDays(new Date(), 7);
    }
  }, [timeRange]);

  // Delivery stats over time
  const { data: deliveryStats, isLoading: statsLoading } = useQuery({
    queryKey: ["analytics-delivery-stats", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_stats")
        .select("hour, sent, delivered, bounced, deferred, failed, complaints")
        .gte("hour", since.toISOString())
        .order("hour", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Email logs for engagement & domain metrics
  const { data: logStats, isLoading: logsLoading } = useQuery({
    queryKey: ["analytics-log-stats", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("event_type, to_address, created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Sending domains health
  const { data: domains } = useQuery({
    queryKey: ["analytics-domains"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sending_domains")
        .select("domain, spf_status, dkim_status, dmarc_status, verified");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Bounce records for top bouncing domains
  const { data: bounceRecords } = useQuery({
    queryKey: ["analytics-bounces", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bounces")
        .select("email, bounce_type")
        .gte("created_at", since.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  // Computed data
  const totals = useMemo(() => {
    if (!deliveryStats?.length) return { sent: 0, delivered: 0, bounced: 0, failed: 0, complaints: 0 };
    return deliveryStats.reduce((acc, r) => ({
      sent: acc.sent + (r.sent || 0),
      delivered: acc.delivered + (r.delivered || 0),
      bounced: acc.bounced + (r.bounced || 0),
      failed: acc.failed + (r.failed || 0),
      complaints: acc.complaints + (r.complaints || 0),
    }), { sent: 0, delivered: 0, bounced: 0, failed: 0, complaints: 0 });
  }, [deliveryStats]);

  const deliveryRate = totals.sent > 0 ? ((totals.delivered / totals.sent) * 100).toFixed(1) : "0.0";
  const bounceRate = totals.sent > 0 ? ((totals.bounced / totals.sent) * 100).toFixed(1) : "0.0";

  // Engagement from logs
  const engagement = useMemo(() => {
    if (!logStats?.length) return { opened: 0, clicked: 0, complained: 0, unsubscribed: 0, totalSent: 0 };
    const opened = logStats.filter((l) => l.event_type === "opened").length;
    const clicked = logStats.filter((l) => l.event_type === "clicked").length;
    const complained = logStats.filter((l) => l.event_type === "complained").length;
    const unsubscribed = logStats.filter((l) => l.event_type === "unsubscribed").length;
    const totalSent = logStats.filter((l) => l.event_type === "sent" || l.event_type === "delivered").length;
    return { opened, clicked, complained, unsubscribed, totalSent };
  }, [logStats]);

  const openRate = engagement.totalSent > 0 ? ((engagement.opened / engagement.totalSent) * 100).toFixed(1) : "0.0";
  const clickRate = engagement.totalSent > 0 ? ((engagement.clicked / engagement.totalSent) * 100).toFixed(1) : "0.0";
  const unsubRate = engagement.totalSent > 0 ? ((engagement.unsubscribed / engagement.totalSent) * 100).toFixed(1) : "0.0";

  // Delivery trend chart data (aggregated by day or hour)
  const trendData = useMemo(() => {
    if (!deliveryStats?.length) return [];
    const useHourly = timeRange === "24h";
    const grouped: Record<string, { sent: number; delivered: number; bounced: number; failed: number }> = {};

    for (const row of deliveryStats) {
      const key = useHourly
        ? format(startOfHour(new Date(row.hour)), "HH:mm")
        : format(startOfDay(new Date(row.hour)), "MMM d");
      if (!grouped[key]) grouped[key] = { sent: 0, delivered: 0, bounced: 0, failed: 0 };
      grouped[key].sent += row.sent || 0;
      grouped[key].delivered += row.delivered || 0;
      grouped[key].bounced += row.bounced || 0;
      grouped[key].failed += row.failed || 0;
    }
    return Object.entries(grouped).map(([label, v]) => ({ label, ...v }));
  }, [deliveryStats, timeRange]);

  // Delivery rate over time
  const rateData = useMemo(() => {
    return trendData.map((d) => ({
      label: d.label,
      rate: d.sent > 0 ? +((d.delivered / d.sent) * 100).toFixed(1) : 100,
      bounceRate: d.sent > 0 ? +((d.bounced / d.sent) * 100).toFixed(1) : 0,
    }));
  }, [trendData]);

  // Domain distribution from logs
  const domainDistribution = useMemo(() => {
    if (!logStats?.length) return [];
    const counts: Record<string, number> = {};
    for (const log of logStats) {
      if (log.event_type === "sent" || log.event_type === "delivered") {
        const domain = log.to_address.split("@")[1]?.toLowerCase() || "unknown";
        counts[domain] = (counts[domain] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([domain, count]) => ({ domain, count }));
  }, [logStats]);

  // Top bouncing domains
  const topBouncingDomains = useMemo(() => {
    if (!bounceRecords?.length) return [];
    const counts: Record<string, { total: number; hard: number }> = {};
    for (const b of bounceRecords) {
      const domain = b.email.split("@")[1]?.toLowerCase() || "unknown";
      if (!counts[domain]) counts[domain] = { total: 0, hard: 0 };
      counts[domain].total++;
      if (b.bounce_type === "hard") counts[domain].hard++;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 5)
      .map(([domain, { total, hard }]) => ({ domain, total, hard, rate: ((hard / total) * 100).toFixed(1) }));
  }, [bounceRecords]);

  // Event type distribution for pie chart
  const eventDistribution = useMemo(() => {
    if (!logStats?.length) return [];
    const counts: Record<string, number> = {};
    for (const log of logStats) {
      counts[log.event_type] = (counts[log.event_type] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }));
  }, [logStats]);

  const isLoading = statsLoading || logsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics & Deliverability</h1>
            <p className="text-sm text-muted-foreground mt-1">Monitor delivery performance, engagement, and domain reputation.</p>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              {[
                { label: "Sent", value: totals.sent.toLocaleString(), icon: Send, color: "text-info" },
                { label: "Delivered", value: totals.delivered.toLocaleString(), icon: CheckCircle, color: "text-success" },
                { label: "Delivery Rate", value: `${deliveryRate}%`, icon: TrendingUp, color: "text-success" },
                { label: "Bounce Rate", value: `${bounceRate}%`, icon: TrendingDown, color: "text-destructive" },
                { label: "Open Rate", value: `${openRate}%`, icon: Eye, color: "text-primary" },
                { label: "Click Rate", value: `${clickRate}%`, icon: MousePointerClick, color: "text-primary" },
              ].map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <s.icon className={cn("h-4 w-4", s.color)} />
                  </div>
                  <p className="text-xl font-bold mt-1">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Delivery Volume */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="text-sm font-medium text-foreground mb-4">Delivery Volume</h3>
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="delivered" stackId="1" stroke="hsl(142, 71%, 45%)" fill="hsl(142, 71%, 45%)" fillOpacity={0.3} />
                      <Area type="monotone" dataKey="bounced" stackId="1" stroke="hsl(0, 72%, 51%)" fill="hsl(0, 72%, 51%)" fillOpacity={0.3} />
                      <Area type="monotone" dataKey="failed" stackId="1" stroke="hsl(38, 92%, 50%)" fill="hsl(38, 92%, 50%)" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">No delivery data for this period</div>
                )}
              </div>

              {/* Delivery & Bounce Rate */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="text-sm font-medium text-foreground mb-4">Delivery & Bounce Rate</h3>
                {rateData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={rateData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="rate" name="Delivery %" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="bounceRate" name="Bounce %" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">No rate data for this period</div>
                )}
              </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Recipient Domains */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="text-sm font-medium text-foreground mb-4">Top Recipient Domains</h3>
                {domainDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={domainDistribution} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="domain" type="category" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} width={90} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">No domain data</div>
                )}
              </div>

              {/* Event Type Distribution */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="text-sm font-medium text-foreground mb-4">Event Distribution</h3>
                {eventDistribution.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={eventDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {eventDistribution.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">No event data</div>
                )}
                {eventDistribution.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {eventDistribution.map((e, i) => (
                      <span key={e.name} className="text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        {e.name} ({e.value})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Domain Reputation & Top Bouncing */}
              <div className="bg-card border border-border rounded-lg p-5 space-y-5">
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">Domain Health</h3>
                  {domains && domains.length > 0 ? (
                    <div className="space-y-2">
                      {domains.map((d) => {
                        const checks = [d.spf_status, d.dkim_status, d.dmarc_status];
                        const passed = checks.filter((s) => s === "valid").length;
                        const score = Math.round((passed / 3) * 100);
                        return (
                          <div key={d.domain} className="bg-secondary rounded-md p-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{d.domain}</p>
                              <p className="text-xs text-muted-foreground">
                                SPF: {d.spf_status} · DKIM: {d.dkim_status} · DMARC: {d.dmarc_status}
                              </p>
                            </div>
                            <span className={cn(
                              "text-xs font-medium px-2 py-0.5 rounded",
                              score >= 80 ? "text-success bg-success/15" :
                              score >= 50 ? "text-warning bg-warning/15" :
                              "text-destructive bg-destructive/15"
                            )}>
                              {score}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No sending domains configured.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">Top Bouncing Domains</h3>
                  {topBouncingDomains.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Domain</th>
                          <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Count</th>
                          <th className="pb-2 text-left text-xs font-medium text-muted-foreground">Hard %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topBouncingDomains.map((d) => (
                          <tr key={d.domain} className="border-b border-border last:border-0">
                            <td className="py-2 text-sm">{d.domain}</td>
                            <td className="py-2 text-sm text-muted-foreground">{d.total}</td>
                            <td className="py-2 text-sm font-medium text-destructive">{d.rate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-xs text-muted-foreground">No bounces recorded.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
