"use client"

import { FileText, ExternalLink } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Document } from "@/lib/types"

interface SearchResultsProps {
  results: Document[]
  query: string
  onViewDocument: (doc: Document) => void
}

export function SearchResults({ results, query, onViewDocument }: SearchResultsProps) {
  if (!query) return null

  return (
    <div className="w-full max-w-xl space-y-3 px-2 mt-6">
      <p className="text-sm text-muted-foreground">
        {results.length} result{results.length !== 1 ? "s" : ""} for "{query}"
      </p>

      {results.length === 0 ? (
        <Card className="p-6 bg-muted/20 border-border/40 text-center">
          <p className="text-muted-foreground">No documents found matching your search.</p>
        </Card>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {results.map((doc) => (
            <Card
              key={doc.id}
              className="p-4 bg-muted/20 border-border/40 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => onViewDocument(doc)}
            >
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{doc.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">{doc.description}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs bg-muted px-2 py-1 rounded">{doc.category}</span>
                    {doc.page_count && <span className="text-xs text-muted-foreground">{doc.page_count} pages</span>}
                  </div>
                </div>
                {doc.source_url && (
                  <Button variant="ghost" size="icon" className="shrink-0 h-10 w-10" asChild>
                    <a
                      href={doc.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
