import { DashboardLayout } from "@/components/DashboardLayout";
import { Megaphone } from "lucide-react";

export default function Campaigns() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage email campaigns.</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-medium">No campaigns yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">Create your first email campaign to start sending bulk emails to your subscribers.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
