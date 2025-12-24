"use client"

import { useEffect, useState } from "react"
import { Plus, FileText, Calendar, Edit, Clock, XCircle, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type { Activity, User } from "@/lib/types"

interface RecentActivityProps {
  user: User | null
  onAddDocument: () => void
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatExactTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function RecentActivity({ user, onAddDocument }: RecentActivityProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchActivities = async () => {
      const supabase = createClient()
      const { data } = await supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(10)

      if (data) {
        setActivities(data)
      }
      setIsLoading(false)
    }

    fetchActivities()

    // Subscribe to real-time updates
    const supabase = createClient()
    const channel = supabase
      .channel("activities")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, (payload) => {
        setActivities((prev) => [payload.new as Activity, ...prev].slice(0, 10))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const getActionConfig = (action: string) => {
    switch (action) {
      case "edited":
        return {
          icon: <Edit className="w-4 h-4 text-amber-500" />,
          bg: "bg-amber-500/20",
          label: "Edited",
        }
      case "pending":
        return {
          icon: <Clock className="w-4 h-4 text-blue-400" />,
          bg: "bg-blue-500/20",
          label: "Edit pending review",
        }
      case "approved":
        return {
          icon: <CheckCircle className="w-4 h-4 text-green-500" />,
          bg: "bg-green-500/20",
          label: "Edit approved",
        }
      case "rejected":
        return {
          icon: <XCircle className="w-4 h-4 text-red-400" />,
          bg: "bg-red-500/20",
          label: "Edit rejected",
        }
      default:
        return {
          icon: <FileText className="w-4 h-4 text-muted-foreground" />,
          bg: "bg-muted/30",
          label: "Added",
        }
    }
  }

  const getDisplayName = (activity: Activity) => {
    if (activity.redacted) {
      return "[Redacted]"
    }
    return activity.username
  }

  return (
    <div className="w-full max-w-xl px-4">
      {user && (
        <div className="flex justify-center mb-6">
          <Button
            variant="outline"
            className="rounded-full gap-2 min-h-[44px] px-6 bg-muted/20 border-border/50 hover:bg-muted/40"
            onClick={onAddDocument}
          >
            <Plus className="w-4 h-4" />
            Add Document
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Loading activity...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          activities.map((item) => {
            const actionConfig = getActionConfig(item.action)
            const displayName = getDisplayName(item)
            return (
              <div
                key={item.id}
                className="group relative bg-muted/10 hover:bg-muted/20 border border-border/30 rounded-xl p-4 transition-all duration-200"
              >
                {/* Top accent line */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-muted-foreground/20 rounded-full" />

                <div className="flex items-start gap-3">
                  {/* Icon - different for each action type */}
                  <div className={`p-2 rounded-lg shrink-0 ${actionConfig.bg}`}>{actionConfig.icon}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground text-sm leading-tight mb-1 text-balance">
                      {item.document_title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {actionConfig.label} by{" "}
                      <span
                        className={`font-medium ${item.redacted ? "italic text-muted-foreground" : "text-foreground"}`}
                      >
                        {displayName}
                      </span>
                    </p>
                  </div>

                  {/* Time */}
                  <div className="flex flex-col items-end gap-0.5 text-muted-foreground shrink-0">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span className="text-[10px]">{formatTimeAgo(item.created_at)}</span>
                    </div>
                    <span className="text-[9px] text-muted-foreground/60">{formatExactTime(item.created_at)}</span>
                  </div>
                </div>

                {/* Bottom accent */}
                <div className="absolute bottom-2 right-3 w-1 h-1 bg-muted-foreground/20 rounded-full" />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
