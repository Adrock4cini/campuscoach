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
      assignments: {
        Row: {
          class_id: string | null
          client_class_id: string | null
          created_at: string
          due_date: string | null
          estimated_minutes: number
          id: string
          meta: Json
          notes: string | null
          priority: string
          status: string
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
          id?: string
          meta?: Json
          notes?: string | null
          priority?: string
          status?: string
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
          id?: string
          meta?: Json
          notes?: string | null
          priority?: string
          status?: string
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
      captures: {
        Row: {
          anonymized: boolean
          captured_on: string
          chapter: string | null
          class_id: string | null
          client_class_id: string | null
          created_at: string
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
          captured_on?: string
          chapter?: string | null
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
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
          captured_on?: string
          chapter?: string | null
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
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
            foreignKeyName: "captures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          client_class_id: string | null
          color: string | null
          course_instance_id: string | null
          created_at: string
          current_topic: string | null
          id: string
          location: string | null
          meta: Json
          name: string
          professor: string | null
          readiness: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_class_id?: string | null
          color?: string | null
          course_instance_id?: string | null
          created_at?: string
          current_topic?: string | null
          id?: string
          location?: string | null
          meta?: Json
          name: string
          professor?: string | null
          readiness?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_class_id?: string | null
          color?: string | null
          course_instance_id?: string | null
          created_at?: string
          current_topic?: string | null
          id?: string
          location?: string | null
          meta?: Json
          name?: string
          professor?: string | null
          readiness?: number | null
          updated_at?: string
          user_id?: string
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
          id: string
          meta: Json
          notes: string | null
          readiness: number
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
          id?: string
          meta?: Json
          notes?: string | null
          readiness?: number
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
          id?: string
          meta?: Json
          notes?: string | null
          readiness?: number
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
          created_at: string
          duration_seconds: number | null
          id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          anonymized?: boolean
          capture_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          kind: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          anonymized?: boolean
          capture_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
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
      study_sessions: {
        Row: {
          anonymized: boolean
          class_id: string | null
          client_class_id: string | null
          created_at: string
          duration_minutes: number
          ended_at: string | null
          id: string
          mode: string | null
          score: number | null
          started_at: string
          topic: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          anonymized?: boolean
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          id?: string
          mode?: string | null
          score?: number | null
          started_at?: string
          topic?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          anonymized?: boolean
          class_id?: string | null
          client_class_id?: string | null
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          id?: string
          mode?: string | null
          score?: number | null
          started_at?: string
          topic?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
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
      owns_row: { Args: { _user_id: string }; Returns: boolean }
      recompute_topic_scores: {
        Args: { _class_id?: string }
        Returns: undefined
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
