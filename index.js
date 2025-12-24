import express from "express"
import cors from "cors"
import pdf from "pdf-parse/lib/pdf-parse.js"

const app = express()
app.use(cors())
app.use(express.json())

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "PDF Extraction Server" })
})

// Check if URL is from a .gov domain
function isGovUrl(urlString) {
  try {
    const url = new URL(urlString)
    return url.hostname.endsWith(".gov")
  } catch {
    // Fallback for URLs with special characters
    const match = urlString.match(/https?:\/\/([^/]+)/)
    if (match) {
      return match[1].endsWith(".gov")
    }
    return false
  }
}

// Extract title from URL path
function extractTitleFromUrl(urlString) {
  try {
    const decodedUrl = decodeURIComponent(urlString)

    // Look for case patterns like "Name v. Name"
    const caseMatch = decodedUrl.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+v\.\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/)
    if (caseMatch) {
      return `${caseMatch[1]} v. ${caseMatch[2]}`
    }

    // Get filename from path
    const pathMatch = decodedUrl.match(/\/([^/]+)\.(pdf|html?|txt)$/i)
    if (pathMatch) {
      return pathMatch[1].replace(/[_-]/g, " ").replace(/\s+/g, " ").trim()
    }

    return null
  } catch {
    return null
  }
}

// Extract names from text
function extractNamesFromText(text, urlString) {
  const names = new Set()

  // Try to get names from case pattern in URL
  try {
    const decodedUrl = decodeURIComponent(urlString)
    const urlCaseMatch = decodedUrl.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+v\.\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/)
    if (urlCaseMatch) {
      names.add(urlCaseMatch[1])
      names.add(urlCaseMatch[2])
    }
  } catch {}

  // Look for case patterns in text
  const casePatterns = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+v\.\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g)
  if (casePatterns) {
    casePatterns.forEach((match) => {
      const parts = match.split(/\s+v\.\s+/)
      if (parts.length === 2) {
        names.add(parts[0].trim())
        names.add(parts[1].trim())
      }
    })
  }

  return Array.from(names).slice(0, 10)
}

// Main extraction endpoint
app.post("/extract", async (req, res) => {
  try {
    const { url } = req.body

    if (!url) {
      return res.status(400).json({ error: "URL is required" })
    }

    if (!isGovUrl(url)) {
      return res.status(400).json({ error: "Only .gov URLs are allowed" })
    }

    console.log(`Fetching: ${url}`)

    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "*/*",
      },
    })

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch URL: ${response.status} ${response.statusText}` })
    }

    const contentType = response.headers.get("content-type") || ""
    const buffer = Buffer.from(await response.arrayBuffer())

    // Detect file type
    const urlLower = url.toLowerCase()
    const isPdf = urlLower.includes(".pdf") || contentType.includes("pdf")
    const isVideo = /\.(mp4|webm|mov|avi)/.test(urlLower) || contentType.includes("video")
    const isAudio = /\.(mp3|wav|ogg|m4a)/.test(urlLower) || contentType.includes("audio")
    const isImage = /\.(jpg|jpeg|png|gif|webp)/.test(urlLower) || contentType.includes("image")
    const isDoc = /\.(doc|docx|xls|xlsx)/.test(urlLower)

    let title = extractTitleFromUrl(url) || "Untitled Document"
    let description = ""
    let content = ""
    let names = []
    let fileType = "document"

    if (isPdf) {
      fileType = "pdf"
      console.log("Parsing PDF...")

      try {
        const pdfData = await pdf(buffer)
        content = pdfData.text || ""

        // Get title from PDF metadata or extract from content
        if (pdfData.info?.Title) {
          title = pdfData.info.Title
        } else if (content) {
          // Get first meaningful line as title
          const lines = content.split("\n").filter((l) => l.trim().length > 5)
          if (lines.length > 0 && !extractTitleFromUrl(url)) {
            title = lines[0].trim().substring(0, 200)
          }
        }

        // Get description from first paragraph
        if (content) {
          const paragraphs = content.split("\n\n").filter((p) => p.trim().length > 20)
          if (paragraphs.length > 0) {
            description = paragraphs[0].trim().substring(0, 500)
          }
        }

        names = extractNamesFromText(content, url)

        console.log(`PDF parsed: ${content.length} chars, title: ${title}`)
      } catch (pdfError) {
        console.error("PDF parsing error:", pdfError)
        content = "[PDF content could not be extracted]"
        description = "PDF document from " + new URL(url).hostname
      }
    } else if (isVideo) {
      fileType = "video"
      content = "[Video content]"
      description = "Video file from " + new URL(url).hostname
    } else if (isAudio) {
      fileType = "audio"
      content = "[Audio content]"
      description = "Audio file from " + new URL(url).hostname
    } else if (isImage) {
      fileType = "image"
      content = "[Image content]"
      description = "Image file from " + new URL(url).hostname
    } else if (isDoc) {
      fileType = "document"
      content = "[Document content - manual review required]"
      description = "Document file from " + new URL(url).hostname
    } else {
      // Try to parse as HTML
      fileType = "webpage"
      const html = buffer.toString("utf-8")

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) {
        title = titleMatch[1].trim()
      }

      // Extract meta description
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      if (descMatch) {
        description = descMatch[1].trim()
      }

      // Extract text content (simple approach)
      content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 50000)

      names = extractNamesFromText(content, url)
    }

    res.json({
      success: true,
      title,
      description,
      content,
      names,
      fileType,
      url,
    })
  } catch (error) {
    console.error("Extraction error:", error)
    res.status(500).json({ error: error.message || "Failed to extract content" })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`PDF Extraction Server running on port ${PORT}`)
})

