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
      addon_sales: {
        Row: {
          addon_product: string
          branch: string
          client_id: string
          comment: string | null
          created_at: string
          employee_id: string
          employee_name: string
          id: string
          main_product: string
          owner_id: string
          photo_path: string
          reviewed_at: string | null
          reviewed_by: string | null
          sold_at: string
          status: Database["public"]["Enums"]["addon_sale_status"]
          ticket_number: string
          updated_at: string
        }
        Insert: {
          addon_product: string
          branch: string
          client_id: string
          comment?: string | null
          created_at?: string
          employee_id: string
          employee_name: string
          id?: string
          main_product: string
          owner_id: string
          photo_path: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sold_at?: string
          status?: Database["public"]["Enums"]["addon_sale_status"]
          ticket_number: string
          updated_at?: string
        }
        Update: {
          addon_product?: string
          branch?: string
          client_id?: string
          comment?: string | null
          created_at?: string
          employee_id?: string
          employee_name?: string
          id?: string
          main_product?: string
          owner_id?: string
          photo_path?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sold_at?: string
          status?: Database["public"]["Enums"]["addon_sale_status"]
          ticket_number?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      customers: {
        Row: {
          active: boolean
          code: string
          created_at: string
          discount_type: string | null
          email: string | null
          end_date: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
          registered_by_id: string | null
          registered_by_name: string | null
          school: string | null
          start_date: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          discount_type?: string | null
          email?: string | null
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          registered_by_id?: string | null
          registered_by_name?: string | null
          school?: string | null
          start_date?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          discount_type?: string | null
          email?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          registered_by_id?: string | null
          registered_by_name?: string | null
          school?: string | null
          start_date?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      employee_schedules: {
        Row: {
          active: boolean
          created_at: string
          employee_id: string
          end_time: string
          id: string
          owner_id: string
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          employee_id: string
          end_time?: string
          id?: string
          owner_id: string
          start_time?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          active?: boolean
          created_at?: string
          employee_id?: string
          end_time?: string
          id?: string
          owner_id?: string
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
          weekly_salary: number
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
          weekly_salary?: number
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
          weekly_salary?: number
        }
        Relationships: []
      }
      inventory_alerts: {
        Row: {
          branch: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["alert_kind"]
          message: string
          owner_id: string
          product_id: string | null
          read_at: string | null
        }
        Insert: {
          branch?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["alert_kind"]
          message: string
          owner_id: string
          product_id?: string | null
          read_at?: string | null
        }
        Update: {
          branch?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["alert_kind"]
          message?: string
          owner_id?: string
          product_id?: string | null
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audit_log: {
        Row: {
          action: string
          actor_employee_id: string | null
          after: Json | null
          before: Json | null
          branch: string | null
          created_at: string
          device_label: string | null
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_employee_id?: string | null
          after?: Json | null
          before?: Json | null
          branch?: string | null
          created_at?: string
          device_label?: string | null
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_employee_id?: string | null
          after?: Json | null
          before?: Json | null
          branch?: string | null
          created_at?: string
          device_label?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audit_log_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          count_id: string
          difference: number | null
          id: string
          product_id: string
          qty_physical: number | null
          qty_theoretical: number
          value_difference: number | null
        }
        Insert: {
          count_id: string
          difference?: number | null
          id?: string
          product_id: string
          qty_physical?: number | null
          qty_theoretical?: number
          value_difference?: number | null
        }
        Update: {
          count_id?: string
          difference?: number | null
          id?: string
          product_id?: string
          qty_physical?: number | null
          qty_theoretical?: number
          value_difference?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          area: string | null
          branch: string
          closed_at: string | null
          created_at: string
          frequency: Database["public"]["Enums"]["count_frequency"]
          id: string
          notes: string | null
          owner_id: string
          responsible_employee_id: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["count_status"]
        }
        Insert: {
          area?: string | null
          branch: string
          closed_at?: string | null
          created_at?: string
          frequency?: Database["public"]["Enums"]["count_frequency"]
          id?: string
          notes?: string | null
          owner_id: string
          responsible_employee_id?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["count_status"]
        }
        Update: {
          area?: string | null
          branch?: string
          closed_at?: string | null
          created_at?: string
          frequency?: Database["public"]["Enums"]["count_frequency"]
          id?: string
          notes?: string | null
          owner_id?: string
          responsible_employee_id?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["count_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_responsible_employee_id_fkey"
            columns: ["responsible_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          area: string | null
          authorized_by: string | null
          branch: string
          created_at: string
          device_label: string | null
          employee_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          owner_id: string
          product_id: string
          qty_after: number
          qty_before: number
          quantity: number
          reason: string | null
          transfer_id: string | null
          type: Database["public"]["Enums"]["inventory_movement_type"]
        }
        Insert: {
          area?: string | null
          authorized_by?: string | null
          branch: string
          created_at?: string
          device_label?: string | null
          employee_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          owner_id: string
          product_id: string
          qty_after?: number
          qty_before?: number
          quantity: number
          reason?: string | null
          transfer_id?: string | null
          type: Database["public"]["Enums"]["inventory_movement_type"]
        }
        Update: {
          area?: string | null
          authorized_by?: string | null
          branch?: string
          created_at?: string
          device_label?: string | null
          employee_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          owner_id?: string
          product_id?: string
          qty_after?: number
          qty_before?: number
          quantity?: number
          reason?: string | null
          transfer_id?: string | null
          type?: Database["public"]["Enums"]["inventory_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock: {
        Row: {
          branch: string
          id: string
          owner_id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          branch: string
          id?: string
          owner_id: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          branch?: string
          id?: string
          owner_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfer_items: {
        Row: {
          difference_reason: string | null
          id: string
          product_id: string
          qty_after: number | null
          qty_before: number | null
          qty_received: number | null
          qty_sent: number
          transfer_id: string
        }
        Insert: {
          difference_reason?: string | null
          id?: string
          product_id: string
          qty_after?: number | null
          qty_before?: number | null
          qty_received?: number | null
          qty_sent: number
          transfer_id: string
        }
        Update: {
          difference_reason?: string | null
          id?: string
          product_id?: string
          qty_after?: number | null
          qty_before?: number | null
          qty_received?: number | null
          qty_sent?: number
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfer_photos: {
        Row: {
          created_at: string
          id: string
          kind: string
          photo_path: string
          transfer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          photo_path: string
          transfer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          photo_path?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_photos_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          authorized_by: string | null
          created_at: string
          dest_branch: string
          folio: string
          id: string
          notes: string | null
          origin_branch: string
          owner_id: string
          reason: string | null
          received_at: string | null
          received_by: string | null
          sent_at: string | null
          sent_by: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          updated_at: string
        }
        Insert: {
          authorized_by?: string | null
          created_at?: string
          dest_branch: string
          folio: string
          id?: string
          notes?: string | null
          origin_branch: string
          owner_id: string
          reason?: string | null
          received_at?: string | null
          received_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          updated_at?: string
        }
        Update: {
          authorized_by?: string | null
          created_at?: string
          dest_branch?: string
          folio?: string
          id?: string
          notes?: string | null
          origin_branch?: string
          owner_id?: string
          reason?: string | null
          received_at?: string | null
          received_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      perfume_sales: {
        Row: {
          branch: string
          comment: string | null
          created_at: string
          employee_id: string
          employee_name: string
          id: string
          owner_id: string
          perfume_name: string
          quantity: number
          sold_at: string
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          branch: string
          comment?: string | null
          created_at?: string
          employee_id: string
          employee_name: string
          id?: string
          owner_id: string
          perfume_name: string
          quantity?: number
          sold_at?: string
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          branch?: string
          comment?: string | null
          created_at?: string
          employee_id?: string
          employee_name?: string
          id?: string
          owner_id?: string
          perfume_name?: string
          quantity?: number
          sold_at?: string
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfume_sales_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
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
      products: {
        Row: {
          active: boolean
          barcode: string | null
          brand: string | null
          category_id: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          internal_code: string
          name: string
          owner_id: string
          photo_path: string | null
          price: number
          stock_max: number
          stock_min: number
          supplier_id: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          internal_code: string
          name: string
          owner_id: string
          photo_path?: string | null
          price?: number
          stock_max?: number
          stock_min?: number
          supplier_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          internal_code?: string
          name?: string
          owner_id?: string
          photo_path?: string | null
          price?: number
          stock_max?: number
          stock_min?: number
          supplier_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rest_change_requests: {
        Row: {
          admin_comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          employee_id: string
          id: string
          original_weekday: number | null
          owner_id: string
          reason: string | null
          request_type: string
          requested_date: string
          status: string
        }
        Insert: {
          admin_comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          employee_id: string
          id?: string
          original_weekday?: number | null
          owner_id: string
          reason?: string | null
          request_type?: string
          requested_date: string
          status?: string
        }
        Update: {
          admin_comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          employee_id?: string
          id?: string
          original_weekday?: number | null
          owner_id?: string
          reason?: string | null
          request_type?: string
          requested_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rest_change_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      rest_days: {
        Row: {
          branch: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          owner_id: string
          reason: string | null
          rest_date: string
          type: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          owner_id: string
          reason?: string | null
          rest_date: string
          type?: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          owner_id?: string
          reason?: string | null
          rest_date?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rest_days_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      rest_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          new_date: string
          original_weekday: number | null
          owner_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          new_date: string
          original_weekday?: number | null
          owner_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          new_date?: string
          original_weekday?: number | null
          owner_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rest_overrides_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      rest_schedule: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          owner_id: string
          updated_at: string
          updated_by: string | null
          weekday: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          owner_id: string
          updated_at?: string
          updated_by?: string | null
          weekday: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          owner_id?: string
          updated_at?: string
          updated_by?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "rest_schedule_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      shortage_reports: {
        Row: {
          branch: string
          comment: string | null
          created_at: string
          employee_id: string
          employee_name: string
          id: string
          items: string[]
          owner_id: string
          report_date: string
          updated_at: string
        }
        Insert: {
          branch: string
          comment?: string | null
          created_at?: string
          employee_id: string
          employee_name: string
          id?: string
          items?: string[]
          owner_id: string
          report_date?: string
          updated_at?: string
        }
        Update: {
          branch?: string
          comment?: string | null
          created_at?: string
          employee_id?: string
          employee_name?: string
          id?: string
          items?: string[]
          owner_id?: string
          report_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shortage_reports_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
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
      weekly_payments: {
        Row: {
          base_amount: number
          created_at: string
          employee_id: string
          id: string
          loan_amount: number
          loan_note: string | null
          owner_id: string
          paid: boolean
          paid_at: string | null
          paid_by: string | null
          total_amount: number | null
          updated_at: string
          week_start: string
        }
        Insert: {
          base_amount?: number
          created_at?: string
          employee_id: string
          id?: string
          loan_amount?: number
          loan_note?: string | null
          owner_id: string
          paid?: boolean
          paid_at?: string | null
          paid_by?: string | null
          total_amount?: number | null
          updated_at?: string
          week_start: string
        }
        Update: {
          base_amount?: number
          created_at?: string
          employee_id?: string
          id?: string
          loan_amount?: number
          loan_note?: string | null
          owner_id?: string
          paid?: boolean
          paid_at?: string | null
          paid_by?: string | null
          total_amount?: number | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      addon_sale_status: "pendiente" | "validado" | "rechazado"
      alert_kind: "stock_min" | "agotado" | "diferencia" | "traspaso" | "ajuste"
      cleaning_frequency: "daily" | "weekly" | "monthly"
      count_frequency: "manual" | "diario" | "semanal" | "mensual"
      count_status: "abierto" | "cerrado"
      entry_type: "clock_in" | "clock_out" | "break_start" | "break_end"
      inventory_movement_type:
        | "entrada"
        | "salida"
        | "ajuste"
        | "consumo"
        | "traspaso_out"
        | "traspaso_in"
        | "correccion"
      supply_movement_type: "entrada" | "salida" | "ajuste"
      supply_reason: "terminado" | "queda_poco" | "danado" | "otro"
      supply_status: "pendiente" | "aprobada" | "entregada" | "rechazada"
      transfer_status:
        | "pendiente"
        | "autorizado"
        | "en_transito"
        | "recibido"
        | "recibido_diferencias"
        | "cancelado"
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
      addon_sale_status: ["pendiente", "validado", "rechazado"],
      alert_kind: ["stock_min", "agotado", "diferencia", "traspaso", "ajuste"],
      cleaning_frequency: ["daily", "weekly", "monthly"],
      count_frequency: ["manual", "diario", "semanal", "mensual"],
      count_status: ["abierto", "cerrado"],
      entry_type: ["clock_in", "clock_out", "break_start", "break_end"],
      inventory_movement_type: [
        "entrada",
        "salida",
        "ajuste",
        "consumo",
        "traspaso_out",
        "traspaso_in",
        "correccion",
      ],
      supply_movement_type: ["entrada", "salida", "ajuste"],
      supply_reason: ["terminado", "queda_poco", "danado", "otro"],
      supply_status: ["pendiente", "aprobada", "entregada", "rechazada"],
      transfer_status: [
        "pendiente",
        "autorizado",
        "en_transito",
        "recibido",
        "recibido_diferencias",
        "cancelado",
      ],
      vacation_status: ["pendiente", "aprobada", "rechazada"],
    },
  },
} as const
