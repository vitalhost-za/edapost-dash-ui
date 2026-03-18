import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, Legend,
} from "recharts";
import {
  Eye, MousePointerClick, Send, CheckCircle, XCircle, Loader2,
  TrendingUp, Megaphone, BarChart3,
} from "lucide-react";
import { format, subDays, startOfDay, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  delivered_count: number;
  bounced_count: number;
  opened_count: number;
  clicked_count: number;
  sent_at: string | null;
  created_at: string;
}

export default function CampaignAnalytics() {
  const [timeRange, setTimeRange] = useState("30d");

  const since = useMemo(() => {
    switch (timeRange) {
      case "7d": return subDays(new Date(), 7);
      case "30d": return subDays(new Date(), 30);
      case "90d": return subDays(new Date(), 90);
      case "all": return new Date(0);
      default: return subDays(new Date(), 30);
    }
  }, [timeRange]);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaign-analytics", timeRange],
    queryFn: async () => {
      let query = supabase
        .from("campaigns")
        .select("id, name, status, recipient_count, sent_count, delivered_count, bounced_count, opened_count, clicked_count, sent_at, created_at")
        .order("created_at", { ascending: true });

      if (timeRange !== "all") {
        query = query.gte("created_at", since.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  // Aggregate KPIs
  const totals = useMemo(() => {
    if (!campaigns?.length) return { sent: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, campaigns: 0 };
    return campaigns.reduce(
      (acc, c) => ({
        sent: acc.sent + c.sent_count,
        delivered: acc.delivered + c.delivered_count,
        bounced: acc.bounced + c.bounced_count,
        opened: acc.opened + c.opened_count,
        clicked: acc.clicked + c.clicked_count,
        campaigns: acc.campaigns + 1,
      }),
      { sent: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, campaigns: 0 }
    );
  }, [campaigns]);

  const pct = (num: number, den: number) => den > 0 ? +((num / den) * 100).toFixed(1) : 0;

  // Trends over time — group by day
  const trendData = useMemo(() => {
    if (!campaigns?.length) return [];
    const grouped: Record<string, { sent: number; delivered: number; bounced: number; opened: number; clicked: number }> = {};

    for (const c of campaigns) {
      const dateKey = format(startOfDay(parseISO(c.sent_at || c.created_at)), "MMM d");
      if (!grouped[dateKey]) grouped[dateKey] = { sent: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0 };
      grouped[dateKey].sent += c.sent_count;
      grouped[dateKey].delivered += c.delivered_count;
      grouped[dateKey].bounced += c.bounced_count;
      grouped[dateKey].opened += c.opened_count;
      grouped[dateKey].clicked += c.clicked_count;
    }

    return Object.entries(grouped).map(([label, v]) => ({
      label,
      ...v,
      openRate: pct(v.opened, v.delivered),
      clickRate: pct(v.clicked, v.delivered),
      deliveryRate: pct(v.delivered, v.sent),
      bounceRate: pct(v.bounced, v.sent),
    }));
  }, [campaigns]);

  // Per-campaign comparison (top 10 by sent_count)
  const campaignComparison = useMemo(() => {
    if (!campaigns?.length) return [];
    return [...campaigns]
      .filter((c) => c.sent_count > 0)
      .sort((a, b) => b.sent_count - a.sent_count)
      .slice(0, 10)
      .map((c) => ({
        name: c.name.length > 20 ? c.name.slice(0, 20) + "…" : c.name,
        openRate: pct(c.opened_count, c.sent_count),
        clickRate: pct(c.clicked_count, c.sent_count),
        deliveryRate: pct(c.delivered_count, c.sent_count),
        bounceRate: pct(c.bounced_count, c.sent_count),
      }));
  }, [campaigns]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Campaign Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track open rates, click rates, and delivery trends across campaigns.
            </p>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              {[
                { label: "Campaigns", value: totals.campaigns.toLocaleString(), icon: Megaphone, color: "text-primary" },
                { label: "Sent", value: totals.sent.toLocaleString(), icon: Send, color: "text-info" },
                { label: "Delivery Rate", value: `${pct(totals.delivered, totals.sent)}%`, icon: CheckCircle, color: "text-success" },
                { label: "Bounce Rate", value: `${pct(totals.bounced, totals.sent)}%`, icon: XCircle, color: "text-destructive" },
                { label: "Open Rate", value: `${pct(totals.opened, totals.delivered)}%`, icon: Eye, color: "text-primary" },
                { label: "Click Rate", value: `${pct(totals.clicked, totals.delivered)}%`, icon: MousePointerClick, color: "text-primary" },
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

            {/* Delivery Volume Trend */}
            <div className="bg-card border border-border rounded-lg p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Delivery Volume Over Time</h3>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="delivered" name="Delivered" stroke="hsl(142, 71%, 45%)" fill="hsl(142, 71%, 45%)" fillOpacity={0.2} strokeWidth={2} />
                    <Area type="monotone" dataKey="opened" name="Opened" stroke="hsl(217, 91%, 60%)" fill="hsl(217, 91%, 60%)" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="clicked" name="Clicked" stroke="hsl(262, 83%, 58%)" fill="hsl(262, 83%, 58%)" fillOpacity={0.1} strokeWidth={2} />
                    <Area type="monotone" dataKey="bounced" name="Bounced" stroke="hsl(0, 72%, 51%)" fill="hsl(0, 72%, 51%)" fillOpacity={0.1} strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No delivery data for this period" />
              )}
            </div>

            {/* Rate Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="text-sm font-medium text-foreground mb-4">Open & Click Rate Trends</h3>
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => `${val}%`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="openRate" name="Open Rate" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(217, 91%, 60%)" }} />
                      <Line type="monotone" dataKey="clickRate" name="Click Rate" stroke="hsl(262, 83%, 58%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(262, 83%, 58%)" }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="No engagement data" />
                )}
              </div>

              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="text-sm font-medium text-foreground mb-4">Delivery & Bounce Rate Trends</h3>
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => `${val}%`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="deliveryRate" name="Delivery Rate" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(142, 71%, 45%)" }} />
                      <Line type="monotone" dataKey="bounceRate" name="Bounce Rate" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(0, 72%, 51%)" }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="No delivery data" />
                )}
              </div>
            </div>

            {/* Per-Campaign Comparison */}
            <div className="bg-card border border-border rounded-lg p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">Campaign Comparison — Top 10 by Volume</h3>
              {campaignComparison.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, campaignComparison.length * 40)}>
                  <BarChart data={campaignComparison} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} width={130} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => `${val}%`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="openRate" name="Open Rate" fill="hsl(217, 91%, 60%)" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="clickRate" name="Click Rate" fill="hsl(262, 83%, 58%)" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="deliveryRate" name="Delivery Rate" fill="hsl(142, 71%, 45%)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No campaigns with sent emails to compare" />
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[200px] text-center">
      <BarChart3 className="h-8 w-8 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
