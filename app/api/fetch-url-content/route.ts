const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
}

function isGovUrl(url: string): boolean {
  try {
    const normalizedUrl = encodeURI(decodeURI(url))
    const parsed = new URL(normalizedUrl)
    return parsed.hostname.endsWith(".gov") || parsed.hostname === "gov"
  } catch {
    try {
      const lowerUrl = url.toLowerCase()
      return lowerUrl.includes(".gov/") || lowerUrl.includes(".gov")
    } catch {
      return false
    }
  }
}

function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    try {
      const encoded = encodeURI(decodeURI(url))
      return new URL(encoded)
    } catch {
      try {
        const cleaned = url.replace(/ /g, "%20")
        return new URL(cleaned)
      } catch {
        return null
      }
    }
  }
}

function getFileType(url: string, contentType: string): string {
  try {
    const parsed = safeParseUrl(url)
    const pathname = parsed ? parsed.pathname.toLowerCase() : url.toLowerCase()

    if (pathname.endsWith(".pdf")) return "pdf"
    if (
      pathname.endsWith(".mp4") ||
      pathname.endsWith(".webm") ||
      pathname.endsWith(".mov") ||
      pathname.endsWith(".avi")
    )
      return "video"
    if (
      pathname.endsWith(".mp3") ||
      pathname.endsWith(".wav") ||
      pathname.endsWith(".ogg") ||
      pathname.endsWith(".m4a")
    )
      return "audio"
    if (
      pathname.endsWith(".jpg") ||
      pathname.endsWith(".jpeg") ||
      pathname.endsWith(".png") ||
      pathname.endsWith(".gif") ||
      pathname.endsWith(".webp")
    )
      return "image"
    if (pathname.endsWith(".doc") || pathname.endsWith(".docx")) return "document"
    if (pathname.endsWith(".xls") || pathname.endsWith(".xlsx")) return "spreadsheet"
    if (pathname.endsWith(".txt")) return "text"

    if (contentType.includes("application/pdf")) return "pdf"
    if (contentType.includes("video/")) return "video"
    if (contentType.includes("audio/")) return "audio"
    if (contentType.includes("image/")) return "image"
    if (contentType.includes("text/html")) return "html"
    if (contentType.includes("text/plain")) return "text"

    return "unknown"
  } catch {
    return "unknown"
  }
}

function extractTitleFromUrl(url: string): string {
  try {
    const parsed = safeParseUrl(url)
    if (!parsed) return "Untitled Document"

    const pathname = decodeURIComponent(parsed.pathname)
    const parts = pathname.split("/")
    const filename = parts[parts.length - 1] || ""
    const nameWithoutExt = filename.replace(
      /\.(pdf|mp4|mp3|wav|mov|avi|webm|ogg|m4a|jpg|jpeg|png|gif|doc|docx|xls|xlsx|txt)$/i,
      "",
    )

    let title = nameWithoutExt.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim()

    if (/^\d+$/.test(title) && parts.length > 2) {
      const pathParts = parts.filter((p) => p && !p.match(/^\d+\.(pdf|mp4|mp3)$/i))
      const casePart = pathParts.find((p) => p.includes(" v. ") || p.includes(" v ") || p.includes("vs"))
      if (casePart) {
        title = decodeURIComponent(casePart).replace(/%20/g, " ")
      } else if (pathParts.length > 0) {
        title = decodeURIComponent(pathParts[pathParts.length - 1]).replace(/%20/g, " ")
      }
    }

    return title || "Untitled Document"
  } catch {
    return "Untitled Document"
  }
}

function extractNamesFromText(text: string): string[] {
  const names: string[] = []
  const casePattern = /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+v\.?\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g
  let match
  while ((match = casePattern.exec(text)) !== null) {
    if (match[1] && !names.includes(match[1])) names.push(match[1])
    if (match[2] && !names.includes(match[2])) names.push(match[2])
  }
  return names.slice(0, 10)
}

