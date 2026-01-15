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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_folders: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          project_type: string | null
          settings: Json | null
          sort_order: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_type?: string | null
          settings?: Json | null
          sort_order?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_type?: string | null
          settings?: Json | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attached_files: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          attached_files?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          attached_files?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notices: {
        Row: {
          author_name: string
          client_name: string
          created_at: string
          id: string
          message: string
          updated_at: string
        }
        Insert: {
          author_name: string
          client_name: string
          created_at?: string
          id?: string
          message: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          client_name?: string
          created_at?: string
          id?: string
          message?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_passwords: {
        Row: {
          category: string | null
          client_name: string
          created_at: string
          id: string
          notes: string | null
          password: string
          software_name: string
          sort_order: number | null
          updated_at: string
          url: string | null
          username: string
        }
        Insert: {
          category?: string | null
          client_name: string
          created_at?: string
          id?: string
          notes?: string | null
          password: string
          software_name: string
          sort_order?: number | null
          updated_at?: string
          url?: string | null
          username: string
        }
        Update: {
          category?: string | null
          client_name?: string
          created_at?: string
          id?: string
          notes?: string | null
          password?: string
          software_name?: string
          sort_order?: number | null
          updated_at?: string
          url?: string | null
          username?: string
        }
        Relationships: []
      }
      client_whiteboards: {
        Row: {
          client_name: string
          content: string
          created_at: string
          id: string
          last_updated_by: string | null
          updated_at: string
        }
        Insert: {
          client_name: string
          content?: string
          created_at?: string
          id?: string
          last_updated_by?: string | null
          updated_at?: string
        }
        Update: {
          client_name?: string
          content?: string
          created_at?: string
          id?: string
          last_updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          billing_contact_email: string | null
          billing_contact_name: string | null
          billing_contact_phone: string | null
          company_address: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          created_by: string
          id: string
          key_contact_email: string | null
          key_contact_name: string | null
          key_contact_phone: string | null
          mrr: number | null
          name: string
          notes: string | null
          recurring_day: number | null
          software: string | null
          software_login_details: string | null
          software_used: string | null
          source: string | null
          status: string | null
          updated_at: string
          website_address: string | null
        }
        Insert: {
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          company_address?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by: string
          id?: string
          key_contact_email?: string | null
          key_contact_name?: string | null
          key_contact_phone?: string | null
          mrr?: number | null
          name: string
          notes?: string | null
          recurring_day?: number | null
          software?: string | null
          software_login_details?: string | null
          software_used?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
          website_address?: string | null
        }
        Update: {
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          company_address?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string
          id?: string
          key_contact_email?: string | null
          key_contact_name?: string | null
          key_contact_phone?: string | null
          mrr?: number | null
          name?: string
          notes?: string | null
          recurring_day?: number | null
          software?: string | null
          software_login_details?: string | null
          software_used?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
          website_address?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          page_id: string
          parent_comment_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          page_id: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          page_id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          folder_id: string | null
          id: string
          last_message_at: string | null
          thread_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id?: string | null
          id?: string
          last_message_at?: string | null
          thread_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string | null
          id?: string
          last_message_at?: string | null
          thread_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "chat_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_exceptions: {
        Row: {
          created_at: string
          created_by: string
          email: string
          id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          email: string
          id?: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string
          id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      glossary: {
        Row: {
          created_at: string
          created_by: string
          definition: string
          id: string
          term: string
          updated_at: string
          variations: string[]
        }
        Insert: {
          created_at?: string
          created_by: string
          definition: string
          id?: string
          term: string
          updated_at?: string
          variations?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: string
          id?: string
          term?: string
          updated_at?: string
          variations?: string[]
        }
        Relationships: []
      }
      hr_profiles: {
        Row: {
          annual_holiday_allowance: number | null
          base_currency: string
          base_salary: number | null
          created_at: string
          department: string | null
          employee_id: string | null
          employment_status: Database["public"]["Enums"]["employment_status"]
          id: string
          job_title: string | null
          notes: string | null
          pay_frequency: string | null
          scheduling_role: string
          start_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          annual_holiday_allowance?: number | null
          base_currency?: string
          base_salary?: number | null
          created_at?: string
          department?: string | null
          employee_id?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          id?: string
          job_title?: string | null
          notes?: string | null
          pay_frequency?: string | null
          scheduling_role?: string
          start_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          annual_holiday_allowance?: number | null
          base_currency?: string
          base_salary?: number | null
          created_at?: string
          department?: string | null
          employee_id?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          id?: string
          job_title?: string | null
          notes?: string | null
          pay_frequency?: string | null
          scheduling_role?: string
          start_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_completions: {
        Row: {
          completed_at: string
          id: string
          notes: string | null
          step_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          notes?: string | null
          step_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          notes?: string | null
          step_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_completions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "onboarding_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_owners: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_steps: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          external_url: string | null
          id: string
          owner_id: string | null
          sort_order: number | null
          stage: string
          step_type: string
          target_page_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          external_url?: string | null
          id?: string
          owner_id?: string | null
          sort_order?: number | null
          stage?: string
          step_type?: string
          target_page_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          external_url?: string | null
          id?: string
          owner_id?: string | null
          sort_order?: number | null
          stage?: string
          step_type?: string
          target_page_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_steps_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "onboarding_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_steps_target_page_id_fkey"
            columns: ["target_page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_acknowledgements: {
        Row: {
          acknowledged_at: string
          id: string
          page_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          page_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          page_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_acknowledgements_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_audit_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          operation_type: string
          page_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation_type: string
          page_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation_type?: string
          page_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      page_content_snapshots: {
        Row: {
          content: string
          created_at: string
          id: string
          page_id: string
          recommended_reading: Json
          snapshot_type: string
          title: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          page_id: string
          recommended_reading?: Json
          snapshot_type?: string
          title: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          page_id?: string
          recommended_reading?: Json
          snapshot_type?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      page_permissions: {
        Row: {
          created_at: string
          id: string
          page_id: string
          permission_type: string
          role: Database["public"]["Enums"]["app_role"] | null
          space_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          page_id: string
          permission_type: string
          role?: Database["public"]["Enums"]["app_role"] | null
          space_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          page_id?: string
          permission_type?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          space_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_permissions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_permissions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      page_quizzes: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          page_id: string
          passing_score: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          page_id: string
          passing_score?: number
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          page_id?: string
          passing_score?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_quizzes_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          category_order: string[] | null
          content: string
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          is_public: boolean | null
          parent_page_id: string | null
          public_token: string | null
          recommended_reading: Json | null
          sort_order: number | null
          space_id: string | null
          tags: string[] | null
          title: string
          updated_at: string
          version: number | null
          view_count: number | null
        }
        Insert: {
          category_order?: string[] | null
          content?: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          is_public?: boolean | null
          parent_page_id?: string | null
          public_token?: string | null
          recommended_reading?: Json | null
          sort_order?: number | null
          space_id?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          version?: number | null
          view_count?: number | null
        }
        Update: {
          category_order?: string[] | null
          content?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          is_public?: boolean | null
          parent_page_id?: string | null
          public_token?: string | null
          recommended_reading?: Json | null
          sort_order?: number | null
          space_id?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          version?: number | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pages_parent_page_id_fkey"
            columns: ["parent_page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "chat_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      project_instructions: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          project_id: string
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_instructions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "chat_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      project_research: {
        Row: {
          created_at: string
          id: string
          project_id: string
          query: string
          results: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          query: string
          results?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          query?: string
          results?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_research_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "chat_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_completions: {
        Row: {
          answers: Json
          completed_at: string
          id: string
          passed: boolean
          quiz_id: string
          score: number
          user_id: string
        }
        Insert: {
          answers?: Json
          completed_at?: string
          id?: string
          passed: boolean
          quiz_id: string
          score: number
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string
          id?: string
          passed?: boolean
          quiz_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_completions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "page_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: number
          created_at: string
          id: string
          options: Json
          question: string
          quiz_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          correct_answer: number
          created_at?: string
          id?: string
          options?: Json
          question: string
          quiz_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          correct_answer?: number
          created_at?: string
          id?: string
          options?: Json
          question?: string
          quiz_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "page_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      recommended_reading_audit: {
        Row: {
          change_details: Json | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          operation_type: string
          page_id: string
          user_id: string | null
        }
        Insert: {
          change_details?: Json | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation_type: string
          page_id: string
          user_id?: string | null
        }
        Update: {
          change_details?: Json | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation_type?: string
          page_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      recurring_bonuses: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          currency: string
          description: string | null
          end_date: string | null
          id: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          end_date?: string | null
          id?: string
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          id?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_shift_patterns: {
        Row: {
          client_name: string
          created_at: string
          created_by: string
          currency: string
          days_of_week: number[]
          end_date: string | null
          end_time: string
          hourly_rate: number | null
          id: string
          is_overtime: boolean
          notes: string | null
          recurrence_interval: string
          shift_type: string | null
          start_date: string
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_name: string
          created_at?: string
          created_by: string
          currency?: string
          days_of_week: number[]
          end_date?: string | null
          end_time: string
          hourly_rate?: number | null
          id?: string
          is_overtime?: boolean
          notes?: string | null
          recurrence_interval?: string
          shift_type?: string | null
          start_date: string
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_name?: string
          created_at?: string
          created_by?: string
          currency?: string
          days_of_week?: number[]
          end_date?: string | null
          end_time?: string
          hourly_rate?: number | null
          id?: string
          is_overtime?: boolean
          notes?: string | null
          recurrence_interval?: string
          shift_type?: string | null
          start_date?: string
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          created_at: string | null
          event_details: Json | null
          event_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_details?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_details?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      shift_pattern_exceptions: {
        Row: {
          created_at: string
          created_by: string | null
          exception_date: string
          exception_type: string
          id: string
          pattern_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          exception_date: string
          exception_type?: string
          id?: string
          pattern_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          exception_date?: string
          exception_type?: string
          id?: string
          pattern_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_pattern_exceptions_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "recurring_shift_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_client_assignments: {
        Row: {
          client_name: string
          created_at: string
          id: string
          notes: string | null
          staff_user_id: string
          updated_at: string
        }
        Insert: {
          client_name: string
          created_at?: string
          id?: string
          notes?: string | null
          staff_user_id: string
          updated_at?: string
        }
        Update: {
          client_name?: string
          created_at?: string
          id?: string
          notes?: string | null
          staff_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_holidays: {
        Row: {
          absence_type: Database["public"]["Enums"]["absence_type"]
          approved_at: string | null
          approved_by: string | null
          created_at: string
          days_taken: number
          end_date: string
          id: string
          no_cover_required: boolean
          notes: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          absence_type?: Database["public"]["Enums"]["absence_type"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          days_taken: number
          end_date: string
          id?: string
          no_cover_required?: boolean
          notes?: string | null
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          absence_type?: Database["public"]["Enums"]["absence_type"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          days_taken?: number
          end_date?: string
          id?: string
          no_cover_required?: boolean
          notes?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_onboarding_documents: {
        Row: {
          account_number: string | null
          address: string | null
          bank_name: string | null
          created_at: string
          date_of_birth: string | null
          emergency_contact_email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          employment_start_date: string | null
          form_status: string
          full_name: string | null
          id: string
          personal_email: string | null
          phone_number: string | null
          photograph_path: string | null
          proof_of_address_path: string | null
          proof_of_address_type: string | null
          proof_of_id_1_path: string | null
          proof_of_id_1_type: string | null
          proof_of_id_2_path: string | null
          proof_of_id_2_type: string | null
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number?: string | null
          address?: string | null
          bank_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employment_start_date?: string | null
          form_status?: string
          full_name?: string | null
          id?: string
          personal_email?: string | null
          phone_number?: string | null
          photograph_path?: string | null
          proof_of_address_path?: string | null
          proof_of_address_type?: string | null
          proof_of_id_1_path?: string | null
          proof_of_id_1_type?: string | null
          proof_of_id_2_path?: string | null
          proof_of_id_2_type?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string | null
          address?: string | null
          bank_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employment_start_date?: string | null
          form_status?: string
          full_name?: string | null
          id?: string
          personal_email?: string | null
          phone_number?: string | null
          photograph_path?: string | null
          proof_of_address_path?: string | null
          proof_of_address_type?: string | null
          proof_of_id_1_path?: string | null
          proof_of_id_1_type?: string | null
          proof_of_id_2_path?: string | null
          proof_of_id_2_type?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_overtime: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          hourly_rate: number | null
          hours: number
          id: string
          notes: string | null
          overtime_date: string
          schedule_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          currency?: string
          hourly_rate?: number | null
          hours: number
          id?: string
          notes?: string | null
          overtime_date: string
          schedule_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          hourly_rate?: number | null
          hours?: number
          id?: string
          notes?: string | null
          overtime_date?: string
          schedule_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_overtime_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "staff_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_pay_records: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          currency: string
          description: string | null
          id: string
          pay_date: string
          pay_period_end: string | null
          pay_period_start: string | null
          record_type: Database["public"]["Enums"]["pay_record_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          id?: string
          pay_date: string
          pay_period_end?: string | null
          pay_period_start?: string | null
          record_type?: Database["public"]["Enums"]["pay_record_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          id?: string
          pay_date?: string
          pay_period_end?: string | null
          pay_period_start?: string | null
          record_type?: Database["public"]["Enums"]["pay_record_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_requests: {
        Row: {
          client_informed: boolean | null
          created_at: string
          days_requested: number
          details: string | null
          end_date: string
          id: string
          linked_holiday_id: string | null
          overtime_type: string | null
          request_type: Database["public"]["Enums"]["staff_request_type"]
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          swap_with_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_informed?: boolean | null
          created_at?: string
          days_requested?: number
          details?: string | null
          end_date: string
          id?: string
          linked_holiday_id?: string | null
          overtime_type?: string | null
          request_type: Database["public"]["Enums"]["staff_request_type"]
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          swap_with_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_informed?: boolean | null
          created_at?: string
          days_requested?: number
          details?: string | null
          end_date?: string
          id?: string
          linked_holiday_id?: string | null
          overtime_type?: string | null
          request_type?: Database["public"]["Enums"]["staff_request_type"]
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          swap_with_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_requests_linked_holiday_id_fkey"
            columns: ["linked_holiday_id"]
            isOneToOne: false
            referencedRelation: "staff_holidays"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_schedules: {
        Row: {
          client_name: string
          created_at: string
          created_by: string
          currency: string
          end_datetime: string
          hourly_rate: number | null
          id: string
          notes: string | null
          shift_type: string | null
          start_datetime: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_name: string
          created_at?: string
          created_by: string
          currency?: string
          end_datetime: string
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          shift_type?: string | null
          start_datetime: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_name?: string
          created_at?: string
          created_by?: string
          currency?: string
          end_datetime?: string
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          shift_type?: string | null
          start_datetime?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      hr_profiles_public: {
        Row: {
          created_at: string | null
          department: string | null
          employee_id: string | null
          employment_status:
            | Database["public"]["Enums"]["employment_status"]
            | null
          id: string | null
          job_title: string | null
          scheduling_role: string | null
          start_date: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          employee_id?: string | null
          employment_status?:
            | Database["public"]["Enums"]["employment_status"]
            | null
          id?: string | null
          job_title?: string | null
          scheduling_role?: string | null
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          department?: string | null
          employee_id?: string | null
          employment_status?:
            | Database["public"]["Enums"]["employment_status"]
            | null
          id?: string | null
          job_title?: string | null
          scheduling_role?: string | null
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_view_full_hr_profile: {
        Args: { profile_user_id: string }
        Returns: boolean
      }
      can_view_schedule_for_client: {
        Args: { _client_name: string; _user_id: string }
        Returns: boolean
      }
      create_page_snapshot: {
        Args: { p_page_id: string; p_snapshot_type?: string }
        Returns: string
      }
      get_current_user_role: { Args: never; Returns: string }
      get_next_sort_order: {
        Args: { p_parent_page_id: string; p_space_id: string }
        Returns: number
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_scheduling_editor: { Args: { _user_id: string }; Returns: boolean }
      log_page_operation: {
        Args: {
          p_error_message?: string
          p_new_values?: Json
          p_old_values?: Json
          p_operation_type: string
          p_page_id: string
        }
        Returns: undefined
      }
      log_recommended_reading_change: {
        Args: {
          p_change_details?: Json
          p_new_data?: Json
          p_old_data?: Json
          p_operation_type: string
          p_page_id: string
        }
        Returns: string
      }
      log_security_event: {
        Args: {
          p_event_details?: Json
          p_event_type: string
          p_ip_address?: unknown
          p_user_agent?: string
          p_user_id: string
        }
        Returns: undefined
      }
      move_page_down: { Args: { page_id: string }; Returns: boolean }
      move_page_down_enhanced: {
        Args: { p_expected_version?: number; p_page_id: string }
        Returns: Json
      }
      move_page_down_safe: {
        Args: { p_expected_version: number; p_page_id: string }
        Returns: Json
      }
      move_page_to_parent_safe: {
        Args: {
          p_expected_version: number
          p_new_parent_id: string
          p_page_id: string
        }
        Returns: Json
      }
      move_page_up: { Args: { page_id: string }; Returns: boolean }
      move_page_up_enhanced: {
        Args: { p_expected_version?: number; p_page_id: string }
        Returns: Json
      }
      move_page_up_safe: {
        Args: { p_expected_version: number; p_page_id: string }
        Returns: Json
      }
      permanently_delete_page: { Args: { p_page_id: string }; Returns: Json }
      restore_page: { Args: { p_page_id: string }; Returns: Json }
      sync_missing_profiles: {
        Args: never
        Returns: {
          created_profile: boolean
          email: string
          user_id: string
        }[]
      }
      update_project_memory: { Args: { p_project_id: string }; Returns: Json }
      user_has_page_permission: {
        Args: { page_id: string; permission_types: string[] }
        Returns: boolean
      }
    }
    Enums: {
      absence_type:
        | "holiday"
        | "sick"
        | "personal"
        | "maternity"
        | "paternity"
        | "unpaid"
        | "other"
      app_role: "business_manager" | "consultant" | "admin" | "client"
      employment_status:
        | "onboarding_probation"
        | "onboarding_passed"
        | "active"
        | "inactive_left"
        | "inactive_fired"
      pay_record_type: "salary" | "bonus" | "deduction" | "expense" | "overtime"
      staff_request_type:
        | "overtime_standard"
        | "overtime_double_up"
        | "holiday"
        | "shift_swap"
        | "holiday_paid"
        | "holiday_unpaid"
        | "overtime"
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
      absence_type: [
        "holiday",
        "sick",
        "personal",
        "maternity",
        "paternity",
        "unpaid",
        "other",
      ],
      app_role: ["business_manager", "consultant", "admin", "client"],
      employment_status: [
        "onboarding_probation",
        "onboarding_passed",
        "active",
        "inactive_left",
        "inactive_fired",
      ],
      pay_record_type: ["salary", "bonus", "deduction", "expense", "overtime"],
      staff_request_type: [
        "overtime_standard",
        "overtime_double_up",
        "holiday",
        "shift_swap",
        "holiday_paid",
        "holiday_unpaid",
        "overtime",
      ],
    },
  },
} as const
