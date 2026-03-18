import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SmtpServer {
  id: string;
  hostname: string;
  ip_address: string;
  port: number;
  status: "online" | "offline" | "degraded" | "maintenance";
  tls_enabled: boolean;
  max_connections: number;
  current_connections: number;
  queue_size: number;
  postfix_version: string | null;
  last_heartbeat: string | null;
}

export interface SendingDomain {
  id: string;
  domain: string;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
  mx_status: string;
  ptr_status: string;
  verified: boolean;
  dkim_selector: string | null;
  smtp_server_id: string | null;
}

export interface IpWarmup {
  id: string;
  ip_address: string;
  warmup_day: number;
  total_days: number;
  daily_limit: number;
  sent_today: number;
  status: "active" | "paused" | "completed";
  started_at: string;
  smtp_server_id: string;
}

export interface DeliveryStat {
  hour: string;
  sent: number;
  delivered: number;
  bounced: number;
  deferred: number;
  failed: number;
  complaints: number;
}

export function useSmtpServers() {
  return useQuery({
    queryKey: ["smtp-servers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("smtp_servers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SmtpServer[];
    },
  });
}

export function useSendingDomains() {
  return useQuery({
    queryKey: ["sending-domains"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sending_domains")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SendingDomain[];
    },
  });
}

export function useIpWarmup() {
  return useQuery({
    queryKey: ["ip-warmup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ip_warmup")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as IpWarmup[];
    },
  });
}

export function useDeliveryStats(days = 30) {
  return useQuery({
    queryKey: ["delivery-stats", days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("delivery_stats")
        .select("hour, sent, delivered, bounced, deferred, failed, complaints")
        .gte("hour", since.toISOString())
        .order("hour", { ascending: true });
      if (error) throw error;
      return data as DeliveryStat[];
    },
  });
}

export function useDeliveryTotals(days = 1) {
  return useQuery({
    queryKey: ["delivery-totals", days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("delivery_stats")
        .select("sent, delivered, bounced, deferred, failed, complaints")
        .gte("hour", since.toISOString());
      if (error) throw error;

      const totals = (data || []).reduce(
        (acc, row) => ({
          sent: acc.sent + (row.sent || 0),
          delivered: acc.delivered + (row.delivered || 0),
          bounced: acc.bounced + (row.bounced || 0),
          deferred: acc.deferred + (row.deferred || 0),
          failed: acc.failed + (row.failed || 0),
          complaints: acc.complaints + (row.complaints || 0),
        }),
        { sent: 0, delivered: 0, bounced: 0, deferred: 0, failed: 0, complaints: 0 }
      );

      return totals;
    },
  });
}
