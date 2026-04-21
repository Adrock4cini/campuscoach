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
      exam_debriefs: {
        Row: {
          advice_notes: string | null
          chapter_tags: string[]
          class_id: string
          confidence: number
          created_at: string
          date_taken: string
          difficulty: number
          exam_id: string | null
          exam_name: string
          format_tags: string[]
          id: string
          professor_id: string | null
          study_more_tags: string[]
          surprises: string | null
          time_pressure: number
          topics_mentioned: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          advice_notes?: string | null
          chapter_tags?: string[]
          class_id: string
          confidence: number
          created_at?: string
          date_taken: string
          difficulty: number
          exam_id?: string | null
          exam_name: string
          format_tags?: string[]
          id?: string
          professor_id?: string | null
          study_more_tags?: string[]
          surprises?: string | null
          time_pressure: number
          topics_mentioned?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          advice_notes?: string | null
          chapter_tags?: string[]
          class_id?: string
          confidence?: number
          created_at?: string
          date_taken?: string
          difficulty?: number
          exam_id?: string | null
          exam_name?: string
          format_tags?: string[]
          id?: string
          professor_id?: string | null
          study_more_tags?: string[]
          surprises?: string | null
          time_pressure?: number
          topics_mentioned?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      topic_scores: {
        Row: {
          average_confidence: number
          class_id: string
          computed_at: string
          confidence_band: string
          created_at: string
          id: string
          miss_rate: number
          post_exam_mentions: number
          probability: number
          score: number
          star_count: number
          student_count: number
          topic_id: string
          topic_name: string
          total_time_spent_minutes: number
          updated_at: string
        }
        Insert: {
          average_confidence?: number
          class_id: string
          computed_at?: string
          confidence_band?: string
          created_at?: string
          id?: string
          miss_rate?: number
          post_exam_mentions?: number
          probability?: number
          score?: number
          star_count?: number
          student_count?: number
          topic_id: string
          topic_name: string
          total_time_spent_minutes?: number
          updated_at?: string
        }
        Update: {
          average_confidence?: number
          class_id?: string
          computed_at?: string
          confidence_band?: string
          created_at?: string
          id?: string
          miss_rate?: number
          post_exam_mentions?: number
          probability?: number
          score?: number
          star_count?: number
          student_count?: number
          topic_id?: string
          topic_name?: string
          total_time_spent_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      topic_signals: {
        Row: {
          accuracy: number | null
          class_id: string
          confidence: number | null
          created_at: string
          id: string
          incorrect_count: number
          recorded_at: string
          source_id: string | null
          source_type: string
          starred: boolean
          time_spent_minutes: number
          topic_id: string
          topic_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          class_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          incorrect_count?: number
          recorded_at?: string
          source_id?: string | null
          source_type?: string
          starred?: boolean
          time_spent_minutes?: number
          topic_id: string
          topic_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          class_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          incorrect_count?: number
          recorded_at?: string
          source_id?: string | null
          source_type?: string
          starred?: boolean
          time_spent_minutes?: number
          topic_id?: string
          topic_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recompute_topic_scores: {
        Args: { _class_id?: string }
        Returns: undefined
      }
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
