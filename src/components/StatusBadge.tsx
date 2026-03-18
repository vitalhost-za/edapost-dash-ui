import { cn } from "@/lib/utils";

const variants = {
  queued: "bg-info/15 text-info border-info/20",
  processing: "bg-warning/15 text-warning border-warning/20",
  sent: "bg-success/15 text-success border-success/20",
  delivered: "bg-success/15 text-success border-success/20",
  failed: "bg-destructive/15 text-destructive border-destructive/20",
  retrying: "bg-orange/15 text-orange border-orange/20",
  hard: "bg-destructive/15 text-destructive border-destructive/20",
  soft: "bg-warning/15 text-warning border-warning/20",
  valid: "bg-success/15 text-success border-success/20",
  missing: "bg-destructive/15 text-destructive border-destructive/20",
  warning: "bg-warning/15 text-warning border-warning/20",
  bounced: "bg-destructive/15 text-destructive border-destructive/20",
  deferred: "bg-orange/15 text-orange border-orange/20",
  complained: "bg-warning/15 text-warning border-warning/20",
} as const;

interface StatusBadgeProps {
  status: keyof typeof variants;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize",
      variants[status]
    )}>
      {label || status}
    </span>
  );
}
