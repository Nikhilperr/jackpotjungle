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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      auto_responses: {
        Row: {
          admin_id: string
          created_at: string
          enabled: boolean
          id: string
          message: string
          minutes: number
        }
        Insert: {
          admin_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          message: string
          minutes?: number
        }
        Update: {
          admin_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          message?: string
          minutes?: number
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          admin_id: string
          content: string
          created_at: string
          id: string
          sent_count: number
          target_tag_id: string | null
          target_type: string
          target_user_ids: string[] | null
        }
        Insert: {
          admin_id: string
          content: string
          created_at?: string
          id?: string
          sent_count?: number
          target_tag_id?: string | null
          target_type: string
          target_user_ids?: string[] | null
        }
        Update: {
          admin_id?: string
          content?: string
          created_at?: string
          id?: string
          sent_count?: number
          target_tag_id?: string | null
          target_type?: string
          target_user_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_target_tag_id_fkey"
            columns: ["target_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          answered_at: string | null
          call_type: Database["public"]["Enums"]["call_type"]
          callee_id: string | null
          caller_id: string
          context: string
          created_at: string
          duration_seconds: number
          ended_at: string | null
          id: string
          page_conversation_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["call_status"]
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          call_type?: Database["public"]["Enums"]["call_type"]
          callee_id?: string | null
          caller_id: string
          context?: string
          created_at?: string
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          page_conversation_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          call_type?: Database["public"]["Enums"]["call_type"]
          callee_id?: string | null
          caller_id?: string
          context?: string
          created_at?: string
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          page_conversation_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_page_conversation_id_fkey"
            columns: ["page_conversation_id"]
            isOneToOne: false
            referencedRelation: "page_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          admin_id: string | null
          amount: number
          created_at: string
          id: string
          note: string | null
          type: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          type: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      followups: {
        Row: {
          admin_id: string
          created_at: string
          days_after: number
          id: string
          message: string
          scheduled_at: string
          sent: boolean
          user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          days_after: number
          id?: string
          message: string
          scheduled_at: string
          sent?: boolean
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          days_after?: number
          id?: string
          message?: string
          scheduled_at?: string
          sent?: boolean
          user_id?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      login_logs: {
        Row: {
          created_at: string
          id: string
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          audio_url: string | null
          content: string | null
          created_at: string
          delivered: boolean
          id: string
          image_url: string | null
          receiver_id: string
          seen: boolean
          sender_id: string
        }
        Insert: {
          audio_url?: string | null
          content?: string | null
          created_at?: string
          delivered?: boolean
          id?: string
          image_url?: string | null
          receiver_id: string
          seen?: boolean
          sender_id: string
        }
        Update: {
          audio_url?: string | null
          content?: string | null
          created_at?: string
          delivered?: boolean
          id?: string
          image_url?: string | null
          receiver_id?: string
          seen?: boolean
          sender_id?: string
        }
        Relationships: []
      }
      page_conversations: {
        Row: {
          created_at: string
          id: string
          is_spam: boolean
          last_message_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_spam?: boolean
          last_message_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_spam?: boolean
          last_message_at?: string
          user_id?: string
        }
        Relationships: []
      }
      page_messages: {
        Row: {
          audio_url: string | null
          content: string | null
          conversation_id: string
          created_at: string
          from_page: boolean
          id: string
          image_url: string | null
          seen: boolean
          sender_id: string
        }
        Insert: {
          audio_url?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string
          from_page?: boolean
          id?: string
          image_url?: string | null
          seen?: boolean
          sender_id: string
        }
        Update: {
          audio_url?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          from_page?: boolean
          id?: string
          image_url?: string | null
          seen?: boolean
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "page_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          admin_id: string | null
          amount_due: number
          amount_paid: number
          created_at: string
          id: string
          note: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          amount_due?: number
          amount_paid?: number
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          amount_due?: number
          amount_paid?: number
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          friend_code: string
          id: string
          is_blocked: boolean
          last_seen: string
          notif_enabled: boolean
          online: boolean
          referral_code: string
          referred_by: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          friend_code: string
          id: string
          is_blocked?: boolean
          last_seen?: string
          notif_enabled?: boolean
          online?: boolean
          referral_code: string
          referred_by?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          friend_code?: string
          id?: string
          is_blocked?: boolean
          last_seen?: string
          notif_enabled?: boolean
          online?: boolean
          referral_code?: string
          referred_by?: string | null
          username?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          admin_id: string
          content: string
          created_at: string
          id: string
          shared: boolean
          title: string
        }
        Insert: {
          admin_id: string
          content: string
          created_at?: string
          id?: string
          shared?: boolean
          title: string
        }
        Update: {
          admin_id?: string
          content?: string
          created_at?: string
          id?: string
          shared?: boolean
          title?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          bonus_amount: number
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          status: string
        }
        Insert: {
          bonus_amount?: number
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          status?: string
        }
        Update: {
          bonus_amount?: number
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      spam_list: {
        Row: {
          created_at: string
          id: string
          spammed_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          spammed_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          spammed_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notes: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          note: string
          user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          note: string
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          note?: string
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
      user_tags: {
        Row: {
          created_at: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_credits: {
        Args: {
          _amount: number
          _note: string
          _type: string
          _user_id: string
        }
        Returns: number
      }
      gen_code: { Args: { prefix: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "admin" | "super_admin"
      call_status:
        | "ringing"
        | "active"
        | "ended"
        | "missed"
        | "declined"
        | "canceled"
      call_type: "voice" | "video"
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
    Enums: {
      app_role: ["user", "admin", "super_admin"],
      call_status: [
        "ringing",
        "active",
        "ended",
        "missed",
        "declined",
        "canceled",
      ],
      call_type: ["voice", "video"],
    },
  },
} as const
