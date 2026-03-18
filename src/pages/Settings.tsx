import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, RefreshCw, Copy } from "lucide-react";
import { useState } from "react";

const apiKeys = [
  { id: "key_1", name: "Production", key: "ep_live_****...a3f2", created: "Jan 15, 2026", lastUsed: "2 hours ago", permissions: "Full Access" },
  { id: "key_2", name: "Staging", key: "ep_test_****...b7c1", created: "Feb 28, 2026", lastUsed: "3 days ago", permissions: "Send Only" },
];

const warmupSchedule = [
  { day: 1, limit: 500 }, { day: 5, limit: 1000 }, { day: 10, limit: 2500 },
  { day: 15, limit: 5000 }, { day: 20, limit: 10000 }, { day: 25, limit: 25000 }, { day: 30, limit: 50000 },
];

export default function SettingsPage() {
  const [warmupEnabled, setWarmupEnabled] = useState(true);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="smtp">SMTP</TabsTrigger>
            <TabsTrigger value="auth">Authentication</TabsTrigger>
            <TabsTrigger value="warmup">Warmup</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="apikeys">API Keys</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 max-w-2xl">
              <div className="space-y-2"><Label>System Name</Label><Input defaultValue="EdaPost Production" /></div>
              <div className="space-y-2"><Label>Default From Address</Label><Input defaultValue="noreply@edapost.io" /></div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select defaultValue="utc">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utc">UTC</SelectItem>
                    <SelectItem value="est">America/New_York</SelectItem>
                    <SelectItem value="pst">America/Los_Angeles</SelectItem>
                    <SelectItem value="cet">Europe/Berlin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button>Save Changes</Button>
            </div>
          </TabsContent>

          <TabsContent value="smtp" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 max-w-2xl">
              <div className="space-y-2"><Label>Hostname</Label><Input defaultValue="mail.edapost.io" /></div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Port 25</Label><Input defaultValue="25" /></div>
                <div className="space-y-2"><Label>Port 465</Label><Input defaultValue="465" /></div>
                <div className="space-y-2"><Label>Port 587</Label><Input defaultValue="587" /></div>
              </div>
              <div className="space-y-2">
                <Label>TLS Mode</Label>
                <Select defaultValue="starttls">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="starttls">STARTTLS</SelectItem>
                    <SelectItem value="tls">TLS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Max Message Size (MB)</Label><Input defaultValue="25" /></div>
                <div className="space-y-2"><Label>Connection Limit</Label><Input defaultValue="100" /></div>
              </div>
              <Button>Save Changes</Button>
            </div>
          </TabsContent>

          <TabsContent value="auth" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 max-w-2xl">
              <div className="bg-secondary rounded-md p-4 flex items-center justify-between">
                <div><p className="text-sm font-medium">SPF</p><p className="text-xs text-muted-foreground font-mono mt-1">v=spf1 include:_spf.edapost.com ~all</p></div>
                <span className="text-xs font-medium text-success">Configured</span>
              </div>
              <div className="bg-secondary rounded-md p-4 flex items-center justify-between">
                <div><p className="text-sm font-medium">DKIM</p><p className="text-xs text-muted-foreground font-mono mt-1">Selector: edapost._domainkey</p></div>
                <Button variant="outline" size="sm"><RefreshCw className="h-3 w-3 mr-1" /> Rotate Key</Button>
              </div>
              <div className="bg-secondary rounded-md p-4 flex items-center justify-between">
                <div><p className="text-sm font-medium">DMARC</p><p className="text-xs text-muted-foreground font-mono mt-1">v=DMARC1; p=none</p></div>
                <span className="text-xs font-medium text-warning">Weak Policy</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="warmup" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 max-w-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">IP Warmup</p>
                  <p className="text-xs text-muted-foreground">Gradually increase sending volume for new IPs</p>
                </div>
                <Switch checked={warmupEnabled} onCheckedChange={setWarmupEnabled} />
              </div>
              {warmupEnabled && (
                <>
                  <div className="bg-secondary rounded-md p-4 flex items-center justify-between">
                    <span className="text-sm">Current Day</span>
                    <span className="text-sm font-semibold">Day 14</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="p-2 text-left text-xs font-medium text-muted-foreground">Day</th>
                          <th className="p-2 text-left text-xs font-medium text-muted-foreground">Daily Limit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {warmupSchedule.map((row) => (
                          <tr key={row.day} className="border-b border-border">
                            <td className="p-2">Day {row.day}</td>
                            <td className="p-2"><Input className="w-32 h-8" defaultValue={row.limit} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button>Save Schedule</Button>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 max-w-2xl">
              <div className="space-y-2"><Label>Slack Webhook URL</Label><Input placeholder="https://hooks.slack.com/services/..." /></div>
              <div className="space-y-2"><Label>Alert Email</Label><Input placeholder="alerts@company.com" /></div>
              <h3 className="text-sm font-medium mt-4">Alert Thresholds</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2"><Label className="text-xs">Bounce Rate %</Label><Input defaultValue="5" /></div>
                <div className="space-y-2"><Label className="text-xs">Complaint Rate %</Label><Input defaultValue="0.1" /></div>
                <div className="space-y-2"><Label className="text-xs">Queue Depth</Label><Input defaultValue="10000" /></div>
              </div>
              <Button>Save Notifications</Button>
            </div>
          </TabsContent>

          <TabsContent value="apikeys" className="mt-6">
            <div className="space-y-4 max-w-3xl">
              <Button className="gap-2"><Plus className="h-4 w-4" /> Create API Key</Button>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Key</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Last Used</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Permissions</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((k) => (
                      <tr key={k.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                        <td className="p-3 font-medium">{k.name}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{k.key}</td>
                        <td className="p-3 text-muted-foreground text-xs">{k.created}</td>
                        <td className="p-3 text-muted-foreground text-xs">{k.lastUsed}</td>
                        <td className="p-3 text-xs">{k.permissions}</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Copy className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
