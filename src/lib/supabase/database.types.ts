export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      factories: {
        Row: {
          id: string
          name: string
          owner_name: string
          phone: string
          lat: number
          lng: number
          region: string
          balance: number
          tag_number: string | null
          waste_type: 'liquid' | 'solid' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_name: string
          phone: string
          lat?: number | null
          lng?: number | null
          region: string
          balance?: number
          tag_number?: string | null
          waste_type?: 'liquid' | 'solid' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_name?: string
          phone?: string
          lat?: number | null
          lng?: number | null
          region?: string
          balance?: number
          tag_number?: string | null
          waste_type?: 'liquid' | 'solid' | null
          updated_at?: string
        }
      }
      trips: {
        Row: {
          id: string
          factory_id: string
          amount: number
          payment_status: 'paid' | 'credit'
          payment_method: 'cash' | 'later' | null
          trip_date: string
          volume_m3: number | null
          waste_type: 'liquid' | 'solid' | null
          notes: string | null
          coupon_number: string | null
          driver_name: string | null
          vehicle_type: 'tank' | 'truck' | null
          distance_km: number | null
          dump_site: string | null
          transfer_zone: string | null
          trip_cost: number | null
          factory_contribution: number | null
          subsidy_amount: number | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          factory_id: string
          amount?: number
          payment_status: 'paid' | 'credit'
          payment_method?: 'cash' | 'later' | null
          trip_date?: string
          volume_m3?: number | null
          waste_type?: 'liquid' | 'solid' | null
          notes?: string | null
          coupon_number?: string | null
          driver_name?: string | null
          vehicle_type?: 'tank' | 'truck' | null
          distance_km?: number | null
          dump_site?: string | null
          transfer_zone?: string | null
          trip_cost?: number | null
          factory_contribution?: number | null
          subsidy_amount?: number | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          payment_status?: 'paid' | 'credit'
          payment_method?: 'cash' | 'later' | null
          trip_date?: string
          volume_m3?: number | null
          waste_type?: 'liquid' | 'solid' | null
          notes?: string | null
          coupon_number?: string | null
          driver_name?: string | null
          vehicle_type?: 'tank' | 'truck' | null
          distance_km?: number | null
          dump_site?: string | null
          transfer_zone?: string | null
        }
      }
      payments: {
        Row: {
          id: string
          factory_id: string
          amount_paid: number
          date: string
          receipt_image_url: string | null
          notes: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          factory_id: string
          amount_paid: number
          date: string
          receipt_image_url?: string | null
          notes?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          receipt_image_url?: string | null
          notes?: string | null
        }
      }
      audit_log: {
        Row: {
          id: string
          table_name: string
          record_id: string
          action: string
          old_data: Json | null
          new_data: Json | null
          performed_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          action: string
          old_data?: Json | null
          new_data?: Json | null
          performed_by?: string | null
          created_at?: string
        }
        Update: Record<string, never>
      }
      disbursements: {
        Row: {
          id: string
          period_from: string
          period_to: string
          trips_count: number
          total_trips_cost: number
          total_factory_share: number
          disbursed_amount: number
          notes: string | null
          status: 'draft' | 'closed'
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          period_from: string
          period_to: string
          trips_count?: number
          total_trips_cost?: number
          total_factory_share?: number
          disbursed_amount?: number
          notes?: string | null
          status?: 'draft' | 'closed'
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          trips_count?: number
          total_trips_cost?: number
          total_factory_share?: number
          disbursed_amount?: number
          notes?: string | null
          status?: 'draft' | 'closed'
          closed_at?: string | null
          closed_by?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// Convenience types
export type Factory = Database['public']['Tables']['factories']['Row']
export type FactoryInsert = Database['public']['Tables']['factories']['Insert']
export type FactoryUpdate = Database['public']['Tables']['factories']['Update']

export type Trip = Database['public']['Tables']['trips']['Row']
export type TripInsert = Database['public']['Tables']['trips']['Insert']

export type Payment = Database['public']['Tables']['payments']['Row']
export type PaymentInsert = Database['public']['Tables']['payments']['Insert']

export type AuditLog = Database['public']['Tables']['audit_log']['Row']

export type Disbursement = Database['public']['Tables']['disbursements']['Row']
export type DisbursementInsert = Database['public']['Tables']['disbursements']['Insert']
export type DisbursementUpdate = Database['public']['Tables']['disbursements']['Update']
