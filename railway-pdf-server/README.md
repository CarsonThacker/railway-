# PDF Extraction Server for Filepedia (Puppeteer Version)

This server uses Puppeteer (headless Chrome) to extract text from PDFs and documents from .gov URLs. It bypasses 401 blocks by behaving like a real browser.

## Deploy to Railway (Recommended Method)

Since this uses Puppeteer, you need to deploy via GitHub so Railway can build the Docker image.

### Step 1: Create a GitHub Repository

1. Create a new folder on your computer called `pdf-server`
2. Copy these files into it:
   - `package.json`
   - `index.js`
   - `Dockerfile`
3. Initialize git and push to GitHub:
   ```bash
   cd pdf-server
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create pdf-server --public --push
   ```

### Step 2: Deploy on Railway

1. Go to https://railway.app and sign in
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `pdf-server` repository
4. Railway will auto-detect the Dockerfile and build it
5. Wait for the build to complete (may take 2-3 minutes)

### Step 3: Generate Public URL

1. In your Railway project, go to Settings → Networking
2. Click "Generate Domain"
3. Copy the URL (e.g., `https://pdf-server-production.up.railway.app`)

### Step 4: Add Environment Variable to v0

1. In v0, open the sidebar and go to "Vars"
2. Add a new variable:
   - Name: `PDF_SERVER_URL`
   - Value: Your Railway URL (e.g., `https://pdf-server-production.up.railway.app`)

## Test the Server

```bash
curl -X POST https://your-app.up.railway.app/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.justice.gov/multimedia/Court%20Records/Bryant%20v.%20Indyke,%20No.%20119-cv-10479%20(S.D.N.Y.%202019)/001.pdf"}'
```

## Troubleshooting

- **Build fails**: Make sure all 3 files (package.json, index.js, Dockerfile) are in the repo
- **Timeout errors**: Government PDFs can be large; the server has a 60-second timeout
- **Still getting 401**: Some government sites have additional protections; try a different document
