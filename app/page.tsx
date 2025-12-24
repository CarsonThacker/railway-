"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, Moon, Sun, ArrowUp, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthModal } from "@/components/auth-modal"
import { RecentActivity } from "@/components/recent-activity"
import { FloatingStars } from "@/components/floating-stars"
import { SearchResults } from "@/components/search-results"
import { DocumentViewer } from "@/components/document-viewer"
import { AddDocumentModal } from "@/components/add-document-modal"
import { AdminPanel } from "@/components/admin-panel"
import { LegalModal } from "@/components/legal-modal"
import { createClient } from "@/lib/supabase/client"
import type { Document, User } from "@/lib/types"

const ADMIN_USERNAME = "System"

export default function Home() {
  const [darkMode, setDarkMode] = useState(true)
  const [showAuth, setShowAuth] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Document[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [showAddDocument, setShowAddDocument] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [documentCount, setDocumentCount] = useState(0)
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | "aup" | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const isAdmin = user?.username === ADMIN_USERNAME

  // Check for existing session and fetch document count on mount
  useEffect(() => {
    const init = async () => {
      const supabase = createClient()

      // Check for existing session
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (authUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, redacted_name")
          .eq("id", authUser.id)
          .single()

        setUser({
          id: authUser.id,
          email: authUser.email || "",
          username: profile?.username || authUser.email?.split("@")[0] || "User",
          redactedName: profile?.redacted_name || false,
        })
      }

      // Get document count (only approved documents)
      const { count } = await supabase.from("documents").select("*", { count: "exact", head: true })
      setDocumentCount(count || 0)
      setIsLoading(false)
    }

    init()

    // Subscribe to auth changes
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.documentElement.classList.add("dark")
  }, [])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [darkMode])

  const handleSearch = useCallback(async () => {
    if (searchQuery.trim()) {
      const supabase = createClient()
      const searchTerm = searchQuery.trim().toLowerCase()

      // Search documents by title, description, category, or names
      const { data } = await supabase
        .from("documents")
        .select("*")
        .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`)
        .order("created_at", { ascending: false })
        .limit(50)

      setSearchResults(data || [])
      setHasSearched(true)
    } else {
      setSearchResults([])
      setHasSearched(false)
    }
  }, [searchQuery])

  const handleViewDocument = async (doc: Document) => {
    // Fetch the latest version of the document
    const supabase = createClient()
    const { data } = await supabase.from("documents").select("*").eq("id", doc.id).single()

    if (data) {
      setSelectedDocument(data)
    } else {
      setSelectedDocument(doc)
    }
  }

  const handleDocumentAdded = async () => {
    const supabase = createClient()
    const { count } = await supabase.from("documents").select("*", { count: "exact", head: true })
    setDocumentCount(count || 0)

    if (hasSearched && searchQuery.trim()) {
      handleSearch()
    }
  }

  const handleDocumentUpdated = async () => {
    // Refresh the document if it's currently selected
    if (selectedDocument) {
      const supabase = createClient()
      const { data } = await supabase.from("documents").select("*").eq("id", selectedDocument.id).single()
      if (data) {
        setSelectedDocument(data)
      }
    }

    // Refresh search results if searching
    if (hasSearched && searchQuery.trim()) {
      handleSearch()
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden pb-safe">
      <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
        <FloatingStars />

        {/* Header */}
        <header className="flex justify-end items-center p-4 gap-2 relative z-10 safe-top">
          {isAdmin && (
            <Button
              variant="outline"
              size="icon"
              className="rounded-full min-h-[44px] min-w-[44px] bg-card border-border"
              onClick={() => router.push("/admin")}
            >
              <Shield className="w-5 h-5" />
            </Button>
          )}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-3 rounded-full hover:bg-muted/30 active:bg-muted/50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <Button
            variant="outline"
            className="rounded-full px-5 py-2 min-h-[44px] bg-card text-card-foreground hover:bg-card/90 active:bg-card/80 font-medium border border-border"
            onClick={() => setShowAuth(true)}
          >
            {user ? user.username : "Login"}
          </Button>
        </header>

        {/* Main Content */}
        <main className="flex flex-col items-center px-4 pt-8 md:pt-16 pb-48 relative z-10">
          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-6xl font-serif tracking-tight mb-1 text-balance">
              Filepedia <span className="text-muted-foreground text-lg md:text-3xl italic font-normal">v0.2</span>
            </h1>
            <p className="text-muted-foreground text-sm md:text-lg">for the public</p>
          </div>

          {/* Search Bar */}
          <div className="w-full max-w-xl mb-6">
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search names, pages, documents..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (!e.target.value.trim()) {
                    setHasSearched(false)
                    setSearchResults([])
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full pl-12 pr-14 py-6 rounded-full bg-muted/20 border-border/40 text-base placeholder:text-muted-foreground/60 focus:bg-muted/30"
              />
              <Button
                size="icon"
                className="absolute right-2 rounded-full bg-card text-card-foreground hover:bg-card/80 active:bg-card/70 border border-border min-h-[44px] min-w-[44px]"
                onClick={handleSearch}
              >
                <ArrowUp className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Search Results or Recent Activity */}
          {hasSearched ? (
            <SearchResults results={searchResults} query={searchQuery} onViewDocument={handleViewDocument} />
          ) : (
            <RecentActivity user={user} onAddDocument={() => setShowAddDocument(true)} />
          )}
        </main>

        {/* Footer */}
        <footer className="fixed bottom-0 left-0 right-0 text-center pb-6 pt-10 bg-gradient-to-t from-background via-background to-transparent relative z-10 safe-bottom">
          <p className="text-muted-foreground text-xs mb-1">Documents Available</p>
          <p className="text-xl md:text-2xl font-mono tracking-wider mb-3">
            {isLoading ? "..." : documentCount.toLocaleString()}
          </p>
          <div className="flex justify-center items-center gap-1.5 text-xs text-muted-foreground">
            <button
              onClick={() => setLegalModal("terms")}
              className="hover:text-foreground active:text-foreground transition-colors py-2 px-2"
            >
              Terms of Service
            </button>
            <span className="text-muted-foreground/30">•</span>
            <button
              onClick={() => setLegalModal("privacy")}
              className="hover:text-foreground active:text-foreground transition-colors py-2 px-2"
            >
              Privacy Policy
            </button>
            <span className="text-muted-foreground/30">•</span>
            <button
              onClick={() => setLegalModal("aup")}
              className="hover:text-foreground active:text-foreground transition-colors py-2 px-2"
            >
              AUP
            </button>
          </div>
        </footer>

        {/* Modals */}
        <AuthModal open={showAuth} onOpenChange={setShowAuth} user={user} onAuthChange={setUser} />

        <DocumentViewer
          document={selectedDocument}
          open={!!selectedDocument}
          onClose={() => setSelectedDocument(null)}
          user={user}
          onDocumentUpdated={handleDocumentUpdated}
        />

        <AddDocumentModal
          open={showAddDocument}
          onClose={() => setShowAddDocument(false)}
          onAdd={handleDocumentAdded}
          user={user}
        />

        <AdminPanel open={showAdminPanel} onClose={() => setShowAdminPanel(false)} user={user} />

        <LegalModal type={legalModal} open={!!legalModal} onClose={() => setLegalModal(null)} />
      </div>
    </div>
  )
}
