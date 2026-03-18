import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  sparkline?: number[];
}

export function MetricCard({ title, value, change, changeType = "neutral", icon: Icon, sparkline }: MetricCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 lg:p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {change && (
            <p className={cn(
              "text-xs font-medium",
              changeType === "positive" && "text-success",
              changeType === "negative" && "text-destructive",
              changeType === "neutral" && "text-muted-foreground",
            )}>
              {change}
            </p>
          )}
        </div>
        <div className="p-2 rounded-md bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      {sparkline && (
        <div className="mt-3 flex items-end gap-[2px] h-8">
          {sparkline.map((v, i) => (
            <div
              key={i}
              className="flex-1 bg-primary/30 rounded-sm min-w-[2px]"
              style={{ height: `${(v / Math.max(...sparkline)) * 100}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
