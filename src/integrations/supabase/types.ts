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
        }
        Insert: {
          created_at?: string
          created_by: string
          definition: string
          id?: string
          term: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: string
          id?: string
          term?: string
          updated_at?: string
        }
        Relationships: []
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
      [_ in never]: never
    }
    Functions: {
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
      app_role: "business_manager" | "consultant" | "admin" | "client"
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
      app_role: ["business_manager", "consultant", "admin", "client"],
    },
  },
} as const
