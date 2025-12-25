"use client"

import { useState, useEffect } from "react"
import {
  X,
  Check,
  Trash2,
  Loader2,
  RefreshCw,
  Sparkles,
  FileText,
  Video,
  Music,
  ImageIcon,
  File,
  Download,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import type { PendingEdit, User } from "@/lib/types"

interface AdminPanelProps {
  open: boolean
  onClose: () => void
  user: User | null
}

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

const ADMIN_USERNAME = "System"

const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return "Unknown"
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}

const getFileTypeIcon = (type: string) => {
  switch (type) {
    case "video":
      return <Video className="w-4 h-4" />
    case "audio":
      return <Music className="w-4 h-4" />
    case "image":
      return <ImageIcon className="w-4 h-4" />
    case "pdf":
      return <FileText className="w-4 h-4" />
    default:
      return <File className="w-4 h-4" />
  }
}

const getFileTypeFromUrl = (url: string): string => {
  const lower = url.toLowerCase()
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)$/)) return "image"
  if (lower.match(/\.(mp4|webm|mov)$/)) return "video"
  if (lower.match(/\.(mp3|wav|ogg|m4a)$/)) return "audio"
  if (lower.endsWith(".pdf")) return "pdf"
  return "document"
}

export function AdminPanel({ open, onClose, user }: AdminPanelProps) {
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [editingItem, setEditingItem] = useState<PendingEdit | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    category: "",
    content: "",
  })

  const isAdmin = user?.username === ADMIN_USERNAME

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

  useEffect(() => {
    if (open && isAdmin) {
      fetchPendingEdits()
    }
  }, [open, isAdmin])

  const handleApprove = async (edit: PendingEdit) => {
    setProcessingId(edit.id)
    const supabase = createClient()
    const now = new Date().toISOString()

    try {
      // Update the document with approved content
      await supabase
        .from("documents")
        .update({
          title: editForm.title || edit.pending_title,
          description: editForm.description || edit.pending_description || `Approved document`,
          content: editForm.content || edit.pending_content,
          category: editForm.category || edit.pending_category,
          names: edit.pending_names,
          file_url: edit.pending_file_url,
          file_size: edit.pending_file_size,
          thumbnail_url: edit.pending_thumbnail_url,
          source_urls: edit.pending_source_urls,
          updated_at: now,
        })
        .eq("id", edit.document_id)

      // Update pending edit status
      await supabase
        .from("pending_edits")
        .update({
          status: "approved",
          ai_feedback: "Manually approved by admin",
          reviewed_at: now,
        })
        .eq("id", edit.id)

      // Log activity
      await supabase.from("activities").insert({
        document_id: edit.document_id,
        user_id: user?.id,
        action: "approved",
        document_title: editForm.title || edit.pending_title,
        username: user?.username || "Admin",
        redacted: false,
      })

      // Refresh list
      await fetchPendingEdits()
      setEditingItem(null)
      setPreviewUrl(null)
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
      // Delete files from blob storage
      if (edit.pending_file_url) {
        await fetch("/api/delete-file", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: edit.pending_file_url }),
        })
      }

      if (edit.pending_thumbnail_url) {
        await fetch("/api/delete-file", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: edit.pending_thumbnail_url }),
        })
      }

      // Delete the document
      await supabase.from("documents").delete().eq("id", edit.document_id)

      // Update pending edit status
      await supabase
        .from("pending_edits")
        .update({
          status: "rejected",
          ai_feedback: "Rejected by admin",
          reviewed_at: now,
        })
        .eq("id", edit.id)

      // Log activity
      await supabase.from("activities").insert({
        document_id: edit.document_id,
        user_id: user?.id,
        action: "rejected",
        document_title: edit.pending_title,
        username: user?.username || "Admin",
        redacted: false,
      })

      // Refresh list
      await fetchPendingEdits()
      setEditingItem(null)
      setPreviewUrl(null)
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
    setPreviewUrl(edit.pending_file_url || null)
  }

  if (!isAdmin) {
    return null
  }

  const renderPreview = (url: string, type: string) => {
    switch (type) {
      case "image":
        return <img src={url || "/placeholder.svg"} alt="Preview" className="max-w-full max-h-48 rounded-lg mx-auto" />
      case "video":
        return <video src={url} controls className="max-w-full max-h-48 rounded-lg mx-auto" />
      case "audio":
        return <audio src={url} controls className="w-full" />
      case "pdf":
        return <iframe src={url} className="w-full h-48 rounded-lg border" title="PDF Preview" />
      default:
        return (
          <div className="flex items-center justify-center h-32 bg-muted rounded-lg">
            <File className="w-8 h-8 text-muted-foreground" />
          </div>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-background max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Admin Review Panel</DialogTitle>
            <Button variant="ghost" size="icon" className="absolute right-4 top-4" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{pendingEdits.length} pending submission(s)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchPendingEdits} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {pendingEdits.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleBatchAIReview} disabled={batchProcessing}>
                  <Sparkles className={`w-4 h-4 mr-2 ${batchProcessing ? "animate-pulse" : ""}`} />
                  {batchProcessing ? "Processing..." : "AI Batch Review"}
                </Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingEdits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No pending submissions</div>
          ) : editingItem ? (
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Review Submission</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingItem(null)
                    setPreviewUrl(null)
                  }}
                >
                  Back to List
                </Button>
              </div>

              {/* File Preview */}
              {previewUrl && (
                <div className="border rounded-lg p-4 bg-muted/20">
                  <Label className="text-xs text-muted-foreground mb-2 block">File Preview</Label>
                  {renderPreview(previewUrl, getFileTypeFromUrl(previewUrl))}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(editingItem.pending_file_size)}
                    </span>
                    <Button variant="outline" size="sm" asChild>
                      <a href={previewUrl} target="_blank" rel="noopener noreferrer" download>
                        <Download className="w-3 h-3 mr-1" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
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
                    placeholder="Add a description..."
                  />
                </div>

                <div>
                  <Label>Content Notes</Label>
                  <Textarea
                    value={editForm.content}
                    onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                    rows={3}
                    placeholder="Add content summary or notes..."
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Submitted by {editingItem.username} on {new Date(editingItem.created_at).toLocaleDateString()}
                </p>

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
              {pendingEdits.map((edit) => {
                const fileType = edit.pending_file_url ? getFileTypeFromUrl(edit.pending_file_url) : "document"

                return (
                  <div key={edit.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-start gap-3">
                      {/* Thumbnail or icon */}
                      {edit.pending_thumbnail_url ? (
                        <img
                          src={edit.pending_thumbnail_url || "/placeholder.svg"}
                          alt={edit.pending_title}
                          className="w-14 h-14 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center">
                          {getFileTypeIcon(fileType)}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{edit.pending_title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {edit.pending_category} • {formatFileSize(edit.pending_file_size)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          By {edit.username} • {new Date(edit.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-h-[44px] bg-transparent"
                        onClick={() => startEditing(edit)}
                      >
                        Review
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
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
