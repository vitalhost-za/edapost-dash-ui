import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Trash2, Copy, Loader2, Save, Key, Bell, Server, Settings2, Shield,
  CheckCircle, User, Camera, Webhook, ExternalLink, AlertTriangle, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface UserSettings {
  id: string;
  user_id: string;
  system_name: string;
  default_from_address: string;
  timezone: string;
  smtp_hostname: string | null;
  smtp_port: number | null;
  smtp_tls_mode: string;
  smtp_max_message_size: number | null;
  smtp_connection_limit: number | null;
  slack_webhook_url: string | null;
  alert_email: string | null;
  alert_bounce_rate: number | null;
  alert_complaint_rate: number | null;
  alert_queue_depth: number | null;
  notify_bounces: boolean;
  notify_complaints: boolean;
  notify_queue_full: boolean;
  notify_server_down: boolean;
  warmup_enabled: boolean;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  permissions: string;
  last_used_at: string | null;
  created_at: string;
}

interface WebhookEntry {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  last_status_code: number | null;
  failure_count: number;
  created_at: string;
}

const WEBHOOK_EVENTS = [
  { value: "email.sent", label: "Email Sent" },
  { value: "email.delivered", label: "Email Delivered" },
  { value: "email.bounced", label: "Email Bounced" },
  { value: "email.opened", label: "Email Opened" },
  { value: "email.clicked", label: "Link Clicked" },
  { value: "email.complained", label: "Spam Complaint" },
  { value: "email.deferred", label: "Email Deferred" },
  { value: "email.failed", label: "Email Failed" },
  { value: "server.online", label: "Server Online" },
  { value: "server.offline", label: "Server Offline" },
];

