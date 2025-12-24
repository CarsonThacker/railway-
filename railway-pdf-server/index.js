const express = require("express")
const cors = require("cors")
const pdfParse = require("pdf-parse")
const puppeteer = require("puppeteer")

const app = express()
app.use(cors())
app.use(express.json())

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "PDF Extraction Server with Puppeteer" })
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

// Fetch using Puppeteer (real browser)
async function fetchWithPuppeteer(url) {
  console.log("Launching Puppeteer browser...")

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1920,1080",
    ],
  })

  try {
    const page = await browser.newPage()

    // Set a real browser viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 })
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )

    // Set extra headers
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
    })

    // Enable request interception to capture PDF data
    let pdfBuffer = null
    let contentType = ""

    await page.setRequestInterception(true)

    page.on("request", (request) => {
      request.continue()
    })

    // For PDFs, we need to capture the response directly
    const urlLower = url.toLowerCase()
    const isPdfUrl = urlLower.includes(".pdf")

    if (isPdfUrl) {
      // For PDF files, fetch directly with page.goto and get the response
      console.log("Fetching PDF directly...")

      const response = await page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 60000,
      })

      if (!response) {
        throw new Error("No response received")
      }

      const status = response.status()
      console.log(`Response status: ${status}`)

      if (status !== 200) {
        throw new Error(`HTTP ${status}`)
      }

      contentType = response.headers()["content-type"] || ""
      pdfBuffer = await response.buffer()

      console.log(`Got ${pdfBuffer.length} bytes, content-type: ${contentType}`)
    } else {
      // For HTML pages, load and get content
      console.log("Fetching HTML page...")

      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      })

      if (!response) {
        throw new Error("No response received")
      }

      const status = response.status()
      if (status !== 200) {
        throw new Error(`HTTP ${status}`)
      }

      contentType = response.headers()["content-type"] || ""
      const html = await page.content()
      pdfBuffer = Buffer.from(html, "utf-8")
    }

    await browser.close()

    return {
      data: pdfBuffer,
      contentType,
      finalUrl: url,
    }
  } catch (error) {
    await browser.close()
    throw error
  }
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
      fetchResult = await fetchWithPuppeteer(url)
    } catch (fetchErr) {
      console.error("Puppeteer fetch failed:", fetchErr.message)
      return res.status(400).json({
        error: `Could not fetch the document: ${fetchErr.message}`,
      })
    }

    const { data: buffer, contentType } = fetchResult
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
      // Parse as HTML
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
      url,
    })
  } catch (error) {
    console.error("Extraction error:", error)
    res.status(500).json({ error: error.message || "Failed to extract content" })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`PDF Extraction Server (Puppeteer) running on port ${PORT}`)
})
