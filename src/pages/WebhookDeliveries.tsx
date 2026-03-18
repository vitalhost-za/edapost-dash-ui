import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, Eye,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

interface Delivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status_code: number | null;
  response_body: string | null;
  duration_ms: number | null;
  success: boolean;
  error_message: string | null;
  attempt_number: number;
  max_attempts: number;
  next_retry_at: string | null;
  delivery_id: string;
  created_at: string;
}

interface WebhookInfo {
  id: string;
  name: string;
  url: string;
}

const PAGE_SIZE = 25;

export default function WebhookDeliveries() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const webhookIdFilter = searchParams.get("webhook") ?? "all";
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);

  // Fetch webhooks for filter dropdown
  const { data: webhooks } = useQuery({
    queryKey: ["webhooks-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhooks")
        .select("id, name, url")
        .order("name");
      if (error) throw error;
      return data as WebhookInfo[];
    },
  });

  // Fetch deliveries
  const { data: deliveries, isLoading } = useQuery({
    queryKey: ["webhook-deliveries", webhookIdFilter, eventFilter, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("webhook_deliveries")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (webhookIdFilter !== "all") {
        query = query.eq("webhook_id", webhookIdFilter);
      }
      if (eventFilter !== "all") {
        query = query.eq("event_type", eventFilter);
      }
      if (statusFilter === "success") {
        query = query.eq("success", true);
      } else if (statusFilter === "failed") {
        query = query.eq("success", false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Delivery[];
    },
  });

  // Summary stats
  const { data: stats } = useQuery({
    queryKey: ["webhook-delivery-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select("success");
      if (error) throw error;
      const total = data.length;
      const successful = data.filter((d) => d.success).length;
      const failed = total - successful;
      return { total, successful, failed, rate: total > 0 ? ((successful / total) * 100).toFixed(1) : "0" };
    },
  });

  const webhookName = (id: string) => webhooks?.find((w) => w.id === id)?.name ?? "Unknown";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhook Delivery Log</h1>
          <p className="text-sm text-muted-foreground mt-1">Track every webhook delivery attempt with payloads, response codes, and timing.</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Total Deliveries</p>
              <p className="text-2xl font-bold mt-1">{stats.total}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Successful</p>
              <p className="text-2xl font-bold mt-1 text-primary">{stats.successful}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold mt-1 text-destructive">{stats.failed}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Success Rate</p>
              <p className="text-2xl font-bold mt-1">{stats.rate}%</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={webhookIdFilter} onValueChange={() => {}}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Webhooks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Webhooks</SelectItem>
              {webhooks?.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setPage(0); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="email.sent">Email Sent</SelectItem>
              <SelectItem value="email.delivered">Email Delivered</SelectItem>
              <SelectItem value="email.bounced">Email Bounced</SelectItem>
              <SelectItem value="email.opened">Email Opened</SelectItem>
              <SelectItem value="email.clicked">Link Clicked</SelectItem>
              <SelectItem value="email.complained">Spam Complaint</SelectItem>
              <SelectItem value="email.test">Test Event</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : deliveries && deliveries.length > 0 ? (
          <>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Webhook</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Event</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">HTTP Code</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Duration</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Attempt</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Time</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr key={d.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                        <td className="p-3">
                          {d.success ? (
                            <CheckCircle className="h-4 w-4 text-primary" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </td>
                        <td className="p-3 font-medium max-w-[150px] truncate">{webhookName(d.webhook_id)}</td>
                        <td className="p-3">
                          <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded">
                            {d.event_type}
                          </span>
                        </td>
                        <td className="p-3">
                          {d.status_code ? (
                            <span className={cn(
                              "text-xs font-mono font-medium px-2 py-0.5 rounded",
                              d.status_code < 300 ? "bg-primary/15 text-primary" :
                              d.status_code < 500 ? "bg-warning/15 text-warning" :
                              "bg-destructive/15 text-destructive"
                            )}>
                              {d.status_code}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {d.duration_ms !== null ? `${d.duration_ms}ms` : "—"}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          #{d.attempt_number}/{d.max_attempts}
                          {d.next_retry_at && !d.success && (
                            <span className="ml-1 text-warning" title={`Retry at ${format(new Date(d.next_retry_at), "PPpp")}`}>⏳</span>
                          )}
                          {!d.success && d.attempt_number >= d.max_attempts && (
                            <span className="ml-1 text-destructive" title="Max retries exhausted">✗</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                        </td>
                        <td className="p-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDelivery(d)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + deliveries.length}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={deliveries.length < PAGE_SIZE} onClick={() => setPage(page + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-card border border-border rounded-lg flex flex-col items-center justify-center py-16 text-center">
            <div className="p-3 rounded-xl bg-muted mb-3"><Clock className="h-6 w-6 text-muted-foreground" /></div>
            <p className="text-sm font-medium">No deliveries yet</p>
            <p className="text-xs text-muted-foreground mt-1">Webhook delivery attempts will appear here as events are dispatched.</p>
          </div>
        )}
      </div>

      {/* Delivery Detail Dialog */}
      <Dialog open={!!selectedDelivery} onOpenChange={() => setSelectedDelivery(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delivery Details</DialogTitle>
            <DialogDescription>
              {selectedDelivery && (
                <span>
                  {webhookName(selectedDelivery.webhook_id)} · {selectedDelivery.event_type} · {format(new Date(selectedDelivery.created_at), "PPpp")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-secondary rounded-md p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className={cn("text-sm font-medium mt-0.5", selectedDelivery.success ? "text-primary" : "text-destructive")}>
                    {selectedDelivery.success ? "Success" : "Failed"}
                  </p>
                </div>
                <div className="bg-secondary rounded-md p-3">
                  <p className="text-xs text-muted-foreground">HTTP Code</p>
                  <p className="text-sm font-medium mt-0.5 font-mono">{selectedDelivery.status_code ?? "N/A"}</p>
                </div>
                <div className="bg-secondary rounded-md p-3">
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="text-sm font-medium mt-0.5">{selectedDelivery.duration_ms ? `${selectedDelivery.duration_ms}ms` : "N/A"}</p>
                </div>
                <div className="bg-secondary rounded-md p-3">
                  <p className="text-xs text-muted-foreground">Attempt</p>
                  <p className="text-sm font-medium mt-0.5">#{selectedDelivery.attempt_number}</p>
                </div>
              </div>

              {/* Error */}
              {selectedDelivery.error_message && (
                <div>
                  <p className="text-xs font-medium text-destructive mb-1">Error</p>
                  <pre className="bg-destructive/10 text-destructive text-xs rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                    {selectedDelivery.error_message}
                  </pre>
                </div>
              )}

              {/* Payload */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Request Payload</p>
                <pre className="bg-secondary text-foreground text-xs rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-60">
                  {JSON.stringify(selectedDelivery.payload, null, 2)}
                </pre>
              </div>

              {/* Response */}
              {selectedDelivery.response_body && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Response Body</p>
                  <pre className="bg-secondary text-foreground text-xs rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-60">
                    {selectedDelivery.response_body}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