function generateApiKey(): { full: string; prefix: string; hash: string } {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "ep_";
  for (let i = 0; i < 40; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return { full: key, prefix: key.substring(0, 10) + "****" + key.substring(key.length - 4), hash: btoa(key) };
}

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Settings state
  const [settings, setSettings] = useState<Partial<UserSettings>>({});
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyPerms, setNewKeyPerms] = useState("full");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);

  // Webhook state
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookEntry | null>(null);
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [deleteWebhookId, setDeleteWebhookId] = useState<string | null>(null);

  // Fetch profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  // Save profile
  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName, avatar_url: avatarUrl })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Upload avatar
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File must be under 2MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user!.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
      toast.success("Avatar uploaded");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Fetch settings
  const { data: savedSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as UserSettings | null;
    },
  });

  useEffect(() => {
    if (savedSettings) setSettings(savedSettings);
  }, [savedSettings]);

  // Fetch API keys
  const { data: apiKeys, isLoading: keysLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ApiKey[];
    },
  });

  // Fetch domains for auth tab
  const { data: domains } = useQuery({
    queryKey: ["sending-domains"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sending_domains")
        .select("domain, spf_status, dkim_status, dmarc_status, dkim_selector, verified");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Save settings
  const saveMutation = useMutation({
    mutationFn: async (partial: Partial<UserSettings>) => {
      if (savedSettings?.id) {
        const { error } = await supabase
          .from("user_settings")
          .update(partial)
          .eq("id", savedSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_settings")
          .insert({ ...partial, user_id: user!.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("Settings saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Create API key
  const createKeyMutation = useMutation({
    mutationFn: async () => {
      const { full, prefix, hash } = generateApiKey();
      const { error } = await supabase.from("api_keys").insert({
        user_id: user!.id,
        name: newKeyName.trim() || "Untitled",
        key_prefix: prefix,
        key_hash: hash,
        permissions: newKeyPerms,
      });
      if (error) throw error;
      return full;
    },
    onSuccess: (key) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setGeneratedKey(key);
      setNewKeyName("");
      setNewKeyPerms("full");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete API key
  const deleteKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setDeleteKeyId(null);
      toast.success("API key deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateField = (key: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveGeneral = () => saveMutation.mutate({
    system_name: settings.system_name,
    default_from_address: settings.default_from_address,
    timezone: settings.timezone,
  });

  const handleSaveSmtp = () => saveMutation.mutate({
    smtp_hostname: settings.smtp_hostname,
    smtp_port: settings.smtp_port,
    smtp_tls_mode: settings.smtp_tls_mode,
    smtp_max_message_size: settings.smtp_max_message_size,
    smtp_connection_limit: settings.smtp_connection_limit,
  });

  const handleSaveNotifications = () => saveMutation.mutate({
    slack_webhook_url: settings.slack_webhook_url,
    alert_email: settings.alert_email,
    alert_bounce_rate: settings.alert_bounce_rate,
    alert_complaint_rate: settings.alert_complaint_rate,
    alert_queue_depth: settings.alert_queue_depth,
    notify_bounces: settings.notify_bounces,
    notify_complaints: settings.notify_complaints,
    notify_queue_full: settings.notify_queue_full,
    notify_server_down: settings.notify_server_down,
  });

  const handleSaveWarmup = () => saveMutation.mutate({
    warmup_enabled: settings.warmup_enabled,
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (settingsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

        <Tabs defaultValue="profile">
          <TabsList className="flex-wrap">
            <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
            <TabsTrigger value="general" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" /> General</TabsTrigger>
            <TabsTrigger value="smtp" className="gap-1.5"><Server className="h-3.5 w-3.5" /> SMTP</TabsTrigger>
            <TabsTrigger value="auth" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Authentication</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> Notifications</TabsTrigger>
            <TabsTrigger value="apikeys" className="gap-1.5"><Key className="h-3.5 w-3.5" /> API Keys</TabsTrigger>
          </TabsList>

          {/* Profile */}
          <TabsContent value="profile" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-6 max-w-2xl">
              <div className="flex items-center gap-6">
                <div className="relative group">
                  <Avatar className="h-20 w-20">
                    {avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt="Avatar" />
                    ) : null}
                    <AvatarFallback className="text-lg bg-primary/20 text-primary">
                      {displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 rounded-full transition-opacity"
                  >
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin text-foreground" /> : <Camera className="h-5 w-5 text-foreground" />}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Profile Photo</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG or GIF. Max 2MB.</p>
                  <Button variant="outline" size="sm" className="mt-1" onClick={() => avatarInputRef.current?.click()} disabled={uploading}>
                    {uploading ? "Uploading..." : "Change Photo"}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email ?? ""} disabled className="opacity-60" />
                <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
              </div>
              <Button className="gap-2" onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending}>
                {saveProfileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Profile
              </Button>
            </div>
          </TabsContent>

          {/* General */}
          <TabsContent value="general" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 max-w-2xl">
              <div className="space-y-2">
                <Label>System Name</Label>
                <Input value={settings.system_name ?? "EdaPost Production"} onChange={(e) => updateField("system_name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Default From Address</Label>
                <Input value={settings.default_from_address ?? ""} onChange={(e) => updateField("default_from_address", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={settings.timezone ?? "UTC"} onValueChange={(v) => updateField("timezone", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                    <SelectItem value="America/Chicago">America/Chicago</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                    <SelectItem value="Europe/London">Europe/London</SelectItem>
                    <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                    <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                    <SelectItem value="Asia/Shanghai">Asia/Shanghai</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="gap-2" onClick={handleSaveGeneral} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          </TabsContent>

          {/* SMTP */}
          <TabsContent value="smtp" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 max-w-2xl">
              <div className="space-y-2">
                <Label>Hostname</Label>
                <Input value={settings.smtp_hostname ?? ""} onChange={(e) => updateField("smtp_hostname", e.target.value)} placeholder="mail.yourdomain.com" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input type="number" value={settings.smtp_port ?? 587} onChange={(e) => updateField("smtp_port", parseInt(e.target.value) || 587)} />
                </div>
                <div className="space-y-2">
                  <Label>TLS Mode</Label>
                  <Select value={settings.smtp_tls_mode ?? "starttls"} onValueChange={(v) => updateField("smtp_tls_mode", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="starttls">STARTTLS</SelectItem>
                      <SelectItem value="tls">TLS/SSL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Message Size (MB)</Label>
                  <Input type="number" value={settings.smtp_max_message_size ?? 25} onChange={(e) => updateField("smtp_max_message_size", parseInt(e.target.value) || 25)} />
                </div>
                <div className="space-y-2">
                  <Label>Connection Limit</Label>
                  <Input type="number" value={settings.smtp_connection_limit ?? 100} onChange={(e) => updateField("smtp_connection_limit", parseInt(e.target.value) || 100)} />
                </div>
              </div>
              <Button className="gap-2" onClick={handleSaveSmtp} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          </TabsContent>

          {/* Authentication */}
          <TabsContent value="auth" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 max-w-2xl">
              <p className="text-sm text-muted-foreground">Email authentication status for your sending domains.</p>
              {domains && domains.length > 0 ? (
                domains.map((d) => (
                  <div key={d.domain} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{d.domain}</h3>
                      {d.verified ? (
                        <span className="text-xs font-medium text-success bg-success/15 px-2 py-0.5 rounded flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Verified</span>
                      ) : (
                        <span className="text-xs font-medium text-warning bg-warning/15 px-2 py-0.5 rounded">Unverified</span>
                      )}
                    </div>
                    {[
                      { label: "SPF", status: d.spf_status, hint: `v=spf1 include:_spf.${d.domain} ~all` },
                      { label: "DKIM", status: d.dkim_status, hint: `Selector: ${d.dkim_selector || "default"}._domainkey.${d.domain}` },
                      { label: "DMARC", status: d.dmarc_status, hint: `v=DMARC1; p=reject; rua=mailto:dmarc@${d.domain}` },
                    ].map((rec) => (
                      <div key={rec.label} className="bg-secondary rounded-md p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{rec.label}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{rec.hint}</p>
                        </div>
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded",
                          rec.status === "valid" ? "text-success bg-success/15" :
                          rec.status === "warning" ? "text-warning bg-warning/15" :
                          "text-destructive bg-destructive/15"
                        )}>
                          {rec.status === "valid" ? "Configured" : rec.status === "warning" ? "Weak" : rec.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No sending domains configured. Add domains in the DNS Health page.</p>
              )}
            </div>
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-5 max-w-2xl">
              <div className="space-y-2">
                <Label>Slack Webhook URL</Label>
                <Input
                  placeholder="https://hooks.slack.com/services/..."
                  value={settings.slack_webhook_url ?? ""}
                  onChange={(e) => updateField("slack_webhook_url", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Alert Email</Label>
                <Input
                  placeholder="alerts@company.com"
                  value={settings.alert_email ?? ""}
                  onChange={(e) => updateField("alert_email", e.target.value)}
                />
              </div>

              <h3 className="text-sm font-medium pt-2">Notification Events</h3>
              <div className="space-y-3">
                {[
                  { key: "notify_bounces", label: "Bounce alerts", desc: "Get notified when bounce rate exceeds threshold" },
                  { key: "notify_complaints", label: "Complaint alerts", desc: "Get notified about spam complaints" },
                  { key: "notify_queue_full", label: "Queue depth alerts", desc: "Alert when queue exceeds threshold" },
                  { key: "notify_server_down", label: "Server down alerts", desc: "Alert when an SMTP server goes offline" },
                ].map((n) => (
                  <div key={n.key} className="flex items-center justify-between bg-secondary rounded-md p-3">
                    <div>
                      <p className="text-sm font-medium">{n.label}</p>
                      <p className="text-xs text-muted-foreground">{n.desc}</p>
                    </div>
                    <Switch
                      checked={(settings as any)[n.key] ?? true}
                      onCheckedChange={(v) => updateField(n.key, v)}
                    />
                  </div>
                ))}
              </div>

              <h3 className="text-sm font-medium pt-2">Alert Thresholds</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Bounce Rate %</Label>
                  <Input type="number" step="0.1" value={settings.alert_bounce_rate ?? 5} onChange={(e) => updateField("alert_bounce_rate", parseFloat(e.target.value) || 5)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Complaint Rate %</Label>
                  <Input type="number" step="0.01" value={settings.alert_complaint_rate ?? 0.1} onChange={(e) => updateField("alert_complaint_rate", parseFloat(e.target.value) || 0.1)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Queue Depth</Label>
                  <Input type="number" value={settings.alert_queue_depth ?? 10000} onChange={(e) => updateField("alert_queue_depth", parseInt(e.target.value) || 10000)} />
                </div>
              </div>

              <Button className="gap-2" onClick={handleSaveNotifications} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Notifications
              </Button>
            </div>
          </TabsContent>

          {/* API Keys */}
          <TabsContent value="apikeys" className="mt-6">
            <div className="space-y-4 max-w-3xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Manage API keys for programmatic access to your SMTP infrastructure.</p>
                <Button className="gap-2" onClick={() => setShowNewKey(true)}>
                  <Plus className="h-4 w-4" /> Create API Key
                </Button>
              </div>

              {keysLoading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : apiKeys && apiKeys.length > 0 ? (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Key</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Permissions</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Last Used</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((k) => (
                        <tr key={k.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                          <td className="p-3 font-medium">{k.name}</td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">{k.key_prefix}</td>
                          <td className="p-3">
                            <span className={cn(
                              "text-xs font-medium px-2 py-0.5 rounded",
                              k.permissions === "full" ? "bg-primary/15 text-primary" :
                              k.permissions === "send_only" ? "bg-warning/15 text-warning" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {k.permissions === "full" ? "Full Access" : k.permissions === "send_only" ? "Send Only" : "Read Only"}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{formatDistanceToNow(new Date(k.created_at), { addSuffix: true })}</td>
                          <td className="p-3 text-muted-foreground text-xs">
                            {k.last_used_at ? formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true }) : "Never"}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(k.key_prefix)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteKeyId(k.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-lg flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-3 rounded-xl bg-muted mb-3"><Key className="h-6 w-6 text-muted-foreground" /></div>
                  <p className="text-sm font-medium">No API keys</p>
                  <p className="text-xs text-muted-foreground mt-1">Create an API key to integrate with your SMTP infrastructure.</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create API Key Dialog */}
      <Dialog open={showNewKey} onOpenChange={(open) => { if (!open) { setShowNewKey(false); setGeneratedKey(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{generatedKey ? "API Key Created" : "Create API Key"}</DialogTitle>
            <DialogDescription>
              {generatedKey
                ? "Copy this key now. It won't be shown again."
                : "Give your API key a name and set permissions."}
            </DialogDescription>
          </DialogHeader>
          {generatedKey ? (
            <div className="space-y-4">
              <div className="bg-secondary rounded-md p-4 font-mono text-sm break-all select-all">
                {generatedKey}
              </div>
              <Button className="w-full gap-2" onClick={() => { copyToClipboard(generatedKey); setShowNewKey(false); setGeneratedKey(null); }}>
                <Copy className="h-4 w-4" /> Copy & Close
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="e.g., Production" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Permissions</Label>
                <Select value={newKeyPerms} onValueChange={setNewKeyPerms}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Access</SelectItem>
                    <SelectItem value="send_only">Send Only</SelectItem>
                    <SelectItem value="read_only">Read Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewKey(false)}>Cancel</Button>
                <Button onClick={() => createKeyMutation.mutate()} disabled={createKeyMutation.isPending} className="gap-2">
                  {createKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                  Generate Key
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Key Confirmation */}
      <AlertDialog open={!!deleteKeyId} onOpenChange={() => setDeleteKeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
            <AlertDialogDescription>Any integrations using this key will stop working immediately.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteKeyId && deleteKeyMutation.mutate(deleteKeyId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
