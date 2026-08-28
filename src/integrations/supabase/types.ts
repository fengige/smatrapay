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
      address_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          property_id: string
        }
        Insert: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          property_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "address_audit_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      assignment_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          assignment_id: string | null
          changes: Json
          created_at: string
          id: string
          new_unit_id: string | null
          old_unit_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          assignment_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          new_unit_id?: string | null
          old_unit_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          assignment_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          new_unit_id?: string | null
          old_unit_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      meter_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          meter_id: string
        }
        Insert: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          meter_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          meter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_audit_logs_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      meters: {
        Row: {
          agent_id: string | null
          created_at: string
          ea: number | null
          id: string
          initial_reading: number
          ken: number | null
          krn: number | null
          landlord_id: string | null
          meter_number: string
          price_per_unit: number
          serial_number: string
          sgc: number | null
          status: string
          ti: number | null
          type: string
          unit_id: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          ea?: number | null
          id?: string
          initial_reading?: number
          ken?: number | null
          krn?: number | null
          landlord_id?: string | null
          meter_number: string
          price_per_unit?: number
          serial_number: string
          sgc?: number | null
          status?: string
          ti?: number | null
          type: string
          unit_id?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          ea?: number | null
          id?: string
          initial_reading?: number
          ken?: number | null
          krn?: number | null
          landlord_id?: string | null
          meter_number?: string
          price_per_unit?: number
          serial_number?: string
          sgc?: number | null
          status?: string
          ti?: number | null
          type?: string
          unit_id?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meters_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          building_category: string | null
          city: string | null
          code: string | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          landlord_id: string | null
          name: string
          number_of_units: number | null
          postal_code: string | null
          property_type: string
          state: string | null
          status: Database["public"]["Enums"]["property_status"]
          subtype: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          building_category?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          landlord_id?: string | null
          name: string
          number_of_units?: number | null
          postal_code?: string | null
          property_type?: string
          state?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          subtype?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          building_category?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          landlord_id?: string | null
          name?: string
          number_of_units?: number | null
          postal_code?: string | null
          property_type?: string
          state?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          subtype?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      unit_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          unit_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          unit_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_audit_logs_unit_id_fkey"
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
          electricity_meter_active: boolean
          electricity_meter_no: string | null
          floor: string | null
          gas_meter_active: boolean
          gas_meter_no: string | null
          id: string
          notes: string | null
          property_id: string
          status: Database["public"]["Enums"]["unit_status"]
          unit_number: string
          unit_type: string | null
          updated_at: string
          updated_by: string | null
          water_meter_active: boolean
          water_meter_no: string | null
        }
        Insert: {
          bedrooms?: number | null
          building?: string | null
          created_at?: string
          created_by?: string | null
          electricity_meter_active?: boolean
          electricity_meter_no?: string | null
          floor?: string | null
          gas_meter_active?: boolean
          gas_meter_no?: string | null
          id?: string
          notes?: string | null
          property_id: string
          status?: Database["public"]["Enums"]["unit_status"]
          unit_number: string
          unit_type?: string | null
          updated_at?: string
          updated_by?: string | null
          water_meter_active?: boolean
          water_meter_no?: string | null
        }
        Update: {
          bedrooms?: number | null
          building?: string | null
          created_at?: string
          created_by?: string | null
          electricity_meter_active?: boolean
          electricity_meter_no?: string | null
          floor?: string | null
          gas_meter_active?: boolean
          gas_meter_no?: string | null
          id?: string
          notes?: string | null
          property_id?: string
          status?: Database["public"]["Enums"]["unit_status"]
          unit_number?: string
          unit_type?: string | null
          updated_at?: string
          updated_by?: string | null
          water_meter_active?: boolean
          water_meter_no?: string | null
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
