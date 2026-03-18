import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, Plus, Trash2, Monitor, Smartphone, Send, Loader2, Save, Upload } from "lucide-react";
import { CsvImport } from "@/components/CsvImport";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function Compose() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [toField, setToField] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState(`<html>\n  <body>\n    <h1>Hello!</h1>\n    <p>Your email content here.</p>\n  </body>\n</html>`);
  const [plainBody, setPlainBody] = useState("");
  const [headers, setHeaders] = useState([{ key: "", value: "" }]);
  const [openTracking, setOpenTracking] = useState(true);
  const [clickTracking, setClickTracking] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [serverId, setServerId] = useState("");
  const [domainId, setDomainId] = useState("");

  const { data: domains } = useQuery({
    queryKey: ["sending-domains"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sending_domains").select("id, domain").order("domain");
      if (error) throw error;
      return data;
    },
  });

  const { data: servers } = useQuery({
    queryKey: ["smtp-servers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("smtp_servers").select("id, hostname").order("hostname");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "scheduled" | "sending") => {
      const recipients = toField
        .split(/[,;\n]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));

      const customHeaders = headers.filter((h) => h.key.trim() && h.value.trim());

      const campaignData = {
        user_id: user!.id,
        name: name.trim() || subject.trim() || "Untitled Campaign",
        subject: subject.trim(),
        from_address: fromAddress.trim(),
        reply_to: replyTo.trim() || null,
        html_body: htmlBody,
        plain_body: plainBody || null,
        status,
        open_tracking: openTracking,
        click_tracking: clickTracking,
        custom_headers: customHeaders.length > 0 ? customHeaders : [],
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        recipient_count: recipients.length,
        smtp_server_id: serverId || null,
        sending_domain_id: domainId || null,
      };

      const { data: campaign, error } = await supabase
        .from("campaigns")
        .insert(campaignData)
        .select("id")
        .single();
      if (error) throw error;

      // Insert recipients
      if (recipients.length > 0) {
        const recipientRows = recipients.map((email) => ({
          campaign_id: campaign.id,
          user_id: user!.id,
          email,
        }));
        const { error: recError } = await supabase
          .from("campaign_recipients")
          .insert(recipientRows);
        if (recError) throw recError;
      }

      // If sending, also queue the emails
      if (status === "sending") {
        const queueRows = recipients.map((email) => ({
          user_id: user!.id,
          from_address: fromAddress.trim(),
          to_address: email,
          subject: subject.trim(),
          smtp_server_id: serverId || null,
        }));
        if (queueRows.length > 0) {
          const { error: qError } = await supabase.from("email_queue").insert(queueRows);
          if (qError) throw qError;
        }
      }

      return campaign.id;
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      if (status === "draft") {
        toast.success("Campaign saved as draft");
      } else if (status === "scheduled") {
        toast.success("Campaign scheduled");
      } else {
        toast.success("Campaign queued for sending");
      }
      navigate("/campaigns");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSend = () => {
    if (!fromAddress.trim() || !subject.trim() || !toField.trim()) {
      toast.error("From, To, and Subject are required");
      return;
    }
    saveMutation.mutate(scheduledAt ? "scheduled" : "sending");
  };

  const previewHtml = useMemo(() => {
    if (!htmlBody.trim()) return "";
    // Sanitize for iframe preview — strip scripts
    return htmlBody.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  }, [htmlBody]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compose Email</h1>
            <p className="text-sm text-muted-foreground mt-1">Create and send emails through your SMTP infrastructure.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Form */}
          <div className="xl:col-span-3 space-y-5">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input placeholder="e.g., Welcome Series #1" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Address *</Label>
                  <Input placeholder="noreply@yourdomain.com" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Reply-To</Label>
                  <Input placeholder="reply@yourdomain.com" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>To *</Label>
                <Textarea
                  placeholder="recipient@example.com&#10;Separate multiple addresses with commas, semicolons, or new lines"
                  value={toField}
                  onChange={(e) => setToField(e.target.value)}
                  className="min-h-[80px]"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {toField.split(/[,;\n]+/).filter((e) => e.trim().includes("@")).length} recipient(s)
                  </p>
                </div>
                <CsvImport
                  onImport={(recipients) => {
                    const newEmails = recipients.map((r) =>
                      r.name ? `${r.name} <${r.email}>` : r.email
                    );
                    setToField((prev) => {
                      const existing = prev.trim();
                      return existing ? `${existing}\n${newEmails.join("\n")}` : newEmails.join("\n");
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input placeholder="Email subject line" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SMTP Server</Label>
                  <Select value={serverId} onValueChange={setServerId}>
                    <SelectTrigger><SelectValue placeholder="Auto-select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-select</SelectItem>
                      {servers?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.hostname}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sending Domain</Label>
                  <Select value={domainId} onValueChange={setDomainId}>
                    <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {domains?.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Body Editor */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-4">
              <Tabs defaultValue="html">
                <div className="flex items-center justify-between">
                  <Label>Email Body</Label>
                  <TabsList className="h-8">
                    <TabsTrigger value="html" className="text-xs">HTML</TabsTrigger>
                    <TabsTrigger value="plain" className="text-xs">Plain Text</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="html">
                  <Textarea
                    className="min-h-[240px] font-mono text-sm"
                    value={htmlBody}
                    onChange={(e) => setHtmlBody(e.target.value)}
                  />
                </TabsContent>
                <TabsContent value="plain">
                  <Textarea
                    placeholder="Plain text fallback content…"
                    className="min-h-[240px] text-sm"
                    value={plainBody}
                    onChange={(e) => setPlainBody(e.target.value)}
                  />
                </TabsContent>
              </Tabs>
            </div>

            {/* Advanced Options */}
            <Collapsible>
              <div className="bg-card border border-border rounded-lg">
                <CollapsibleTrigger className="flex items-center justify-between w-full p-5">
                  <span className="text-sm font-medium">Advanced Options</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-5 pb-5 space-y-5">
                  <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">Custom Headers</Label>
                    {headers.map((h, i) => (
                      <div key={i} className="flex gap-2">
                        <Input placeholder="Header name" value={h.key} onChange={(e) => {
                          const copy = [...headers]; copy[i] = { ...copy[i], key: e.target.value }; setHeaders(copy);
                        }} className="flex-1" />
                        <Input placeholder="Value" value={h.value} onChange={(e) => {
                          const copy = [...headers]; copy[i] = { ...copy[i], value: e.target.value }; setHeaders(copy);
                        }} className="flex-1" />
                        <Button variant="ghost" size="icon" onClick={() => setHeaders(headers.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setHeaders([...headers, { key: "", value: "" }])}>
                      <Plus className="h-3 w-3 mr-1" /> Add Header
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between bg-secondary rounded-md p-3">
                      <span className="text-sm">Open Tracking</span>
                      <Switch checked={openTracking} onCheckedChange={setOpenTracking} />
                    </div>
                    <div className="flex items-center justify-between bg-secondary rounded-md p-3">
                      <span className="text-sm">Click Tracking</span>
                      <Switch checked={clickTracking} onCheckedChange={setClickTracking} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Schedule Send</Label>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                    />
                    {scheduledAt && (
                      <p className="text-xs text-muted-foreground">
                        Will be sent at {new Date(scheduledAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="gap-2"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate("draft")}
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Draft
              </Button>
              <Button
                className="gap-2"
                disabled={saveMutation.isPending}
                onClick={handleSend}
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {scheduledAt ? "Schedule" : "Send Now"}
              </Button>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="xl:col-span-2">
            <div className="bg-card border border-border rounded-lg p-5 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Preview</h3>
                <div className="flex gap-1 bg-secondary rounded-md p-0.5">
                  <button
                    onClick={() => setPreviewMode("desktop")}
                    className={cn("p-1.5 rounded transition-colors", previewMode === "desktop" ? "bg-accent text-foreground" : "text-muted-foreground")}
                  >
                    <Monitor className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPreviewMode("mobile")}
                    className={cn("p-1.5 rounded transition-colors", previewMode === "mobile" ? "bg-accent text-foreground" : "text-muted-foreground")}
                  >
                    <Smartphone className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Subject preview */}
              {subject && (
                <div className="mb-3 p-2.5 bg-secondary rounded-md">
                  <p className="text-xs text-muted-foreground">Subject</p>
                  <p className="text-sm font-medium text-foreground mt-0.5">{subject}</p>
                </div>
              )}

              <div className={cn(
                "bg-white rounded-md border border-border mx-auto overflow-hidden transition-all",
                previewMode === "mobile" ? "max-w-[320px]" : "w-full"
              )}>
                {previewHtml ? (
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full min-h-[400px] border-0"
                    title="Email Preview"
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="p-4 min-h-[400px] flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Start typing HTML to see a preview</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
