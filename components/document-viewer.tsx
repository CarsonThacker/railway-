"use client"

import { useState, useEffect } from "react"
import { X, FileText, ChevronLeft, ExternalLink, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import type { Document, User } from "@/lib/types"

interface DocumentViewerProps {
  document: Document | null
  open: boolean
  onClose: () => void
  user: User | null
  onDocumentUpdated: () => void
}

const ADMIN_USERNAME = "cdthacker14"

export function DocumentViewer({ document, open, onClose, user, onDocumentUpdated }: DocumentViewerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editContent, setEditContent] = useState("")
  const [editNames, setEditNames] = useState("")
  const [editSourceUrls, setEditSourceUrls] = useState<string[]>([""])
  const [isSaving, setIsSaving] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState("")
  const [moderationStatus, setModerationStatus] = useState("idle")
  const [moderationFeedback, setModerationFeedback] = useState("")
  const [moderationIssues, setModerationIssues] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (document) {
      setEditTitle(document.title)
      setEditDescription(document.description || "")
      setEditContent(document.content || "")
      setEditNames(document.names?.join(", ") || "")
      const urls = document.source_urls?.length
        ? document.source_urls
        : document.source_url
          ? [document.source_url]
          : [""]
      setEditSourceUrls(urls.length > 0 ? urls : [""])
      setIsEditing(false)
      setError("")
      setModerationStatus("idle")
      setModerationFeedback("")
      setModerationIssues([])
      setShowDeleteConfirm(false)
    }
  }, [document])

  if (!document || !open) return null

  const isAdmin = user?.username === ADMIN_USERNAME

  const addUrlField = () => {
    setEditSourceUrls([...editSourceUrls, ""])
  }

  const removeUrlField = (index: number) => {
    if (editSourceUrls.length > 1) {
      setEditSourceUrls(editSourceUrls.filter((_, i) => i !== index))
    }
  }

  const updateUrl = (index: number, value: string) => {
    const newUrls = [...editSourceUrls]
    newUrls[index] = value
    setEditSourceUrls(newUrls)
  }

  const fetchFromUrl = async (url: string) => {
    if (!url.trim()) {
      setError("Enter a URL first")
      return
    }

    setIsFetching(true)
    setError("")

    try {
      const response = await fetch("/api/fetch-url-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || "Failed to fetch content")
        return
      }

      if (result.data.title) setEditTitle(result.data.title)
      if (result.data.description) setEditDescription(result.data.description)
      if (result.data.content) setEditContent(result.data.content)
      if (result.data.names?.length) setEditNames(result.data.names.join(", "))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch content")
    } finally {
      setIsFetching(false)
    }
  }

  const handleSave = async () => {
    if (!user) {
      setError("You must be logged in to edit")
      return
    }

    const validUrls = editSourceUrls.filter((url) => url.trim())
    if (validUrls.length === 0) {
      setError("At least one source URL is required")
      return
    }

    setIsSaving(true)
    setError("")
    setModerationStatus("submitting")
    setModerationIssues([])

    const supabase = createClient()

    try {
      const { data: pendingEdit, error: insertError } = await supabase
        .from("pending_edits")
        .insert({
          document_id: document.id,
          user_id: user.id,
          username: user.username,
          pending_title: editTitle.trim(),
          pending_description: editDescription.trim() || null,
          pending_content: editContent.trim() || null,
          pending_names: editNames
            ? editNames
                .split(",")
                .map((n) => n.trim())
                .filter(Boolean)
            : null,
          pending_source_url: validUrls[0],
          pending_source_urls: validUrls,
          status: "pending",
        })
        .select()
        .single()

      if (insertError) throw insertError

      await supabase.from("activities").insert({
        document_id: document.id,
        user_id: user.id,
        action: "pending",
        document_title: editTitle.trim(),
        username: user.redactedName ? "[Redacted]" : user.username,
        redacted: user.redactedName || false,
      })

      setModerationStatus("reviewing")

      const response = await fetch("/api/moderate-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingEditId: pendingEdit.id }),
      })

      const result = await response.json()

      if (result.approved) {
        setModerationStatus("approved")
        setModerationFeedback(result.reason)
        setTimeout(() => {
          setIsEditing(false)
          setModerationStatus("idle")
          onDocumentUpdated()
        }, 1500)
      } else {
        setModerationStatus("rejected")
        setModerationFeedback(result.reason)
        setModerationIssues(result.issues || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
      setModerationStatus("idle")
    } finally {
      setIsSaving(false)
    }
  }

  const resetEdit = () => {
    setIsEditing(false)
    setModerationStatus("idle")
    setModerationIssues([])
    setEditTitle(document.title)
    setEditDescription(document.description || "")
    setEditContent(document.content || "")
    setEditNames(document.names?.join(", ") || "")
    const urls = document.source_urls?.length
      ? document.source_urls
      : document.source_url
        ? [document.source_url]
        : [""]
    setEditSourceUrls(urls.length > 0 ? urls : [""])
  }

  const handleDelete = async () => {
    if (!user || !isAdmin) {
      setError("You don't have permission to delete documents")
      return
    }

    setIsDeleting(true)
    setError("")

    const supabase = createClient()

    try {
      // Delete related activities first
      await supabase.from("activities").delete().eq("document_id", document.id)

      // Delete pending edits
      await supabase.from("pending_edits").delete().eq("document_id", document.id)

      // Delete the document
      const { error: deleteError } = await supabase.from("documents").delete().eq("id", document.id)

      if (deleteError) throw deleteError

      onDocumentUpdated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document")
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  const displayUrls = document.source_urls?.length
    ? document.source_urls
    : document.source_url
      ? [document.source_url]
      : []

  const ModerationBanner = () => {
    if (moderationStatus === "idle") return null

    const statusConfig = {
      submitting: {
        icon: <Loader2 className="w-5 h-5 animate-spin" />,
        title: "Submitting edit...",
        desc: "Your edit is being submitted",
        bg: "bg-blue-500/10 border-blue-500/30",
        text: "text-blue-400",
      },
      reviewing: {
        icon: <Loader2 className="w-5 h-5 animate-spin" />,
        title: "Validating URLs...",
        desc: "Checking that all source URLs are accessible",
        bg: "bg-amber-500/10 border-amber-500/30",
        text: "text-amber-400",
      },
      approved: {
        icon: <Loader2 className="w-5 h-5" />,
        title: "Edit saved!",
        desc: moderationFeedback,
        bg: "bg-green-500/10 border-green-500/30",
        text: "text-green-400",
      },
      rejected: {
        icon: <Loader2 className="w-5 h-5" />,
        title: "Invalid URLs",
        desc: moderationFeedback,
        bg: "bg-red-500/10 border-red-500/30",
        text: "text-red-400",
      },
    }

    const config = statusConfig[moderationStatus]

    return (
      <div className={`mb-4 p-4 rounded-xl border ${config.bg}`}>
        <div className="flex items-start gap-3">
          <div className={config.text}>{config.icon}</div>
          <div className="flex-1">
            <h4 className={`font-medium ${config.text}`}>{config.title}</h4>
            <p className="text-sm text-muted-foreground mt-1">{config.desc}</p>
          </div>
        </div>
        {moderationStatus === "rejected" && moderationIssues.length > 0 && (
          <ul className="mt-3 ml-8 space-y-1">
            {moderationIssues.map((issue, i) => (
              <li key={i} className="text-sm text-destructive flex items-start gap-1">
                <span className="mt-0.5">•</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        )}
        {moderationStatus === "rejected" && (
          <div className="mt-3 flex gap-2 ml-8">
            <Button size="sm" variant="outline" onClick={() => setModerationStatus("idle")} className="text-xs">
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={resetEdit} className="text-xs">
              Cancel edit
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 p-4 border-b border-border bg-background safe-top">
        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] shrink-0" onClick={onClose}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0 text-center">
          {isEditing && moderationStatus === "idle" ? (
            <div className="flex items-center justify-center gap-2">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-center font-semibold"
                placeholder="Document title"
              />
            </div>
          ) : (
            <>
              <h1 className="font-semibold text-foreground truncate text-sm">{document.title}</h1>
              <p className="text-xs text-muted-foreground">{document.category}</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {user && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="min-h-[44px] min-w-[44px] shrink-0"
              onClick={() => setIsEditing(true)}
            >
              {/* Edit icon */}
            </Button>
          )}
          {isEditing && moderationStatus === "idle" && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px] shrink-0 text-destructive"
                onClick={resetEdit}
              >
                {/* XCircle icon */}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px] shrink-0 text-green-500"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  {
                    /* Save icon */
                  }
                )}
              </Button>
            </>
          )}
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className="min-h-[44px] min-w-[44px] shrink-0 text-destructive hover:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] shrink-0" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="h-[calc(100vh-80px)]">
        <div className="p-4">
          {showDeleteConfirm && (
            <div className="mb-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm font-medium text-destructive mb-3">
                Are you sure you want to delete this document? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Yes, Delete"
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Description */}
          {document.description && (
            <div className="mb-4">
              <Label className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider block">
                Description
              </Label>
              <p className="text-sm text-foreground">{document.description}</p>
            </div>
          )}

          {/* Source URLs */}
          <div className="mb-4">
            <Label className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider block">
              Source URLs
            </Label>
            {displayUrls.length > 0 ? (
              <div className="space-y-2">
                {displayUrls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline break-all p-2 bg-muted/20 rounded-lg"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span className="break-all">{url}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No source URLs</p>
            )}
          </div>

          {/* Related Names */}
          <div className="mb-4">
            <Label className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider block">
              Names Mentioned
            </Label>
            {document.names && document.names.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {document.names.map((name, idx) => (
                  <span
                    key={idx}
                    className="bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs border border-primary/20"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No names listed</p>
            )}
          </div>

          {/* Document Content */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4">
              {/* Document Header */}
              <div className="text-center mb-4 pb-3 border-b border-border/50">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
                  {document.category} {document.page_count && `• ${document.page_count} pages`}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-base font-medium text-foreground">{document.title}</h3>
                </div>
              </div>

              {/* Document Body - Read Only */}
              <div className="bg-muted/10 rounded-lg p-4 min-h-[300px] border border-border/30">
                <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-sans">
                  {document.content || "No content available for this document."}
                </pre>
              </div>

              {/* Document Footer */}
              <div className="mt-4 pt-3 border-t border-border/50 space-y-1">
                <p className="text-[10px] text-muted-foreground text-center">
                  Document ID: {document.id.toUpperCase().slice(0, 8)}
                </p>
                <p className="text-[10px] text-muted-foreground text-center">
                  Added: {formatDate(document.created_at)}
                  {document.updated_at !== document.created_at && <> • Updated: {formatDate(document.updated_at)}</>}
                </p>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
