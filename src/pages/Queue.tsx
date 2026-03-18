import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, X, Trash2, Search, Zap, Clock, Send, Gauge } from "lucide-react";

const queueData = [
  { id: "JOB-001", from: "noreply@edapost.com", to: "user1@gmail.com", subject: "Welcome!", status: "queued" as const, attempts: 0, created: "Mar 18, 10:42 AM", retry: "—" },
  { id: "JOB-002", from: "hello@company.com", to: "john@outlook.com", subject: "Invoice #5678", status: "processing" as const, attempts: 1, created: "Mar 18, 10:40 AM", retry: "—" },
  { id: "JOB-003", from: "noreply@edapost.com", to: "sara@yahoo.com", subject: "Password Reset", status: "sent" as const, attempts: 1, created: "Mar 18, 10:38 AM", retry: "—" },
  { id: "JOB-004", from: "hello@company.com", to: "bad@invalid.xyz", subject: "Newsletter", status: "failed" as const, attempts: 3, created: "Mar 18, 10:35 AM", retry: "—" },
  { id: "JOB-005", from: "noreply@edapost.com", to: "mark@corp.io", subject: "Alert: Server Down", status: "retrying" as const, attempts: 2, created: "Mar 18, 10:30 AM", retry: "Mar 18, 10:45 AM" },
  { id: "JOB-006", from: "hello@company.com", to: "alice@startup.dev", subject: "Onboarding Step 2", status: "queued" as const, attempts: 0, created: "Mar 18, 10:28 AM", retry: "—" },
  { id: "JOB-007", from: "noreply@edapost.com", to: "kate@design.co", subject: "Weekly Report", status: "sent" as const, attempts: 1, created: "Mar 18, 10:25 AM", retry: "—" },
];

const stats = [
  { label: "Total Queued", value: "142", icon: ListIcon },
  { label: "Processing", value: "23", icon: Zap },
  { label: "Sent / min", value: "48", icon: Send },
  { label: "Avg Latency", value: "1.2s", icon: Gauge },
];

function ListIcon(props: React.SVGProps<SVGSVGElement>) {
  return <Clock {...(props as any)} />;
}

export default function Queue() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor and manage outgoing email jobs.</p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10">
                <s.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-semibold">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by recipient or subject..." className="pl-9" />
            </div>
            <Select>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="retrying">Retrying</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" className="w-[160px]" />
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm"><RefreshCw className="h-3 w-3 mr-1" /> Retry Selected</Button>
              <Button variant="outline" size="sm"><X className="h-3 w-3 mr-1" /> Cancel Selected</Button>
              <Button variant="destructive" size="sm"><Trash2 className="h-3 w-3 mr-1" /> Purge Failed</Button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="p-3 text-left w-10"><Checkbox /></th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job ID</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">From</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">To</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Subject</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Attempts</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Next Retry</th>
                </tr>
              </thead>
              <tbody>
                {queueData.map((row) => (
                  <tr key={row.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                    <td className="p-3"><Checkbox /></td>
                    <td className="p-3 font-mono text-xs text-primary">{row.id}</td>
                    <td className="p-3 text-muted-foreground">{row.from}</td>
                    <td className="p-3">{row.to}</td>
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
