import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus, Globe, RefreshCw, Loader2, CheckCircle, XCircle, AlertTriangle,
  ChevronDown, Trash2, Shield, Mail, ArrowRightLeft, Server,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SendingDomain {
  id: string;
  domain: string;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
  mx_status: string;
  ptr_status: string;
  verified: boolean;
  dkim_selector: string | null;
  smtp_server_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SmtpServer {
  id: string;
  hostname: string;
  ip_address: string;
}

interface RecordResult {
  status: "valid" | "invalid" | "missing";
  records: string[];
  details: string;
}

interface DnsResults {
  spf: RecordResult;
  dkim: RecordResult;
  dmarc: RecordResult;
  mx: RecordResult;
  ptr: RecordResult;
  checked_at: string;
}

const recordMeta: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  spf: { label: "SPF Record", icon: Shield, description: "Specifies which servers are allowed to send email for your domain." },
  dkim: { label: "DKIM Record", icon: Mail, description: "Cryptographically signs emails to verify they haven't been tampered with." },
  dmarc: { label: "DMARC Record", icon: Shield, description: "Tells receiving servers how to handle failed SPF/DKIM checks." },
  mx: { label: "MX Records", icon: ArrowRightLeft, description: "Points to mail servers that accept email for your domain." },
  ptr: { label: "PTR (Reverse DNS)", icon: Server, description: "Maps your server IP back to your domain name." },
};

const statusConfig = {
  valid: { icon: CheckCircle, color: "text-success", bg: "bg-success/10", label: "Valid" },
  invalid: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Invalid" },
  missing: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", label: "Missing" },
  unchecked: { icon: Globe, color: "text-muted-foreground", bg: "bg-muted", label: "Unchecked" },
};

