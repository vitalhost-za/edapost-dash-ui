import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ScrollText, Search, Loader2, Radio, ChevronLeft, ChevronRight,
  Send, CheckCircle, XCircle, AlertTriangle, Clock, MousePointerClick,
  Eye, MessageSquareWarning, Unlink,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

interface EmailLog {
  id: string;
  message_id: string | null;
  event_type: string;
  from_address: string;
  to_address: string;
  subject: string | null;
  smtp_response: string | null;
  response_code: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const EVENT_TYPES = ["all", "queued", "sent", "delivered", "bounced", "deferred", "failed", "opened", "clicked", "complained", "unsubscribed"] as const;

const eventStatusMap: Record<string, keyof typeof import("@/components/StatusBadge")["StatusBadge"] extends never ? string : string> = {
  queued: "queued",
  sent: "sent",
  delivered: "delivered",
  bounced: "bounced",
  deferred: "deferred",
  failed: "failed",
  opened: "delivered",
  clicked: "delivered",
  complained: "complained",
  unsubscribed: "warning",
};

const eventIcons: Record<string, typeof Send> = {
  queued: Clock,
  sent: Send,
  delivered: CheckCircle,
  bounced: XCircle,
  deferred: AlertTriangle,
  failed: XCircle,
  opened: Eye,
  clicked: MousePointerClick,
  complained: MessageSquareWarning,
  unsubscribed: Unlink,
};

const PAGE_SIZE = 50;

export default function Logs() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [timeRange, setTimeRange] = useState("24h");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);

  const getTimeRangeDate = () => {
    const now = new Date();
    switch (timeRange) {
      case "1h": now.setHours(now.getHours() - 1); break;
      case "6h": now.setHours(now.getHours() - 6); break;
      case "24h": now.setDate(now.getDate() - 1); break;
      case "7d": now.setDate(now.getDate() - 7); break;
      case "30d": now.setDate(now.getDate() - 30); break;
      default: now.setDate(now.getDate() - 1);
    }
    return now;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["email-logs", eventFilter, search, timeRange, page],
    queryFn: async () => {
      let query = supabase
        .from("email_logs")
        .select("*", { count: "exact" })
        .gte("created_at", getTimeRangeDate().toISOString())
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (eventFilter !== "all") query = query.eq("event_type", eventFilter);
      if (search.trim()) {
        query = query.or(`to_address.ilike.%${search.trim()}%,from_address.ilike.%${search.trim()}%,subject.ilike.%${search.trim()}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { logs: data as EmailLog[], total: count ?? 0 };
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("email-logs-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_logs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["email-logs"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Event stats from current results
  const { data: statsData } = useQuery({
    queryKey: ["email-log-stats", timeRange],
    queryFn: async () => {
      const since = getTimeRangeDate().toISOString();
      const stats: Record<string, number> = {};
      for (const type of ["sent", "delivered", "bounced", "failed", "opened"]) {
        const { count, error } = await supabase
          .from("email_logs")
          .select("*", { count: "exact", head: true })
          .eq("event_type", type)
          .gte("created_at", since);
        if (!error) stats[type] = count ?? 0;
      }
      return stats;
    },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Delivery Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time email delivery event tracking.
              <span className="inline-flex items-center gap-1 ml-2 text-success">
                <Radio className="h-3 w-3 animate-pulse" /> Live
              </span>
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Sent", value: statsData?.sent ?? 0, icon: Send, color: "text-info" },
            { label: "Delivered", value: statsData?.delivered ?? 0, icon: CheckCircle, color: "text-success" },
            { label: "Bounced", value: statsData?.bounced ?? 0, icon: XCircle, color: "text-destructive" },
            { label: "Failed", value: statsData?.failed ?? 0, icon: XCircle, color: "text-destructive" },
            { label: "Opened", value: statsData?.opened ?? 0, icon: Eye, color: "text-primary" },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <s.icon className={cn("h-4 w-4", s.color)} />
              </div>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, subject…"
                className="pl-9 bg-transparent"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              />
            </div>
            <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === "all" ? "All events" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={(v) => { setTimeRange(v); setPage(0); }}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last 1h</SelectItem>
                <SelectItem value="6h">Last 6h</SelectItem>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground ml-auto">{total} events</p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length > 0 ? (
            <>
              <div className="divide-y divide-border">
                {logs.map((log) => {
                  const Icon = eventIcons[log.event_type] || ScrollText;
                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="w-full p-4 flex items-center gap-4 hover:bg-accent/30 transition-colors text-left"
                    >
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                        log.event_type === "delivered" || log.event_type === "opened" || log.event_type === "clicked"
                          ? "bg-success/10 text-success"
                          : log.event_type === "bounced" || log.event_type === "failed"
                            ? "bg-destructive/10 text-destructive"
                            : log.event_type === "deferred" || log.event_type === "complained"
                              ? "bg-warning/10 text-warning"
                              : "bg-muted text-muted-foreground"
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{log.to_address}</span>
                          <StatusBadge status={eventStatusMap[log.event_type] as any} label={log.event_type} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {log.subject || "No subject"} · from {log.from_address}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </p>
                        {log.response_code && (
                          <p className="text-xs font-mono text-muted-foreground">{log.response_code}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-4 flex items-center justify-between border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-3 rounded-xl bg-muted mb-3">
                <ScrollText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No logs found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {eventFilter !== "all" || search
                  ? "Try adjusting your filters."
                  : "Email delivery events will appear here in real-time once you start sending."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Event Detail
              {selectedLog && (
                <StatusBadge status={eventStatusMap[selectedLog.event_type] as any} label={selectedLog.event_type} />
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedLog && format(new Date(selectedLog.created_at), "PPpp")}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "To", value: selectedLog.to_address },
                  { label: "From", value: selectedLog.from_address },
                  { label: "Subject", value: selectedLog.subject || "—" },
                  { label: "Message ID", value: selectedLog.message_id || "—" },
                  { label: "Response Code", value: selectedLog.response_code || "—" },
                  { label: "IP Address", value: selectedLog.ip_address || "—" },
                ].map((f) => (
                  <div key={f.label} className="space-y-1">
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                    <p className="text-sm font-medium break-all">{f.value}</p>
                  </div>
                ))}
              </div>

              {selectedLog.smtp_response && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">SMTP Response</p>
                  <div className="bg-secondary rounded-md p-3">
                    <code className="text-xs break-all">{selectedLog.smtp_response}</code>
                  </div>
                </div>
              )}

              {selectedLog.user_agent && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">User Agent</p>
                  <p className="text-xs text-muted-foreground break-all">{selectedLog.user_agent}</p>
                </div>
              )}

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Metadata</p>
                  <div className="bg-secondary rounded-md p-3">
                    <pre className="text-xs whitespace-pre-wrap break-all">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