function getHostname(url: string): string {
  const parsed = safeParseUrl(url)
  return parsed ? parsed.hostname : "gov"
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json()

    if (!url) {
      return Response.json({ error: "URL is required" }, { status: 400 })
    }

    const trimmedUrl = url.trim()

    if (!isGovUrl(trimmedUrl)) {
      return Response.json({ error: "URL must be from a .gov domain" }, { status: 400 })
    }

    const parsed = safeParseUrl(trimmedUrl)
    if (parsed && !["http:", "https:"].includes(parsed.protocol)) {
      return Response.json({ error: "URL must use http or https" }, { status: 400 })
    }

    const urlTitle = extractTitleFromUrl(trimmedUrl)
    const urlNames = extractNamesFromText(urlTitle)

    const pdfServerUrl = process.env.PDF_SERVER_URL

    if (pdfServerUrl) {
      try {
        console.log("[v0] Calling Railway server:", pdfServerUrl)
        const extractResponse = await fetch(`${pdfServerUrl}/extract`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: trimmedUrl }),
        })

        if (extractResponse.ok) {
          const data = await extractResponse.json()
          console.log("[v0] Railway server response:", data)

          return Response.json({
            success: true,
            data: {
              title: data.title || urlTitle,
              description: data.description || `Document from ${getHostname(trimmedUrl)}`,
              content: data.content || "",
              names: data.names?.length ? data.names : urlNames,
              url: trimmedUrl,
              type: data.fileType || "document",
            },
          })
        } else {
          const errorData = await extractResponse.json().catch(() => ({}))
          console.log("[v0] Railway server error:", extractResponse.status, errorData)

          if (errorData.error) {
            return Response.json({ error: errorData.error }, { status: 400 })
          }
        }
      } catch (railwayError) {
        console.error("[v0] Railway server fetch failed:", railwayError)
      }
    }

    let response: Response | null = null
    let fetchError: Error | null = null

    try {
      response = await fetch(trimmedUrl, {
        headers: BROWSER_HEADERS,
        redirect: "follow",
      })
    } catch (err) {
      fetchError = err as Error
      console.error("[v0] First fetch attempt failed:", err)
    }

    if (!response || !response.ok) {
      try {
        response = await fetch(trimmedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "*/*",
          },
          redirect: "follow",
        })
      } catch (retryErr) {
        console.error("[v0] Retry fetch failed:", retryErr)

        return Response.json({
          success: true,
          data: {
            title: urlTitle,
            description: `Document from ${getHostname(trimmedUrl)}`,
            content:
              "[Unable to fetch content - the server may be blocking automated requests. Please verify the URL is accessible.]",
            names: urlNames,
            url: trimmedUrl,
            type: getFileType(trimmedUrl, ""),
          },
        })
      }
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return Response.json(
          {
            error: `Access denied (${response.status}). The server may be blocking automated requests. Try a different URL or use the Railway PDF server.`,
          },
          { status: 400 },
        )
      }
      if (response.status === 404) {
        return Response.json({ error: "Document not found (404). Please check the URL." }, { status: 400 })
      }
      return Response.json({ error: `Failed to fetch URL: ${response.status}` }, { status: 400 })
    }

    const contentType = response.headers.get("content-type") || ""
    const fileType = getFileType(trimmedUrl, contentType)

    if (fileType === "video") {
      return Response.json({
        success: true,
        data: {
          title: urlTitle,
          description: `Video file from ${getHostname(trimmedUrl)}`,
          content: `[Video file - ${urlTitle}]`,
          names: urlNames,
          url: trimmedUrl,
          type: "video",
        },
      })
    }

    if (fileType === "audio") {
      return Response.json({
        success: true,
        data: {
          title: urlTitle,
          description: `Audio file from ${getHostname(trimmedUrl)}`,
          content: `[Audio file - ${urlTitle}]`,
          names: urlNames,
          url: trimmedUrl,
          type: "audio",
        },
      })
    }

    if (fileType === "image") {
      return Response.json({
        success: true,
        data: {
          title: urlTitle,
          description: `Image file from ${getHostname(trimmedUrl)}`,
          content: `[Image file - ${urlTitle}]`,
          names: urlNames,
          url: trimmedUrl,
          type: "image",
        },
      })
    }

    if (fileType === "text") {
      const content = await response.text()
      return Response.json({
        success: true,
        data: {
          title: urlTitle,
          description: `Text file from ${getHostname(trimmedUrl)}`,
          content: content.slice(0, 50000),
          names: extractNamesFromText(content),
          url: trimmedUrl,
          type: "text",
        },
      })
    }

    if (fileType === "html" || contentType.includes("text/html")) {
      const html = await response.text()

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const htmlTitle = titleMatch ? titleMatch[1].trim() : urlTitle

      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      const description = descMatch ? descMatch[1] : `Page from ${getHostname(trimmedUrl)}`

      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 50000)

      return Response.json({
        success: true,
        data: {
          title: htmlTitle,
          description,
          content: textContent,
          names: extractNamesFromText(textContent),
          url: trimmedUrl,
          type: "html",
        },
      })
    }

    if (fileType === "pdf") {
      return Response.json({
        success: true,
        data: {
          title: urlTitle,
          description: `PDF document from ${getHostname(trimmedUrl)}`,
          content: "[PDF content extraction requires Railway server - add PDF_SERVER_URL to environment variables]",
          names: urlNames,
          url: trimmedUrl,
          type: "pdf",
        },
      })
    }

    return Response.json({
      success: true,
      data: {
        title: urlTitle,
        description: `Document from ${getHostname(trimmedUrl)}`,
        content: `[${fileType} file - content extraction not supported]`,
        names: urlNames,
        url: trimmedUrl,
        type: fileType,
      },
    })
  } catch (error) {
    console.error("[v0] Fetch error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch URL content" },
      { status: 500 },
    )
  }
}