export default function DnsHealth() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [newSelector, setNewSelector] = useState("default");
  const [newServerId, setNewServerId] = useState<string>("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [dnsResults, setDnsResults] = useState<Record<string, DnsResults>>({});

  const { data: domains, isLoading } = useQuery({
    queryKey: ["sending-domains"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sending_domains")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SendingDomain[];
    },
  });

  const { data: servers } = useQuery({
    queryKey: ["smtp-servers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("smtp_servers")
        .select("id, hostname, ip_address")
        .order("hostname");
      if (error) throw error;
      return data as SmtpServer[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sending_domains").insert({
        domain: newDomain.trim().toLowerCase(),
        dkim_selector: newSelector.trim() || "default",
        smtp_server_id: newServerId || null,
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sending-domains"] });
      setAddOpen(false);
      setNewDomain("");
      setNewSelector("default");
      setNewServerId("");
      toast.success("Domain added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sending_domains").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sending-domains"] });
      setDeleteId(null);
      toast.success("Domain removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleVerify = async (domain: SendingDomain) => {
    setVerifyingId(domain.id);
    try {
      const { data, error } = await supabase.functions.invoke("verify-dns", {
        body: {
          domain_id: domain.id,
          domain: domain.domain,
          dkim_selector: domain.dkim_selector || "default",
        },
      });
      if (error) throw error;
      setDnsResults((prev) => ({ ...prev, [domain.id]: data as DnsResults }));
      queryClient.invalidateQueries({ queryKey: ["sending-domains"] });
      toast.success(`DNS check complete for ${domain.domain}`);
    } catch (err) {
      toast.error("DNS verification failed: " + (err as Error).message);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleVerifyAll = async () => {
    if (!domains?.length) return;
    for (const domain of domains) {
      await handleVerify(domain);
    }
  };

  const getStatusConfig = (status: string) => statusConfig[status as keyof typeof statusConfig] || statusConfig.unchecked;

  const getOverallHealth = (domain: SendingDomain) => {
    const checks = [domain.spf_status, domain.dkim_status, domain.dmarc_status, domain.mx_status, domain.ptr_status];
    const valid = checks.filter((c) => c === "valid").length;
    const missing = checks.filter((c) => c === "missing").length;
    const invalid = checks.filter((c) => c === "invalid").length;
    const unchecked = checks.filter((c) => c === "unchecked").length;

    if (unchecked === 5) return { score: 0, label: "Not checked", color: "text-muted-foreground" };
    if (valid === 5) return { score: 100, label: "Excellent", color: "text-success" };
    if (invalid > 0 || missing > 1) return { score: Math.round((valid / 5) * 100), label: "Needs attention", color: "text-destructive" };
    return { score: Math.round((valid / 5) * 100), label: "Good", color: "text-warning" };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">DNS Health</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Verify SPF, DKIM, DMARC, MX, and PTR records for your sending domains.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={handleVerifyAll} disabled={!domains?.length || !!verifyingId}>
              <RefreshCw className={cn("h-4 w-4", verifyingId && "animate-spin")} /> Re-check All
            </Button>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Domain
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : domains && domains.length > 0 ? (
          <div className="space-y-6">
            {domains.map((domain) => {
              const health = getOverallHealth(domain);
              const results = dnsResults[domain.id];
              const checks = ["spf", "dkim", "dmarc", "mx", "ptr"] as const;

              return (
                <div key={domain.id} className="bg-card border border-border rounded-lg overflow-hidden">
                  {/* Domain header */}
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={cn("p-2.5 rounded-lg", domain.verified ? "bg-success/10" : "bg-muted")}>
                        <Globe className={cn("h-5 w-5", domain.verified ? "text-success" : "text-muted-foreground")} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{domain.domain}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          DKIM selector: <span className="font-mono">{domain.dkim_selector || "default"}</span>
                        </p>
                      </div>
                    </div>

                    {/* Health score */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className={cn("text-sm font-semibold", health.color)}>{health.label}</p>
                        <p className="text-xs text-muted-foreground">{health.score}% healthy</p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={verifyingId === domain.id}
                        onClick={() => handleVerify(domain)}
                      >
                        {verifyingId === domain.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Verify
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(domain.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* DNS Record badges summary */}
                  <div className="px-5 pb-2 flex flex-wrap gap-2">
                    {checks.map((check) => {
                      const status = domain[`${check}_status` as keyof SendingDomain] as string;
                      const cfg = getStatusConfig(status);
                      const Icon = cfg.icon;
                      return (
                        <span
                          key={check}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
                            cfg.bg, cfg.color
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {recordMeta[check].label}
                        </span>
                      );
                    })}
                  </div>

                  {/* Detailed results (shown after verification) */}
                  {results && (
                    <div className="border-t border-border">
                      {checks.map((check) => {
                        const result = results[check];
                        const meta = recordMeta[check];
                        const cfg = statusConfig[result.status];
                        const Icon = cfg.icon;

                        return (
                          <Collapsible key={check}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full px-5 py-3 hover:bg-accent/30 transition-colors border-b border-border last:border-0">
                              <div className="flex items-center gap-3">
                                <Icon className={cn("h-4 w-4", cfg.color)} />
                                <div className="text-left">
                                  <p className="text-sm font-medium text-foreground">{meta.label}</p>
                                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={cn("text-xs font-semibold", cfg.color)}>{cfg.label}</span>
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="px-5 pb-4 pt-2">
                              <div className="bg-secondary rounded-lg p-4 space-y-3">
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Analysis</p>
                                  <p className="text-sm text-foreground">{result.details}</p>
                                </div>
                                {result.records.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">
                                      Record{result.records.length > 1 ? "s" : ""} Found
                                    </p>
                                    <div className="space-y-1">
                                      {result.records.map((rec, i) => (
                                        <p key={i} className="text-xs font-mono text-foreground bg-background rounded px-2 py-1.5 break-all">
                                          {rec}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                      <div className="px-5 py-2 text-xs text-muted-foreground border-t border-border">
                        Last checked: {new Date(results.checked_at).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-2xl bg-muted mb-4">
              <Globe className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">No sending domains</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Add your sending domains to verify their DNS records and ensure optimal deliverability.
            </p>
            <Button onClick={() => setAddOpen(true)} className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> Add Your First Domain
            </Button>
          </div>
        )}
      </div>

      {/* Add Domain Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Sending Domain</DialogTitle>
            <DialogDescription>
              Enter the domain you send emails from. We'll verify its DNS records.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newDomain.trim()) return;
              addMutation.mutate();
            }}
            className="space-y-4 mt-2"
          >
            <div className="space-y-2">
              <Label>Domain *</Label>
              <Input
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>DKIM Selector</Label>
              <Input
                placeholder="default"
                value={newSelector}
                onChange={(e) => setNewSelector(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">The DKIM selector used in your DNS record (e.g., "default", "mail", "s1").</p>
            </div>
            <div className="space-y-2">
              <Label>Linked SMTP Server</Label>
              <Select value={newServerId} onValueChange={setNewServerId}>
                <SelectTrigger>
                  <SelectValue placeholder="None (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {servers?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.hostname} ({s.ip_address})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Link to an SMTP server for PTR (reverse DNS) verification.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Domain
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this domain?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the domain and its DNS verification history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
