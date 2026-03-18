import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RefreshCw, Trash2, Search, Loader2, ListOrdered, Zap, Clock, RotateCcw,
  CheckCircle, XCircle, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface QueueItem {
  id: string;
  from_address: string;
  to_address: string;
  subject: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  postfix_queue_id: string | null;
  next_retry_at: string | null;
  sent_at: string | null;
  created_at: string;
  smtp_server_id: string | null;
}

const statusOptions = ["all", "queued", "processing", "sent", "delivered", "failed", "retrying", "deferred"] as const;

const statusBadgeMap: Record<string, "queued" | "processing" | "sent" | "delivered" | "failed" | "retrying" | "deferred"> = {
  queued: "queued",
  processing: "processing",
  sent: "sent",
  delivered: "delivered",
  failed: "failed",
  retrying: "retrying",
  deferred: "deferred",
};

export default function Queue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Query queue items
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["email-queue", statusFilter, search, page],
    queryFn: async () => {
      let query = supabase
        .from("email_queue")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (search.trim()) {
        query = query.or(`to_address.ilike.%${search.trim()}%,subject.ilike.%${search.trim()}%,from_address.ilike.%${search.trim()}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { items: data as QueueItem[], total: count ?? 0 };
    },
  });

  // Query stats
  const { data: stats } = useQuery({
    queryKey: ["email-queue-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_queue")
        .select("status");
      if (error) throw error;

      const counts = { queued: 0, processing: 0, sent: 0, delivered: 0, failed: 0, retrying: 0, deferred: 0, total: 0 };
      (data || []).forEach((row) => {
        counts.total++;
        const s = row.status as keyof typeof counts;
        if (s in counts) counts[s]++;
      });
      return counts;
    },
    refetchInterval: 5000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("email-queue-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_queue" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["email-queue"] });
          queryClient.invalidateQueries({ queryKey: ["email-queue-stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("email_queue")
        .update({ status: "queued", attempts: 0, error_message: null, next_retry_at: null })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-queue"] });
      queryClient.invalidateQueries({ queryKey: ["email-queue-stats"] });
      setSelected(new Set());
      toast.success("Jobs requeued for retry");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Purge failed mutation
  const purgeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("email_queue")
        .delete()
        .eq("status", "failed");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-queue"] });
      queryClient.invalidateQueries({ queryKey: ["email-queue-stats"] });
      setPurgeOpen(false);
      toast.success("Failed jobs purged");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete selected
  const deleteSelectedMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("email_queue")
        .delete()
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-queue"] });
      queryClient.invalidateQueries({ queryKey: ["email-queue-stats"] });
      setSelected(new Set());
      toast.success("Jobs removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const items = data?.items ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const selectedRetryable = items.filter((i) => selected.has(i.id) && (i.status === "failed" || i.status === "deferred"));

  const statCards = [
    { label: "Total Queued", value: stats?.queued ?? 0, icon: ListOrdered, color: "text-info" },
    { label: "Processing", value: stats?.processing ?? 0, icon: Zap, color: "text-warning" },
    { label: "Delivered", value: (stats?.sent ?? 0) + (stats?.delivered ?? 0), icon: CheckCircle, color: "text-success" },
    { label: "Failed", value: stats?.failed ?? 0, icon: XCircle, color: "text-destructive" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Queue</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor and manage your email delivery pipeline in real-time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              Live
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <s.icon className={cn("h-4 w-4", s.color)} />
              </div>
              <p className="text-2xl font-bold mt-1">{s.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* Filters + Actions + Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search recipient, sender, or subject…"
                className="pl-9 bg-transparent"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 ml-auto">
              {selectedRetryable.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={retryMutation.isPending}
                  onClick={() => retryMutation.mutate(selectedRetryable.map((i) => i.id))}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry ({selectedRetryable.length})
                </Button>
              )}
              {selected.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={deleteSelectedMutation.isPending}
                  onClick={() => deleteSelectedMutation.mutate(Array.from(selected))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete ({selected.size})
                </Button>
              )}
              {(stats?.failed ?? 0) > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setPurgeOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Purge Failed
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-3 w-10">
                        <Checkbox
                          checked={items.length > 0 && selected.size === items.length}
                          onCheckedChange={toggleAll}
                        />
                      </th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">From</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">To</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Subject</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="p-3 text-center text-xs font-medium text-muted-foreground">Attempts</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Next Retry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-border transition-colors hover:bg-accent/30",
                          selected.has(row.id) && "bg-primary/5"
                        )}
                      >
                        <td className="p-3">
                          <Checkbox
                            checked={selected.has(row.id)}
                            onCheckedChange={() => toggleSelect(row.id)}
                          />
                        </td>
                        <td className="p-3 text-muted-foreground text-xs truncate max-w-[160px]">{row.from_address}</td>
                        <td className="p-3 font-medium text-xs truncate max-w-[180px]">{row.to_address}</td>
                        <td className="p-3 truncate max-w-[200px]">{row.subject}</td>
                        <td className="p-3">
                          <StatusBadge status={statusBadgeMap[row.status] || "queued"} />
                        </td>
                        <td className="p-3 text-center text-xs">
                          <span className={cn(
                            row.attempts >= row.max_attempts && "text-destructive font-semibold"
                          )}>
                            {row.attempts}/{row.max_attempts}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                          {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                        </td>
                        <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                          {row.next_retry_at
                            ? formatDistanceToNow(new Date(row.next_retry_at), { addSuffix: true })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Error details for failed items */}
              {items.some((i) => i.status === "failed" && i.error_message) && (
                <div className="px-4 py-3 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Error Details</p>
                  <div className="space-y-1.5">
                    {items
                      .filter((i) => i.status === "failed" && i.error_message)
                      .slice(0, 5)
                      .map((i) => (
                        <div key={i.id} className="flex items-start gap-2 text-xs">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">
                            <span className="font-medium text-foreground">{i.to_address}</span>: {i.error_message}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalItems)} of {totalItems}
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-3 rounded-xl bg-muted mb-3">
                <ListOrdered className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Queue is empty</p>
              <p className="text-xs text-muted-foreground mt-1">
                {statusFilter !== "all"
                  ? `No ${statusFilter} emails found.`
                  : "Emails will appear here as they enter the delivery pipeline."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Purge Confirmation */}
      <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge all failed jobs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {stats?.failed ?? 0} failed email jobs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => purgeMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {purgeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Purge Failed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
