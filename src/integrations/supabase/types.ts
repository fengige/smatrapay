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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      properties: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          code: string | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          postal_code: string | null
          property_type: string
          state: string | null
          status: Database["public"]["Enums"]["property_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          postal_code?: string | null
          property_type?: string
          state?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          postal_code?: string | null
          property_type?: string
          state?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      unit_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          notes: string | null
          role: Database["public"]["Enums"]["assignment_role"]
          start_date: string
          unit_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          role: Database["public"]["Enums"]["assignment_role"]
          start_date?: string
          unit_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          role?: Database["public"]["Enums"]["assignment_role"]
          start_date?: string
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_assignments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          bedrooms: number | null
          building: string | null
          created_at: string
          created_by: string | null
          floor: string | null
          id: string
          notes: string | null
          property_id: string
          status: Database["public"]["Enums"]["unit_status"]
          unit_number: string
          unit_type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bedrooms?: number | null
          building?: string | null
          created_at?: string
          created_by?: string | null
          floor?: string | null
          id?: string
          notes?: string | null
          property_id: string
          status?: Database["public"]["Enums"]["unit_status"]
          unit_number: string
          unit_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bedrooms?: number | null
          building?: string | null
          created_at?: string
          created_by?: string | null
          floor?: string | null
          id?: string
          notes?: string | null
          property_id?: string
          status?: Database["public"]["Enums"]["unit_status"]
          unit_number?: string
          unit_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
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
      users: {
        Row: {
          bio: string | null
          building: string | null
          created_at: string
          created_by: string | null
          email: string | null
          email_verified_at: string | null
          id: string
          move_in_date: string | null
          name: string | null
          notes: string | null
          phone: string | null
          profile_image: string | null
          profile_image_url: string | null
          property: string | null
          status: Database["public"]["Enums"]["user_status"]
          unit_number: string | null
          updated_at: string
          updated_by: string | null
          username: string | null
        }
        Insert: {
          bio?: string | null
          building?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_verified_at?: string | null
          id: string
          move_in_date?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          profile_image?: string | null
          profile_image_url?: string | null
          property?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          unit_number?: string | null
          updated_at?: string
          updated_by?: string | null
          username?: string | null
        }
        Update: {
          bio?: string | null
          building?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_verified_at?: string | null
          id?: string
          move_in_date?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          profile_image?: string | null
          profile_image_url?: string | null
          property?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          unit_number?: string | null
          updated_at?: string
          updated_by?: string | null
          username?: string | null
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
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "resident"
        | "landlord"
        | "vendor"
        | "agent"
        | "service_provider"
      assignment_role: "resident" | "landlord"
      property_status: "active" | "archived"
      unit_status: "vacant" | "occupied" | "maintenance" | "archived"
      user_status: "active" | "inactive" | "suspended" | "pending"
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
      app_role: [
        "admin",
        "moderator",
        "user",
        "resident",
        "landlord",
        "vendor",
        "agent",
        "service_provider",
      ],
      assignment_role: ["resident", "landlord"],
      property_status: ["active", "archived"],
      unit_status: ["vacant", "occupied", "maintenance", "archived"],
      user_status: ["active", "inactive", "suspended", "pending"],
    },
  },
} as const
