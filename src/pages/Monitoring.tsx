import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar,
} from "recharts";
import {
  Activity, Server, Loader2, Wifi, WifiOff, Clock, Shield,
  AlertTriangle, CheckCircle, XCircle, RefreshCw, Gauge, Mail, TrendingUp,
  TrendingDown, ListOrdered, MessageSquareWarning,
} from "lucide-react";
import { format, subDays, subHours, startOfHour, startOfDay, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

export default function Monitoring() {
  const [timeRange, setTimeRange] = useState("24h");
  const [tab, setTab] = useState("email");

  const since = useMemo(() => {
    switch (timeRange) {
      case "1h": return subHours(new Date(), 1);
      case "6h": return subHours(new Date(), 6);
      case "24h": return subHours(new Date(), 24);
      case "7d": return subDays(new Date(), 7);
      case "30d": return subDays(new Date(), 30);
      default: return subHours(new Date(), 24);
    }
  }, [timeRange]);

  // Delivery stats
  const { data: deliveryStats, isLoading: statsLoading } = useQuery({
    queryKey: ["monitoring-delivery-stats", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_stats")
        .select("hour, sent, delivered, bounced, deferred, failed, complaints")
        .gte("hour", since.toISOString())
        .order("hour", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // SMTP servers
  const { data: servers, isLoading: serversLoading } = useQuery({
    queryKey: ["monitoring-servers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("smtp_servers")
        .select("*")
        .order("hostname");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  // Queue stats
  const { data: queueStats } = useQuery({
    queryKey: ["monitoring-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_queue")
        .select("status, created_at")
        .in("status", ["queued", "processing", "failed"]);
      if (error) throw error;
      const queued = data?.filter((e) => e.status === "queued") ?? [];
      const processing = data?.filter((e) => e.status === "processing") ?? [];
      const failed = data?.filter((e) => e.status === "failed") ?? [];

      // Calculate oldest job age and average latency for queued items
      const now = Date.now();
      let oldestAge = 0;
      let totalLatency = 0;
      const pendingJobs = [...queued, ...processing];
      for (const job of pendingJobs) {
        const age = now - new Date(job.created_at).getTime();
        if (age > oldestAge) oldestAge = age;
        totalLatency += age;
      }
      const avgLatency = pendingJobs.length > 0 ? totalLatency / pendingJobs.length : 0;

      return {
        queued: queued.length,
        processing: processing.length,
        failed: failed.length,
        total: queued.length + processing.length + failed.length,
        oldestAge,
        avgLatency,
      };
    },
    refetchInterval: 10000,
  });

  // Queue latency history (completed emails: sent_at - created_at)
  const { data: latencyHistory } = useQuery({
    queryKey: ["monitoring-latency-history", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_queue")
        .select("created_at, sent_at")
        .eq("status", "sent")
        .not("sent_at", "is", null)
        .gte("sent_at", since.toISOString())
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Alert settings
  const { data: alertSettings } = useQuery({
    queryKey: ["monitoring-alert-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("alert_bounce_rate, alert_complaint_rate, alert_queue_depth, alert_delivery_rate, alert_tls_expiry_days, alert_queue_latency_seconds")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Computed metrics
  const totals = useMemo(() => {
    if (!deliveryStats?.length) return { sent: 0, delivered: 0, bounced: 0, failed: 0, complaints: 0, deferred: 0 };
    return deliveryStats.reduce((acc, r) => ({
      sent: acc.sent + (r.sent || 0),
      delivered: acc.delivered + (r.delivered || 0),
      bounced: acc.bounced + (r.bounced || 0),
      failed: acc.failed + (r.failed || 0),
      complaints: acc.complaints + (r.complaints || 0),
      deferred: acc.deferred + (r.deferred || 0),
    }), { sent: 0, delivered: 0, bounced: 0, failed: 0, complaints: 0, deferred: 0 });
  }, [deliveryStats]);

  const deliveryRate = totals.sent > 0 ? (totals.delivered / totals.sent) * 100 : 100;
  const bounceRate = totals.sent > 0 ? (totals.bounced / totals.sent) * 100 : 0;
  const complaintRate = totals.sent > 0 ? (totals.complaints / totals.sent) * 100 : 0;
  const totalQueueDepth = servers?.reduce((s, srv) => s + srv.queue_size, 0) ?? 0;

  // Alert statuses
  const alerts = useMemo(() => {
    const thresholds = alertSettings ?? { alert_delivery_rate: 95, alert_bounce_rate: 2, alert_complaint_rate: 0.1, alert_queue_depth: 10000, alert_tls_expiry_days: 14 };
    const items: { label: string; status: "ok" | "warning" | "critical"; value: string; threshold: string }[] = [];

    const dlvThreshold = Number(thresholds.alert_delivery_rate) || 95;
    items.push({
      label: "Delivery Rate",
      status: deliveryRate < dlvThreshold ? "critical" : "ok",
      value: `${deliveryRate.toFixed(1)}%`,
      threshold: `< ${dlvThreshold}%`,
    });

    const bncThreshold = Number(thresholds.alert_bounce_rate) || 2;
    items.push({
      label: "Bounce Rate",
      status: bounceRate > bncThreshold ? "critical" : "ok",
      value: `${bounceRate.toFixed(1)}%`,
      threshold: `> ${bncThreshold}%`,
    });

    const cmpThreshold = Number(thresholds.alert_complaint_rate) || 0.1;
    items.push({
      label: "Complaint Rate",
      status: complaintRate > cmpThreshold ? "critical" : "ok",
      value: `${complaintRate.toFixed(2)}%`,
      threshold: `> ${cmpThreshold}%`,
    });

    const queueThreshold = Number(thresholds.alert_queue_depth) || 10000;
    items.push({
      label: "Queue Depth",
      status: totalQueueDepth > queueThreshold ? "critical" : "ok",
      value: totalQueueDepth.toLocaleString(),
      threshold: `> ${queueThreshold.toLocaleString()}`,
    });

    // TLS cert expiry
    const tlsDays = Number(thresholds.alert_tls_expiry_days) || 14;
    const now = new Date();
    let worstTls: { status: "ok" | "warning" | "critical"; value: string } = { status: "ok", value: "N/A" };
    if (servers?.length) {
      for (const srv of servers) {
        const expiry = (srv as any).tls_cert_expiry;
        if (expiry) {
          const daysLeft = Math.floor((new Date(expiry).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysLeft < tlsDays) {
            worstTls = { status: daysLeft < 3 ? "critical" : "warning", value: `${daysLeft}d` };
          } else if (worstTls.value === "N/A") {
            worstTls = { status: "ok", value: `${daysLeft}d` };
          }
        }
      }
    }
    items.push({ label: "TLS Cert Expiry", ...worstTls, threshold: `< ${tlsDays} days` });

    // Postfix process
    const offlineServers = servers?.filter((s) => s.status !== "online") ?? [];
    items.push({
      label: "Postfix Process",
      status: offlineServers.length > 0 ? "critical" : "ok",
      value: offlineServers.length > 0 ? `${offlineServers.length} down` : "All up",
      threshold: "Any down",
    });

    // Queue latency
    const latencyThreshold = Number((thresholds as any).alert_queue_latency_seconds) || 300;
    const oldestMs = queueStats?.oldestAge ?? 0;
    const oldestSec = Math.floor(oldestMs / 1000);
    const latencyValue = oldestMs === 0 ? "0s" : oldestSec < 60 ? `${oldestSec}s` : `${Math.floor(oldestSec / 60)}m`;
    items.push({
      label: "Queue Latency",
      status: oldestSec > latencyThreshold ? "critical" : oldestSec > latencyThreshold * 0.7 ? "warning" : "ok",
      value: latencyValue,
      threshold: `> ${latencyThreshold}s`,
    });

    return items;
  }, [deliveryRate, bounceRate, complaintRate, totalQueueDepth, servers, alertSettings, queueStats]);

  // Trend chart data
  const trendData = useMemo(() => {
    if (!deliveryStats?.length) return [];
    const useHourly = timeRange === "1h" || timeRange === "6h" || timeRange === "24h";
    const grouped: Record<string, { sent: number; delivered: number; bounced: number; complaints: number }> = {};
    for (const row of deliveryStats) {
      const key = useHourly
        ? format(startOfHour(new Date(row.hour)), "HH:mm")
        : format(startOfDay(new Date(row.hour)), "MMM d");
      if (!grouped[key]) grouped[key] = { sent: 0, delivered: 0, bounced: 0, complaints: 0 };
      grouped[key].sent += row.sent || 0;
      grouped[key].delivered += row.delivered || 0;
      grouped[key].bounced += row.bounced || 0;
      grouped[key].complaints += row.complaints || 0;
    }
    return Object.entries(grouped).map(([label, v]) => ({ label, ...v }));
  }, [deliveryStats, timeRange]);

  // Rate trend
  const rateTrend = useMemo(() => {
    return trendData.map((d) => ({
      label: d.label,
      deliveryRate: d.sent > 0 ? +((d.delivered / d.sent) * 100).toFixed(1) : 100,
      bounceRate: d.sent > 0 ? +((d.bounced / d.sent) * 100).toFixed(1) : 0,
      complaintRate: d.sent > 0 ? +((d.complaints / d.sent) * 100).toFixed(2) : 0,
    }));
  }, [trendData]);

  const onlineCount = servers?.filter((s) => s.status === "online").length ?? 0;
  const totalServers = servers?.length ?? 0;

  const runAlertCheck = async () => {
    try {
      const { error } = await supabase.functions.invoke("check-alerts");
      if (error) throw error;
      toast.success("Alert check completed");
    } catch {
      toast.error("Failed to run alert check");
    }
  };

  const isLoading = statsLoading || serversLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Monitoring</h1>
            <p className="text-sm text-muted-foreground mt-1">Real-time email metrics, server health, and alert status.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2" onClick={runAlertCheck}>
              <RefreshCw className="h-3.5 w-3.5" /> Check Alerts
            </Button>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last 1h</SelectItem>
                <SelectItem value="6h">Last 6h</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Alert Status Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {alerts.map((a) => (
            <div key={a.label} className={cn(
              "rounded-lg border p-3 transition-colors",
              a.status === "ok" && "border-border bg-card",
              a.status === "warning" && "border-warning/50 bg-warning/5",
              a.status === "critical" && "border-destructive/50 bg-destructive/5",
            )}>
              <div className="flex items-center gap-1.5 mb-1">
                {a.status === "ok" ? (
                  <CheckCircle className="h-3.5 w-3.5 text-success" />
                ) : a.status === "warning" ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className="text-xs font-medium text-muted-foreground">{a.label}</span>
              </div>
              <p className="text-lg font-bold">{a.value}</p>
              <p className="text-[10px] text-muted-foreground">Threshold: {a.threshold}</p>
            </div>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="email" className="gap-1.5"><Mail className="h-3.5 w-3.5" /> Email Metrics</TabsTrigger>
            <TabsTrigger value="server" className="gap-1.5"><Server className="h-3.5 w-3.5" /> Server Health</TabsTrigger>
          </TabsList>

          {/* Email Metrics Tab */}
          <TabsContent value="email" className="mt-6 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: "Sent", value: totals.sent.toLocaleString(), icon: Mail, color: "text-primary" },
                    { label: "Delivered", value: totals.delivered.toLocaleString(), icon: CheckCircle, color: "text-success" },
                    { label: "Delivery Rate", value: `${deliveryRate.toFixed(1)}%`, icon: TrendingUp, color: deliveryRate >= 95 ? "text-success" : "text-destructive" },
                    { label: "Bounce Rate", value: `${bounceRate.toFixed(1)}%`, icon: TrendingDown, color: bounceRate > 2 ? "text-destructive" : "text-success" },
                    { label: "Complaint Rate", value: `${complaintRate.toFixed(2)}%`, icon: MessageSquareWarning, color: complaintRate > 0.1 ? "text-destructive" : "text-success" },
                    { label: "Queue Depth", value: totalQueueDepth.toLocaleString(), icon: ListOrdered, color: "text-muted-foreground" },
                  ].map((m) => (
                    <div key={m.label} className="bg-card border border-border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{m.label}</p>
                        <m.icon className={cn("h-3.5 w-3.5", m.color)} />
                      </div>
                      <p className="text-xl font-bold mt-1">{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded-lg p-5">
                    <h3 className="text-sm font-medium mb-4">Delivery Volume</h3>
                    {trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Area type="monotone" dataKey="delivered" stackId="1" stroke="hsl(142, 71%, 45%)" fill="hsl(142, 71%, 45%)" fillOpacity={0.3} name="Delivered" />
                          <Area type="monotone" dataKey="bounced" stackId="1" stroke="hsl(0, 72%, 51%)" fill="hsl(0, 72%, 51%)" fillOpacity={0.3} name="Bounced" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">No data for this period</div>
                    )}
                  </div>

                  <div className="bg-card border border-border rounded-lg p-5">
                    <h3 className="text-sm font-medium mb-4">Rate Trends</h3>
                    {rateTrend.length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={rateTrend}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Line type="monotone" dataKey="deliveryRate" name="Delivery %" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="bounceRate" name="Bounce %" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="complaintRate" name="Complaint %" stroke="hsl(38, 92%, 50%)" strokeWidth={1.5} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">No data for this period</div>
                    )}
                  </div>
                </div>

                {/* Queue breakdown */}
                <div className="bg-card border border-border rounded-lg p-5">
                  <h3 className="text-sm font-medium mb-4">Queue Status</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Queued", value: queueStats?.queued ?? 0, color: "text-primary" },
                      { label: "Processing", value: queueStats?.processing ?? 0, color: "text-warning" },
                      { label: "Failed", value: queueStats?.failed ?? 0, color: "text-destructive" },
                    ].map((q) => (
                      <div key={q.label} className="bg-secondary rounded-lg p-4 text-center">
                        <p className="text-xs text-muted-foreground">{q.label}</p>
                        <p className={cn("text-2xl font-bold mt-1", q.color)}>{q.value.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Queue Latency */}
                <div className="bg-card border border-border rounded-lg p-5">
                  <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" /> Queue Latency &amp; Oldest Job Age
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {(() => {
                      const formatDuration = (ms: number) => {
                        if (ms === 0) return "—";
                        const secs = Math.floor(ms / 1000);
                        if (secs < 60) return `${secs}s`;
                        const mins = Math.floor(secs / 60);
                        if (mins < 60) return `${mins}m ${secs % 60}s`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs}h ${mins % 60}m`;
                        const days = Math.floor(hrs / 24);
                        return `${days}d ${hrs % 24}h`;
                      };
                      const oldest = queueStats?.oldestAge ?? 0;
                      const avg = queueStats?.avgLatency ?? 0;
                      const pending = (queueStats?.queued ?? 0) + (queueStats?.processing ?? 0);
                      const oldestSeverity = oldest > 600000 ? "text-destructive" : oldest > 120000 ? "text-warning" : "text-success";
                      const avgSeverity = avg > 300000 ? "text-destructive" : avg > 60000 ? "text-warning" : "text-success";
                      return [
                        { label: "Oldest Job Age", value: formatDuration(oldest), color: oldestSeverity, icon: AlertTriangle },
                        { label: "Avg Wait Time", value: formatDuration(avg), color: avgSeverity, icon: Gauge },
                        { label: "Pending Jobs", value: pending.toLocaleString(), color: pending > 100 ? "text-warning" : "text-muted-foreground", icon: ListOrdered },
                        { label: "Throughput Status", value: oldest === 0 ? "Idle" : oldest > 600000 ? "Backlogged" : oldest > 120000 ? "Busy" : "Healthy", color: oldest === 0 ? "text-muted-foreground" : oldest > 600000 ? "text-destructive" : oldest > 120000 ? "text-warning" : "text-success", icon: Activity },
                      ].map((m) => (
                        <div key={m.label} className="bg-secondary rounded-lg p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 mb-2">
                            <m.icon className={cn("h-3.5 w-3.5", m.color)} />
                            <p className="text-xs text-muted-foreground">{m.label}</p>
                          </div>
                          <p className={cn("text-2xl font-bold", m.color)}>{m.value}</p>
                        </div>
                      ));
                    })()}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-3">
                    ⏱ Thresholds — Healthy: &lt;2m avg wait · Busy: 2–10m · Backlogged: &gt;10m oldest job
                  </p>

                  {/* Latency History Chart */}
                  {(() => {
                    const useHourly = timeRange === "1h" || timeRange === "6h" || timeRange === "24h";
                    const grouped: Record<string, { totalMs: number; count: number; maxMs: number }> = {};
                    for (const row of (latencyHistory ?? [])) {
                      if (!row.sent_at) continue;
                      const key = useHourly
                        ? format(startOfHour(new Date(row.sent_at)), "HH:mm")
                        : format(startOfDay(new Date(row.sent_at)), "MMM d");
                      if (!grouped[key]) grouped[key] = { totalMs: 0, count: 0, maxMs: 0 };
                      const waitMs = new Date(row.sent_at).getTime() - new Date(row.created_at).getTime();
                      grouped[key].totalMs += waitMs;
                      grouped[key].count += 1;
                      if (waitMs > grouped[key].maxMs) grouped[key].maxMs = waitMs;
                    }
                    const chartData = Object.entries(grouped).map(([label, v]) => ({
                      label,
                      avgWait: +(v.totalMs / v.count / 1000).toFixed(1),
                      maxWait: +(v.maxMs / 1000).toFixed(1),
                      volume: v.count,
                    }));

                    return chartData.length > 0 ? (
                      <div className="mt-5">
                        <h4 className="text-xs font-medium text-muted-foreground mb-3">Wait Time History (seconds)</h4>
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} label={{ value: "sec", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } }} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value}s`, name === "avgWait" ? "Avg Wait" : name === "maxWait" ? "Max Wait" : "Volume"]} />
                            <Area type="monotone" dataKey="maxWait" stroke="hsl(0, 72%, 51%)" fill="hsl(0, 72%, 51%)" fillOpacity={0.1} name="Max Wait" strokeWidth={1.5} />
                            <Area type="monotone" dataKey="avgWait" stroke="hsl(217, 91%, 60%)" fill="hsl(217, 91%, 60%)" fillOpacity={0.2} name="Avg Wait" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="mt-5 flex items-center justify-center h-[120px] text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                        No completed emails in this period to compute latency history
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </TabsContent>

          {/* Server Health Tab */}
          <TabsContent value="server" className="mt-6 space-y-4">
            {serversLoading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {/* Server overview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-card border border-border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Total Servers</p>
                    <p className="text-2xl font-bold mt-1">{totalServers}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Online</p>
                    <p className="text-2xl font-bold mt-1 text-success">{onlineCount}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Offline</p>
                    <p className="text-2xl font-bold mt-1 text-destructive">{totalServers - onlineCount}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Total Queue</p>
                    <p className="text-2xl font-bold mt-1">{totalQueueDepth.toLocaleString()}</p>
                  </div>
                </div>

                {/* Server cards */}
                {servers && servers.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {servers.map((srv) => {
                      const isOnline = srv.status === "online";
                      const heartbeatAgo = srv.last_heartbeat
                        ? formatDistanceToNow(new Date(srv.last_heartbeat), { addSuffix: true })
                        : "Never";
                      const tlsExpiry = (srv as any).tls_cert_expiry;
                      const daysToExpiry = tlsExpiry
                        ? Math.floor((new Date(tlsExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null;

                      return (
                        <div key={srv.id} className={cn(
                          "bg-card border rounded-lg p-5 space-y-4",
                          isOnline ? "border-border" : "border-destructive/50"
                        )}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isOnline ? (
                                <Wifi className="h-5 w-5 text-success" />
                              ) : (
                                <WifiOff className="h-5 w-5 text-destructive" />
                              )}
                              <div>
                                <p className="font-medium">{srv.hostname}</p>
                                <p className="text-xs text-muted-foreground font-mono">{String(srv.ip_address)}:{srv.port}</p>
                              </div>
                            </div>
                            <span className={cn(
                              "text-xs font-medium px-2 py-1 rounded",
                              isOnline ? "bg-success/15 text-success" :
                              srv.status === "degraded" ? "bg-warning/15 text-warning" :
                              "bg-destructive/15 text-destructive"
                            )}>
                              {srv.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-secondary rounded-md p-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Connections</p>
                              <p className="text-sm font-bold mt-0.5">{srv.current_connections}/{srv.max_connections}</p>
                            </div>
                            <div className="bg-secondary rounded-md p-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Queue</p>
                              <p className="text-sm font-bold mt-0.5">{srv.queue_size.toLocaleString()}</p>
                            </div>
                            <div className="bg-secondary rounded-md p-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">TLS</p>
                              <p className={cn("text-sm font-bold mt-0.5", srv.tls_enabled ? "text-success" : "text-destructive")}>
                                {srv.tls_enabled ? "Enabled" : "Disabled"}
                              </p>
                            </div>
                            <div className="bg-secondary rounded-md p-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Postfix</p>
                              <p className="text-sm font-bold mt-0.5">{srv.postfix_version || "N/A"}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3 w-3" />
                              <span>Heartbeat: {heartbeatAgo}</span>
                            </div>
                            {daysToExpiry !== null && (
                              <div className="flex items-center gap-1.5">
                                <Shield className={cn("h-3 w-3", daysToExpiry < 14 ? "text-warning" : "text-success")} />
                                <span className={daysToExpiry < 14 ? "text-warning" : ""}>
                                  TLS cert: {daysToExpiry}d left
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-lg flex flex-col items-center justify-center py-16 text-center">
                    <Server className="h-8 w-8 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium">No SMTP servers configured</p>
                    <p className="text-xs text-muted-foreground mt-1">Add servers on the Servers page to monitor their health.</p>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
