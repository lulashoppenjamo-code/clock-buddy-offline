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
      cleaning_areas: {
        Row: {
          active: boolean
          branch: string
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          active?: boolean
          branch: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          active?: boolean
          branch?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      cleaning_logs: {
        Row: {
          area_id: string
          branch: string
          client_id: string
          completed_at: string
          created_at: string
          device_label: string | null
          employee_id: string
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          owner_id: string
          photo_after_path: string | null
          photo_before_path: string | null
          task_id: string
        }
        Insert: {
          area_id: string
          branch: string
          client_id: string
          completed_at?: string
          created_at?: string
          device_label?: string | null
          employee_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          owner_id: string
          photo_after_path?: string | null
          photo_before_path?: string | null
          task_id: string
        }
        Update: {
          area_id?: string
          branch?: string
          client_id?: string
          completed_at?: string
          created_at?: string
          device_label?: string | null
          employee_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          owner_id?: string
          photo_after_path?: string | null
          photo_before_path?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_logs_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "cleaning_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_tasks: {
        Row: {
          active: boolean
          area_id: string
          created_at: string
          description: string | null
          frequency: Database["public"]["Enums"]["cleaning_frequency"]
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          active?: boolean
          area_id: string
          created_at?: string
          description?: string | null
          frequency?: Database["public"]["Enums"]["cleaning_frequency"]
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          active?: boolean
          area_id?: string
          created_at?: string
          description?: string | null
          frequency?: Database["public"]["Enums"]["cleaning_frequency"]
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_tasks_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "cleaning_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          branch: string | null
          color: string
          created_at: string
          hire_date: string | null
          id: string
          name: string
          owner_id: string
          pin: string
        }
        Insert: {
          active?: boolean
          branch?: string | null
          color?: string
          created_at?: string
          hire_date?: string | null
          id?: string
          name: string
          owner_id: string
          pin: string
        }
        Update: {
          active?: boolean
          branch?: string | null
          color?: string
          created_at?: string
          hire_date?: string | null
          id?: string
          name?: string
          owner_id?: string
          pin?: string
        }
        Relationships: []
      }
      supplies: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          id: string
          name: string
          owner_id: string
          reorder_days: number
          stock_mina: number
          stock_morelos: number
          unit: string | null
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          reorder_days?: number
          stock_mina?: number
          stock_morelos?: number
          unit?: string | null
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          reorder_days?: number
          stock_mina?: number
          stock_morelos?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "supply_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
        }
        Relationships: []
      }
      supply_movements: {
        Row: {
          branch: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          owner_id: string
          quantity: number
          request_id: string | null
          supply_id: string
          type: Database["public"]["Enums"]["supply_movement_type"]
        }
        Insert: {
          branch: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          quantity: number
          request_id?: string | null
          supply_id: string
          type: Database["public"]["Enums"]["supply_movement_type"]
        }
        Update: {
          branch?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          quantity?: number
          request_id?: string | null
          supply_id?: string
          type?: Database["public"]["Enums"]["supply_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "supply_movements_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "supply_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_movements_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_requests: {
        Row: {
          branch: string
          client_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          delivered_at: string | null
          employee_id: string
          id: string
          notes: string | null
          owner_id: string
          quantity: number
          reason: Database["public"]["Enums"]["supply_reason"]
          requested_at: string
          status: Database["public"]["Enums"]["supply_status"]
          supply_id: string
        }
        Insert: {
          branch: string
          client_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          delivered_at?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          owner_id: string
          quantity: number
          reason?: Database["public"]["Enums"]["supply_reason"]
          requested_at?: string
          status?: Database["public"]["Enums"]["supply_status"]
          supply_id: string
        }
        Update: {
          branch?: string
          client_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          delivered_at?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          owner_id?: string
          quantity?: number
          reason?: Database["public"]["Enums"]["supply_reason"]
          requested_at?: string
          status?: Database["public"]["Enums"]["supply_status"]
          supply_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_supply_id_fkey"
            columns: ["supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          accuracy: number | null
          client_id: string
          created_at: string
          device_label: string | null
          employee_id: string
          id: string
          latitude: number | null
          longitude: number | null
          occurred_at: string
          owner_id: string
          photo_path: string | null
          type: Database["public"]["Enums"]["entry_type"]
        }
        Insert: {
          accuracy?: number | null
          client_id: string
          created_at?: string
          device_label?: string | null
          employee_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          occurred_at: string
          owner_id: string
          photo_path?: string | null
          type: Database["public"]["Enums"]["entry_type"]
        }
        Update: {
          accuracy?: number | null
          client_id?: string
          created_at?: string
          device_label?: string | null
          employee_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          occurred_at?: string
          owner_id?: string
          photo_path?: string | null
          type?: Database["public"]["Enums"]["entry_type"]
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          days: number
          employee_id: string
          id: string
          owner_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days: number
          employee_id: string
          id?: string
          owner_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days?: number
          employee_id?: string
          id?: string
          owner_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      vacation_requests: {
        Row: {
          admin_comment: string | null
          client_id: string
          created_at: string
          days_requested: number
          decided_at: string | null
          decided_by: string | null
          employee_comment: string | null
          employee_id: string
          end_date: string
          id: string
          owner_id: string
          start_date: string
          status: Database["public"]["Enums"]["vacation_status"]
          updated_at: string
        }
        Insert: {
          admin_comment?: string | null
          client_id: string
          created_at?: string
          days_requested: number
          decided_at?: string | null
          decided_by?: string | null
          employee_comment?: string | null
          employee_id: string
          end_date: string
          id?: string
          owner_id: string
          start_date: string
          status?: Database["public"]["Enums"]["vacation_status"]
          updated_at?: string
        }
        Update: {
          admin_comment?: string | null
          client_id?: string
          created_at?: string
          days_requested?: number
          decided_at?: string | null
          decided_by?: string | null
          employee_comment?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          owner_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["vacation_status"]
          updated_at?: string
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
      cleaning_frequency: "daily" | "weekly" | "monthly"
      entry_type: "clock_in" | "clock_out" | "break_start" | "break_end"
      supply_movement_type: "entrada" | "salida" | "ajuste"
      supply_reason: "terminado" | "queda_poco" | "danado" | "otro"
      supply_status: "pendiente" | "aprobada" | "entregada" | "rechazada"
      vacation_status: "pendiente" | "aprobada" | "rechazada"
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
      cleaning_frequency: ["daily", "weekly", "monthly"],
      entry_type: ["clock_in", "clock_out", "break_start", "break_end"],
      supply_movement_type: ["entrada", "salida", "ajuste"],
      supply_reason: ["terminado", "queda_poco", "danado", "otro"],
      supply_status: ["pendiente", "aprobada", "entregada", "rechazada"],
      vacation_status: ["pendiente", "aprobada", "rechazada"],
    },
  },
} as const
