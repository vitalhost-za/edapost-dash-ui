import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Clock, Globe, Repeat, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  { value: "UTC", label: "UTC (±00:00)" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
  { value: "America/Toronto", label: "Toronto (ET)" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (ART)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Europe/Madrid", label: "Madrid (CET)" },
  { value: "Europe/Rome", label: "Rome (CET)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET)" },
  { value: "Europe/Moscow", label: "Moscow (MSK)" },
  { value: "Europe/Istanbul", label: "Istanbul (TRT)" },
  { value: "Africa/Cairo", label: "Cairo (EET)" },
  { value: "Africa/Johannesburg", label: "Johannesburg (SAST)" },
  { value: "Africa/Lagos", label: "Lagos (WAT)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Bangkok", label: "Bangkok (ICT)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Seoul", label: "Seoul (KST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
  { value: "Australia/Melbourne", label: "Melbourne (AEST)" },
  { value: "Pacific/Auckland", label: "Auckland (NZST)" },
];

const RECURRENCE_OPTIONS = [
  { value: "none", label: "One-time send" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

interface ScheduleConfig {
  scheduledAt: string;
  timezone: string;
  recurrencePattern: string;
  recurrenceEndAt: string;
  recurrenceCount: string;
}

interface CampaignSchedulerProps {
  config: ScheduleConfig;
  onChange: (config: ScheduleConfig) => void;
}

export function CampaignScheduler({ config, onChange }: CampaignSchedulerProps) {
  const update = (partial: Partial<ScheduleConfig>) => onChange({ ...config, ...partial });
  const isRecurring = config.recurrencePattern !== "none" && config.recurrencePattern !== "";
  const hasSchedule = !!config.scheduledAt;

  // Format the scheduled time in the selected timezone for display
  const formattedTime = config.scheduledAt
    ? (() => {
        try {
          const d = new Date(config.scheduledAt);
          return d.toLocaleString("en-US", {
            timeZone: config.timezone,
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          });
        } catch {
          return "";
        }
      })()
    : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
        <Label className="text-xs text-muted-foreground font-medium">Scheduling</Label>
      </div>

      {/* Date/time + timezone row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Send Date & Time
          </Label>
          <Input
            type="datetime-local"
            value={config.scheduledAt}
            onChange={(e) => update({ scheduledAt: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Globe className="h-3 w-3" /> Timezone
          </Label>
          <Select value={config.timezone} onValueChange={(v) => update({ timezone: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasSchedule && formattedTime && (
        <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
          <p className="text-xs text-primary font-medium">
            Scheduled: {formattedTime}
          </p>
        </div>
      )}

      {/* Recurrence */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Repeat className="h-3 w-3" /> Repeat
          </Label>
          <Select
            value={config.recurrencePattern || "none"}
            onValueChange={(v) => update({
              recurrencePattern: v,
              ...(v === "none" ? { recurrenceEndAt: "", recurrenceCount: "" } : {}),
            })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RECURRENCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isRecurring && (
          <div className="pl-4 border-l-2 border-primary/20 space-y-3">
            <p className="text-xs text-muted-foreground">
              Campaign will repeat <span className="font-medium text-foreground">{config.recurrencePattern}</span> starting from the scheduled date.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">End Date (optional)</Label>
                <Input
                  type="datetime-local"
                  value={config.recurrenceEndAt}
                  onChange={(e) => update({ recurrenceEndAt: e.target.value })}
                  placeholder="Never"
                />
                {!config.recurrenceEndAt && !config.recurrenceCount && (
                  <p className="text-[10px] text-muted-foreground">Runs indefinitely if no end date or count is set</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max Occurrences (optional)</Label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  placeholder="Unlimited"
                  value={config.recurrenceCount}
                  onChange={(e) => update({ recurrenceCount: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { TIMEZONES };
