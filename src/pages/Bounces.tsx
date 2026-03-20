import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Upload, Trash2, ShieldBan, Search, Loader2, Plus, AlertTriangle, Ban, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, subDays, subHours } from "date-fns";

interface Bounce {
  id: string;
  email: string;
  bounce_type: string;
  bounce_code: string | null;
  reason: string | null;
  attempts: number;
  created_at: string;
}

interface Suppression {
  id: string;
  email: string;
  reason: string;
  added_by: string;
  created_at: string;
}

export default function Bounces() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [suppSearch, setSuppSearch] = useState("");
  const [selectedBounces, setSelectedBounces] = useState<string[]>([]);
  const [selectedSuppressions, setSelectedSuppressions] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "bounce" | "suppression"; ids: string[] } | null>(null);
  const [addSuppEmail, setAddSuppEmail] = useState("");
  const [showAddSupp, setShowAddSupp] = useState(false);

  // Complaints state
  const [complaintSearch, setComplaintSearch] = useState("");
  const [complaintDateRange, setComplaintDateRange] = useState("7d");
  const [complaintFeedbackType, setComplaintFeedbackType] = useState("all");

  // Bounces query
  const { data: bounces, isLoading: bouncesLoading } = useQuery({
    queryKey: ["bounces", typeFilter, search],
    queryFn: async () => {
      let query = supabase.from("bounces").select("*").order("created_at", { ascending: false });
      if (typeFilter !== "all") query = query.eq("bounce_type", typeFilter);
      if (search.trim()) query = query.ilike("email", `%${search.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data as Bounce[];
    },
  });

  // Suppression query
  const { data: suppressions, isLoading: suppLoading } = useQuery({
    queryKey: ["suppression-list", suppSearch],
    queryFn: async () => {
      let query = supabase.from("suppression_list").select("*").order("created_at", { ascending: false });
      if (suppSearch.trim()) query = query.ilike("email", `%${suppSearch.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data as Suppression[];
    },
  });

  // Complaints query — from email_logs where event_type = 'complaint'
  const { data: complaints, isLoading: complaintsLoading } = useQuery({
    queryKey: ["complaints", complaintSearch, complaintDateRange, complaintFeedbackType],
    queryFn: async () => {
      const dateMap: Record<string, Date> = {
        "24h": subHours(new Date(), 24),
        "7d": subDays(new Date(), 7),
        "30d": subDays(new Date(), 30),
        "90d": subDays(new Date(), 90),
      };
      const since = dateMap[complaintDateRange] || subDays(new Date(), 7);

      let query = supabase
        .from("email_logs")
        .select("*")
        .eq("event_type", "complaint")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });

      if (complaintSearch.trim()) {
        query = query.ilike("to_address", `%${complaintSearch.trim()}%`);
      }

      if (complaintFeedbackType !== "all") {
        // feedback type stored in metadata->feedback_type
        query = query.contains("metadata", { feedback_type: complaintFeedbackType });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Add to suppression from bounces
  const addToSuppressionMutation = useMutation({
    mutationFn: async (emails: string[]) => {
      const rows = emails.map((email) => ({
        user_id: user!.id,
        email,
        reason: "Hard bounce",
        added_by: "System",
      }));
      const { error } = await supabase.from("suppression_list").upsert(rows, { onConflict: "user_id,email" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppression-list"] });
      setSelectedBounces([]);
      toast.success("Added to suppression list");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Add manual suppression
  const addManualSuppMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.from("suppression_list").insert({
        user_id: user!.id,
        email: email.trim(),
        reason: "Manual",
        added_by: "Admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppression-list"] });
      setAddSuppEmail("");
      setShowAddSupp(false);
      toast.success("Email added to suppression list");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ type, ids }: { type: "bounce" | "suppression"; ids: string[] }) => {
      const table = type === "bounce" ? "bounces" : "suppression_list";
      const { error } = await supabase.from(table).delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, { type }) => {
      queryClient.invalidateQueries({ queryKey: type === "bounce" ? ["bounces"] : ["suppression-list"] });
      if (type === "bounce") setSelectedBounces([]);
      else setSelectedSuppressions([]);
      setDeleteTarget(null);
      toast.success("Deleted successfully");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Export suppression CSV
  const exportCSV = () => {
    if (!suppressions?.length) return;
    const csv = ["Email,Reason,Added By,Date"]
      .concat(suppressions.map((s) => `${s.email},${s.reason},${s.added_by},${s.created_at}`))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "suppression-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSuppressSelected = () => {
    const emails = bounces?.filter((b) => selectedBounces.includes(b.id)).map((b) => b.email) ?? [];
    if (emails.length === 0) {
      toast.error("Select bounces to suppress");
      return;
    }
    addToSuppressionMutation.mutate(emails);
  };

  const bounceStats = {
    total: bounces?.length ?? 0,
    hard: bounces?.filter((b) => b.bounce_type === "hard").length ?? 0,
    soft: bounces?.filter((b) => b.bounce_type === "soft").length ?? 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Bounce & Suppression Management</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Bounces", value: bounceStats.total, icon: AlertTriangle, color: "text-warning" },
            { label: "Hard Bounces", value: bounceStats.hard, icon: Ban, color: "text-destructive" },
            { label: "Soft Bounces", value: bounceStats.soft, icon: AlertTriangle, color: "text-warning" },
            { label: "Suppressed", value: suppressions?.length ?? 0, icon: ShieldBan, color: "text-primary" },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="bounces">
          <TabsList>
            <TabsTrigger value="bounces">Bounces</TabsTrigger>
            <TabsTrigger value="complaints">Complaints</TabsTrigger>
            <TabsTrigger value="suppression">Suppression List</TabsTrigger>
          </TabsList>

          {/* Bounces Tab */}
          <TabsContent value="bounces" className="mt-4">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by email" className="pl-9 bg-transparent" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                    <SelectItem value="soft">Soft</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline" size="sm" className="ml-auto gap-1"
                  disabled={selectedBounces.length === 0 || addToSuppressionMutation.isPending}
                  onClick={handleSuppressSelected}
                >
                  {addToSuppressionMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldBan className="h-3 w-3" />}
                  Suppress Selected ({selectedBounces.length})
                </Button>
                {selectedBounces.length > 0 && (
                  <Button
                    variant="destructive" size="sm" className="gap-1"
                    onClick={() => setDeleteTarget({ type: "bounce", ids: selectedBounces })}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                )}
              </div>

              {bouncesLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : bounces && bounces.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-3 w-10">
                          <Checkbox
                            checked={selectedBounces.length === bounces.length && bounces.length > 0}
                            onCheckedChange={(c) => setSelectedBounces(c ? bounces.map((b) => b.id) : [])}
                          />
                        </th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Email Address</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Code</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reason</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Attempts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bounces.map((b) => (
                        <tr key={b.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                          <td className="p-3">
                            <Checkbox
                              checked={selectedBounces.includes(b.id)}
                              onCheckedChange={(c) =>
                                setSelectedBounces(c ? [...selectedBounces, b.id] : selectedBounces.filter((id) => id !== b.id))
                              }
                            />
                          </td>
                          <td className="p-3 font-medium">{b.email}</td>
                          <td className="p-3"><StatusBadge status={b.bounce_type as "hard" | "soft"} /></td>
                          <td className="p-3 text-muted-foreground">{b.bounce_code || "—"}</td>
                          <td className="p-3 text-muted-foreground max-w-[200px] truncate">{b.reason || "—"}</td>
                          <td className="p-3 text-muted-foreground text-xs">{formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}</td>
                          <td className="p-3 text-center">{b.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-3 rounded-xl bg-muted mb-3"><AlertTriangle className="h-6 w-6 text-muted-foreground" /></div>
                  <p className="text-sm font-medium">No bounces recorded</p>
                  <p className="text-xs text-muted-foreground mt-1">Bounced emails will appear here automatically.</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Complaints Tab */}
          <TabsContent value="complaints" className="mt-4">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by recipient email"
                    className="pl-9 bg-transparent"
                    value={complaintSearch}
                    onChange={(e) => setComplaintSearch(e.target.value)}
                  />
                </div>
                <Select value={complaintFeedbackType} onValueChange={setComplaintFeedbackType}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Feedback Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="abuse">Abuse</SelectItem>
                    <SelectItem value="fraud">Fraud</SelectItem>
                    <SelectItem value="virus">Virus</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="not-spam">Not Spam</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={complaintDateRange} onValueChange={setComplaintDateRange}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Last 24 hours</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {complaintsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : complaints && complaints.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Recipient</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">From</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Feedback Type</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Source</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Response</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complaints.map((c) => {
                        const meta = (c.metadata || {}) as Record<string, string>;
                        return (
                          <tr key={c.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                            <td className="p-3 font-medium">{c.to_address}</td>
                            <td className="p-3 text-muted-foreground">{c.from_address}</td>
                            <td className="p-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                                <MessageSquareWarning className="h-3 w-3" />
                                {meta.feedback_type || "abuse"}
                              </span>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">{meta.source || "fbl"}</td>
                            <td className="p-3 text-muted-foreground max-w-[200px] truncate text-xs">{c.smtp_response || "—"}</td>
                            <td className="p-3 text-muted-foreground text-xs">
                              {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-3 rounded-xl bg-muted mb-3">
                    <MessageSquareWarning className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No complaints recorded</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    FBL complaints and spam reports will appear here automatically.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="suppression" className="mt-4">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by email" className="pl-9 bg-transparent" value={suppSearch} onChange={(e) => setSuppSearch(e.target.value)} />
                </div>
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowAddSupp(true)}>
                    <Plus className="h-3 w-3" /> Add Email
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={exportCSV} disabled={!suppressions?.length}>
                    <Download className="h-3 w-3" /> Export CSV
                  </Button>
                  {selectedSuppressions.length > 0 && (
                    <Button
                      variant="destructive" size="sm" className="gap-1"
                      onClick={() => setDeleteTarget({ type: "suppression", ids: selectedSuppressions })}
                    >
                      <Trash2 className="h-3 w-3" /> Remove ({selectedSuppressions.length})
                    </Button>
                  )}
                </div>
              </div>

              {/* Add email inline form */}
              {showAddSupp && (
                <div className="p-4 border-b border-border flex gap-2 items-center bg-muted/30">
                  <Input
                    placeholder="email@example.com"
                    value={addSuppEmail}
                    onChange={(e) => setAddSuppEmail(e.target.value)}
                    className="max-w-xs"
                    onKeyDown={(e) => e.key === "Enter" && addSuppEmail.includes("@") && addManualSuppMutation.mutate(addSuppEmail)}
                  />
                  <Button
                    size="sm"
                    disabled={!addSuppEmail.includes("@") || addManualSuppMutation.isPending}
                    onClick={() => addManualSuppMutation.mutate(addSuppEmail)}
                  >
                    {addManualSuppMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowAddSupp(false); setAddSuppEmail(""); }}>Cancel</Button>
                </div>
              )}

              {suppLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : suppressions && suppressions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-3 w-10">
                          <Checkbox
                            checked={selectedSuppressions.length === suppressions.length && suppressions.length > 0}
                            onCheckedChange={(c) => setSelectedSuppressions(c ? suppressions.map((s) => s.id) : [])}
                          />
                        </th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Email Address</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reason</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date Added</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Added By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppressions.map((s) => (
                        <tr key={s.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                          <td className="p-3">
                            <Checkbox
                              checked={selectedSuppressions.includes(s.id)}
                              onCheckedChange={(c) =>
                                setSelectedSuppressions(c ? [...selectedSuppressions, s.id] : selectedSuppressions.filter((id) => id !== s.id))
                              }
                            />
                          </td>
                          <td className="p-3 font-medium">{s.email}</td>
                          <td className="p-3 text-muted-foreground">{s.reason}</td>
                          <td className="p-3 text-muted-foreground text-xs">{formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</td>
                          <td className="p-3 text-muted-foreground">{s.added_by}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-3 rounded-xl bg-muted mb-3"><ShieldBan className="h-6 w-6 text-muted-foreground" /></div>
                  <p className="text-sm font-medium">No suppressed addresses</p>
                  <p className="text-xs text-muted-foreground mt-1">Addresses added here will be blocked from receiving emails.</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.ids.length} {deleteTarget?.type === "bounce" ? "bounce(s)" : "suppression(s)"}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
