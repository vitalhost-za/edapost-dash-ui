import { DashboardLayout } from "@/components/DashboardLayout";
import { ShieldBan } from "lucide-react";

export default function Suppression() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppression List</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage suppressed email addresses.</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ShieldBan className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-medium">No suppressed addresses</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">Addresses added to the suppression list will be blocked from receiving emails.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
