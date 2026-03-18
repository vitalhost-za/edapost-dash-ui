import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Mail, TrendingUp, AlertTriangle, XCircle, ListOrdered,
  ArrowUp, ArrowDown, Server, Globe, Loader2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  useSmtpServers,
  useSendingDomains,
  useIpWarmup,
  useDeliveryStats,
  useDeliveryTotals,
} from "@/hooks/use-dashboard-data";
import { format } from "date-fns";

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-3 rounded-xl bg-muted mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">{description}</p>
    </div>
  );
}

export default function Dashboard() {
  const { data: servers, isLoading: serversLoading } = useSmtpServers();
  const { data: domains, isLoading: domainsLoading } = useSendingDomains();
  const { data: warmups, isLoading: warmupsLoading } = useIpWarmup();
  const { data: chartData, isLoading: chartLoading } = useDeliveryStats(30);
  const { data: todayTotals, isLoading: totalsLoading } = useDeliveryTotals(1);

  const totalQueueSize = servers?.reduce((sum, s) => sum + s.queue_size, 0) ?? 0;
  const onlineServers = servers?.filter((s) => s.status === "online").length ?? 0;
  const totalServers = servers?.length ?? 0;

  const sent = todayTotals?.sent ?? 0;
  const delivered = todayTotals?.delivered ?? 0;
  const bounced = todayTotals?.bounced ?? 0;
  const complaints = todayTotals?.complaints ?? 0;
  const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : "0.0";
  const bounceRate = sent > 0 ? ((bounced / sent) * 100).toFixed(1) : "0.0";
  const complaintRate = sent > 0 ? ((complaints / sent) * 100).toFixed(2) : "0.00";

  const donutData = [
    { name: "Delivered", value: todayTotals?.delivered ?? 0, color: "hsl(142, 71%, 45%)" },
    { name: "Bounced", value: todayTotals?.bounced ?? 0, color: "hsl(0, 72%, 51%)" },
    { name: "Deferred", value: todayTotals?.deferred ?? 0, color: "hsl(25, 95%, 53%)" },
    { name: "Failed", value: todayTotals?.failed ?? 0, color: "hsl(0, 62%, 40%)" },
  ];

  const hasDonutData = donutData.some((d) => d.value > 0);

  const formattedChartData = (chartData ?? []).map((d) => ({
    ...d,
    label: format(new Date(d.hour), "MMM d HH:mm"),
  }));

  const metrics = [
    { title: "Emails Sent Today", value: sent.toLocaleString(), icon: Mail },
    { title: "Delivery Rate", value: `${deliveryRate}%`, icon: TrendingUp },
    { title: "Bounce Rate", value: `${bounceRate}%`, icon: AlertTriangle },
    { title: "Complaint Rate", value: `${complaintRate}%`, icon: XCircle },
    { title: "Queue Depth", value: totalQueueSize.toLocaleString(), icon: ListOrdered },
  ];

  const isLoading = serversLoading || domainsLoading || warmupsLoading || chartLoading || totalsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

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
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Emails Sent — Last 30 Days</h3>
            {formattedChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={formattedChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, className: "fill-muted-foreground" }} axisLine={false} tickLine={false} />
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
                  <Line type="monotone" dataKey="sent" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Sent" />
                  <Line type="monotone" dataKey="delivered" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Delivered" />
                  <Line type="monotone" dataKey="bounced" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} name="Bounced" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={Mail} title="No delivery data yet" description="Stats will appear here once your SMTP servers start sending emails." />
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Delivery Breakdown</h3>
            {hasDonutData ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={donutData} innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3} strokeWidth={0}>
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
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
              </>
            ) : (
              <EmptyState icon={TrendingUp} title="No data yet" description="Delivery breakdown will populate as emails are processed." />
            )}
          </div>
        </div>

        {/* Servers + Domains + Warmup */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Server Status */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground">SMTP Servers</h3>
              <span className="text-xs text-muted-foreground">{onlineServers}/{totalServers} online</span>
            </div>
            {servers && servers.length > 0 ? (
              <div className="space-y-3">
                {servers.slice(0, 5).map((server) => (
                  <div key={server.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{server.hostname}</p>
                      <p className="text-xs text-muted-foreground font-mono">{server.ip_address}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Q: {server.queue_size}</span>
                      <StatusBadge status={server.status === "online" ? "sent" : server.status === "degraded" ? "warning" : "failed"} label={server.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Server} title="No servers added" description="Add your first Postfix SMTP server to get started." />
            )}
          </div>

          {/* Sending Domains */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">Sending Domains</h3>
            {domains && domains.length > 0 ? (
              <div className="space-y-3">
                {domains.slice(0, 5).map((domain) => (
                  <div key={domain.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <p className="text-sm font-medium text-foreground">{domain.domain}</p>
                    <div className="flex items-center gap-1">
                      {(["spf", "dkim", "dmarc"] as const).map((check) => {
                        const status = domain[`${check}_status` as keyof typeof domain] as string;
                        return (
                          <span
                            key={check}
                            className={cn(
                              "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                              status === "valid" && "bg-success/15 text-success",
                              status === "invalid" && "bg-destructive/15 text-destructive",
                              status === "missing" && "bg-warning/15 text-warning",
                              status === "unchecked" && "bg-muted text-muted-foreground"
                            )}
                          >
                            {check}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Globe} title="No domains configured" description="Add a sending domain to verify DNS records." />
            )}
          </div>

          {/* IP Warmup */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-sm font-medium text-foreground mb-4">IP Warmup Progress</h3>
            {warmups && warmups.length > 0 ? (
              <div className="space-y-5">
                {warmups.slice(0, 3).map((w) => {
                  const progress = Math.round((w.warmup_day / w.total_days) * 100);
                  return (
                    <div key={w.id} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground font-mono text-xs">{w.ip_address}</span>
                        <span className="font-medium text-primary">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Day {w.warmup_day}/{w.total_days}</span>
                        <span>{w.sent_today.toLocaleString()}/{w.daily_limit.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={TrendingUp} title="No active warmups" description="Start an IP warmup schedule to gradually build sender reputation." />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
