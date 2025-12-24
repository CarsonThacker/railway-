const express = require("express")
const cors = require("cors")
const pdfParse = require("pdf-parse")
const axios = require("axios")
const https = require("https")

const app = express()
app.use(cors())
app.use(express.json())

// Create axios instance with custom settings
const client = axios.create({
  timeout: 60000,
  maxRedirects: 10,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
  }),
  validateStatus: (status) => status < 500,
})

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "PDF Extraction Server" })
})

// Check if URL is from a .gov domain
function isGovUrl(urlString) {
  try {
    const cleanUrl = urlString.split("?")[0]
    const match = cleanUrl.match(/https?:\/\/([^/]+)/)
    if (match) {
      return match[1].toLowerCase().endsWith(".gov")
    }
    return false
  } catch {
    return urlString.toLowerCase().includes(".gov")
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

    // Try to get last meaningful path segment
    const segments = decodedUrl.split("/").filter((s) => s && !s.match(/^\d+\.(pdf|html?)$/i))
    if (segments.length > 0) {
      const last = segments[segments.length - 1].replace(/\.(pdf|html?|txt)$/i, "")
      return last.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim()
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
  if (text) {
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
  }

  return Array.from(names).slice(0, 10)
}

// Get hostname safely
function getHostname(urlString) {
  try {
    const match = urlString.match(/https?:\/\/([^/]+)/)
    return match ? match[1] : "gov"
  } catch {
    return "gov"
  }
}

// Try multiple user agents
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
]

// Fetch with retries using different configurations
async function fetchWithRetry(url) {
  const errors = []

  for (let i = 0; i < USER_AGENTS.length; i++) {
    const userAgent = USER_AGENTS[i]

    try {
      console.log(`Attempt ${i + 1} with UA: ${userAgent.substring(0, 50)}...`)

      const response = await client.get(url, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      })

      if (response.status === 200) {
        console.log(`Success on attempt ${i + 1}`)
        return {
          data: Buffer.from(response.data),
          contentType: response.headers["content-type"] || "",
          finalUrl: response.request?.res?.responseUrl || url,
        }
      }

      errors.push(`Attempt ${i + 1}: Status ${response.status}`)
    } catch (err) {
      errors.push(`Attempt ${i + 1}: ${err.message}`)
      console.error(`Attempt ${i + 1} failed:`, err.message)
    }
  }

  // Last resort: try with minimal headers
  try {
    console.log("Last resort: minimal headers")
    const response = await client.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "curl/7.88.1",
      },
    })

    if (response.status === 200) {
      return {
        data: Buffer.from(response.data),
        contentType: response.headers["content-type"] || "",
        finalUrl: response.request?.res?.responseUrl || url,
      }
    }
    errors.push(`Minimal headers: Status ${response.status}`)
  } catch (err) {
    errors.push(`Minimal headers: ${err.message}`)
  }

  throw new Error(`All fetch attempts failed:\n${errors.join("\n")}`)
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

    console.log(`\n========================================`)
    console.log(`Extracting: ${url}`)
    console.log(`========================================`)

    let fetchResult
    try {
      fetchResult = await fetchWithRetry(url)
    } catch (fetchErr) {
      console.error("All fetch attempts failed:", fetchErr.message)
      return res.status(400).json({
        error: `Could not fetch the document. The server may be blocking automated requests. Error: ${fetchErr.message}`,
      })
    }

    const { data: buffer, contentType, finalUrl } = fetchResult
    console.log(`Fetched ${buffer.length} bytes, content-type: ${contentType}`)

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
    const hostname = getHostname(url)

    if (isPdf) {
      fileType = "pdf"
      console.log("Parsing PDF...")

      try {
        const pdfData = await pdfParse(buffer)
        content = pdfData.text || ""

        // Get title from PDF metadata or extract from content
        if (pdfData.info && pdfData.info.Title && pdfData.info.Title.trim()) {
          title = pdfData.info.Title
        } else if (content) {
          const lines = content.split("\n").filter((l) => l.trim().length > 5)
          const urlTitle = extractTitleFromUrl(url)
          if (urlTitle) {
            title = urlTitle
          } else if (lines.length > 0) {
            title = lines[0].trim().substring(0, 200)
          }
        }

        // Get description from first paragraph
        if (content) {
          const cleanContent = content.replace(/\s+/g, " ").trim()
          description = cleanContent.substring(0, 500)
        }

        names = extractNamesFromText(content, url)

        console.log(`PDF parsed: ${content.length} chars, title: "${title}"`)
      } catch (pdfError) {
        console.error("PDF parsing error:", pdfError)
        content = "[PDF content could not be extracted]"
        description = "PDF document from " + hostname
      }
    } else if (isVideo) {
      fileType = "video"
      content = "[Video content]"
      description = "Video file from " + hostname
      names = extractNamesFromText("", url)
    } else if (isAudio) {
      fileType = "audio"
      content = "[Audio content]"
      description = "Audio file from " + hostname
      names = extractNamesFromText("", url)
    } else if (isImage) {
      fileType = "image"
      content = "[Image content]"
      description = "Image file from " + hostname
      names = extractNamesFromText("", url)
    } else if (isDoc) {
      fileType = "document"
      content = "[Document content - manual review required]"
      description = "Document file from " + hostname
      names = extractNamesFromText("", url)
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
      } else {
        description = "Webpage from " + hostname
      }

      // Extract text content
      content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 50000)

      names = extractNamesFromText(content, url)
    }

    console.log(`Extraction complete: ${fileType}, title="${title}", names=${names.length}`)

    res.json({
      success: true,
      title,
      description,
      content: content.substring(0, 50000),
      names,
      fileType,
      url: finalUrl,
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
