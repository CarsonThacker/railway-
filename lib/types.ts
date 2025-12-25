export interface Profile {
  id: string
  username: string
  redacted_name: boolean
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  title: string
  description: string | null
  category: string
  content: string | null
  page_count: number | null
  names: string[] | null
  file_type: string
  file_url: string | null
  file_size: number | null
  thumbnail_url: string | null
  source_url: string | null
  source_urls: string[] | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Activity {
  id: string
  document_id: string
  user_id: string | null
  action: "added" | "edited" | "pending" | "approved" | "rejected"
  document_title: string
  username: string
  redacted: boolean
  created_at: string
}

export interface User {
  id: string
  email: string
  username: string
  redactedName: boolean
}

export interface PendingEdit {
  id: string
  document_id: string
  user_id: string | null
  username: string
  pending_title: string
  pending_description: string | null
  pending_content: string | null
  pending_names: string[] | null
  pending_source_urls: string[] | null
  pending_file_url: string | null
  pending_file_size: number | null
  pending_thumbnail_url: string | null
  pending_category: string | null
  status: "pending" | "approved" | "rejected"
  ai_feedback: string | null
  reviewed_at: string | null
  created_at: string
}
