import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Trash2, Search } from "lucide-react";

const queueData = [
  { id: "JOB-001", from: "noreply@edapost.io", to: "user1@gmail.com", subject: "Welcome email", status: "sent" as const, attempts: 1, created: "2024-03-15 14:23", retry: "—" },
  { id: "JOB-002", from: "hello@edapost.io", to: "client@corp.com", subject: "Invoice #4521", status: "queued" as const, attempts: 0, created: "2024-03-15 14:25", retry: "—" },
  { id: "JOB-003", from: "noreply@edapost.io", to: "bad@invalid.net", subject: "Newsletter #12", status: "failed" as const, attempts: 3, created: "2024-03-15 13:10", retry: "—" },
  { id: "JOB-004", from: "hello@edapost.io", to: "dev@startup.io", subject: "API key update", status: "retrying" as const, attempts: 2, created: "2024-03-15 14:00", retry: "14:35" },
  { id: "JOB-005", from: "noreply@edapost.io", to: "team@company.co", subject: "Weekly digest", status: "processing" as const, attempts: 1, created: "2024-03-15 14:28", retry: "—" },
  { id: "JOB-006", from: "noreply@edapost.io", to: "admin@site.org", subject: "Security notice", status: "sent" as const, attempts: 1, created: "2024-03-15 14:20", retry: "—" },
  { id: "JOB-007", from: "hello@edapost.io", to: "person@yahoo.com", subject: "Promo offer", status: "queued" as const, attempts: 0, created: "2024-03-15 14:30", retry: "—" },
];

export default function Queue() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Email Queue</h1>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Queued", value: "342" },
            { label: "Processing", value: "28" },
            { label: "Sent/min", value: "145" },
            { label: "Avg Latency", value: "1.2s" },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters + Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search recipient or subject" className="pl-9 bg-transparent" />
            </div>
            <Select>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="retrying">Retrying</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" className="gap-1"><RefreshCw className="h-3 w-3" /> Retry Selected</Button>
              <Button variant="destructive" size="sm" className="gap-1"><Trash2 className="h-3 w-3" /> Purge Failed</Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job ID</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">From</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">To</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Subject</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Attempts</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Created At</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Next Retry</th>
                </tr>
              </thead>
              <tbody>
                {queueData.map((row) => (
                  <tr key={row.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                    <td className="p-3 font-mono text-xs">{row.id}</td>
                    <td className="p-3 text-muted-foreground">{row.from}</td>
                    <td className="p-3 font-medium">{row.to}</td>
                    <td className="p-3">{row.subject}</td>
                    <td className="p-3"><StatusBadge status={row.status} /></td>
                    <td className="p-3 text-center">{row.attempts}</td>
                    <td className="p-3 text-muted-foreground text-xs">{row.created}</td>
                    <td className="p-3 text-muted-foreground text-xs">{row.retry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
