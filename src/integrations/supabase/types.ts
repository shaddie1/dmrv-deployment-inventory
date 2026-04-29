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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      deployments: {
        Row: {
          created_at: string
          created_by: string
          deployment_date: string
          field_officer_id: string
          gps_latitude: number | null
          gps_longitude: number | null
          id: string
          item_id: string
          location_name: string | null
          notes: string | null
          project_id: string
          quantity: number
          status: Database["public"]["Enums"]["deployment_status"]
          stock_batch_id: string
          updated_at: string
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deployment_date?: string
          field_officer_id: string
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          item_id: string
          location_name?: string | null
          notes?: string | null
          project_id: string
          quantity: number
          status?: Database["public"]["Enums"]["deployment_status"]
          stock_batch_id: string
          updated_at?: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deployment_date?: string
          field_officer_id?: string
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          item_id?: string
          location_name?: string | null
          notes?: string | null
          project_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["deployment_status"]
          stock_batch_id?: string
          updated_at?: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deployments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployments_stock_batch_id_fkey"
            columns: ["stock_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_files: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["evidence_event_type"]
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          flag_reason: string | null
          gps_latitude: number | null
          gps_longitude: number | null
          id: string
          is_flagged: boolean
          linked_entity_id: string
          linked_entity_type: string
          project_id: string | null
          sha256_hash: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["evidence_event_type"]
          file_name: string
          file_size?: number | null
          file_type?: string
          file_url: string
          flag_reason?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          is_flagged?: boolean
          linked_entity_id: string
          linked_entity_type: string
          project_id?: string | null
          sha256_hash: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["evidence_event_type"]
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          flag_reason?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          is_flagged?: boolean
          linked_entity_id?: string
          linked_entity_type?: string
          project_id?: string | null
          sha256_hash?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          category: Database["public"]["Enums"]["item_category"]
          created_at: string
          description: string | null
          id: string
          low_stock_threshold: number
          name: string
          specifications: Json | null
          unit_of_measure: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["item_category"]
          created_at?: string
          description?: string | null
          id?: string
          low_stock_threshold?: number
          name: string
          specifications?: Json | null
          unit_of_measure?: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["item_category"]
          created_at?: string
          description?: string | null
          id?: string
          low_stock_threshold?: number
          name?: string
          specifications?: Json | null
          unit_of_measure?: string
          updated_at?: string
        }
        Relationships: []
      }
      pcb_repairs: {
        Row: {
          assigned_at: string | null
          batch: string | null
          completed_at: string | null
          components_replaced: string | null
          cooker_model: string | null
          created_at: string
          created_by: string
          deployment_id: string | null
          device_origin: string | null
          device_type: string | null
          diagnosis_notes: string | null
          fault_category: string | null
          fault_description: string
          fault_source: string | null
          id: string
          is_charger_repair: boolean
          item_id: string | null
          meter_replaced: boolean | null
          priority: string
          project_id: string | null
          repair_action: string | null
          repair_notes: string | null
          replacement_device_type: string | null
          replacement_serial: string | null
          serial_number: string
          status: Database["public"]["Enums"]["repair_status"]
          technician_id: string | null
          total_cost: number | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          batch?: string | null
          completed_at?: string | null
          components_replaced?: string | null
          cooker_model?: string | null
          created_at?: string
          created_by: string
          deployment_id?: string | null
          device_origin?: string | null
          device_type?: string | null
          diagnosis_notes?: string | null
          fault_category?: string | null
          fault_description?: string
          fault_source?: string | null
          id?: string
          is_charger_repair?: boolean
          item_id?: string | null
          meter_replaced?: boolean | null
          priority?: string
          project_id?: string | null
          repair_action?: string | null
          repair_notes?: string | null
          replacement_device_type?: string | null
          replacement_serial?: string | null
          serial_number?: string
          status?: Database["public"]["Enums"]["repair_status"]
          technician_id?: string | null
          total_cost?: number | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          batch?: string | null
          completed_at?: string | null
          components_replaced?: string | null
          cooker_model?: string | null
          created_at?: string
          created_by?: string
          deployment_id?: string | null
          device_origin?: string | null
          device_type?: string | null
          diagnosis_notes?: string | null
          fault_category?: string | null
          fault_description?: string
          fault_source?: string | null
          id?: string
          is_charger_repair?: boolean
          item_id?: string | null
          meter_replaced?: boolean | null
          priority?: string
          project_id?: string | null
          repair_action?: string | null
          repair_notes?: string | null
          replacement_device_type?: string | null
          replacement_serial?: string | null
          serial_number?: string
          status?: Database["public"]["Enums"]["repair_status"]
          technician_id?: string | null
          total_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pcb_repairs_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pcb_repairs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pcb_repairs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget: number | null
          country: string
          created_at: string
          description: string | null
          id: string
          name: string
          region: string | null
          responsible_officer_id: string | null
          target_quantity: number
          total_income: number | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          country?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          region?: string | null
          responsible_officer_id?: string | null
          target_quantity?: number
          total_income?: number | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          country?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          region?: string | null
          responsible_officer_id?: string | null
          target_quantity?: number
          total_income?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      repair_parts: {
        Row: {
          added_by: string
          created_at: string
          id: string
          notes: string | null
          part_name: string
          quantity: number
          repair_id: string
          unit_cost: number | null
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          notes?: string | null
          part_name: string
          quantity?: number
          repair_id: string
          unit_cost?: number | null
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          notes?: string | null
          part_name?: string
          quantity?: number
          repair_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_parts_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "pcb_repairs"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          actual_arrival: string | null
          created_at: string
          created_by: string
          expected_arrival: string | null
          id: string
          item_id: string
          notes: string | null
          origin_country: string
          procurement_category: Database["public"]["Enums"]["procurement_category"]
          procurement_type: string
          project_id: string | null
          quantity: number
          status: Database["public"]["Enums"]["shipment_status"]
          supplier: string
          total_cost: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          actual_arrival?: string | null
          created_at?: string
          created_by: string
          expected_arrival?: string | null
          id?: string
          item_id: string
          notes?: string | null
          origin_country?: string
          procurement_category?: Database["public"]["Enums"]["procurement_category"]
          procurement_type?: string
          project_id?: string | null
          quantity: number
          status?: Database["public"]["Enums"]["shipment_status"]
          supplier?: string
          total_cost?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          actual_arrival?: string | null
          created_at?: string
          created_by?: string
          expected_arrival?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          origin_country?: string
          procurement_category?: Database["public"]["Enums"]["procurement_category"]
          procurement_type?: string
          project_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["shipment_status"]
          supplier?: string
          total_cost?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjusted_by: string
          created_at: string
          id: string
          quantity_change: number
          reason: string
          stock_batch_id: string
        }
        Insert: {
          adjusted_by: string
          created_at?: string
          id?: string
          quantity_change: number
          reason: string
          stock_batch_id: string
        }
        Update: {
          adjusted_by?: string
          created_at?: string
          id?: string
          quantity_change?: number
          reason?: string
          stock_batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_stock_batch_id_fkey"
            columns: ["stock_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_batches: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          item_id: string
          notes: string | null
          quantity_available: number
          quantity_deployed: number
          quantity_received: number
          shipment_id: string
          updated_at: string
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          quantity_available: number
          quantity_deployed?: number
          quantity_received: number
          shipment_id: string
          updated_at?: string
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          quantity_available?: number
          quantity_deployed?: number
          quantity_received?: number
          shipment_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
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
      app_role: "admin" | "warehouse_manager" | "field_officer" | "auditor"
      deployment_status:
        | "scheduled"
        | "in_transit"
        | "deployed"
        | "verified"
        | "flagged"
      evidence_event_type:
        | "shipment"
        | "deployment"
        | "audit"
        | "stock_adjustment"
      item_category:
        | "cookstove"
        | "iot_device"
        | "antenna"
        | "sensor"
        | "other"
        | "dmrv_pcb"
        | "dc_pcb"
        | "ac_pcb"
        | "home_gas_meter"
        | "industrial_gas_meter"
        | "tool"
        | "consumable"
      procurement_category:
        | "consumable"
        | "tool"
        | "pcb_dc"
        | "pcb_ac"
        | "other"
      repair_status:
        | "intake"
        | "diagnosis"
        | "in_repair"
        | "testing"
        | "completed"
        | "scrapped"
      shipment_status:
        | "ordered"
        | "in_transit"
        | "customs"
        | "received"
        | "partial"
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
      app_role: ["admin", "warehouse_manager", "field_officer", "auditor"],
      deployment_status: [
        "scheduled",
        "in_transit",
        "deployed",
        "verified",
        "flagged",
      ],
      evidence_event_type: [
        "shipment",
        "deployment",
        "audit",
        "stock_adjustment",
      ],
      item_category: [
        "cookstove",
        "iot_device",
        "antenna",
        "sensor",
        "other",
        "dmrv_pcb",
        "dc_pcb",
        "ac_pcb",
        "home_gas_meter",
        "industrial_gas_meter",
        "tool",
        "consumable",
      ],
      procurement_category: ["consumable", "tool", "pcb_dc", "pcb_ac", "other"],
      repair_status: [
        "intake",
        "diagnosis",
        "in_repair",
        "testing",
        "completed",
        "scrapped",
      ],
      shipment_status: [
        "ordered",
        "in_transit",
        "customs",
        "received",
        "partial",
      ],
    },
  },
} as const
