import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { userId, username } = await request.json()

    if (!userId || !username) {
      return NextResponse.json({ error: "Missing userId or username" }, { status: 400 })
    }

    const supabase = await createClient()

    // Check if profile already exists
    const { data: existingProfile } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle()

    if (existingProfile) {
      return NextResponse.json({ success: true, message: "Profile already exists" })
    }

    // Check if username is taken
    const { data: existingUsername } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle()

    if (existingUsername) {
      return NextResponse.json({ error: "Username already taken" }, { status: 400 })
    }

    // Create profile
    const { error } = await supabase.from("profiles").insert({
      id: userId,
      username: username.trim(),
      redacted_name: false,
    })

    if (error) {
      console.error("Profile creation error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Create profile error:", err)
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 })
  }
}
