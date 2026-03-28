import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Send, CheckCircle, XCircle, Eye, MousePointerClick, Loader2,
  TrendingUp, TrendingDown, UserX, ArrowUpRight, ArrowDownRight, Minus,
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

function getPeriodRange(timeRange: string) {
  const now = new Date();
  switch (timeRange) {
    case "24h": return { current: subHours(now, 24), previous: subHours(now, 48), label: "vs prev 24h" };
    case "7d": return { current: subDays(now, 7), previous: subDays(now, 14), label: "vs prev week" };
    case "30d": return { current: subDays(now, 30), previous: subDays(now, 60), label: "vs prev 30d" };
    case "90d": return { current: subDays(now, 90), previous: subDays(now, 180), label: "vs prev 90d" };
    default: return { current: subDays(now, 7), previous: subDays(now, 14), label: "vs prev week" };
  }
}

function calcChange(current: number, previous: number): { value: string; type: "positive" | "negative" | "neutral" } {
  if (previous === 0 && current === 0) return { value: "—", type: "neutral" };
  if (previous === 0) return { value: "+∞", type: "positive" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.1) return { value: "0%", type: "neutral" };
  return {
    value: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`,
    type: pct > 0 ? "positive" : "negative",
  };
}

function ChangeIndicator({ value, type, invertColor }: { value: string; type: "positive" | "negative" | "neutral"; invertColor?: boolean }) {
  const colorType = invertColor ? (type === "positive" ? "negative" : type === "negative" ? "positive" : "neutral") : type;
  const Icon = type === "positive" ? ArrowUpRight : type === "negative" ? ArrowDownRight : Minus;
  return (
    <span className={cn(
      "text-xs font-medium flex items-center gap-0.5",
      colorType === "positive" && "text-success",
      colorType === "negative" && "text-destructive",
      colorType === "neutral" && "text-muted-foreground",
    )}>
      <Icon className="h-3 w-3" />
      {value}
    </span>
  );
}

export default function Analytics() {
  const [timeRange, setTimeRange] = useState("7d");

  const periods = useMemo(() => getPeriodRange(timeRange), [timeRange]);

  // Current period delivery stats
  const { data: deliveryStats, isLoading: statsLoading } = useQuery({
    queryKey: ["analytics-delivery-stats", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_stats")
        .select("hour, sent, delivered, bounced, deferred, failed, complaints")
        .gte("hour", periods.current.toISOString())
        .order("hour", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Previous period delivery stats
  const { data: prevDeliveryStats } = useQuery({
    queryKey: ["analytics-prev-delivery-stats", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_stats")
        .select("hour, sent, delivered, bounced, deferred, failed, complaints")
        .gte("hour", periods.previous.toISOString())
        .lt("hour", periods.current.toISOString())
        .order("hour", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Current period email logs
  const { data: logStats, isLoading: logsLoading } = useQuery({
    queryKey: ["analytics-log-stats", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("event_type, to_address, created_at")
        .gte("created_at", periods.current.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Previous period email logs
  const { data: prevLogStats } = useQuery({
    queryKey: ["analytics-prev-log-stats", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("event_type, to_address, created_at")
        .gte("created_at", periods.previous.toISOString())
        .lt("created_at", periods.current.toISOString())
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

  // Bounce records
  const { data: bounceRecords } = useQuery({
    queryKey: ["analytics-bounces", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bounces")
        .select("email, bounce_type")
        .gte("created_at", periods.current.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---- Computed: current period totals ----
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

  // ---- Computed: previous period totals ----
  const prevTotals = useMemo(() => {
    if (!prevDeliveryStats?.length) return { sent: 0, delivered: 0, bounced: 0, failed: 0, complaints: 0 };
    return prevDeliveryStats.reduce((acc, r) => ({
      sent: acc.sent + (r.sent || 0),
      delivered: acc.delivered + (r.delivered || 0),
      bounced: acc.bounced + (r.bounced || 0),
      failed: acc.failed + (r.failed || 0),
      complaints: acc.complaints + (r.complaints || 0),
    }), { sent: 0, delivered: 0, bounced: 0, failed: 0, complaints: 0 });
  }, [prevDeliveryStats]);

  const pct = (n: number, d: number) => d > 0 ? +((n / d) * 100).toFixed(1) : 0;
  const deliveryRate = pct(totals.delivered, totals.sent);
  const bounceRate = pct(totals.bounced, totals.sent);
  const prevDeliveryRate = pct(prevTotals.delivered, prevTotals.sent);
  const prevBounceRate = pct(prevTotals.bounced, prevTotals.sent);

  // Engagement from logs
  const computeEngagement = (logs: typeof logStats) => {
    if (!logs?.length) return { opened: 0, clicked: 0, complained: 0, unsubscribed: 0, totalSent: 0 };
    const opened = logs.filter((l) => l.event_type === "opened").length;
    const clicked = logs.filter((l) => l.event_type === "clicked").length;
    const complained = logs.filter((l) => l.event_type === "complained").length;
    const unsubscribed = logs.filter((l) => l.event_type === "unsubscribed").length;
    const totalSent = logs.filter((l) => l.event_type === "sent" || l.event_type === "delivered").length;
    return { opened, clicked, complained, unsubscribed, totalSent };
  };

  const engagement = useMemo(() => computeEngagement(logStats), [logStats]);
  const prevEngagement = useMemo(() => computeEngagement(prevLogStats), [prevLogStats]);

  const openRate = pct(engagement.opened, engagement.totalSent);
  const clickRate = pct(engagement.clicked, engagement.totalSent);
  const unsubRate = pct(engagement.unsubscribed, engagement.totalSent);
  const prevOpenRate = pct(prevEngagement.opened, prevEngagement.totalSent);
  const prevClickRate = pct(prevEngagement.clicked, prevEngagement.totalSent);
  const prevUnsubRate = pct(prevEngagement.unsubscribed, prevEngagement.totalSent);

  // KPI cards with changes
  const kpiCards = useMemo(() => [
    { label: "Sent", value: totals.sent.toLocaleString(), icon: Send, color: "text-info", change: calcChange(totals.sent, prevTotals.sent) },
    { label: "Delivered", value: totals.delivered.toLocaleString(), icon: CheckCircle, color: "text-success", change: calcChange(totals.delivered, prevTotals.delivered) },
    { label: "Delivery Rate", value: `${deliveryRate}%`, icon: TrendingUp, color: "text-success", change: calcChange(deliveryRate, prevDeliveryRate) },
    { label: "Bounce Rate", value: `${bounceRate}%`, icon: TrendingDown, color: "text-destructive", change: calcChange(bounceRate, prevBounceRate), invertColor: true },
    { label: "Open Rate", value: `${openRate}%`, icon: Eye, color: "text-primary", change: calcChange(openRate, prevOpenRate) },
    { label: "Click Rate", value: `${clickRate}%`, icon: MousePointerClick, color: "text-primary", change: calcChange(clickRate, prevClickRate) },
    { label: "Unsub Rate", value: `${unsubRate}%`, icon: UserX, color: "text-warning", change: calcChange(unsubRate, prevUnsubRate), invertColor: true },
  ], [totals, prevTotals, deliveryRate, bounceRate, openRate, clickRate, unsubRate, prevDeliveryRate, prevBounceRate, prevOpenRate, prevClickRate, prevUnsubRate]);

  // Period comparison bar chart data
  const comparisonData = useMemo(() => [
    { metric: "Sent", current: totals.sent, previous: prevTotals.sent },
    { metric: "Delivered", current: totals.delivered, previous: prevTotals.delivered },
    { metric: "Bounced", current: totals.bounced, previous: prevTotals.bounced },
    { metric: "Opened", current: engagement.opened, previous: prevEngagement.opened },
    { metric: "Clicked", current: engagement.clicked, previous: prevEngagement.clicked },
    { metric: "Unsubs", current: engagement.unsubscribed, previous: prevEngagement.unsubscribed },
  ], [totals, prevTotals, engagement, prevEngagement]);

  // Delivery trend chart data
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

  const rateData = useMemo(() =>
    trendData.map((d) => ({
      label: d.label,
      rate: d.sent > 0 ? +((d.delivered / d.sent) * 100).toFixed(1) : 100,
      bounceRate: d.sent > 0 ? +((d.bounced / d.sent) * 100).toFixed(1) : 0,
    })),
  [trendData]);

  const engagementTrend = useMemo(() => {
    if (!logStats?.length) return [];
    const useHourly = timeRange === "24h";
    const grouped: Record<string, { sent: number; opened: number; clicked: number; unsubscribed: number }> = {};
    for (const log of logStats) {
      const key = useHourly
        ? format(startOfHour(new Date(log.created_at)), "HH:mm")
        : format(startOfDay(new Date(log.created_at)), "MMM d");
      if (!grouped[key]) grouped[key] = { sent: 0, opened: 0, clicked: 0, unsubscribed: 0 };
      if (log.event_type === "sent" || log.event_type === "delivered") grouped[key].sent++;
      if (log.event_type === "opened") grouped[key].opened++;
      if (log.event_type === "clicked") grouped[key].clicked++;
      if (log.event_type === "unsubscribed") grouped[key].unsubscribed++;
    }
    return Object.entries(grouped).map(([label, v]) => ({
      label,
      openRate: v.sent > 0 ? +((v.opened / v.sent) * 100).toFixed(1) : 0,
      clickRate: v.sent > 0 ? +((v.clicked / v.sent) * 100).toFixed(1) : 0,
      unsubRate: v.sent > 0 ? +((v.unsubscribed / v.sent) * 100).toFixed(1) : 0,
    }));
  }, [logStats, timeRange]);

  const domainDistribution = useMemo(() => {
    if (!logStats?.length) return [];
    const counts: Record<string, number> = {};
    for (const log of logStats) {
      if (log.event_type === "sent" || log.event_type === "delivered") {
        const domain = log.to_address.split("@")[1]?.toLowerCase() || "unknown";
        counts[domain] = (counts[domain] || 0) + 1;
      }
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 8).map(([domain, count]) => ({ domain, count }));
  }, [logStats]);

  const topBouncingDomains = useMemo(() => {
    if (!bounceRecords?.length) return [];
    const counts: Record<string, { total: number; hard: number }> = {};
    for (const b of bounceRecords) {
      const domain = b.email.split("@")[1]?.toLowerCase() || "unknown";
      if (!counts[domain]) counts[domain] = { total: 0, hard: 0 };
      counts[domain].total++;
      if (b.bounce_type === "hard") counts[domain].hard++;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b.total - a.total).slice(0, 5)
      .map(([domain, { total, hard }]) => ({ domain, total, hard, rate: ((hard / total) * 100).toFixed(1) }));
  }, [bounceRecords]);

  const eventDistribution = useMemo(() => {
    if (!logStats?.length) return [];
    const counts: Record<string, number> = {};
    for (const log of logStats) { counts[log.event_type] = (counts[log.event_type] || 0) + 1; }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
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
            {/* KPI Cards with period-over-period change */}
            <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
              {kpiCards.map((s) => (
                <div key={s.label} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <s.icon className={cn("h-4 w-4", s.color)} />
                  </div>
                  <p className="text-xl font-bold mt-1">{s.value}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <ChangeIndicator value={s.change.value} type={s.change.type} invertColor={s.invertColor} />
                    <span className="text-[10px] text-muted-foreground">{periods.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Period Comparison Bar Chart */}
            <div className="bg-card border border-border rounded-lg p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Period-over-Period Comparison <span className="text-muted-foreground font-normal">({periods.label})</span></h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="metric" tick={{ fontSize: 11, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="current" name="Current Period" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="previous" name="Previous Period" fill="hsl(var(--muted-foreground))" fillOpacity={0.4} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

            {/* Engagement Rates Over Time */}
            <div className="bg-card border border-border rounded-lg p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Engagement Rates Over Time</h3>
              {engagementTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={engagementTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} domain={[0, "auto"]} unit="%" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => `${value}%`} />
                    <Line type="monotone" dataKey="openRate" name="Open Rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="clickRate" name="Click Rate" stroke="hsl(262, 83%, 58%)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="unsubRate" name="Unsub Rate" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">No engagement data for this period</div>
              )}
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="text-sm font-medium text-foreground mb-4">Event Distribution</h3>
                {eventDistribution.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={eventDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
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
                              <p className="text-xs text-muted-foreground">SPF: {d.spf_status} · DKIM: {d.dkim_status} · DMARC: {d.dmarc_status}</p>
                            </div>
                            <span className={cn(
                              "text-xs font-medium px-2 py-0.5 rounded",
                              score >= 80 ? "text-success bg-success/15" : score >= 50 ? "text-warning bg-warning/15" : "text-destructive bg-destructive/15"
                            )}>{score}%</span>
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
