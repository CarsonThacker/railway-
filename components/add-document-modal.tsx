"use client"

import type React from "react"
import { useState, useRef } from "react"
import { X, CheckCircle, Loader2, Upload, FileText, Video, Music, ImageIcon, File, Clock, Trash2 } from "lucide-react"
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

type SubmitStatus = "idle" | "uploading" | "submitting" | "submitted"

interface UploadedFile {
  url: string
  filename: string
  size: number
  type: string
  fileType: string
  thumbnailUrl?: string
}

const formatFileSize = (bytes: number): string => {
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

// Compress image before upload
const compressImage = async (file: File, maxWidth = 1920, quality = 0.8): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      let { width, height } = img

      // Scale down if too large
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Failed to get canvas context"))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error("Failed to compress image"))
          }
        },
        "image/jpeg",
        quality,
      )
    }
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = URL.createObjectURL(file)
  })
}

// Create thumbnail for images
const createThumbnail = async (file: File): Promise<Blob> => {
  return compressImage(file, 400, 0.7)
}

export function AddDocumentModal({ open, onClose, onAdd, user }: AddDocumentModalProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [category, setCategory] = useState("")
  const [editableTitle, setEditableTitle] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState("")
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setUploadedFiles([])
    setCategory("")
    setEditableTitle("")
    setError("")
    setSubmitStatus("idle")
    setUploadProgress(0)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setSubmitStatus("uploading")
    setError("")

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadProgress(Math.round(((i + 0.5) / files.length) * 100))

      try {
        let fileToUpload: File | Blob = file
        let thumbnailUrl: string | undefined

        // Compress images before upload
        if (file.type.startsWith("image/")) {
          const compressed = await compressImage(file)
          fileToUpload = new File([compressed], file.name, { type: "image/jpeg" })

          // Create and upload thumbnail
          const thumbnail = await createThumbnail(file)
          const thumbFormData = new FormData()
          thumbFormData.append("file", new File([thumbnail], `thumb_${file.name}`, { type: "image/jpeg" }))

          const thumbResponse = await fetch("/api/upload", {
            method: "POST",
            body: thumbFormData,
          })

          if (thumbResponse.ok) {
            const thumbResult = await thumbResponse.json()
            thumbnailUrl = thumbResult.url
          }
        }

        const formData = new FormData()
        formData.append("file", fileToUpload)

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        })

        const result = await response.json()

        if (!response.ok) {
          setError(result.error || "Upload failed")
          continue
        }

        setUploadedFiles((prev) => [
          ...prev,
          {
            url: result.url,
            filename: result.filename,
            size: result.size,
            type: result.type,
            fileType: result.fileType,
            thumbnailUrl,
          },
        ])

        // Auto-set title from first file
        if (!editableTitle && i === 0) {
          const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ")
          setEditableTitle(nameWithoutExt)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed")
      }
    }

    setSubmitStatus("idle")
    setUploadProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeFile = async (index: number) => {
    const file = uploadedFiles[index]

    // Delete from blob storage
    try {
      await fetch("/api/delete-file", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: file.url }),
      })

      if (file.thumbnailUrl) {
        await fetch("/api/delete-file", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: file.thumbnailUrl }),
        })
      }
    } catch (err) {
      console.error("Failed to delete file:", err)
    }

    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
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

    if (uploadedFiles.length === 0) {
      setError("At least one file is required")
      return
    }

    setIsLoading(true)
    setError("")
    setSubmitStatus("submitting")

    const supabase = createClient()
    const mainFile = uploadedFiles[0]

    try {
      // Create document in pending state
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          title: editableTitle.trim(),
          description: `Pending approval - submitted by ${user.username}`,
          category,
          content: null,
          file_url: mainFile.url,
          file_size: mainFile.size,
          file_type: mainFile.fileType,
          thumbnail_url: mainFile.thumbnailUrl || null,
          source_urls: uploadedFiles.map((f) => f.url),
          names: null,
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
        pending_file_url: mainFile.url,
        pending_file_size: mainFile.size,
        pending_thumbnail_url: mainFile.thumbnailUrl || null,
        pending_source_urls: uploadedFiles.map((f) => f.url),
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
    if (submitStatus === "submitting" || submitStatus === "uploading") return
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
              disabled={submitStatus === "submitting" || submitStatus === "uploading"}
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
              {/* File Upload Area */}
              <div className="space-y-2">
                <Label>Upload Files *</Label>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={submitStatus === "uploading"}
                  />
                  {submitStatus === "uploading" ? (
                    <div className="space-y-2">
                      <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Uploading... {uploadProgress}%</p>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Click or drag files here</p>
                      <p className="text-xs text-muted-foreground mt-1">Images, PDFs, videos, audio (max 10MB each)</p>
                    </>
                  )}
                </div>
              </div>

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <Label>Uploaded Files ({uploadedFiles.length})</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {uploadedFiles.map((file, index) => (
                      <div key={index} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg">
                        {file.thumbnailUrl ? (
                          <img
                            src={file.thumbnailUrl || "/placeholder.svg"}
                            alt={file.filename}
                            className="w-10 h-10 object-cover rounded"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                            {getFileTypeIcon(file.fileType)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.filename}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-[36px] min-w-[36px] text-destructive hover:text-destructive"
                          onClick={() => removeFile(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 min-h-[44px] bg-transparent"
                  onClick={handleClose}
                  disabled={submitStatus === "submitting" || submitStatus === "uploading"}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 min-h-[44px]"
                  disabled={isLoading || !editableTitle.trim() || !category || uploadedFiles.length === 0}
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
                Documents require admin approval before being published.
              </p>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
