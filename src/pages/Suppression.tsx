import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Upload, Trash2, ShieldBan, Search, Loader2, Plus, FileUp } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Suppression {
  id: string;
  email: string;
  reason: string;
  added_by: string;
  created_at: string;
}

export default function SuppressionPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addReason, setAddReason] = useState("Manual");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: suppressions, isLoading } = useQuery({
    queryKey: ["suppression-list", search, reasonFilter],
    queryFn: async () => {
      let query = supabase
        .from("suppression_list")
        .select("*")
        .order("created_at", { ascending: false });
      if (search.trim()) query = query.ilike("email", `%${search.trim()}%`);
      if (reasonFilter !== "all") query = query.eq("reason", reasonFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data as Suppression[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.from("suppression_list").insert({
        user_id: user!.id,
        email: email.trim().toLowerCase(),
        reason: addReason,
        added_by: "Admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppression-list"] });
      setAddEmail("");
      setShowAdd(false);
      toast.success("Email added to suppression list");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("suppression_list").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppression-list"] });
      setSelected([]);
      setShowDeleteConfirm(false);
      toast.success("Removed from suppression list");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const exportCSV = () => {
    if (!suppressions?.length) return;
    const csv = ["Email,Reason,Added By,Date"]
      .concat(suppressions.map((s) => `"${s.email}","${s.reason}","${s.added_by}","${s.created_at}"`))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "suppression-list.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      // Skip header if it looks like one
      const start = lines[0]?.toLowerCase().includes("email") ? 1 : 0;
      const emails = lines.slice(start).map((l) => {
        const parts = l.split(",");
        return parts[0].replace(/"/g, "").trim().toLowerCase();
      }).filter((e) => e.includes("@"));

      if (emails.length === 0) {
        toast.error("No valid emails found in CSV");
        return;
      }

      const rows = emails.map((email) => ({
        user_id: user!.id,
        email,
        reason: "CSV Import",
        added_by: "Admin",
      }));

      // Batch insert in chunks of 100
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error } = await supabase.from("suppression_list").upsert(chunk, { onConflict: "user_id,email" });
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["suppression-list"] });
      toast.success(`Imported ${emails.length} email(s)`);
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const allSelected = suppressions && suppressions.length > 0 && selected.length === suppressions.length;

  const reasons = ["all", "Hard bounce", "Soft bounce", "Complaint", "Manual", "Unsubscribe", "CSV Import"];

  const stats = {
    total: suppressions?.length ?? 0,
    manual: suppressions?.filter((s) => s.reason === "Manual").length ?? 0,
    bounce: suppressions?.filter((s) => s.reason.toLowerCase().includes("bounce")).length ?? 0,
    complaint: suppressions?.filter((s) => s.reason === "Complaint").length ?? 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Suppression List</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage emails that should never receive messages.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Email
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
              Import CSV
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV} disabled={!suppressions?.length}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Suppressed", value: stats.total, icon: ShieldBan, color: "text-primary" },
            { label: "From Bounces", value: stats.bounce, icon: ShieldBan, color: "text-destructive" },
            { label: "Complaints", value: stats.complaint, icon: ShieldBan, color: "text-warning" },
            { label: "Manual", value: stats.manual, icon: ShieldBan, color: "text-muted-foreground" },
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

        {/* Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by email…" className="pl-9 bg-transparent" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Reason" /></SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>{r === "all" ? "All Reasons" : r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected.length > 0 && (
              <Button variant="destructive" size="sm" className="gap-1 ml-auto" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="h-3 w-3" /> Remove ({selected.length})
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : suppressions && suppressions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(c) => setSelected(c ? suppressions.map((s) => s.id) : [])}
                      />
                    </th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Email Address</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reason</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Added By</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date Added</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {suppressions.map((s) => (
                    <tr key={s.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                      <td className="p-3">
                        <Checkbox
                          checked={selected.includes(s.id)}
                          onCheckedChange={(c) =>
                            setSelected(c ? [...selected, s.id] : selected.filter((id) => id !== s.id))
                          }
                        />
                      </td>
                      <td className="p-3 font-medium">{s.email}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-muted text-muted-foreground">
                          {s.reason}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{s.added_by}</td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate([s.id])}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-3 rounded-xl bg-muted mb-3"><ShieldBan className="h-6 w-6 text-muted-foreground" /></div>
              <p className="text-sm font-medium">No suppressed emails</p>
              <p className="text-xs text-muted-foreground mt-1">Add emails manually or import from CSV.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Email Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Suppression List</DialogTitle>
            <DialogDescription>This email will be blocked from receiving any future emails.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="email@example.com"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
            />
            <Select value={addReason} onValueChange={setAddReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Manual">Manual</SelectItem>
                <SelectItem value="Complaint">Complaint</SelectItem>
                <SelectItem value="Hard bounce">Hard bounce</SelectItem>
                <SelectItem value="Unsubscribe">Unsubscribe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate(addEmail)}
              disabled={!addEmail.includes("@") || addMutation.isPending}
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirm */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selected.length} email(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              These emails will be able to receive messages again. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(selected)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
