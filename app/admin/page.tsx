"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Check,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  FileText,
  Video,
  Music,
  ImageIcon,
  File,
  ArrowLeft,
  Shield,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import type { PendingEdit, User } from "@/lib/types"

const CATEGORIES = [
  "Data Sets",
  "Court Records",
  "FBI Documents",
  "BOP Records",
  "Interview Transcripts",
  "Financial Records",
  "Media Files",
  "Other",
]

const ADMIN_USERNAME = "cdthacker14"

const getFileTypeIcon = (type: string) => {
  switch (type) {
    case "video":
      return <Video className="w-4 h-4" />
    case "audio":
      return <Music className="w-4 h-4" />
    case "image":
      return <ImageIcon className="w-4 h-4" />
    case "pdf":
    case "document":
      return <FileText className="w-4 h-4" />
    default:
      return <File className="w-4 h-4" />
  }
}

const getFileTypeFromUrl = (url: string): string => {
  const lower = url.toLowerCase()
  if (lower.endsWith(".pdf")) return "pdf"
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) return "video"
  if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".ogg")) return "audio"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".gif"))
    return "image"
  return "document"
}

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [editingItem, setEditingItem] = useState<PendingEdit | null>(null)
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    category: "",
    content: "",
  })

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (authUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, redacted_name")
          .eq("id", authUser.id)
          .single()

        if (profile?.username === ADMIN_USERNAME) {
          setUser({
            id: authUser.id,
            email: authUser.email || "",
            username: profile.username,
            redactedName: profile.redacted_name || false,
          })
          fetchPendingEdits()
        } else {
          router.push("/")
        }
      } else {
        router.push("/")
      }
      setIsLoading(false)
    }

    checkAuth()
  }, [router])

  const fetchPendingEdits = async () => {
    setIsLoading(true)
    const supabase = createClient()

    const { data } = await supabase
      .from("pending_edits")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })

    setPendingEdits(data || [])
    setIsLoading(false)
  }

  const handleApprove = async (edit: PendingEdit) => {
    setProcessingId(edit.id)
    const supabase = createClient()
    const now = new Date().toISOString()

    try {
      await supabase
        .from("documents")
        .update({
          title: editForm.title || edit.pending_title,
          description: editForm.description || edit.pending_description || "Approved document",
          content: editForm.content || edit.pending_content,
          category: editForm.category || edit.pending_category,
          names: edit.pending_names,
          source_url: edit.pending_source_urls?.[0] || edit.pending_source_url,
          source_urls: edit.pending_source_urls,
          updated_at: now,
        })
        .eq("id", edit.document_id)

      await supabase
        .from("pending_edits")
        .update({
          status: "approved",
          ai_feedback: "Manually approved by admin",
          reviewed_at: now,
        })
        .eq("id", edit.id)

      await supabase.from("activities").insert({
        document_id: edit.document_id,
        user_id: user?.id,
        action: "approved",
        document_title: editForm.title || edit.pending_title,
        username: user?.username || "Admin",
        redacted: false,
      })

      await fetchPendingEdits()
      setEditingItem(null)
    } catch (err) {
      console.error("Failed to approve:", err)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (edit: PendingEdit) => {
    setProcessingId(edit.id)
    const supabase = createClient()
    const now = new Date().toISOString()

    try {
      await supabase.from("documents").delete().eq("id", edit.document_id)

      await supabase
        .from("pending_edits")
        .update({
          status: "rejected",
          ai_feedback: "Rejected by admin",
          reviewed_at: now,
        })
        .eq("id", edit.id)

      await supabase.from("activities").insert({
        document_id: edit.document_id,
        user_id: user?.id,
        action: "rejected",
        document_title: edit.pending_title,
        username: user?.username || "Admin",
        redacted: false,
      })

      await fetchPendingEdits()
      setEditingItem(null)
    } catch (err) {
      console.error("Failed to reject:", err)
    } finally {
      setProcessingId(null)
    }
  }

  const handleBatchAIReview = async () => {
    setBatchProcessing(true)

    try {
      const response = await fetch("/api/batch-ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingIds: pendingEdits.map((e) => e.id) }),
      })

      if (response.ok) {
        await fetchPendingEdits()
      }
    } catch (err) {
      console.error("Batch AI review failed:", err)
    } finally {
      setBatchProcessing(false)
    }
  }

  const startEditing = (edit: PendingEdit) => {
    setEditingItem(edit)
    setEditForm({
      title: edit.pending_title || "",
      description: edit.pending_description || "",
      category: edit.pending_category || "",
      content: edit.pending_content || "",
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user || user.username !== ADMIN_USERNAME) {
    return null
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 p-4 border-b border-border bg-background safe-top">
        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={() => router.push("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Admin Panel</h1>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{pendingEdits.length} pending submission(s)</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPendingEdits}
                disabled={isLoading}
                className="min-h-[44px] bg-transparent"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {pendingEdits.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBatchAIReview}
                  disabled={batchProcessing}
                  className="min-h-[44px] bg-transparent"
                >
                  <Sparkles className={`w-4 h-4 mr-2 ${batchProcessing ? "animate-pulse" : ""}`} />
                  {batchProcessing ? "Processing..." : "AI Batch Review"}
                </Button>
              )}
            </div>
          </div>

          {pendingEdits.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No pending submissions</p>
            </div>
          ) : editingItem ? (
            <div className="space-y-4 p-4 border border-border rounded-xl bg-card">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Edit Before Approving</h3>
                <Button variant="ghost" size="sm" onClick={() => setEditingItem(null)}>
                  Cancel
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="min-h-[44px]"
                  />
                </div>

                <div>
                  <Label>Category</Label>
                  <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={2}
                  />
                </div>

                <div>
                  <Label>Content Summary</Label>
                  <Textarea
                    value={editForm.content}
                    onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                    rows={4}
                    placeholder="Add content summary or notes..."
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Source URLs</Label>
                  <div className="space-y-2 mt-2">
                    {editingItem.pending_source_urls?.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-2 p-2 bg-muted/20 rounded-lg"
                      >
                        <ExternalLink className="w-4 h-4 shrink-0" />
                        <span className="break-all">{url}</span>
                      </a>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="destructive"
                    className="flex-1 min-h-[44px]"
                    onClick={() => handleReject(editingItem)}
                    disabled={processingId === editingItem.id}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    className="flex-1 min-h-[44px] bg-green-600 hover:bg-green-700"
                    onClick={() => handleApprove(editingItem)}
                    disabled={processingId === editingItem.id}
                  >
                    {processingId === editingItem.id ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    Approve
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingEdits.map((edit) => (
                <div key={edit.id} className="p-4 border border-border rounded-xl bg-card space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getFileTypeIcon(getFileTypeFromUrl(edit.pending_source_urls?.[0] || ""))}
                        <h4 className="font-medium">{edit.pending_title}</h4>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Submitted by {edit.username} • {new Date(edit.created_at).toLocaleDateString()}
                      </p>
                      {edit.pending_category && (
                        <span className="inline-block mt-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {edit.pending_category}
                        </span>
                      )}
                    </div>
                  </div>

                  {edit.pending_source_urls && edit.pending_source_urls.length > 0 && (
                    <div className="space-y-1">
                      {edit.pending_source_urls.slice(0, 2).map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{url}</span>
                        </a>
                      ))}
                      {edit.pending_source_urls.length > 2 && (
                        <p className="text-xs text-muted-foreground">
                          +{edit.pending_source_urls.length - 2} more URL(s)
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px] bg-transparent"
                      onClick={() => startEditing(edit)}
                    >
                      Review & Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="min-h-[44px] min-w-[44px]"
                      onClick={() => handleReject(edit)}
                      disabled={processingId === edit.id}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      className="min-h-[44px] min-w-[44px] bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        setEditForm({
                          title: edit.pending_title,
                          description: edit.pending_description || "",
                          category: edit.pending_category || "",
                          content: edit.pending_content || "",
                        })
                        handleApprove(edit)
                      }}
                      disabled={processingId === edit.id}
                    >
                      {processingId === edit.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
