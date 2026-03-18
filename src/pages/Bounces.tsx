import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, Trash2, ShieldBan, Search } from "lucide-react";

const bounces = [
  { email: "bad@invalid.com", type: "hard" as const, code: "550", reason: "Mailbox not found", date: "2024-03-15", attempts: 3 },
  { email: "full@mailbox.net", type: "soft" as const, code: "452", reason: "Mailbox full", date: "2024-03-15", attempts: 1 },
  { email: "old@expired.org", type: "hard" as const, code: "550", reason: "User unknown", date: "2024-03-14", attempts: 2 },
  { email: "temp@down.io", type: "soft" as const, code: "421", reason: "Service temporarily unavailable", date: "2024-03-14", attempts: 1 },
  { email: "gone@deleted.com", type: "hard" as const, code: "550", reason: "Account disabled", date: "2024-03-13", attempts: 4 },
];

const suppressions = [
  { email: "bad@invalid.com", reason: "Hard bounce", date: "2024-03-15", addedBy: "System" },
  { email: "spam@reporter.com", reason: "Complaint", date: "2024-03-14", addedBy: "System" },
  { email: "optout@manual.com", reason: "Manual", date: "2024-03-10", addedBy: "Admin" },
];

export default function Bounces() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Bounce & Suppression Management</h1>

        <Tabs defaultValue="bounces">
          <TabsList>
            <TabsTrigger value="bounces">Bounces</TabsTrigger>
            <TabsTrigger value="suppression">Suppression List</TabsTrigger>
          </TabsList>

          <TabsContent value="bounces" className="mt-4">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by email" className="pl-9 bg-transparent" />
                </div>
                <Select>
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                    <SelectItem value="soft">Soft</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="ml-auto gap-1"><ShieldBan className="h-3 w-3" /> Add to Suppression</Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
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
                        <td className="p-3">{b.email}</td>
                        <td className="p-3"><StatusBadge status={b.type} /></td>
                        <td className="p-3 text-muted-foreground">{b.code}</td>
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

          <TabsContent value="suppression" className="mt-4">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by email" className="pl-9 bg-transparent" />
                </div>
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" size="sm" className="gap-1"><Download className="h-3 w-3" /> Export CSV</Button>
                  <Button variant="outline" size="sm" className="gap-1"><Upload className="h-3 w-3" /> Import CSV</Button>
                  <Button variant="destructive" size="sm" className="gap-1"><Trash2 className="h-3 w-3" /> Remove</Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Email Address</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reason</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date Added</th>
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground">Added By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppressions.map((s, i) => (
                      <tr key={i} className="border-b border-border hover:bg-accent/30 transition-colors">
                        <td className="p-3">{s.email}</td>
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
