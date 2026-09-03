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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage_events: {
        Row: {
          action: string
          created_at: string
          credits: number
          detail: string | null
          id: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          credits?: number
          detail?: string | null
          id?: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          credits?: number
          detail?: string | null
          id?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_events: {
        Row: {
          created_at: string
          delivered: boolean
          id: string
          kind: string
          message: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered?: boolean
          id?: string
          kind: string
          message: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivered?: boolean
          id?: string
          kind?: string
          message?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          created_at: string
          email: string
          enabled: boolean
          geo_threshold: number
          id: string
          last_sent_at: string | null
          mention_delta: number
          min_interval_hours: number
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          enabled?: boolean
          geo_threshold?: number
          id?: string
          last_sent_at?: string | null
          mention_delta?: number
          min_interval_hours?: number
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          enabled?: boolean
          geo_threshold?: number
          id?: string
          last_sent_at?: string | null
          mention_delta?: number
          min_interval_hours?: number
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_items: {
        Row: {
          audit_id: string
          category: string
          created_at: string
          evidence: string | null
          id: string
          passed: boolean
          recommendation: string | null
          severity: string
          title: string
          user_id: string
          weight: number
        }
        Insert: {
          audit_id: string
          category: string
          created_at?: string
          evidence?: string | null
          id?: string
          passed?: boolean
          recommendation?: string | null
          severity?: string
          title: string
          user_id: string
          weight?: number
        }
        Update: {
          audit_id?: string
          category?: string
          created_at?: string
          evidence?: string | null
          id?: string
          passed?: boolean
          recommendation?: string | null
          severity?: string
          title?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_items_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          ai_verification: Json | null
          created_at: string
          geo_score: number
          id: string
          keyword_suggestions: Json | null
          project_id: string
          seo_score: number
          status: string
          summary: string | null
          target_url: string
          user_id: string
        }
        Insert: {
          ai_verification?: Json | null
          created_at?: string
          geo_score?: number
          id?: string
          keyword_suggestions?: Json | null
          project_id: string
          seo_score?: number
          status?: string
          summary?: string | null
          target_url: string
          user_id: string
        }
        Update: {
          ai_verification?: Json | null
          created_at?: string
          geo_score?: number
          id?: string
          keyword_suggestions?: Json | null
          project_id?: string
          seo_score?: number
          status?: string
          summary?: string | null
          target_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_audits: {
        Row: {
          competitor_id: string | null
          created_at: string
          error: string | null
          geo_score: number
          id: string
          is_self: boolean
          items: Json
          label: string
          metrics: Json
          project_id: string
          seo_score: number
          url: string
          user_id: string
        }
        Insert: {
          competitor_id?: string | null
          created_at?: string
          error?: string | null
          geo_score?: number
          id?: string
          is_self?: boolean
          items?: Json
          label: string
          metrics?: Json
          project_id: string
          seo_score?: number
          url: string
          user_id: string
        }
        Update: {
          competitor_id?: string | null
          created_at?: string
          error?: string | null
          geo_score?: number
          id?: string
          is_self?: boolean
          items?: Json
          label?: string
          metrics?: Json
          project_id?: string
          seo_score?: number
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_audits_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitor_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_audits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_sites: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          project_id: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_sites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_articles: {
        Row: {
          audit_id: string | null
          created_at: string
          faq: Json
          format: string
          id: string
          jsonld: Json | null
          markdown: string
          meta_description: string
          meta_title: string
          outline: Json
          project_id: string
          target_keyword: string
          title: string
          user_id: string
          word_count: number
        }
        Insert: {
          audit_id?: string | null
          created_at?: string
          faq?: Json
          format?: string
          id?: string
          jsonld?: Json | null
          markdown?: string
          meta_description?: string
          meta_title?: string
          outline?: Json
          project_id: string
          target_keyword?: string
          title: string
          user_id: string
          word_count?: number
        }
        Update: {
          audit_id?: string | null
          created_at?: string
          faq?: Json
          format?: string
          id?: string
          jsonld?: Json | null
          markdown?: string
          meta_description?: string
          meta_title?: string
          outline?: Json
          project_id?: string
          target_keyword?: string
          title?: string
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "generated_articles_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_articles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mention_runs: {
        Row: {
          competitors: string[]
          created_at: string
          excerpt: string | null
          id: string
          mentioned: boolean
          model: string
          model_label: string
          project_id: string
          prompt_id: string
          rank: number | null
          raw_response: string | null
          user_id: string
        }
        Insert: {
          competitors?: string[]
          created_at?: string
          excerpt?: string | null
          id?: string
          mentioned?: boolean
          model: string
          model_label: string
          project_id: string
          prompt_id: string
          rank?: number | null
          raw_response?: string | null
          user_id: string
        }
        Update: {
          competitors?: string[]
          created_at?: string
          excerpt?: string | null
          id?: string
          mentioned?: boolean
          model?: string
          model_label?: string
          project_id?: string
          prompt_id?: string
          rank?: number | null
          raw_response?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mention_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mention_runs_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_overrides: {
        Row: {
          ai_credits: number | null
          audits: number | null
          created_at: string
          exports: boolean | null
          id: string
          mentions: number | null
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_credits?: number | null
          audits?: number | null
          created_at?: string
          exports?: boolean | null
          id?: string
          mentions?: number | null
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_credits?: number | null
          audits?: number | null
          created_at?: string
          exports?: boolean | null
          id?: string
          mentions?: number | null
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          auto_audit_enabled: boolean
          auto_audit_interval_hours: number
          brand_name: string
          competitors: string[]
          created_at: string
          gsc_site_url: string | null
          id: string
          last_auto_audit_at: string | null
          name: string
          site_url: string
          user_id: string
        }
        Insert: {
          auto_audit_enabled?: boolean
          auto_audit_interval_hours?: number
          brand_name: string
          competitors?: string[]
          created_at?: string
          gsc_site_url?: string | null
          id?: string
          last_auto_audit_at?: string | null
          name: string
          site_url: string
          user_id: string
        }
        Update: {
          auto_audit_enabled?: boolean
          auto_audit_interval_hours?: number
          brand_name?: string
          competitors?: string[]
          created_at?: string
          gsc_site_url?: string | null
          id?: string
          last_auto_audit_at?: string | null
          name?: string
          site_url?: string
          user_id?: string
        }
        Relationships: []
      }
      prompts: {
        Row: {
          created_at: string
          id: string
          project_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_verifications: {
        Row: {
          audit_id: string | null
          canonical: string
          checks: Json
          created_at: string
          final_url: string
          has_canonical: boolean
          has_jsonld: boolean
          id: string
          jsonld_types: string[]
          passed_count: number
          project_id: string | null
          reachable: boolean
          status: number
          total_count: number
          url: string
          user_id: string
        }
        Insert: {
          audit_id?: string | null
          canonical?: string
          checks?: Json
          created_at?: string
          final_url?: string
          has_canonical?: boolean
          has_jsonld?: boolean
          id?: string
          jsonld_types?: string[]
          passed_count?: number
          project_id?: string | null
          reachable?: boolean
          status?: number
          total_count?: number
          url: string
          user_id: string
        }
        Update: {
          audit_id?: string | null
          canonical?: string
          checks?: Json
          created_at?: string
          final_url?: string
          has_canonical?: boolean
          has_jsonld?: boolean
          id?: string
          jsonld_types?: string[]
          passed_count?: number
          project_id?: string | null
          reachable?: boolean
          status?: number
          total_count?: number
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_verifications_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_verifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      search_console_snapshots: {
        Row: {
          clicks: number
          created_at: string
          ctr: number
          fetched_at: string
          id: string
          impressions: number
          period_end: string
          period_start: string
          position: number
          project_id: string
          site_url: string
          top_pages: Json
          top_queries: Json
          user_id: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          ctr?: number
          fetched_at?: string
          id?: string
          impressions?: number
          period_end: string
          period_start: string
          position?: number
          project_id: string
          site_url: string
          top_pages?: Json
          top_queries?: Json
          user_id: string
        }
        Update: {
          clicks?: number
          created_at?: string
          ctr?: number
          fetched_at?: string
          id?: string
          impressions?: number
          period_end?: string
          period_start?: string
          position?: number
          project_id?: string
          site_url?: string
          top_pages?: Json
          top_queries?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_console_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_reports: {
        Row: {
          audit_id: string
          created_at: string
          expires_at: string | null
          id: string
          revoked: boolean
          token: string
          user_id: string
        }
        Insert: {
          audit_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          revoked?: boolean
          token: string
          user_id: string
        }
        Update: {
          audit_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          revoked?: boolean
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_reports_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_interval: string
          created_at: string
          current_period_end: string | null
          id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          count: number
          id: string
          kind: string
          period: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          id?: string
          kind: string
          period: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          id?: string
          kind?: string
          period?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wordpress_sites: {
        Row: {
          app_password: string
          created_at: string
          default_status: string
          id: string
          last_check_ok: boolean | null
          last_checked_at: string | null
          site_url: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          app_password: string
          created_at?: string
          default_status?: string
          id?: string
          last_check_ok?: boolean | null
          last_checked_at?: string | null
          site_url: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          app_password?: string
          created_at?: string
          default_status?: string
          id?: string
          last_check_ok?: boolean | null
          last_checked_at?: string | null
          site_url?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
