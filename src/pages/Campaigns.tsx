import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus, Megaphone, Search, Loader2, Trash2, Eye, Send, Pause, Play,
  BarChart3, Users, Mail, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  from_address: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  delivered_count: number;
  bounced_count: number;
  opened_count: number;
  clicked_count: number;
  open_tracking: boolean;
  click_tracking: boolean;
  scheduled_at: string | null;
  sent_at: string | null;
  completed_at: string | null;
  created_at: string;
  html_body: string | null;
}

const statusFilterOptions = ["all", "draft", "scheduled", "sending", "sent", "paused", "cancelled"] as const;

const campaignStatusMap: Record<string, "queued" | "processing" | "sent" | "delivered" | "failed" | "warning"> = {
  draft: "queued",
  scheduled: "processing",
  sending: "processing",
  sent: "sent",
  paused: "warning",
  cancelled: "failed",
};

export default function Campaigns() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns", statusFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (search.trim()) {
        query = query.or(`name.ilike.%${search.trim()}%,subject.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Campaign[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setDeleteId(null);
      toast.success("Campaign deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "sending") updates.sent_at = new Date().toISOString();
      if (status === "sent") updates.completed_at = new Date().toISOString();

      const { error } = await supabase.from("campaigns").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campaign updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const stats = {
    total: campaigns?.length ?? 0,
    draft: campaigns?.filter((c) => c.status === "draft").length ?? 0,
    sending: campaigns?.filter((c) => c.status === "sending").length ?? 0,
    sent: campaigns?.filter((c) => c.status === "sent").length ?? 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-1">Create and manage email campaigns.</p>
          </div>
          <Button className="gap-2" onClick={() => navigate("/compose")}>
            <Plus className="h-4 w-4" /> New Campaign
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, icon: Megaphone, color: "text-primary" },
            { label: "Drafts", value: stats.draft, icon: Mail, color: "text-muted-foreground" },
            { label: "Sending", value: stats.sending, icon: Send, color: "text-warning" },
            { label: "Completed", value: stats.sent, icon: CheckCircle, color: "text-success" },
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

        {/* Toolbar */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search campaigns…"
                className="pl-9 bg-transparent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusFilterOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns && campaigns.length > 0 ? (
            <div className="divide-y divide-border">
              {campaigns.map((campaign) => {
                const openRate = campaign.sent_count > 0
                  ? ((campaign.opened_count / campaign.sent_count) * 100).toFixed(1)
                  : "0.0";
                const clickRate = campaign.sent_count > 0
                  ? ((campaign.clicked_count / campaign.sent_count) * 100).toFixed(1)
                  : "0.0";

                return (
                  <div
                    key={campaign.id}
                    className="p-4 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Campaign info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {campaign.name}
                          </h3>
                          <StatusBadge
                            status={campaignStatusMap[campaign.status] || "queued"}
                            label={campaign.status}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {campaign.subject} · {campaign.from_address}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Created {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}
                          {campaign.scheduled_at && ` · Scheduled for ${new Date(campaign.scheduled_at).toLocaleString()}`}
                        </p>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-5 text-xs shrink-0">
                        <div className="text-center">
                          <p className="text-muted-foreground">Recipients</p>
                          <p className="font-semibold text-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" /> {campaign.recipient_count}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground">Sent</p>
                          <p className="font-semibold text-foreground">{campaign.sent_count}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground">Open Rate</p>
                          <p className="font-semibold text-foreground">{openRate}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground">Click Rate</p>
                          <p className="font-semibold text-foreground">{clickRate}%</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDetailCampaign(campaign)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {campaign.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateStatusMutation.mutate({ id: campaign.id, status: "sending" })}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {campaign.status === "sending" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateStatusMutation.mutate({ id: campaign.id, status: "paused" })}
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {campaign.status === "paused" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateStatusMutation.mutate({ id: campaign.id, status: "sending" })}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(campaign.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-3 rounded-xl bg-muted mb-3">
                <Megaphone className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No campaigns found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {statusFilter !== "all"
                  ? `No ${statusFilter} campaigns.`
                  : "Create your first campaign to start sending bulk emails."}
              </p>
              <Button onClick={() => navigate("/compose")} className="mt-4 gap-2">
                <Plus className="h-4 w-4" /> New Campaign
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Campaign Detail Dialog */}
      <Dialog open={!!detailCampaign} onOpenChange={() => setDetailCampaign(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailCampaign?.name}</DialogTitle>
            <DialogDescription>{detailCampaign?.subject}</DialogDescription>
          </DialogHeader>
          {detailCampaign && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Recipients", value: detailCampaign.recipient_count },
                  { label: "Sent", value: detailCampaign.sent_count },
                  { label: "Delivered", value: detailCampaign.delivered_count },
                  { label: "Bounced", value: detailCampaign.bounced_count },
                ].map((s) => (
                  <div key={s.label} className="bg-secondary rounded-md p-3 text-center">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-lg font-bold">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary rounded-md p-3 text-center">
                  <p className="text-xs text-muted-foreground">Open Rate</p>
                  <p className="text-lg font-bold">
                    {detailCampaign.sent_count > 0
                      ? ((detailCampaign.opened_count / detailCampaign.sent_count) * 100).toFixed(1)
                      : "0.0"}%
                  </p>
                </div>
                <div className="bg-secondary rounded-md p-3 text-center">
                  <p className="text-xs text-muted-foreground">Click Rate</p>
                  <p className="text-lg font-bold">
                    {detailCampaign.sent_count > 0
                      ? ((detailCampaign.clicked_count / detailCampaign.sent_count) * 100).toFixed(1)
                      : "0.0"}%
                  </p>
                </div>
              </div>
              {detailCampaign.html_body && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Email Preview</p>
                  <div className="bg-white rounded-md border border-border overflow-hidden">
                    <iframe
                      srcDoc={detailCampaign.html_body}
                      className="w-full min-h-[300px] border-0"
                      title="Campaign Preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the campaign and all its recipient data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
