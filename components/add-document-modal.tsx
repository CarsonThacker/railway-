"use client"

import type React from "react"
import { useState } from "react"
import { X, CheckCircle, Loader2, Plus, Trash2, FileText, Video, Music, ImageIcon, File, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@/lib/types"

interface AddDocumentModalProps {
  open: boolean
  onClose: () => void
  onAdd: () => void
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

type SubmitStatus = "idle" | "submitting" | "submitted"

const isGovUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return parsed.hostname.endsWith(".gov") || parsed.hostname === "gov"
  } catch {
    try {
      const lowerUrl = url.toLowerCase().trim()
      return lowerUrl.includes(".gov/") || lowerUrl.includes(".gov")
    } catch {
      return false
    }
  }
}

const getFileTypeFromUrl = (url: string): string => {
  const lower = url.toLowerCase()
  if (lower.endsWith(".pdf")) return "pdf"
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) return "video"
  if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".ogg") || lower.endsWith(".m4a"))
    return "audio"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".gif"))
    return "image"
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "document"
  return "document"
}

const getFileTypeIcon = (type: string) => {
  switch (type) {
    case "video":
      return <Video className="w-3 h-3" />
    case "audio":
      return <Music className="w-3 h-3" />
    case "image":
      return <ImageIcon className="w-3 h-3" />
    case "pdf":
    case "document":
    case "html":
      return <FileText className="w-3 h-3" />
    default:
      return <File className="w-3 h-3" />
  }
}

const extractTitleFromUrl = (url: string): string => {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname)
    const parts = pathname.split("/")
    const filename = parts[parts.length - 1] || ""
    const nameWithoutExt = filename.replace(/\.(pdf|mp4|mp3|wav|mov|avi|webm|ogg|m4a|jpg|jpeg|png|gif|doc|docx)$/i, "")
    return nameWithoutExt.replace(/[_-]/g, " ").replace(/%20/g, " ").replace(/\s+/g, " ").trim() || "Untitled Document"
  } catch {
    return "Untitled Document"
  }
}

export function AddDocumentModal({ open, onClose, onAdd, user }: AddDocumentModalProps) {
  const [sourceUrls, setSourceUrls] = useState<string[]>([""])
  const [category, setCategory] = useState("")
  const [editableTitle, setEditableTitle] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle")

  const resetForm = () => {
    setSourceUrls([""])
    setCategory("")
    setEditableTitle("")
    setError("")
    setSubmitStatus("idle")
  }

  const addUrlField = () => {
    setSourceUrls([...sourceUrls, ""])
  }

  const removeUrlField = (index: number) => {
    if (sourceUrls.length > 1) {
      setSourceUrls(sourceUrls.filter((_, i) => i !== index))
    }
  }

  const updateUrl = (index: number, value: string) => {
    const newUrls = [...sourceUrls]
    newUrls[index] = value
    setSourceUrls(newUrls)

    // Auto-generate title from first URL
    if (index === 0 && value.trim()) {
      const suggestedTitle = extractTitleFromUrl(value)
      if (!editableTitle || editableTitle === "Untitled Document") {
        setEditableTitle(suggestedTitle)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      setError("You must be logged in to add documents")
      return
    }

    if (!editableTitle.trim()) {
      setError("Title is required")
      return
    }

    if (!category) {
      setError("Category is required")
      return
    }

    const validUrls = sourceUrls.filter((url) => url.trim())
    if (validUrls.length === 0) {
      setError("At least one source URL is required")
      return
    }

    const invalidDomainUrls = validUrls.filter((url) => !isGovUrl(url))
    if (invalidDomainUrls.length > 0) {
      setError("All URLs must be from a .gov domain")
      return
    }

    setIsLoading(true)
    setError("")
    setSubmitStatus("submitting")

    const supabase = createClient()
    const fileType = getFileTypeFromUrl(validUrls[0])

    try {
      // Create document in pending state
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          title: editableTitle.trim(),
          description: `Pending approval - submitted by ${user.username}`,
          category,
          content: null,
          source_url: validUrls[0],
          source_urls: validUrls,
          names: null,
          file_type: fileType,
          created_by: user.id,
        })
        .select()
        .single()

      if (docError) throw docError

      // Create pending edit for admin review
      const { error: pendingError } = await supabase.from("pending_edits").insert({
        document_id: doc.id,
        user_id: user.id,
        username: user.username,
        pending_title: editableTitle.trim(),
        pending_description: null,
        pending_content: null,
        pending_names: null,
        pending_source_url: validUrls[0],
        pending_source_urls: validUrls,
        pending_category: category,
        status: "pending",
      })

      if (pendingError) throw pendingError

      // Log activity
      await supabase.from("activities").insert({
        document_id: doc.id,
        user_id: user.id,
        action: "pending",
        document_title: editableTitle.trim(),
        username: user.redactedName ? "[Redacted]" : user.username,
        redacted: user.redactedName || false,
      })

      setSubmitStatus("submitted")

      setTimeout(() => {
        resetForm()
        onAdd()
        onClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit document")
      setSubmitStatus("idle")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (submitStatus === "submitting") return
    resetForm()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-background max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Submit Document for Review</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4"
              onClick={handleClose}
              disabled={submitStatus === "submitting"}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {submitStatus === "submitted" && (
            <div className="p-4 rounded-lg border bg-green-500/10 border-green-500/30">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="font-medium text-green-500">Submitted for Review</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Your document has been submitted and is pending admin approval.
              </p>
            </div>
          )}

          {submitStatus !== "submitted" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={editableTitle}
                  onChange={(e) => setEditableTitle(e.target.value)}
                  placeholder="Enter document title"
                  className="min-h-[44px]"
                  disabled={submitStatus === "submitting"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category / Genre *</Label>
                <Select value={category} onValueChange={setCategory} disabled={submitStatus === "submitting"}>
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Source URLs (.gov only) *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addUrlField}
                    disabled={submitStatus === "submitting"}
                    className="h-8 text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add URL
                  </Button>
                </div>
                <div className="space-y-2">
                  {sourceUrls.map((url, index) => (
                    <div key={index} className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          type="url"
                          value={url}
                          onChange={(e) => updateUrl(index, e.target.value)}
                          placeholder="https://www.justice.gov/..."
                          className="min-h-[44px] pr-10"
                          disabled={submitStatus === "submitting"}
                        />
                        {url.trim() && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {getFileTypeIcon(getFileTypeFromUrl(url))}
                          </div>
                        )}
                      </div>
                      {sourceUrls.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeUrlField(index)}
                          disabled={submitStatus === "submitting"}
                          className="min-h-[44px] min-w-[44px] text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 min-h-[44px] bg-transparent"
                  onClick={handleClose}
                  disabled={submitStatus === "submitting"}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 min-h-[44px]"
                  disabled={isLoading || !editableTitle.trim() || !category || !sourceUrls[0]?.trim()}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 mr-2" />
                      Submit for Review
                    </>
                  )}
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Documents require admin approval before being published. Only .gov URLs are accepted.
              </p>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
