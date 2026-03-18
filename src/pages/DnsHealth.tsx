import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RefreshCw, CheckCircle, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const dnsRecords = [
  {
    name: "SPF Record", status: "valid" as const,
    actual: "v=spf1 include:_spf.edapost.com ~all",
    expected: "v=spf1 include:_spf.edapost.com ~all",
  },
  {
    name: "DKIM Record", status: "valid" as const,
    actual: "v=DKIM1; k=rsa; p=MIGfMA0GCSqG...",
    expected: "v=DKIM1; k=rsa; p=MIGfMA0GCSqG...",
  },
  {
    name: "DMARC Record", status: "warning" as const,
    actual: "v=DMARC1; p=none; rua=mailto:dmarc@edapost.com",
    expected: "v=DMARC1; p=reject; rua=mailto:dmarc@edapost.com",
  },
  {
    name: "MX Record", status: "valid" as const,
    actual: "10 mail.edapost.com",
    expected: "10 mail.edapost.com",
  },
  {
    name: "PTR (Reverse DNS)", status: "valid" as const,
    actual: "mail.edapost.com",
    expected: "mail.edapost.com",
  },
  {
    name: "TLS Certificate", status: "valid" as const,
    actual: "Valid — expires in 247 days",
    expected: "Valid TLS certificate",
  },
];

const statusConfig = {
  valid: { icon: CheckCircle, label: "Valid", className: "text-success" },
  missing: { icon: CheckCircle, label: "Missing", className: "text-destructive" },
  warning: { icon: AlertTriangle, label: "Warning", className: "text-warning" },
};

export default function DnsHealth() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">DNS Health Check</h1>
            <p className="text-sm text-muted-foreground mt-1">Last checked: 5 minutes ago</p>
          </div>
          <Button variant="outline" className="gap-2"><RefreshCw className="h-4 w-4" /> Re-check All</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dnsRecords.map((record) => {
            const config = statusConfig[record.status];
            const StatusIcon = config.icon;
            return (
              <Collapsible key={record.name}>
                <div className="bg-card border border-border rounded-lg">
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-5">
                    <div className="flex items-center gap-3">
                      <StatusIcon className={cn("h-5 w-5", config.className)} />
                      <div className="text-left">
                        <p className="text-sm font-medium">{record.name}</p>
                        <p className={cn("text-xs font-medium", config.className)}>{config.label}</p>
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-5 pb-5 space-y-2">
                    <div className="bg-secondary rounded-md p-3 space-y-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Current Value</p>
                        <p className="text-xs font-mono mt-1 break-all">{record.actual}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Expected Value</p>
                        <p className="text-xs font-mono mt-1 break-all">{record.expected}</p>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
