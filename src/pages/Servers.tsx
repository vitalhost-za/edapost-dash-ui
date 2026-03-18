import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Plus, Server, Trash2, Pencil, Wifi, WifiOff, Loader2, RefreshCw, Shield,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface SmtpServer {
  id: string;
  hostname: string;
  ip_address: string;
  port: number;
  status: string;
  tls_enabled: boolean;
  max_connections: number;
  current_connections: number;
  queue_size: number;
  postfix_version: string | null;
  last_heartbeat: string | null;
  created_at: string;
  updated_at: string;
}

type ServerFormData = {
  hostname: string;
  ip_address: string;
  port: number;
  tls_enabled: boolean;
  max_connections: number;
  postfix_version: string;
  status: string;
};

const defaultForm: ServerFormData = {
  hostname: "",
  ip_address: "",
  port: 25,
  tls_enabled: true,
  max_connections: 100,
  postfix_version: "",
  status: "offline",
};

export default function Servers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<SmtpServer | null>(null);
  const [form, setForm] = useState<ServerFormData>(defaultForm);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: servers, isLoading } = useQuery({
    queryKey: ["smtp-servers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("smtp_servers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SmtpServer[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (data: ServerFormData & { id?: string }) => {
      const payload = {
        hostname: data.hostname.trim(),
        ip_address: data.ip_address.trim(),
        port: data.port,
        tls_enabled: data.tls_enabled,
        max_connections: data.max_connections,
        postfix_version: data.postfix_version.trim() || null,
        status: data.status,
        user_id: user!.id,
      };

      if (data.id) {
        const { error } = await supabase.from("smtp_servers").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("smtp_servers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smtp-servers"] });
      setDialogOpen(false);
      setEditingServer(null);
      setForm(defaultForm);
      toast.success(editingServer ? "Server updated" : "Server added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("smtp_servers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smtp-servers"] });
      setDeleteId(null);
      toast.success("Server removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleTestConnection = async (server: SmtpServer) => {
    setTestingId(server.id);

    try {
      const { data, error } = await supabase.functions.invoke("test-smtp-connection", {
        body: {
          server_id: server.id,
          hostname: server.hostname,
          ip_address: server.ip_address,
          port: server.port,
          tls_enabled: server.tls_enabled,
        },
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["smtp-servers"] });

      if (data.success) {
        const details = [
          data.banner && `Banner: ${data.banner}`,
          `Latency: ${data.latency_ms}ms`,
          data.tls_ok ? "TLS: ✓" : server.tls_enabled ? "TLS: not supported" : null,
        ].filter(Boolean).join(" · ");

        toast.success(`Connection to ${server.hostname} successful`, {
          description: details,
        });
      } else {
        toast.error(`Connection to ${server.hostname} failed`, {
          description: data.error || "Could not reach the server",
        });
      }
    } catch (err) {
      toast.error("Connection test error", {
        description: (err as Error).message,
      });
    } finally {
      setTestingId(null);
    }
  };

  const openEdit = (server: SmtpServer) => {
    setEditingServer(server);
    setForm({
      hostname: server.hostname,
      ip_address: server.ip_address,
      port: server.port,
      tls_enabled: server.tls_enabled,
      max_connections: server.max_connections,
      postfix_version: server.postfix_version || "",
      status: server.status,
    });
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditingServer(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.hostname || !form.ip_address) {
      toast.error("Hostname and IP address are required");
      return;
    }
    upsertMutation.mutate({ ...form, id: editingServer?.id });
  };

  const statusMap: Record<string, "sent" | "failed" | "warning" | "processing"> = {
    online: "sent",
    offline: "failed",
    degraded: "warning",
    maintenance: "processing",
  };

  const getTimeSince = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SMTP Servers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your Postfix mail servers and monitor their status.
            </p>
          </div>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Add Server
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : servers && servers.length > 0 ? (
          <div className="grid gap-4">
            {servers.map((server) => (
              <div
                key={server.id}
                className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Server info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={cn(
                      "p-2.5 rounded-lg shrink-0",
                      server.status === "online" ? "bg-success/10" : "bg-muted"
                    )}>
                      {server.status === "online" ? (
                        <Wifi className="h-5 w-5 text-success" />
                      ) : (
                        <WifiOff className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {server.hostname}
                        </h3>
                        <StatusBadge
                          status={statusMap[server.status] || "failed"}
                          label={server.status}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        {server.ip_address} : {server.port}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6 text-sm shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Queue</p>
                      <p className="font-semibold text-foreground">{server.queue_size.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Connections</p>
                      <p className="font-semibold text-foreground">
                        {server.current_connections}/{server.max_connections}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">TLS</p>
                      <p className="font-semibold text-foreground">
                        {server.tls_enabled ? (
                          <Shield className="h-4 w-4 text-success inline" />
                        ) : (
                          <span className="text-warning text-xs">Off</span>
                        )}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Heartbeat</p>
                      <p className="text-xs font-medium text-foreground">
                        {getTimeSince(server.last_heartbeat)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={testingId === server.id}
                      onClick={() => handleTestConnection(server)}
                    >
                      {testingId === server.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Test
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(server)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(server.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Extra info row */}
                {server.postfix_version && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Postfix {server.postfix_version}</span>
                    <span>Added {new Date(server.created_at).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-2xl bg-muted mb-4">
              <Server className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">No SMTP servers yet</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Add your first Postfix SMTP server to start managing your email infrastructure.
            </p>
            <Button onClick={openAdd} className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> Add Your First Server
            </Button>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingServer ? "Edit Server" : "Add SMTP Server"}</DialogTitle>
            <DialogDescription>
              {editingServer
                ? "Update your Postfix server configuration."
                : "Enter the details of your Postfix SMTP server."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Hostname *</Label>
                <Input
                  placeholder="mail.example.com"
                  value={form.hostname}
                  onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>IP Address *</Label>
                <Input
                  placeholder="198.51.100.42"
                  value={form.ip_address}
                  onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 25 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Connections</Label>
                <Input
                  type="number"
                  value={form.max_connections}
                  onChange={(e) => setForm({ ...form, max_connections: parseInt(e.target.value) || 100 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Postfix Version</Label>
                <Input
                  placeholder="3.8.1"
                  value={form.postfix_version}
                  onChange={(e) => setForm({ ...form, postfix_version: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="degraded">Degraded</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm">TLS Encryption</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Enable STARTTLS for secure connections</p>
                </div>
                <Switch
                  checked={form.tls_enabled}
                  onCheckedChange={(v) => setForm({ ...form, tls_enabled: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingServer ? "Save Changes" : "Add Server"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this server?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the server and all associated warmup schedules. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove Server
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
