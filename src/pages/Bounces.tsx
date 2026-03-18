import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Upload, Trash2, ShieldBan, Search } from "lucide-react";

const bounces = [
  { email: "invalid@test.xyz", type: "hard" as const, code: "550", reason: "Mailbox not found", date: "Mar 18, 2026", attempts: 3 },
  { email: "full@inbox.com", type: "soft" as const, code: "452", reason: "Mailbox full", date: "Mar 17, 2026", attempts: 2 },
  { email: "expired@old.net", type: "hard" as const, code: "550", reason: "Domain expired", date: "Mar 17, 2026", attempts: 1 },
  { email: "temp@busy.io", type: "soft" as const, code: "421", reason: "Try again later", date: "Mar 16, 2026", attempts: 4 },
  { email: "noexist@gone.com", type: "hard" as const, code: "550", reason: "User unknown", date: "Mar 16, 2026", attempts: 1 },
];

const suppressions = [
  { email: "invalid@test.xyz", reason: "Hard bounce", date: "Mar 18, 2026", addedBy: "System" },
  { email: "spam@reporter.com", reason: "Complaint", date: "Mar 15, 2026", addedBy: "System" },
  { email: "optout@manual.com", reason: "Manual", date: "Mar 10, 2026", addedBy: "Admin" },
  { email: "expired@old.net", reason: "Hard bounce", date: "Mar 17, 2026", addedBy: "System" },
];

export default function Bounces() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bounces & Suppression</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage bounced addresses and your suppression list.</p>
        </div>

        <Tabs defaultValue="bounces">
          <TabsList>
            <TabsTrigger value="bounces">Bounces</TabsTrigger>
            <TabsTrigger value="suppression">Suppression List</TabsTrigger>
          </TabsList>

          <TabsContent value="bounces" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search email address..." className="pl-9" />
              </div>
              <Select>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                  <SelectItem value="soft">Soft</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm"><ShieldBan className="h-3 w-3 mr-1" /> Add to Suppression</Button>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="p-3 text-left w-10"><Checkbox /></th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Email Address</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Code</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reason</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bounces.map((b, i) => (
                      <tr key={i} className="border-b border-border hover:bg-accent/30 transition-colors">
                        <td className="p-3"><Checkbox /></td>
                        <td className="p-3 font-mono text-xs">{b.email}</td>
                        <td className="p-3"><StatusBadge status={b.type} /></td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{b.code}</td>
                        <td className="p-3 text-muted-foreground">{b.reason}</td>
                        <td className="p-3 text-muted-foreground text-xs">{b.date}</td>
                        <td className="p-3 text-center">{b.attempts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="suppression" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search email address..." className="pl-9" />
              </div>
              <Select>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Reasons" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reasons</SelectItem>
                  <SelectItem value="hard">Hard Bounce</SelectItem>
                  <SelectItem value="complaint">Complaint</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm"><Download className="h-3 w-3 mr-1" /> Export CSV</Button>
                <Button variant="outline" size="sm"><Upload className="h-3 w-3 mr-1" /> Import CSV</Button>
                <Button variant="destructive" size="sm"><Trash2 className="h-3 w-3 mr-1" /> Remove Selected</Button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="p-3 text-left w-10"><Checkbox /></th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Email Address</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reason</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date Added</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Added By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppressions.map((s, i) => (
                      <tr key={i} className="border-b border-border hover:bg-accent/30 transition-colors">
                        <td className="p-3"><Checkbox /></td>
                        <td className="p-3 font-mono text-xs">{s.email}</td>
                        <td className="p-3 text-muted-foreground">{s.reason}</td>
                        <td className="p-3 text-muted-foreground text-xs">{s.date}</td>
                        <td className="p-3 text-muted-foreground">{s.addedBy}</td>
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
