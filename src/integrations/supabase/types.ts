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
      ai_request_rate_limits: {
        Row: {
          function_name: string
          last_requested_at: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          function_name: string
          last_requested_at?: string
          request_count?: number
          user_id: string
          window_start: string
        }
        Update: {
          function_name?: string
          last_requested_at?: string
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          class_id: string | null
          client_class_id: string | null
          created_at: string
          due_date: string | null
          estimated_minutes: number
          external_id: string | null
          id: string
          meta: Json
          notes: string | null
          priority: string
          source: string
          source_archived_at: string | null
          source_due_at: string | null
          source_updated_at: string | null
          source_url: string | null
          status: string
          syllabus_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          due_date?: string | null
          estimated_minutes?: number
          external_id?: string | null
          id?: string
          meta?: Json
          notes?: string | null
          priority?: string
          source?: string
          source_archived_at?: string | null
          source_due_at?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          status?: string
          syllabus_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          due_date?: string | null
          estimated_minutes?: number
          external_id?: string | null
          id?: string
          meta?: Json
          notes?: string | null
          priority?: string
          source?: string
          source_archived_at?: string | null
          source_due_at?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          status?: string
          syllabus_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_syllabus_id_fkey"
            columns: ["syllabus_id"]
            isOneToOne: false
            referencedRelation: "class_syllabi"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_brain_signals: {
        Row: {
          anonymized: boolean
          class_id: string | null
          client_class_id: string | null
          created_at: string
          id: string
          payload: Json
          recorded_at: string
          source_id: string | null
          source_type: string
          topic: string | null
          user_id: string
          visibility: string
          weight: number
        }
        Insert: {
          anonymized?: boolean
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          recorded_at?: string
          source_id?: string | null
          source_type: string
          topic?: string | null
          user_id: string
          visibility?: string
          weight?: number
        }
        Update: {
          anonymized?: boolean
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          recorded_at?: string
          source_id?: string | null
          source_type?: string
          topic?: string | null
          user_id?: string
          visibility?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "campus_brain_signals_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_calendar_connections: {
        Row: {
          canvas_base_url: string
          created_at: string
          feed_url_ciphertext: string
          id: string
          last_sync_error: string | null
          last_sync_status: string
          last_synced_at: string | null
          status: string
          sync_counts: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          canvas_base_url: string
          created_at?: string
          feed_url_ciphertext: string
          id?: string
          last_sync_error?: string | null
          last_sync_status?: string
          last_synced_at?: string | null
          status?: string
          sync_counts?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          canvas_base_url?: string
          created_at?: string
          feed_url_ciphertext?: string
          id?: string
          last_sync_error?: string | null
          last_sync_status?: string
          last_synced_at?: string | null
          status?: string
          sync_counts?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      canvas_connections: {
        Row: {
          access_token_ciphertext: string
          canvas_base_url: string
          canvas_user_id: string | null
          canvas_user_name: string | null
          created_at: string
          id: string
          last_sync_error: string | null
          last_sync_status: string
          last_synced_at: string | null
          refresh_token_ciphertext: string | null
          status: string
          sync_counts: Json
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_ciphertext: string
          canvas_base_url: string
          canvas_user_id?: string | null
          canvas_user_name?: string | null
          created_at?: string
          id?: string
          last_sync_error?: string | null
          last_sync_status?: string
          last_synced_at?: string | null
          refresh_token_ciphertext?: string | null
          status?: string
          sync_counts?: Json
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_ciphertext?: string
          canvas_base_url?: string
          canvas_user_id?: string | null
          canvas_user_name?: string | null
          created_at?: string
          id?: string
          last_sync_error?: string | null
          last_sync_status?: string
          last_synced_at?: string | null
          refresh_token_ciphertext?: string | null
          status?: string
          sync_counts?: Json
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      canvas_oauth_states: {
        Row: {
          canvas_base_url: string
          created_at: string
          expires_at: string
          redirect_path: string
          state_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          canvas_base_url: string
          created_at?: string
          expires_at: string
          redirect_path?: string
          state_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          canvas_base_url?: string
          created_at?: string
          expires_at?: string
          redirect_path?: string
          state_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      captures: {
        Row: {
          anonymized: boolean
          assignment_id: string | null
          captured_on: string
          chapter: string | null
          class_id: string | null
          client_class_id: string | null
          concept_extraction_claim_id: string | null
          concept_extraction_started_at: string | null
          created_at: string
          exam_id: string | null
          flashcards_ready: boolean
          id: string
          kind: string
          local_id: string | null
          meta: Json
          processing_status: string
          raw_text: string | null
          topic: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          anonymized?: boolean
          assignment_id?: string | null
          captured_on?: string
          chapter?: string | null
          class_id?: string | null
          client_class_id?: string | null
          concept_extraction_claim_id?: string | null
          concept_extraction_started_at?: string | null
          created_at?: string
          exam_id?: string | null
          flashcards_ready?: boolean
          id?: string
          kind: string
          local_id?: string | null
          meta?: Json
          processing_status?: string
          raw_text?: string | null
          topic?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          anonymized?: boolean
          assignment_id?: string | null
          captured_on?: string
          chapter?: string | null
          class_id?: string | null
          client_class_id?: string | null
          concept_extraction_claim_id?: string | null
          concept_extraction_started_at?: string | null
          created_at?: string
          exam_id?: string | null
          flashcards_ready?: boolean
          id?: string
          kind?: string
          local_id?: string | null
          meta?: Json
          processing_status?: string
          raw_text?: string | null
          topic?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "captures_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captures_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      class_syllabi: {
        Row: {
          archived_at: string | null
          class_id: string
          client_class_id: string
          content_hash: string
          created_at: string
          id: string
          mime_type: string
          original_name: string
          parsed_data: Json
          request_id: string
          reviewed_data: Json
          revision: number
          size_bytes: number
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          class_id: string
          client_class_id: string
          content_hash: string
          created_at?: string
          id?: string
          mime_type: string
          original_name: string
          parsed_data: Json
          request_id: string
          reviewed_data: Json
          revision: number
          size_bytes: number
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          class_id?: string
          client_class_id?: string
          content_hash?: string
          created_at?: string
          id?: string
          mime_type?: string
          original_name?: string
          parsed_data?: Json
          request_id?: string
          reviewed_data?: Json
          revision?: number
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_syllabi_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_syllabus_requests: {
        Row: {
          class_id: string
          client_class_id: string
          content_hash: string
          created_at: string
          mime_type: string
          original_name: string
          parsed_data: Json
          request_id: string
          result: Json
          reviewed_data: Json
          size_bytes: number
          storage_path: string
          syllabus_id: string | null
          user_id: string
        }
        Insert: {
          class_id: string
          client_class_id: string
          content_hash: string
          created_at?: string
          mime_type: string
          original_name: string
          parsed_data: Json
          request_id: string
          result: Json
          reviewed_data: Json
          size_bytes: number
          storage_path: string
          syllabus_id?: string | null
          user_id: string
        }
        Update: {
          class_id?: string
          client_class_id?: string
          content_hash?: string
          created_at?: string
          mime_type?: string
          original_name?: string
          parsed_data?: Json
          request_id?: string
          result?: Json
          reviewed_data?: Json
          size_bytes?: number
          storage_path?: string
          syllabus_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_syllabus_requests_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_syllabus_requests_syllabus_id_fkey"
            columns: ["syllabus_id"]
            isOneToOne: false
            referencedRelation: "class_syllabi"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          client_class_id: string
          color: string | null
          course_instance_id: string | null
          created_at: string
          current_topic: string | null
          end_time: string | null
          external_id: string | null
          id: string
          location: string | null
          meta: Json
          name: string
          professor: string | null
          readiness: number | null
          section: string | null
          semester_end_date: string | null
          semester_start_date: string | null
          source: string
          source_archived_at: string | null
          source_updated_at: string | null
          source_url: string | null
          start_time: string | null
          term: string | null
          time_zone: string | null
          updated_at: string
          user_id: string
          weekdays: string[]
        }
        Insert: {
          client_class_id: string
          color?: string | null
          course_instance_id?: string | null
          created_at?: string
          current_topic?: string | null
          end_time?: string | null
          external_id?: string | null
          id?: string
          location?: string | null
          meta?: Json
          name: string
          professor?: string | null
          readiness?: number | null
          section?: string | null
          semester_end_date?: string | null
          semester_start_date?: string | null
          source?: string
          source_archived_at?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          start_time?: string | null
          term?: string | null
          time_zone?: string | null
          updated_at?: string
          user_id: string
          weekdays?: string[]
        }
        Update: {
          client_class_id?: string
          color?: string | null
          course_instance_id?: string | null
          created_at?: string
          current_topic?: string | null
          end_time?: string | null
          external_id?: string | null
          id?: string
          location?: string | null
          meta?: Json
          name?: string
          professor?: string | null
          readiness?: number | null
          section?: string | null
          semester_end_date?: string | null
          semester_start_date?: string | null
          source?: string
          source_archived_at?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          start_time?: string | null
          term?: string | null
          time_zone?: string | null
          updated_at?: string
          user_id?: string
          weekdays?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "classes_course_instance_id_fkey"
            columns: ["course_instance_id"]
            isOneToOne: false
            referencedRelation: "course_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          capture_id: string | null
          class_id: string | null
          client_class_id: string | null
          created_at: string
          definition: string | null
          embedding: string | null
          examples: string[]
          id: string
          meta: Json
          name: string
          professor_emphasis: boolean
          slug: string
          source_kind: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          capture_id?: string | null
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          definition?: string | null
          embedding?: string | null
          examples?: string[]
          id?: string
          meta?: Json
          name: string
          professor_emphasis?: boolean
          slug: string
          source_kind?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          capture_id?: string | null
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          definition?: string | null
          embedding?: string | null
          examples?: string[]
          id?: string
          meta?: Json
          name?: string
          professor_emphasis?: boolean
          slug?: string
          source_kind?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepts_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepts_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      course_instances: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          professor_id: string | null
          professor_name: string | null
          term: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          professor_id?: string | null
          professor_name?: string | null
          term?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          professor_id?: string | null
          professor_name?: string | null
          term?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_instances_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string | null
          created_at: string
          department: string | null
          id: string
          name: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          department?: string | null
          id?: string
          name: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          department?: string | null
          id?: string
          name?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_debriefs: {
        Row: {
          advice_notes: string | null
          anonymized: boolean
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
          visibility: string
        }
        Insert: {
          advice_notes?: string | null
          anonymized?: boolean
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
          visibility?: string
        }
        Update: {
          advice_notes?: string | null
          anonymized?: boolean
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
          visibility?: string
        }
        Relationships: []
      }
      exams: {
        Row: {
          class_id: string | null
          client_class_id: string | null
          created_at: string
          exam_date: string | null
          external_id: string | null
          id: string
          meta: Json
          notes: string | null
          readiness: number
          source: string
          source_archived_at: string | null
          source_due_at: string | null
          source_updated_at: string | null
          source_url: string | null
          syllabus_id: string | null
          title: string
          topics: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          exam_date?: string | null
          external_id?: string | null
          id?: string
          meta?: Json
          notes?: string | null
          readiness?: number
          source?: string
          source_archived_at?: string | null
          source_due_at?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          syllabus_id?: string | null
          title: string
          topics?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          exam_date?: string | null
          external_id?: string | null
          id?: string
          meta?: Json
          notes?: string | null
          readiness?: number
          source?: string
          source_archived_at?: string | null
          source_due_at?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          syllabus_id?: string | null
          title?: string
          topics?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_syllabus_id_fkey"
            columns: ["syllabus_id"]
            isOneToOne: false
            referencedRelation: "class_syllabi"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          anonymized: boolean
          back: string
          capture_id: string | null
          class_id: string | null
          client_class_id: string | null
          created_at: string
          due_at: string | null
          ease: number
          front: string
          id: string
          interval_days: number
          topic: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          anonymized?: boolean
          back: string
          capture_id?: string | null
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          due_at?: string | null
          ease?: number
          front: string
          id?: string
          interval_days?: number
          topic?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          anonymized?: boolean
          back?: string
          capture_id?: string | null
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          due_at?: string | null
          ease?: number
          front?: string
          id?: string
          interval_days?: number
          topic?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_artifacts: {
        Row: {
          capture_id: string | null
          class_id: string | null
          client_class_id: string | null
          concept_ids: string[]
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["artifact_kind"]
          model: string | null
          payload: Json
          prompt_version: string
          stale: boolean
          study_scope_id: string
          study_scope_label: string | null
          study_scope_snapshot: Json
          study_scope_type: string
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          capture_id?: string | null
          class_id?: string | null
          client_class_id?: string | null
          concept_ids?: string[]
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["artifact_kind"]
          model?: string | null
          payload?: Json
          prompt_version?: string
          stale?: boolean
          study_scope_id?: string
          study_scope_label?: string | null
          study_scope_snapshot?: Json
          study_scope_type?: string
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          capture_id?: string | null
          class_id?: string | null
          client_class_id?: string | null
          concept_ids?: string[]
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["artifact_kind"]
          model?: string | null
          payload?: Json
          prompt_version?: string
          stale?: boolean
          study_scope_id?: string
          study_scope_label?: string | null
          study_scope_snapshot?: Json
          study_scope_type?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          anonymized: boolean
          capture_id: string | null
          content_hash: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          kind: string
          mime_type: string | null
          original_name: string | null
          page_index: number | null
          size_bytes: number | null
          storage_path: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          anonymized?: boolean
          capture_id?: string | null
          content_hash?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          kind: string
          mime_type?: string | null
          original_name?: string | null
          page_index?: number | null
          size_bytes?: number | null
          storage_path?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          anonymized?: boolean
          capture_id?: string | null
          content_hash?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          original_name?: string | null
          page_index?: number | null
          size_bytes?: number | null
          storage_path?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_content: {
        Row: {
          anonymized: boolean
          capture_id: string | null
          created_at: string
          id: string
          key_concepts: string[]
          model: string | null
          ocr_text: string | null
          outline: Json | null
          summary: string | null
          transcript: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          anonymized?: boolean
          capture_id?: string | null
          created_at?: string
          id?: string
          key_concepts?: string[]
          model?: string | null
          ocr_text?: string | null
          outline?: Json | null
          summary?: string | null
          transcript?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          anonymized?: boolean
          capture_id?: string | null
          created_at?: string
          id?: string
          key_concepts?: string[]
          model?: string | null
          ocr_text?: string | null
          outline?: Json | null
          summary?: string | null
          transcript?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "processed_content_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_study_length: number | null
          display_name: string | null
          encouragement_tone: string | null
          id: string
          learner_type: string | null
          major: string | null
          onboarded_at: string | null
          school_id: string | null
          term: string | null
          updated_at: string
          user_id: string
          work_schedule: string | null
          year: string | null
        }
        Insert: {
          created_at?: string
          default_study_length?: number | null
          display_name?: string | null
          encouragement_tone?: string | null
          id?: string
          learner_type?: string | null
          major?: string | null
          onboarded_at?: string | null
          school_id?: string | null
          term?: string | null
          updated_at?: string
          user_id: string
          work_schedule?: string | null
          year?: string | null
        }
        Update: {
          created_at?: string
          default_study_length?: number | null
          display_name?: string | null
          encouragement_tone?: string | null
          id?: string
          learner_type?: string | null
          major?: string | null
          onboarded_at?: string | null
          school_id?: string | null
          term?: string | null
          updated_at?: string
          user_id?: string
          work_schedule?: string | null
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          anonymized: boolean
          capture_id: string | null
          class_id: string | null
          client_class_id: string | null
          created_at: string
          id: string
          questions: Json
          title: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          anonymized?: boolean
          capture_id?: string | null
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          id?: string
          questions?: Json
          title?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          anonymized?: boolean
          capture_id?: string | null
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          id?: string
          questions?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_scores: {
        Row: {
          anonymized: boolean
          class_id: string | null
          client_class_id: string | null
          computed_at: string
          created_at: string
          id: string
          momentum: number | null
          readiness: number
          user_id: string
          visibility: string
        }
        Insert: {
          anonymized?: boolean
          class_id?: string | null
          client_class_id?: string | null
          computed_at?: string
          created_at?: string
          id?: string
          momentum?: number | null
          readiness: number
          user_id: string
          visibility?: string
        }
        Update: {
          anonymized?: boolean
          class_id?: string | null
          client_class_id?: string | null
          computed_at?: string
          created_at?: string
          id?: string
          momentum?: number | null
          readiness?: number
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_scores_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      study_memory_feedback: {
        Row: {
          artifact_id: string
          concept_id: string
          created_at: string
          helpful: boolean
          technique: string
          updated_at: string
          user_id: string
        }
        Insert: {
          artifact_id: string
          concept_id: string
          created_at?: string
          helpful: boolean
          technique: string
          updated_at?: string
          user_id: string
        }
        Update: {
          artifact_id?: string
          concept_id?: string
          created_at?: string
          helpful?: boolean
          technique?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_memory_feedback_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "learning_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_memory_feedback_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      study_result_attempts: {
        Row: {
          artifact_id: string
          client_attempt_id: string
          completed_at: string | null
          created_at: string
          duration_seconds: number
          lease_started_at: string
          lease_token: string
          result_payload: Json | null
          result_request_hash: string
          result_status: string
          session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          artifact_id: string
          client_attempt_id: string
          completed_at?: string | null
          created_at?: string
          duration_seconds: number
          lease_started_at?: string
          lease_token: string
          result_payload?: Json | null
          result_request_hash: string
          result_status?: string
          session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          artifact_id?: string
          client_attempt_id?: string
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number
          lease_started_at?: string
          lease_token?: string
          result_payload?: Json | null
          result_request_hash?: string
          result_status?: string
          session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_result_attempts_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "learning_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_result_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      study_result_concept_updates: {
        Row: {
          answer_correct: boolean
          applied_at: string
          class_id: string | null
          client_attempt_id: string
          concept_id: string
          confidence_level: string | null
          previous_strength: number
          recovered: boolean
          resulting_strength: number | null
          user_id: string
        }
        Insert: {
          answer_correct: boolean
          applied_at?: string
          class_id?: string | null
          client_attempt_id: string
          concept_id: string
          confidence_level?: string | null
          previous_strength: number
          recovered?: boolean
          resulting_strength?: number | null
          user_id: string
        }
        Update: {
          answer_correct?: boolean
          applied_at?: string
          class_id?: string | null
          client_attempt_id?: string
          concept_id?: string
          confidence_level?: string | null
          previous_strength?: number
          recovered?: boolean
          resulting_strength?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_result_concept_updates_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_result_concept_updates_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          anonymized: boolean
          artifact_id: string | null
          class_id: string | null
          client_attempt_id: string | null
          client_class_id: string | null
          created_at: string
          duration_minutes: number
          ended_at: string | null
          id: string
          mode: string | null
          result_payload: Json | null
          result_request_hash: string | null
          result_status: string
          score: number | null
          started_at: string
          study_scope_id: string
          study_scope_label: string | null
          study_scope_snapshot: Json
          study_scope_type: string
          topic: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          anonymized?: boolean
          artifact_id?: string | null
          class_id?: string | null
          client_attempt_id?: string | null
          client_class_id?: string | null
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          id?: string
          mode?: string | null
          result_payload?: Json | null
          result_request_hash?: string | null
          result_status?: string
          score?: number | null
          started_at?: string
          study_scope_id?: string
          study_scope_label?: string | null
          study_scope_snapshot?: Json
          study_scope_type?: string
          topic?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          anonymized?: boolean
          artifact_id?: string | null
          class_id?: string | null
          client_attempt_id?: string | null
          client_class_id?: string | null
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          id?: string
          mode?: string | null
          result_payload?: Json | null
          result_request_hash?: string | null
          result_status?: string
          score?: number | null
          started_at?: string
          study_scope_id?: string
          study_scope_label?: string | null
          study_scope_snapshot?: Json
          study_scope_type?: string
          topic?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "learning_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      study_strategy_outcomes: {
        Row: {
          artifact_id: string | null
          class_id: string | null
          correct: number
          created_at: string
          format: string | null
          id: string
          mastery_delta: number | null
          modality: string | null
          occurred_at: string
          outcome_source: string
          strategy_id: string | null
          subject_profile: string | null
          task_kind: string | null
          technique: string | null
          total: number
          user_id: string
        }
        Insert: {
          artifact_id?: string | null
          class_id?: string | null
          correct: number
          created_at?: string
          format?: string | null
          id?: string
          mastery_delta?: number | null
          modality?: string | null
          occurred_at?: string
          outcome_source?: string
          strategy_id?: string | null
          subject_profile?: string | null
          task_kind?: string | null
          technique?: string | null
          total: number
          user_id: string
        }
        Update: {
          artifact_id?: string | null
          class_id?: string | null
          correct?: number
          created_at?: string
          format?: string | null
          id?: string
          mastery_delta?: number | null
          modality?: string | null
          occurred_at?: string
          outcome_source?: string
          strategy_id?: string | null
          subject_profile?: string | null
          task_kind?: string | null
          technique?: string | null
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_strategy_outcomes_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "learning_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_strategy_outcomes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      syllabus_cleanup_configuration: {
        Row: {
          created_at: string
          invoke_secret_digest: string
          invoke_secret_id: string
          project_url_secret_id: string | null
          singleton: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          invoke_secret_digest: string
          invoke_secret_id: string
          project_url_secret_id?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          invoke_secret_digest?: string
          invoke_secret_id?: string
          project_url_secret_id?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      syllabus_source_cleanup_claims: {
        Row: {
          attempts: number
          claim_token: string
          claimed_at: string
          eligible_before: string
          lease_expires_at: string
          object_created_at: string
          storage_path: string
        }
        Insert: {
          attempts?: number
          claim_token: string
          claimed_at?: string
          eligible_before: string
          lease_expires_at: string
          object_created_at: string
          storage_path: string
        }
        Update: {
          attempts?: number
          claim_token?: string
          claimed_at?: string
          eligible_before?: string
          lease_expires_at?: string
          object_created_at?: string
          storage_path?: string
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
          anonymized: boolean
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
          visibility: string
        }
        Insert: {
          accuracy?: number | null
          anonymized?: boolean
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
          visibility?: string
        }
        Update: {
          accuracy?: number | null
          anonymized?: boolean
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
          visibility?: string
        }
        Relationships: []
      }
      user_concept_mastery: {
        Row: {
          attempts: number
          class_id: string | null
          concept_id: string
          correct: number
          created_at: string
          id: string
          last_seen_at: string | null
          next_review_at: string | null
          streak: number
          strength: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          class_id?: string | null
          concept_id: string
          correct?: number
          created_at?: string
          id?: string
          last_seen_at?: string | null
          next_review_at?: string | null
          streak?: number
          strength?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          class_id?: string | null
          concept_id?: string
          correct?: number
          created_at?: string
          id?: string
          last_seen_at?: string | null
          next_review_at?: string | null
          streak?: number
          strength?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_concept_mastery_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_concept_mastery_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      campus_brain_aggregate: {
        Row: {
          average_weight: number | null
          class_id: string | null
          client_class_id: string | null
          day: string | null
          signal_count: number | null
          source_type: string | null
          student_count: number | null
          topic: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_brain_signals_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_study_concept_result: {
        Args: {
          p_attempt_id: string
          p_class_id: string
          p_concept_id: string
          p_correct: boolean
          p_seen_at?: string
        }
        Returns: Json
      }
      apply_study_concept_result_v2: {
        Args: {
          p_attempt_id: string
          p_class_id: string
          p_concept_id: string
          p_confidence: string
          p_correct: boolean
          p_recovered?: boolean
          p_seen_at?: string
          p_user_id: string
        }
        Returns: Json
      }
      can_upload_uncommitted_syllabus_source: {
        Args: { p_path: string }
        Returns: boolean
      }
      claim_abandoned_syllabus_sources: {
        Args: { p_before?: string; p_claim_token: string; p_limit?: number }
        Returns: {
          storage_path: string
        }[]
      }
      commit_class_syllabus: {
        Args: {
          p_class_id: string
          p_client_class_id: string
          p_content_hash: string
          p_mime_type: string
          p_original_name: string
          p_parsed_data: Json
          p_request_id: string
          p_reviewed_data: Json
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: Json
      }
      confirm_syllabus_cleanup_claims: {
        Args: { p_claim_token: string; p_storage_paths: string[] }
        Returns: {
          storage_path: string
        }[]
      }
      consume_ai_request_quota: {
        Args: {
          p_function_name: string
          p_limit: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      get_syllabus_cleanup_invocation_digest: { Args: never; Returns: string }
      owns_active_syllabus_storage_path: {
        Args: { p_path: string }
        Returns: boolean
      }
      owns_row: { Args: { _user_id: string }; Returns: boolean }
      owns_syllabus_storage_path: { Args: { p_path: string }; Returns: boolean }
      recompute_topic_scores: {
        Args: { _class_id?: string }
        Returns: undefined
      }
      record_memory_trick_feedback: {
        Args: {
          p_artifact_id: string
          p_concept_id: string
          p_helpful: boolean
          p_technique: string
        }
        Returns: boolean
      }
      release_syllabus_cleanup_claims: {
        Args: { p_claim_token: string; p_storage_paths: string[] }
        Returns: number
      }
    }
    Enums: {
      artifact_kind:
        | "flashcards"
        | "multiple_choice"
        | "fill_blank"
        | "matching"
        | "practice"
        | "study_guide"
        | "cheat_sheet"
        | "eli5"
        | "eli_professor"
        | "mnemonic"
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
      artifact_kind: [
        "flashcards",
        "multiple_choice",
        "fill_blank",
        "matching",
        "practice",
        "study_guide",
        "cheat_sheet",
        "eli5",
        "eli_professor",
        "mnemonic",
      ],
    },
  },
} as const
