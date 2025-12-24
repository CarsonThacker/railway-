import { createClient } from "@/lib/supabase/server"
import { generateText } from "ai"

export async function POST(req: Request) {
  try {
    const { pendingIds } = await req.json()

    if (!pendingIds || pendingIds.length === 0) {
      return Response.json({ error: "No pending IDs provided" }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch all pending edits
    const { data: pendingEdits, error } = await supabase
      .from("pending_edits")
      .select("*")
      .in("id", pendingIds)
      .eq("status", "pending")

    if (error || !pendingEdits) {
      return Response.json({ error: "Failed to fetch pending edits" }, { status: 500 })
    }

    const results = []

    for (const edit of pendingEdits) {
      try {
        // Use AI to generate a better title and suggest category
        const prompt = `Based on this document submission:
Title: ${edit.pending_title}
URLs: ${edit.pending_source_urls?.join(", ") || edit.pending_source_url || "N/A"}
Category: ${edit.pending_category || "Not specified"}

Please provide:
1. A concise, professional title (max 100 chars)
2. A brief description (max 200 chars)
3. Best category from: Data Sets, Court Records, FBI Documents, BOP Records, Interview Transcripts, Financial Records, Media Files, Other

Respond in JSON format: {"title": "...", "description": "...", "category": "..."}`

        const { text } = await generateText({
          model: "openai/gpt-4o-mini",
          prompt,
          maxTokens: 300,
        })

        // Parse AI response
        let aiSuggestion = { title: edit.pending_title, description: "", category: edit.pending_category }
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            aiSuggestion = JSON.parse(jsonMatch[0])
          }
        } catch {
          // Keep defaults if parsing fails
        }

        // Update pending edit with AI suggestions
        await supabase
          .from("pending_edits")
          .update({
            pending_title: aiSuggestion.title || edit.pending_title,
            pending_description: aiSuggestion.description || null,
            pending_category: aiSuggestion.category || edit.pending_category,
            ai_feedback: `AI suggested: ${aiSuggestion.title}`,
          })
          .eq("id", edit.id)

        results.push({ id: edit.id, success: true, suggestion: aiSuggestion })
      } catch (err) {
        results.push({ id: edit.id, success: false, error: String(err) })
      }
    }

    return Response.json({ results })
  } catch (error) {
    console.error("Batch AI review error:", error)
    return Response.json({ error: "Failed to process batch review" }, { status: 500 })
  }
}
