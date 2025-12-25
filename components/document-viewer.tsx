"use client"

import { useState, useEffect } from "react"
import {
  X,
  ChevronLeft,
  Trash2,
  Loader2,
  FileText,
  Video,
  Music,
  ImageIcon,
  File,
  Download,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import type { DocumentViewerProps } from "./document-viewer-props" // Import DocumentViewerProps

const ADMIN_USERNAME = "System admin"

const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return "Unknown size"
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}

const getFileTypeIcon = (type: string) => {
  switch (type) {
    case "video":
      return <Video className="w-5 h-5" />
    case "audio":
      return <Music className="w-5 h-5" />
    case "image":
      return <ImageIcon className="w-5 h-5" />
    case "pdf":
      return <FileText className="w-5 h-5" />
    default:
      return <File className="w-5 h-5" />
  }
}

export function DocumentViewer({ document, open, onClose, user, onDocumentUpdated }: DocumentViewerProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState("")
  const [imageZoom, setImageZoom] = useState(1)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    if (document) {
      setShowDeleteConfirm(false)
      setError("")
      setImageZoom(1)
      setImageLoaded(false)
    }
  }, [document])

  if (!document || !open) return null

  const isAdmin = user?.username === ADMIN_USERNAME

  const handleDelete = async () => {
    if (!user || !isAdmin) {
      setError("You don't have permission to delete documents")
      return
    }

    setIsDeleting(true)
    setError("")

    const supabase = createClient()

    try {
      // Delete file from blob storage
      if (document.file_url) {
        await fetch("/api/delete-file", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: document.file_url }),
        })
      }

      // Delete thumbnail
      if (document.thumbnail_url) {
        await fetch("/api/delete-file", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: document.thumbnail_url }),
        })
      }

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

  // Render content based on file type
  const renderContent = () => {
    const fileUrl = document.file_url

    if (!fileUrl) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <File className="w-12 h-12 mb-3" />
          <p>No file available</p>
        </div>
      )
    }

    switch (document.file_type) {
      case "image":
        return (
          <div className="relative">
            {/* Zoom controls */}
            <div className="sticky top-0 z-10 flex items-center justify-center gap-2 py-2 bg-background/80 backdrop-blur-sm border-b border-border/50">
              <Button
                variant="outline"
                size="icon"
                className="min-h-[36px] min-w-[36px] bg-transparent"
                onClick={() => setImageZoom((z) => Math.max(0.5, z - 0.25))}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground w-16 text-center">{Math.round(imageZoom * 100)}%</span>
              <Button
                variant="outline"
                size="icon"
                className="min-h-[36px] min-w-[36px] bg-transparent"
                onClick={() => setImageZoom((z) => Math.min(3, z + 0.25))}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
            <div className="overflow-auto p-4">
              {!imageLoaded && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              )}
              <img
                src={fileUrl || "/placeholder.svg"}
                alt={document.title}
                className="mx-auto transition-transform duration-200"
                style={{
                  transform: `scale(${imageZoom})`,
                  transformOrigin: "top center",
                  maxWidth: "100%",
                  display: imageLoaded ? "block" : "none",
                }}
                onLoad={() => setImageLoaded(true)}
              />
            </div>
          </div>
        )

      case "video":
        return (
          <div className="p-4">
            <video src={fileUrl} controls className="w-full rounded-lg max-h-[60vh]" preload="metadata">
              Your browser does not support the video tag.
            </video>
          </div>
        )

      case "audio":
        return (
          <div className="p-6 flex flex-col items-center justify-center">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Music className="w-12 h-12 text-primary" />
            </div>
            <audio src={fileUrl} controls className="w-full max-w-md" preload="metadata">
              Your browser does not support the audio tag.
            </audio>
          </div>
        )

      case "pdf":
        return (
          <div className="w-full h-[70vh]">
            <iframe src={`${fileUrl}#toolbar=1&navpanes=0`} className="w-full h-full border-0" title={document.title} />
          </div>
        )

      default:
        return (
          <div className="p-6 flex flex-col items-center justify-center">
            <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center mb-4">
              {getFileTypeIcon(document.file_type)}
            </div>
            <p className="text-sm text-muted-foreground mb-4">This file type cannot be previewed in the browser.</p>
            <Button asChild>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer" download>
                <Download className="w-4 h-4 mr-2" />
                Download File
              </a>
            </Button>
          </div>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 p-4 border-b border-border bg-background safe-top">
        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] shrink-0" onClick={onClose}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0 text-center">
          <h1 className="font-semibold text-foreground truncate text-sm">{document.title}</h1>
          <p className="text-xs text-muted-foreground">{document.category}</p>
        </div>
        <div className="flex items-center gap-2">
          {document.file_url && (
            <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] shrink-0" asChild>
              <a href={document.file_url} target="_blank" rel="noopener noreferrer" download>
                <Download className="w-5 h-5" />
              </a>
            </Button>
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
        <div className="pb-safe">
          {showDeleteConfirm && (
            <div className="m-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
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
            <div className="m-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Document Info Card */}
          <div className="p-4 border-b border-border">
            <div className="flex items-start gap-3">
              {document.thumbnail_url ? (
                <img
                  src={document.thumbnail_url || "/placeholder.svg"}
                  alt={document.title}
                  className="w-16 h-16 object-cover rounded-lg"
                />
              ) : (
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                  {getFileTypeIcon(document.file_type)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-medium text-foreground">{document.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {document.category} • {formatFileSize(document.file_size)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Added {formatDate(document.created_at)}</p>
              </div>
            </div>

            {document.description && <p className="mt-3 text-sm text-muted-foreground">{document.description}</p>}

            {/* Related Names */}
            {document.names && document.names.length > 0 && (
              <div className="mt-3">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Names Mentioned
                </Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {document.names.map((name, idx) => (
                    <span
                      key={idx}
                      className="bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs border border-primary/20"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* File Content */}
          <div className="bg-card">{renderContent()}</div>

          {/* Footer */}
          <div className="p-4 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">Document ID: {document.id.toUpperCase().slice(0, 8)}</p>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
