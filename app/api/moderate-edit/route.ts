import { createClient } from "@/lib/supabase/server"

function isGovUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname.endsWith(".gov") || parsed.hostname === "gov"
  } catch {
    return false
  }
}

async function validateUrl(url: string): Promise<{ valid: boolean; reason: string; url: string }> {
  if (!url) return { valid: false, reason: "No URL provided", url }

  try {
    const parsed = new URL(url)
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, reason: "URL must use http or https protocol", url }
    }
  } catch {
    return { valid: false, reason: "Invalid URL format", url }
  }

  if (!isGovUrl(url)) {
    return { valid: false, reason: "URL must be from a .gov domain", url }
  }

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Filepedia/1.0)",
      },
    })
    if (!response.ok) {
      return { valid: false, reason: `URL returned status ${response.status}`, url }
    }
    return { valid: true, reason: "URL is accessible", url }
  } catch {
    return { valid: false, reason: "URL is not accessible or timed out", url }
  }
}

export async function POST(req: Request) {
  try {
    const { pendingEditId } = await req.json()

    if (!pendingEditId) {
      return Response.json({ error: "Missing pendingEditId" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: pendingEdit, error: fetchError } = await supabase
      .from("pending_edits")
      .select("*")
      .eq("id", pendingEditId)
      .single()

    if (fetchError || !pendingEdit) {
      return Response.json({ error: "Pending edit not found" }, { status: 404 })
    }

    let isRedacted = false
    if (pendingEdit.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("redacted_name")
        .eq("id", pendingEdit.user_id)
        .single()
      isRedacted = profile?.redacted_name || false
    }

    const { data: originalDoc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", pendingEdit.document_id)
      .single()

    const sourceUrls = pendingEdit.pending_source_urls?.length
      ? pendingEdit.pending_source_urls
      : pendingEdit.pending_source_url
        ? [pendingEdit.pending_source_url]
        : originalDoc?.source_urls?.length
          ? originalDoc.source_urls
          : originalDoc?.source_url
            ? [originalDoc.source_url]
            : []

    // Validate all URLs
    const urlResults = await Promise.all(sourceUrls.map((url: string) => validateUrl(url)))
    const validUrls = urlResults.filter((r) => r.valid)
    const invalidUrls = urlResults.filter((r) => !r.valid)

    const hasAtLeastOneValidUrl = validUrls.length > 0
    const now = new Date().toISOString()
    const displayUsername = isRedacted ? "[Redacted]" : pendingEdit.username

    if (hasAtLeastOneValidUrl) {
      // Approved - at least one URL is valid
      await supabase
        .from("documents")
        .update({
          title: pendingEdit.pending_title,
          description: pendingEdit.pending_description,
          content: pendingEdit.pending_content,
          names: pendingEdit.pending_names,
          source_url: sourceUrls[0] || originalDoc?.source_url,
          source_urls: sourceUrls.length > 0 ? sourceUrls : originalDoc?.source_urls,
          updated_at: now,
        })
        .eq("id", pendingEdit.document_id)

      await supabase
        .from("pending_edits")
        .update({
          status: "approved",
          ai_feedback: `Approved - ${validUrls.length} valid URL(s)`,
          reviewed_at: now,
        })
        .eq("id", pendingEditId)

      await supabase.from("activities").insert({
        document_id: pendingEdit.document_id,
        user_id: pendingEdit.user_id,
        action: "edited",
        document_title: pendingEdit.pending_title,
        username: displayUsername,
        redacted: isRedacted,
      })

      return Response.json({
        approved: true,
        reason: `Document saved with ${validUrls.length} valid source URL(s).`,
        issues: invalidUrls.map((r) => `${r.url}: ${r.reason}`),
      })
    } else {
      // Rejected - no valid URLs
      await supabase
        .from("pending_edits")
        .update({
          status: "rejected",
          ai_feedback: "No valid URLs provided",
          reviewed_at: now,
        })
        .eq("id", pendingEditId)

      await supabase.from("activities").insert({
        document_id: pendingEdit.document_id,
        user_id: pendingEdit.user_id,
        action: "rejected",
        document_title: pendingEdit.pending_title,
        username: displayUsername,
        redacted: isRedacted,
      })

      return Response.json({
        approved: false,
        reason: "All provided URLs are invalid or inaccessible.",
        issues: invalidUrls.map((r) => `${r.url}: ${r.reason}`),
      })
    }
  } catch (error) {
    console.error("Validation error:", error)
    return Response.json({ error: "Failed to validate edit" }, { status: 500 })
  }
}
