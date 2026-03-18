export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ab_test_variants: {
        Row: {
          bounced_count: number
          campaign_id: string
          clicked_count: number
          created_at: string
          delivered_count: number
          from_address: string | null
          html_body: string | null
          id: string
          is_winner: boolean
          opened_count: number
          plain_body: string | null
          recipient_count: number
          scheduled_at: string | null
          sent_count: number
          subject: string | null
          updated_at: string
          user_id: string
          variant_label: string
        }
        Insert: {
          bounced_count?: number
          campaign_id: string
          clicked_count?: number
          created_at?: string
          delivered_count?: number
          from_address?: string | null
          html_body?: string | null
          id?: string
          is_winner?: boolean
          opened_count?: number
          plain_body?: string | null
          recipient_count?: number
          scheduled_at?: string | null
          sent_count?: number
          subject?: string | null
          updated_at?: string
          user_id: string
          variant_label?: string
        }
        Update: {
          bounced_count?: number
          campaign_id?: string
          clicked_count?: number
          created_at?: string
          delivered_count?: number
          from_address?: string | null
          html_body?: string | null
          id?: string
          is_winner?: boolean
          opened_count?: number
          plain_body?: string | null
          recipient_count?: number
          scheduled_at?: string | null
          sent_count?: number
          subject?: string | null
          updated_at?: string
          user_id?: string
          variant_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_variants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          permissions: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          permissions?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          permissions?: string
          user_id?: string
        }
        Relationships: []
      }
      bounces: {
        Row: {
          attempts: number
          bounce_code: string | null
          bounce_type: string
          created_at: string
          email: string
          id: string
          reason: string | null
          smtp_server_id: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          bounce_code?: string | null
          bounce_type?: string
          created_at?: string
          email: string
          id?: string
          reason?: string | null
          smtp_server_id?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          bounce_code?: string | null
          bounce_type?: string
          created_at?: string
          email?: string
          id?: string
          reason?: string | null
          smtp_server_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bounces_smtp_server_id_fkey"
            columns: ["smtp_server_id"]
            isOneToOne: false
            referencedRelation: "smtp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          error_message: string | null
          id: string
          name: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          name?: string | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          name?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ab_test_enabled: boolean
          ab_test_winner_variant_id: string | null
          bounced_count: number
          click_tracking: boolean
          clicked_count: number
          completed_at: string | null
          created_at: string
          custom_headers: Json | null
          delivered_count: number
          from_address: string
          html_body: string | null
          id: string
          last_recurrence_at: string | null
          name: string
          open_tracking: boolean
          opened_count: number
          parent_campaign_id: string | null
          plain_body: string | null
          recipient_count: number
          recurrence_count: number | null
          recurrence_end_at: string | null
          recurrence_pattern: string | null
          reply_to: string | null
          scheduled_at: string | null
          sending_domain_id: string | null
          sent_at: string | null
          sent_count: number
          smtp_server_id: string | null
          status: string
          subject: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ab_test_enabled?: boolean
          ab_test_winner_variant_id?: string | null
          bounced_count?: number
          click_tracking?: boolean
          clicked_count?: number
          completed_at?: string | null
          created_at?: string
          custom_headers?: Json | null
          delivered_count?: number
          from_address: string
          html_body?: string | null
          id?: string
          last_recurrence_at?: string | null
          name: string
          open_tracking?: boolean
          opened_count?: number
          parent_campaign_id?: string | null
          plain_body?: string | null
          recipient_count?: number
          recurrence_count?: number | null
          recurrence_end_at?: string | null
          recurrence_pattern?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          sending_domain_id?: string | null
          sent_at?: string | null
          sent_count?: number
          smtp_server_id?: string | null
          status?: string
          subject: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ab_test_enabled?: boolean
          ab_test_winner_variant_id?: string | null
          bounced_count?: number
          click_tracking?: boolean
          clicked_count?: number
          completed_at?: string | null
          created_at?: string
          custom_headers?: Json | null
          delivered_count?: number
          from_address?: string
          html_body?: string | null
          id?: string
          last_recurrence_at?: string | null
          name?: string
          open_tracking?: boolean
          opened_count?: number
          parent_campaign_id?: string | null
          plain_body?: string | null
          recipient_count?: number
          recurrence_count?: number | null
          recurrence_end_at?: string | null
          recurrence_pattern?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          sending_domain_id?: string | null
          sent_at?: string | null
          sent_count?: number
          smtp_server_id?: string | null
          status?: string
          subject?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_ab_test_winner_variant_id_fkey"
            columns: ["ab_test_winner_variant_id"]
            isOneToOne: false
            referencedRelation: "ab_test_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_parent_campaign_id_fkey"
            columns: ["parent_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_sending_domain_id_fkey"
            columns: ["sending_domain_id"]
            isOneToOne: false
            referencedRelation: "sending_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_smtp_server_id_fkey"
            columns: ["smtp_server_id"]
            isOneToOne: false
            referencedRelation: "smtp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_list_members: {
        Row: {
          created_at: string
          email: string
          id: string
          list_id: string
          name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          list_id: string
          name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          list_id?: string
          name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          contact_count: number
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_count?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_count?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_stats: {
        Row: {
          bounced: number
          complaints: number
          created_at: string
          deferred: number
          delivered: number
          failed: number
          hour: string
          id: string
          sent: number
          smtp_server_id: string | null
          user_id: string
        }
        Insert: {
          bounced?: number
          complaints?: number
          created_at?: string
          deferred?: number
          delivered?: number
          failed?: number
          hour: string
          id?: string
          sent?: number
          smtp_server_id?: string | null
          user_id: string
        }
        Update: {
          bounced?: number
          complaints?: number
          created_at?: string
          deferred?: number
          delivered?: number
          failed?: number
          hour?: string
          id?: string
          sent?: number
          smtp_server_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_stats_smtp_server_id_fkey"
            columns: ["smtp_server_id"]
            isOneToOne: false
            referencedRelation: "smtp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          created_at: string
          event_type: string
          from_address: string
          id: string
          ip_address: string | null
          message_id: string | null
          metadata: Json | null
          response_code: string | null
          smtp_response: string | null
          smtp_server_id: string | null
          subject: string | null
          to_address: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          from_address: string
          id?: string
          ip_address?: string | null
          message_id?: string | null
          metadata?: Json | null
          response_code?: string | null
          smtp_response?: string | null
          smtp_server_id?: string | null
          subject?: string | null
          to_address: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          from_address?: string
          id?: string
          ip_address?: string | null
          message_id?: string | null
          metadata?: Json | null
          response_code?: string | null
          smtp_response?: string | null
          smtp_server_id?: string | null
          subject?: string | null
          to_address?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_smtp_server_id_fkey"
            columns: ["smtp_server_id"]
            isOneToOne: false
            referencedRelation: "smtp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          from_address: string
          html_body: string | null
          id: string
          max_attempts: number
          next_retry_at: string | null
          plain_body: string | null
          postfix_queue_id: string | null
          sent_at: string | null
          smtp_server_id: string | null
          status: string
          subject: string
          to_address: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          from_address: string
          html_body?: string | null
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          plain_body?: string | null
          postfix_queue_id?: string | null
          sent_at?: string | null
          smtp_server_id?: string | null
          status?: string
          subject: string
          to_address: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          from_address?: string
          html_body?: string | null
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          plain_body?: string | null
          postfix_queue_id?: string | null
          sent_at?: string | null
          smtp_server_id?: string | null
          status?: string
          subject?: string
          to_address?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_smtp_server_id_fkey"
            columns: ["smtp_server_id"]
            isOneToOne: false
            referencedRelation: "smtp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          html_body: string
          id: string
          is_favorite: boolean
          name: string
          plain_body: string | null
          subject: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          html_body?: string
          id?: string
          is_favorite?: boolean
          name: string
          plain_body?: string | null
          subject?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          html_body?: string
          id?: string
          is_favorite?: boolean
          name?: string
          plain_body?: string | null
          subject?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ip_warmup: {
        Row: {
          created_at: string
          daily_limit: number
          id: string
          ip_address: unknown
          sent_today: number
          smtp_server_id: string
          started_at: string
          status: string
          total_days: number
          updated_at: string
          user_id: string
          warmup_day: number
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          id?: string
          ip_address: unknown
          sent_today?: number
          smtp_server_id: string
          started_at?: string
          status?: string
          total_days?: number
          updated_at?: string
          user_id: string
          warmup_day?: number
        }
        Update: {
          created_at?: string
          daily_limit?: number
          id?: string
          ip_address?: unknown
          sent_today?: number
          smtp_server_id?: string
          started_at?: string
          status?: string
          total_days?: number
          updated_at?: string
          user_id?: string
          warmup_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "ip_warmup_smtp_server_id_fkey"
            columns: ["smtp_server_id"]
            isOneToOne: false
            referencedRelation: "smtp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sending_domains: {
        Row: {
          created_at: string
          dkim_selector: string | null
          dkim_status: string
          dmarc_status: string
          domain: string
          id: string
          mx_status: string
          ptr_status: string
          smtp_server_id: string | null
          spf_status: string
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          dkim_selector?: string | null
          dkim_status?: string
          dmarc_status?: string
          domain: string
          id?: string
          mx_status?: string
          ptr_status?: string
          smtp_server_id?: string | null
          spf_status?: string
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          dkim_selector?: string | null
          dkim_status?: string
          dmarc_status?: string
          domain?: string
          id?: string
          mx_status?: string
          ptr_status?: string
          smtp_server_id?: string | null
          spf_status?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sending_domains_smtp_server_id_fkey"
            columns: ["smtp_server_id"]
            isOneToOne: false
            referencedRelation: "smtp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      smtp_servers: {
        Row: {
          created_at: string
          current_connections: number
          hostname: string
          id: string
          ip_address: unknown
          last_heartbeat: string | null
          max_connections: number
          port: number
          postfix_version: string | null
          queue_size: number
          status: string
          tls_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_connections?: number
          hostname: string
          id?: string
          ip_address: unknown
          last_heartbeat?: string | null
          max_connections?: number
          port?: number
          postfix_version?: string | null
          queue_size?: number
          status?: string
          tls_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_connections?: number
          hostname?: string
          id?: string
          ip_address?: unknown
          last_heartbeat?: string | null
          max_connections?: number
          port?: number
          postfix_version?: string | null
          queue_size?: number
          status?: string
          tls_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppression_list: {
        Row: {
          added_by: string
          created_at: string
          email: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          added_by?: string
          created_at?: string
          email: string
          id?: string
          reason?: string
          user_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          email?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          alert_bounce_rate: number | null
          alert_complaint_rate: number | null
          alert_email: string | null
          alert_queue_depth: number | null
          created_at: string
          default_from_address: string
          id: string
          notify_bounces: boolean
          notify_complaints: boolean
          notify_queue_full: boolean
          notify_server_down: boolean
          slack_webhook_url: string | null
          smtp_connection_limit: number | null
          smtp_hostname: string | null
          smtp_max_message_size: number | null
          smtp_port: number | null
          smtp_tls_mode: string
          system_name: string
          timezone: string
          updated_at: string
          user_id: string
          warmup_enabled: boolean
        }
        Insert: {
          alert_bounce_rate?: number | null
          alert_complaint_rate?: number | null
          alert_email?: string | null
          alert_queue_depth?: number | null
          created_at?: string
          default_from_address?: string
          id?: string
          notify_bounces?: boolean
          notify_complaints?: boolean
          notify_queue_full?: boolean
          notify_server_down?: boolean
          slack_webhook_url?: string | null
          smtp_connection_limit?: number | null
          smtp_hostname?: string | null
          smtp_max_message_size?: number | null
          smtp_port?: number | null
          smtp_tls_mode?: string
          system_name?: string
          timezone?: string
          updated_at?: string
          user_id: string
          warmup_enabled?: boolean
        }
        Update: {
          alert_bounce_rate?: number | null
          alert_complaint_rate?: number | null
          alert_email?: string | null
          alert_queue_depth?: number | null
          created_at?: string
          default_from_address?: string
          id?: string
          notify_bounces?: boolean
          notify_complaints?: boolean
          notify_queue_full?: boolean
          notify_server_down?: boolean
          slack_webhook_url?: string | null
          smtp_connection_limit?: number | null
          smtp_hostname?: string | null
          smtp_max_message_size?: number | null
          smtp_port?: number | null
          smtp_tls_mode?: string
          system_name?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          warmup_enabled?: boolean
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempt_number: number
          created_at: string
          delivery_id: string | null
          duration_ms: number | null
          error_message: string | null
          event_type: string
          id: string
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          status_code: number | null
          success: boolean
          user_id: string
          webhook_id: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          delivery_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          event_type: string
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          status_code?: number | null
          success?: boolean
          user_id: string
          webhook_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          delivery_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          event_type?: string
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          status_code?: number | null
          success?: boolean
          user_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          events: string[]
          failure_count: number
          id: string
          is_active: boolean
          last_status_code: number | null
          last_triggered_at: string | null
          name: string
          secret: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_status_code?: number | null
          last_triggered_at?: string | null
          name: string
          secret?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_status_code?: number | null
          last_triggered_at?: string | null
          name?: string
          secret?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
