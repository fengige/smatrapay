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
      installation_attachments: {
        Row: {
          assignment_id: string | null
          created_at: string
          id: string
          kind: string
          meter_id: string
          storage_path: string
          uploaded_by: string | null
          vendor_id: string
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          meter_id: string
          storage_path: string
          uploaded_by?: string | null
          vendor_id: string
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          meter_id?: string
          storage_path?: string
          uploaded_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installation_attachments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "meter_installation_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_attachments_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      installation_team_members: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string | null
          role: string
          status: string
          team_id: string
          updated_at: string
          user_id: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          role?: string
          status?: string
          team_id: string
          updated_at?: string
          user_id?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string
          status?: string
          team_id?: string
          updated_at?: string
          user_id?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installation_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "installation_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      installation_teams: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          leader_name: string | null
          name: string
          phone: string | null
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          leader_name?: string | null
          name: string
          phone?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          leader_name?: string | null
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: []
      }
      meter_activation_history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          meter_id: string
          new_status: string | null
          notes: string | null
          previous_status: string | null
          reason: string | null
          vendor_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meter_id: string
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
          reason?: string | null
          vendor_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meter_id?: string
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
          reason?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_activation_history_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
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
      meter_installation_assignments: {
        Row: {
          assigned_by: string | null
          assignment_number: string
          completed_at: string | null
          completion_notes: string | null
          completion_reading: number | null
          created_at: string
          id: string
          installer_name: string | null
          location: string | null
          meter_id: string
          notes: string | null
          resident_id: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          status: Database["public"]["Enums"]["installation_assignment_status"]
          team_id: string | null
          updated_at: string
          vendor_id: string
          zone_id: number | null
        }
        Insert: {
          assigned_by?: string | null
          assignment_number?: string
          completed_at?: string | null
          completion_notes?: string | null
          completion_reading?: number | null
          created_at?: string
          id?: string
          installer_name?: string | null
          location?: string | null
          meter_id: string
          notes?: string | null
          resident_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["installation_assignment_status"]
          team_id?: string | null
          updated_at?: string
          vendor_id: string
          zone_id?: number | null
        }
        Update: {
          assigned_by?: string | null
          assignment_number?: string
          completed_at?: string | null
          completion_notes?: string | null
          completion_reading?: number | null
          created_at?: string
          id?: string
          installer_name?: string | null
          location?: string | null
          meter_id?: string
          notes?: string | null
          resident_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["installation_assignment_status"]
          team_id?: string | null
          updated_at?: string
          vendor_id?: string
          zone_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_installation_assignments_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_installation_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "installation_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_installation_assignments_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["zone_id"]
          },
        ]
      }
      meter_price_change_requests: {
        Row: {
          created_at: string
          current_price: number
          id: string
          meter_id: string
          mode: string
          note: string | null
          requested_by: string | null
          requested_price: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          value: number
          vendor_id: string
        }
        Insert: {
          created_at?: string
          current_price: number
          id?: string
          meter_id: string
          mode: string
          note?: string | null
          requested_by?: string | null
          requested_price: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          value: number
          vendor_id: string
        }
        Update: {
          created_at?: string
          current_price?: number
          id?: string
          meter_id?: string
          mode?: string
          note?: string | null
          requested_by?: string | null
          requested_price?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          value?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_price_change_requests_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_reading_attachments: {
        Row: {
          created_at: string
          id: string
          meter_id: string
          reading_id: string
          storage_path: string
          uploaded_by: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meter_id: string
          reading_id: string
          storage_path: string
          uploaded_by?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meter_id?: string
          reading_id?: string
          storage_path?: string
          uploaded_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_reading_attachments_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_reading_attachments_reading_id_fkey"
            columns: ["reading_id"]
            isOneToOne: false
            referencedRelation: "meter_readings"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          consumption: number | null
          created_at: string
          id: string
          meter_id: string
          notes: string | null
          previous_reading: number | null
          reading: number
          reading_date: string
          reading_type: string
          recorded_by: string | null
          resident_id: string | null
          status: string
          unit: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          consumption?: number | null
          created_at?: string
          id?: string
          meter_id: string
          notes?: string | null
          previous_reading?: number | null
          reading: number
          reading_date?: string
          reading_type?: string
          recorded_by?: string | null
          resident_id?: string | null
          status?: string
          unit?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          consumption?: number | null
          created_at?: string
          id?: string
          meter_id?: string
          notes?: string | null
          previous_reading?: number | null
          reading?: number
          reading_date?: string
          reading_type?: string
          recorded_by?: string | null
          resident_id?: string | null
          status?: string
          unit?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_supplier_api_settings: {
        Row: {
          api_company_name: string | null
          api_login: string | null
          api_maintenance_clear_credit: string | null
          api_maintenance_clear_tamper: string | null
          api_maintenance_set_overdraft_limit: string | null
          api_password: string | null
          api_pos_purchase: string | null
          api_user_name: string | null
          created_at: string
          id: string
          meter_supplier_id: string
          updated_at: string
          vending_software_id: string | null
        }
        Insert: {
          api_company_name?: string | null
          api_login?: string | null
          api_maintenance_clear_credit?: string | null
          api_maintenance_clear_tamper?: string | null
          api_maintenance_set_overdraft_limit?: string | null
          api_password?: string | null
          api_pos_purchase?: string | null
          api_user_name?: string | null
          created_at?: string
          id?: string
          meter_supplier_id: string
          updated_at?: string
          vending_software_id?: string | null
        }
        Update: {
          api_company_name?: string | null
          api_login?: string | null
          api_maintenance_clear_credit?: string | null
          api_maintenance_clear_tamper?: string | null
          api_maintenance_set_overdraft_limit?: string | null
          api_password?: string | null
          api_pos_purchase?: string | null
          api_user_name?: string | null
          created_at?: string
          id?: string
          meter_supplier_id?: string
          updated_at?: string
          vending_software_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_supplier_api_settings_meter_supplier_id_fkey"
            columns: ["meter_supplier_id"]
            isOneToOne: false
            referencedRelation: "meter_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_supplier_api_settings_vending_software_id_fkey"
            columns: ["vending_software_id"]
            isOneToOne: false
            referencedRelation: "vending_software"
            referencedColumns: ["vending_software_id"]
          },
        ]
      }
      meter_supplier_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          supplier_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          supplier_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_supplier_audit_logs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "meter_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_suppliers: {
        Row: {
          company_name: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          license_number: string | null
          logo_url: string | null
          phone_number: string | null
          status: Database["public"]["Enums"]["supplier_status"]
          updated_at: string
          utility_type: Database["public"]["Enums"]["meter_utility_type"]
          website_url: string | null
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          license_number?: string | null
          logo_url?: string | null
          phone_number?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
          updated_at?: string
          utility_type: Database["public"]["Enums"]["meter_utility_type"]
          website_url?: string | null
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          license_number?: string | null
          logo_url?: string | null
          phone_number?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
          updated_at?: string
          utility_type?: Database["public"]["Enums"]["meter_utility_type"]
          website_url?: string | null
        }
        Relationships: []
      }
      meter_tokens: {
        Row: {
          action: Database["public"]["Enums"]["meter_token_action"]
          amount: number
          created_at: string
          customer_phone: string | null
          expires_at: string
          id: string
          idempotency_key: string | null
          issued_by: string | null
          meter_id: string
          provider: string | null
          provider_metadata: Json | null
          provider_reference: string | null
          provider_state: string
          reference: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          sms_requested: boolean
          status: Database["public"]["Enums"]["meter_token_status"]
          supplier_id: string | null
          token: string
          units: number
          updated_at: string
          vending_software_id: string | null
        }
        Insert: {
          action?: Database["public"]["Enums"]["meter_token_action"]
          amount?: number
          created_at?: string
          customer_phone?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          issued_by?: string | null
          meter_id: string
          provider?: string | null
          provider_metadata?: Json | null
          provider_reference?: string | null
          provider_state?: string
          reference?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          sms_requested?: boolean
          status?: Database["public"]["Enums"]["meter_token_status"]
          supplier_id?: string | null
          token: string
          units?: number
          updated_at?: string
          vending_software_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["meter_token_action"]
          amount?: number
          created_at?: string
          customer_phone?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          issued_by?: string | null
          meter_id?: string
          provider?: string | null
          provider_metadata?: Json | null
          provider_reference?: string | null
          provider_state?: string
          reference?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          sms_requested?: boolean
          status?: Database["public"]["Enums"]["meter_token_status"]
          supplier_id?: string | null
          token?: string
          units?: number
          updated_at?: string
          vending_software_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_tokens_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_tokens_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "meter_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_tokens_vending_software_id_fkey"
            columns: ["vending_software_id"]
            isOneToOne: false
            referencedRelation: "vending_software"
            referencedColumns: ["vending_software_id"]
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
          installation_date: string | null
          installation_location: string | null
          installation_notes: string | null
          installation_status: Database["public"]["Enums"]["meter_installation_status"]
          installer: string | null
          ken: number | null
          krn: number | null
          landlord_id: string | null
          meter_number: string
          price_per_unit: number
          serial_number: string
          sgc: number | null
          status: string
          supplier_id: string | null
          ti: number | null
          type: string
          unit_id: string | null
          updated_at: string
          vending_software_id: string | null
          vendor_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          ea?: number | null
          id?: string
          initial_reading?: number
          installation_date?: string | null
          installation_location?: string | null
          installation_notes?: string | null
          installation_status?: Database["public"]["Enums"]["meter_installation_status"]
          installer?: string | null
          ken?: number | null
          krn?: number | null
          landlord_id?: string | null
          meter_number: string
          price_per_unit?: number
          serial_number: string
          sgc?: number | null
          status?: string
          supplier_id?: string | null
          ti?: number | null
          type: string
          unit_id?: string | null
          updated_at?: string
          vending_software_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          ea?: number | null
          id?: string
          initial_reading?: number
          installation_date?: string | null
          installation_location?: string | null
          installation_notes?: string | null
          installation_status?: Database["public"]["Enums"]["meter_installation_status"]
          installer?: string | null
          ken?: number | null
          krn?: number | null
          landlord_id?: string | null
          meter_number?: string
          price_per_unit?: number
          serial_number?: string
          sgc?: number | null
          status?: string
          supplier_id?: string | null
          ti?: number | null
          type?: string
          unit_id?: string | null
          updated_at?: string
          vending_software_id?: string | null
          vendor_id?: string | null
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
            foreignKeyName: "meters_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "meter_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_vending_software_id_fkey"
            columns: ["vending_software_id"]
            isOneToOne: false
            referencedRelation: "vending_software"
            referencedColumns: ["vending_software_id"]
          },
        ]
      }
      mpesa_transactions: {
        Row: {
          account_reference: string | null
          amount: number | null
          callback_payload: Json | null
          checkout_request_id: string | null
          created_at: string
          environment: string
          flow: string
          id: string
          merchant_request_id: string | null
          mpesa_receipt_number: string | null
          payment_id: string | null
          payment_method_id: string | null
          phone_number: string | null
          result_code: string | null
          result_desc: string | null
          status: string
          transaction_date: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_reference?: string | null
          amount?: number | null
          callback_payload?: Json | null
          checkout_request_id?: string | null
          created_at?: string
          environment?: string
          flow?: string
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt_number?: string | null
          payment_id?: string | null
          payment_method_id?: string | null
          phone_number?: string | null
          result_code?: string | null
          result_desc?: string | null
          status?: string
          transaction_date?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_reference?: string | null
          amount?: number | null
          callback_payload?: Json | null
          checkout_request_id?: string | null
          created_at?: string
          environment?: string
          flow?: string
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt_number?: string | null
          payment_id?: string | null
          payment_method_id?: string | null
          phone_number?: string | null
          result_code?: string | null
          result_desc?: string | null
          status?: string
          transaction_date?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          metadata: Json
          read_at: string | null
          resource_id: string | null
          resource_type: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          read_at?: string | null
          resource_id?: string | null
          resource_type?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          read_at?: string | null
          resource_id?: string | null
          resource_type?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_method_accounts: {
        Row: {
          account_name: string | null
          account_number: string
          agent_id: string | null
          bank_name: string | null
          branch: string | null
          created_at: string
          created_by: string | null
          details: string | null
          id: string
          is_active: boolean
          is_default: boolean
          landlord_id: string | null
          paybill_number: string | null
          payment_method_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
          user_type: string
          vendor_id: string | null
        }
        Insert: {
          account_name?: string | null
          account_number: string
          agent_id?: string | null
          bank_name?: string | null
          branch?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          landlord_id?: string | null
          paybill_number?: string | null
          payment_method_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          user_type: string
          vendor_id?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string
          agent_id?: string | null
          bank_name?: string | null
          branch?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          landlord_id?: string | null
          paybill_number?: string | null
          payment_method_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          user_type?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_method_accounts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_method_accounts_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_method_accounts_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_method_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_method_accounts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_method_configurations: {
        Row: {
          account_reference: string | null
          b2c_enabled: boolean
          b2c_initiator_name: string | null
          b2c_occasion: string | null
          b2c_remarks: string | null
          b2c_security_credential: string | null
          b2c_short_code: string | null
          business_short_code: string | null
          c2b_enabled: boolean
          c2b_response_type: string
          c2b_short_code: string | null
          consumer_key: string | null
          consumer_secret: string | null
          country: string
          created_at: string
          currency: string
          enabled: boolean
          environment: string
          id: string
          owner_id: string | null
          passkey: string | null
          payment_method_id: string
          stk_enabled: boolean
          transaction_desc: string | null
          transaction_type: string
          updated_at: string
        }
        Insert: {
          account_reference?: string | null
          b2c_enabled?: boolean
          b2c_initiator_name?: string | null
          b2c_occasion?: string | null
          b2c_remarks?: string | null
          b2c_security_credential?: string | null
          b2c_short_code?: string | null
          business_short_code?: string | null
          c2b_enabled?: boolean
          c2b_response_type?: string
          c2b_short_code?: string | null
          consumer_key?: string | null
          consumer_secret?: string | null
          country?: string
          created_at?: string
          currency?: string
          enabled?: boolean
          environment?: string
          id?: string
          owner_id?: string | null
          passkey?: string | null
          payment_method_id: string
          stk_enabled?: boolean
          transaction_desc?: string | null
          transaction_type?: string
          updated_at?: string
        }
        Update: {
          account_reference?: string | null
          b2c_enabled?: boolean
          b2c_initiator_name?: string | null
          b2c_occasion?: string | null
          b2c_remarks?: string | null
          b2c_security_credential?: string | null
          b2c_short_code?: string | null
          business_short_code?: string | null
          c2b_enabled?: boolean
          c2b_response_type?: string
          c2b_short_code?: string | null
          consumer_key?: string | null
          consumer_secret?: string | null
          country?: string
          created_at?: string
          currency?: string
          enabled?: boolean
          environment?: string
          id?: string
          owner_id?: string | null
          passkey?: string | null
          payment_method_id?: string
          stk_enabled?: boolean
          transaction_desc?: string | null
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_method_configurations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_method_configurations_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          code: string
          created_at: string
          description: string | null
          environment: string
          id: string
          is_active: boolean
          is_configured: boolean
          logo_url: string | null
          name: string
          payment_type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          is_configured?: boolean
          logo_url?: string | null
          name: string
          payment_type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          is_configured?: boolean
          logo_url?: string | null
          name?: string
          payment_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          paid_at: string | null
          payee_id: string
          payee_type: string
          payment_account_id: string | null
          payment_method_id: string | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          paid_at?: string | null
          payee_id: string
          payee_type: string
          payment_account_id?: string | null
          payment_method_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          paid_at?: string | null
          payee_id?: string
          payee_type?: string
          payment_account_id?: string | null
          payment_method_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "payment_method_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          building_category: string | null
          building_number: string | null
          city: string | null
          code: string | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          estate: string | null
          id: string
          landlord_id: string | null
          latitude: number | null
          longitude: number | null
          name: string
          number_of_units: number | null
          owner_type: string
          postal_code: string | null
          property_type: string
          route_id: number | null
          state: string | null
          status: Database["public"]["Enums"]["property_status"]
          street_id: number | null
          subtype: string | null
          updated_at: string
          updated_by: string | null
          zone_id: number | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          building_category?: string | null
          building_number?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estate?: string | null
          id?: string
          landlord_id?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          number_of_units?: number | null
          owner_type?: string
          postal_code?: string | null
          property_type?: string
          route_id?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          street_id?: number | null
          subtype?: string | null
          updated_at?: string
          updated_by?: string | null
          zone_id?: number | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          building_category?: string | null
          building_number?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estate?: string | null
          id?: string
          landlord_id?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          number_of_units?: number | null
          owner_type?: string
          postal_code?: string | null
          property_type?: string
          route_id?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          street_id?: number | null
          subtype?: string | null
          updated_at?: string
          updated_by?: string | null
          zone_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["route_id"]
          },
          {
            foreignKeyName: "properties_street_id_fkey"
            columns: ["street_id"]
            isOneToOne: false
            referencedRelation: "streets"
            referencedColumns: ["street_id"]
          },
          {
            foreignKeyName: "properties_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["zone_id"]
          },
        ]
      }
      property_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          property_id: string | null
          property_name: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          property_id?: string | null
          property_name?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          property_id?: string | null
          property_name?: string | null
        }
        Relationships: []
      }
      property_photos: {
        Row: {
          caption: string | null
          category: string
          created_at: string
          id: string
          is_primary: boolean
          property_id: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          category?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          property_id: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          category?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          property_id?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          route_code: string
          route_id: number
          route_name: string
          status: string
          updated_at: string
          zone_id: number
        }
        Insert: {
          created_at?: string
          route_code: string
          route_id?: never
          route_name: string
          status?: string
          updated_at?: string
          zone_id: number
        }
        Update: {
          created_at?: string
          route_code?: string
          route_id?: never
          route_name?: string
          status?: string
          updated_at?: string
          zone_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "routes_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["zone_id"]
          },
        ]
      }
      service_request_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          note: string | null
          request_id: string
          storage_path: string | null
          to_status: string | null
          vendor_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          note?: string | null
          request_id: string
          storage_path?: string | null
          to_status?: string | null
          vendor_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          note?: string | null
          request_id?: string
          storage_path?: string | null
          to_status?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          assigned_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          final_reading: number | null
          id: string
          issue_type: string
          meter_id: string | null
          meter_status_after: string | null
          parts_used: string | null
          preferred_date: string | null
          priority: Database["public"]["Enums"]["service_priority"]
          request_number: string
          resident_acknowledged: boolean
          resident_id: string | null
          resolution: string | null
          status: Database["public"]["Enums"]["service_request_status"]
          team_id: string | null
          technician_id: string | null
          updated_at: string
          vendor_id: string
          work_performed: string | null
          zone_id: number | null
        }
        Insert: {
          assigned_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          final_reading?: number | null
          id?: string
          issue_type: string
          meter_id?: string | null
          meter_status_after?: string | null
          parts_used?: string | null
          preferred_date?: string | null
          priority?: Database["public"]["Enums"]["service_priority"]
          request_number?: string
          resident_acknowledged?: boolean
          resident_id?: string | null
          resolution?: string | null
          status?: Database["public"]["Enums"]["service_request_status"]
          team_id?: string | null
          technician_id?: string | null
          updated_at?: string
          vendor_id: string
          work_performed?: string | null
          zone_id?: number | null
        }
        Update: {
          assigned_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          final_reading?: number | null
          id?: string
          issue_type?: string
          meter_id?: string | null
          meter_status_after?: string | null
          parts_used?: string | null
          preferred_date?: string | null
          priority?: Database["public"]["Enums"]["service_priority"]
          request_number?: string
          resident_acknowledged?: boolean
          resident_id?: string | null
          resolution?: string | null
          status?: Database["public"]["Enums"]["service_request_status"]
          team_id?: string | null
          technician_id?: string | null
          updated_at?: string
          vendor_id?: string
          work_performed?: string | null
          zone_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "installation_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "installation_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["zone_id"]
          },
        ]
      }
      sms_configurations: {
        Row: {
          account_id: string | null
          api_key: string | null
          api_secret: string | null
          api_url: string | null
          client_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          password: string | null
          provider_code: string
          provider_name: string
          sender_id: string | null
          status: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          account_id?: string | null
          api_key?: string | null
          api_secret?: string | null
          api_url?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          password?: string | null
          provider_code: string
          provider_name: string
          sender_id?: string | null
          status?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          account_id?: string | null
          api_key?: string | null
          api_secret?: string | null
          api_url?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          password?: string | null
          provider_code?: string
          provider_name?: string
          sender_id?: string | null
          status?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          configuration_id: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          message: string
          provider_message_id: string | null
          recipient_phone: string
          sender_id: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          configuration_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message: string
          provider_message_id?: string | null
          recipient_phone: string
          sender_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          configuration_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message?: string
          provider_message_id?: string | null
          recipient_phone?: string
          sender_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_configuration_id_fkey"
            columns: ["configuration_id"]
            isOneToOne: false
            referencedRelation: "sms_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      streets: {
        Row: {
          created_at: string
          postal_code: string | null
          route_id: number
          street_id: number
          street_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          postal_code?: string | null
          route_id: number
          street_id?: never
          street_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          postal_code?: string | null
          route_id?: number
          street_id?: never
          street_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streets_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["route_id"]
          },
        ]
      }
      token_sms_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          error: string | null
          id: string
          phone: string
          status: Database["public"]["Enums"]["sms_delivery_status"]
          token_id: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          phone: string
          status?: Database["public"]["Enums"]["sms_delivery_status"]
          token_id: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          phone?: string
          status?: Database["public"]["Enums"]["sms_delivery_status"]
          token_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_sms_logs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "meter_tokens"
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
      user_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
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
      users: {
        Row: {
          address: string | null
          bio: string | null
          building: string | null
          created_at: string
          created_by: string | null
          email: string | null
          email_verified_at: string | null
          id: string
          id_number: string | null
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
          address?: string | null
          bio?: string | null
          building?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_verified_at?: string | null
          id: string
          id_number?: string | null
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
          address?: string | null
          bio?: string | null
          building?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_verified_at?: string | null
          id?: string
          id_number?: string | null
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
      vending_integration_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          duration_ms: number | null
          endpoint: string | null
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: string
          meter_id: string | null
          meter_number: string | null
          operation: string
          provider_reference: string | null
          provider_result_code: string | null
          request_at: string
          request_payload: Json | null
          response_at: string | null
          response_payload: Json | null
          software_code: string | null
          success: boolean
          supplier_id: string | null
          token_id: string | null
          vending_software_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint?: string | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          meter_id?: string | null
          meter_number?: string | null
          operation: string
          provider_reference?: string | null
          provider_result_code?: string | null
          request_at?: string
          request_payload?: Json | null
          response_at?: string | null
          response_payload?: Json | null
          software_code?: string | null
          success?: boolean
          supplier_id?: string | null
          token_id?: string | null
          vending_software_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint?: string | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          meter_id?: string | null
          meter_number?: string | null
          operation?: string
          provider_reference?: string | null
          provider_result_code?: string | null
          request_at?: string
          request_payload?: Json | null
          response_at?: string | null
          response_payload?: Json | null
          software_code?: string | null
          success?: boolean
          supplier_id?: string | null
          token_id?: string | null
          vending_software_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vending_integration_logs_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vending_integration_logs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "meter_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vending_integration_logs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "meter_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vending_integration_logs_vending_software_id_fkey"
            columns: ["vending_software_id"]
            isOneToOne: false
            referencedRelation: "vending_software"
            referencedColumns: ["vending_software_id"]
          },
        ]
      }
      vending_software: {
        Row: {
          archived_at: string | null
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          logo_url: string | null
          name: string
          status: string
          updated_at: string
          updated_by: string | null
          vending_software_id: string
          version: string | null
        }
        Insert: {
          archived_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          logo_url?: string | null
          name: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          vending_software_id?: string
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          logo_url?: string | null
          name?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          vending_software_id?: string
          version?: string | null
        }
        Relationships: []
      }
      vending_software_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          meter_id: string | null
          new_status: string | null
          previous_status: string | null
          reason: string | null
          software_name: string | null
          vending_software_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          meter_id?: string | null
          new_status?: string | null
          previous_status?: string | null
          reason?: string | null
          software_name?: string | null
          vending_software_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          meter_id?: string | null
          new_status?: string | null
          previous_status?: string | null
          reason?: string | null
          software_name?: string | null
          vending_software_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vending_software_audit_logs_vending_software_id_fkey"
            columns: ["vending_software_id"]
            isOneToOne: false
            referencedRelation: "vending_software"
            referencedColumns: ["vending_software_id"]
          },
        ]
      }
      vendor_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string | null
          vendor_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          vendor_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          vendor_id?: string
        }
        Relationships: []
      }
      vendor_tenant_applications: {
        Row: {
          created_at: string
          details: Json
          id: string
          messages: Json
          resident_id: string | null
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          messages?: Json
          resident_id?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          messages?: Json
          resident_id?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: []
      }
      zone_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          zone_id: number | null
          zone_name: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          zone_id?: number | null
          zone_name?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          zone_id?: number | null
          zone_name?: string | null
        }
        Relationships: []
      }
      zones: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          status: string
          updated_at: string
          vendor_id: string | null
          zone_id: number
          zone_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string | null
          zone_id?: never
          zone_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string | null
          zone_id?: never
          zone_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_meter_assignment: {
        Args: {
          p_action: string
          p_holder: string
          p_holder_id: string
          p_meter_ids: string[]
        }
        Returns: Json
      }
      bulk_add_meters: { Args: { p_payload: Json }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      vendor_can_access_zone: {
        Args: { _vendor: string; _zone: number }
        Returns: boolean
      }
      vendor_zone_ids: {
        Args: { _vendor: string }
        Returns: {
          zone_id: number
        }[]
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
      installation_assignment_status:
        | "pending"
        | "scheduled"
        | "assigned"
        | "in_progress"
        | "completed"
        | "failed"
        | "cancelled"
      meter_installation_status:
        | "not_installed"
        | "scheduled"
        | "installed"
        | "failed"
        | "replaced"
      meter_token_action:
        | "credit"
        | "key_change"
        | "clear_tamper"
        | "clear_credit"
        | "set_max_overdraft"
      meter_token_status: "issued" | "revoked" | "expired"
      meter_utility_type: "Electricity" | "Water" | "Gas" | "Multi-Utility"
      payment_status: "pending" | "completed" | "failed" | "cancelled"
      property_status: "active" | "archived"
      service_priority: "low" | "medium" | "high" | "critical"
      service_request_status:
        | "open"
        | "assigned"
        | "in_progress"
        | "resolved"
        | "closed"
        | "cancelled"
      sms_delivery_status: "queued" | "sent" | "failed"
      supplier_status: "Active" | "Inactive" | "Suspended"
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
      installation_assignment_status: [
        "pending",
        "scheduled",
        "assigned",
        "in_progress",
        "completed",
        "failed",
        "cancelled",
      ],
      meter_installation_status: [
        "not_installed",
        "scheduled",
        "installed",
        "failed",
        "replaced",
      ],
      meter_token_action: [
        "credit",
        "key_change",
        "clear_tamper",
        "clear_credit",
        "set_max_overdraft",
      ],
      meter_token_status: ["issued", "revoked", "expired"],
      meter_utility_type: ["Electricity", "Water", "Gas", "Multi-Utility"],
      payment_status: ["pending", "completed", "failed", "cancelled"],
      property_status: ["active", "archived"],
      service_priority: ["low", "medium", "high", "critical"],
      service_request_status: [
        "open",
        "assigned",
        "in_progress",
        "resolved",
        "closed",
        "cancelled",
      ],
      sms_delivery_status: ["queued", "sent", "failed"],
      supplier_status: ["Active", "Inactive", "Suspended"],
      unit_status: ["vacant", "occupied", "maintenance", "archived"],
      user_status: ["active", "inactive", "suspended", "pending"],
    },
  },
} as const
