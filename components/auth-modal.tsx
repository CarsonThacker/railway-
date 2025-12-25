"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Sparkles, LogOut, Eye, EyeOff } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@/lib/types"

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onAuthChange: (user: User | null) => void
}

export function AuthModal({ open, onOpenChange, user, onAuthChange }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [redactedName, setRedactedName] = useState(false)
  const [isUpdatingRedacted, setIsUpdatingRedacted] = useState(false)

  const handleLogin = async () => {
    setIsLoading(true)
    setError("")

    const supabase = createClient()

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, redacted_name")
          .eq("id", data.user.id)
          .single()

        onAuthChange({
          id: data.user.id,
          email: data.user.email || "",
          username: profile?.username || email.split("@")[0],
          redactedName: profile?.redacted_name || false,
        })
        onOpenChange(false)
        resetForm()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignUp = async () => {
    if (!username.trim()) {
      setError("Username is required")
      return
    }

    if (username.length < 3) {
      setError("Username must be at least 3 characters")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setIsLoading(true)
    setError("")
    setMessage("")

    const supabase = createClient()

    try {
      // Check if username is already taken
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", username.trim())
        .maybeSingle()

      if (existingUser) {
        setError("Username is already taken")
        setIsLoading(false)
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || window.location.origin,
          data: {
            username: username.trim(),
          },
        },
      })

      if (error) throw error

      if (data.user) {
        const profileRes = await fetch("/api/create-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: data.user.id,
            username: username.trim(),
          }),
        })

        const profileData = await profileRes.json()

        if (!profileRes.ok) {
          console.error("Profile creation error:", profileData.error)
        }

        if (data.user.identities && data.user.identities.length > 0) {
          // User was created successfully
          if (data.session) {
            // Auto-confirmed - log them in directly
            onAuthChange({
              id: data.user.id,
              email: data.user.email || "",
              username: username.trim(),
              redactedName: false,
            })
            onOpenChange(false)
            resetForm()
          } else {
            // Email confirmation required
            setMessage("Check your email for a confirmation link to complete sign up!")
          }
        } else {
          // User already exists
          setError("An account with this email already exists")
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Sign up failed"
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleRedacted = async (checked: boolean) => {
    if (!user) return
    setIsUpdatingRedacted(true)

    const supabase = createClient()
    const { error } = await supabase.from("profiles").update({ redacted_name: checked }).eq("id", user.id)

    if (!error) {
      setRedactedName(checked)
      onAuthChange({ ...user, redactedName: checked })
    }
    setIsUpdatingRedacted(false)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    onAuthChange(null)
    onOpenChange(false)
  }

  const resetForm = () => {
    setEmail("")
    setPassword("")
    setUsername("")
    setError("")
    setMessage("")
  }

  const switchMode = () => {
    setMode(mode === "login" ? "signup" : "login")
    setError("")
    setMessage("")
  }

  const currentRedacted = user?.redactedName ?? redactedName

  // If user is logged in, show account info
  if (user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="w-5 h-5" />
              Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-4 bg-muted/20 rounded-lg">
              <p className="text-sm text-muted-foreground">Logged in as</p>
              <p className="font-medium text-foreground">{user.username}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
              <div className="flex items-center gap-3">
                {currentRedacted ? (
                  <EyeOff className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Eye className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium text-sm">Redact my name</p>
                  <p className="text-xs text-muted-foreground">
                    {currentRedacted
                      ? 'Your name shows as "[Redacted]" in activity'
                      : "Your username is visible in activity"}
                  </p>
                </div>
              </div>
              <Switch checked={currentRedacted} onCheckedChange={handleToggleRedacted} disabled={isUpdatingRedacted} />
            </div>

            <Button
              variant="outline"
              className="w-full rounded-full min-h-[44px] gap-2 bg-transparent"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5" />
            {mode === "login" ? "Sign In" : "Create Account"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Sign in to add and edit documents." : "Create an account to contribute to Filepedia."}
          </p>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                className="bg-muted/50 min-h-[44px]"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="bg-muted/50 min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "login" ? "Enter password" : "Create a password (min 6 characters)"}
              className="bg-muted/50 min-h-[44px]"
              onKeyDown={(e) => e.key === "Enter" && (mode === "login" ? handleLogin() : handleSignUp())}
            />
          </div>

          <Button
            className="w-full rounded-full min-h-[44px]"
            onClick={mode === "login" ? handleLogin : handleSignUp}
            disabled={isLoading}
          >
            {isLoading
              ? mode === "login"
                ? "Signing in..."
                : "Creating account..."
              : mode === "login"
                ? "Sign In"
                : "Sign Up"}
          </Button>

          <p className="text-sm text-center text-muted-foreground">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button onClick={switchMode} className="text-primary hover:underline font-medium">
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
