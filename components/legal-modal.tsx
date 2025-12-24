"use client"

import { X, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface LegalModalProps {
  type: "terms" | "privacy" | "aup" | null
  open: boolean
  onClose: () => void
}

const legalContent = {
  terms: {
    title: "Terms of Service",
    content: `Last Updated: December 2025

1. ACCEPTANCE OF TERMS

By accessing and using Filepedia ("the Service"), you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.

2. DESCRIPTION OF SERVICE

Filepedia is a public document archive providing access to declassified government documents released under the Epstein Files Transparency Act (H.R.4405). The Service is provided for informational and research purposes only.

3. USER RESPONSIBILITIES

You agree to:
• Use the Service only for lawful purposes
• Not reproduce, duplicate, or exploit any portion of the Service for commercial purposes without express permission
• Not use the Service to harass, abuse, or harm any individual mentioned in the documents
• Respect the privacy of victims whose names may appear in documents

4. DISCLAIMER OF WARRANTIES

The Service is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Service will be uninterrupted, secure, or error-free.

5. LIMITATION OF LIABILITY

In no event shall Filepedia be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the Service.

6. DOCUMENT ACCURACY

While we strive to maintain accurate copies of all documents, we cannot guarantee the accuracy, completeness, or authenticity of any document. Users should verify information through official government sources.

7. MODIFICATIONS

We reserve the right to modify these Terms at any time. Continued use of the Service after modifications constitutes acceptance of the updated Terms.

8. GOVERNING LAW

These Terms shall be governed by and construed in accordance with the laws of the United States.

9. CONTACT

For questions regarding these Terms, please contact the site administrators.`,
  },
  privacy: {
    title: "Privacy Policy",
    content: `Last Updated: December 2025

1. INFORMATION WE COLLECT

Filepedia is designed with privacy in mind. We collect minimal information:

• Usage Data: Anonymous analytics about page views and search queries (no personal identification)
• Admin Accounts: Login credentials for authorized administrators only

2. INFORMATION WE DO NOT COLLECT

• We do not collect personal information from public visitors
• We do not use cookies for tracking
• We do not sell or share any data with third parties
• We do not require registration to view documents

3. DATA STORAGE

• All documents are stored securely and served over encrypted connections
• Admin credentials are stored using industry-standard encryption
• No visitor data is retained beyond anonymous aggregate statistics

4. THIRD-PARTY SERVICES

The Service may contain links to external government websites (e.g., justice.gov). We are not responsible for the privacy practices of external sites.

5. CHILDREN'S PRIVACY

The Service is not intended for individuals under 18 years of age. We do not knowingly collect information from children.

6. DATA SECURITY

We implement reasonable security measures to protect against unauthorized access, alteration, or destruction of data.

7. YOUR RIGHTS

As we collect minimal data, there is little personal information to manage. If you are an administrator and wish to have your account removed, please contact site administrators.

8. CHANGES TO THIS POLICY

We may update this Privacy Policy periodically. Changes will be posted on this page with an updated revision date.

9. CONTACT

For privacy-related inquiries, please contact the site administrators.`,
  },
  aup: {
    title: "Acceptable Use Policy",
    content: `Last Updated: December 2025

1. PURPOSE

This Acceptable Use Policy ("AUP") outlines the acceptable and prohibited uses of Filepedia. By using the Service, you agree to comply with this policy.

2. ACCEPTABLE USES

You MAY use Filepedia to:
• Research and review publicly released government documents
• Reference documents for journalistic purposes
• Access information for educational and academic research
• Share links to documents for legitimate informational purposes

3. PROHIBITED USES

You MAY NOT use Filepedia to:

a) Harassment or Harm
• Target, harass, or threaten any individuals mentioned in documents
• Doxx or publish private information about victims
• Incite violence or hatred against any person

b) Illegal Activities
• Engage in any activity that violates applicable laws
• Use information to commit fraud or other crimes
• Obstruct justice or interfere with ongoing legal proceedings

c) Misinformation
• Deliberately misrepresent or falsify document contents
• Create or distribute manipulated versions of documents
• Spread false claims about document authenticity

d) Commercial Exploitation
• Sell access to documents that are publicly available
• Use documents for unauthorized commercial purposes
• Scrape or bulk download for commercial redistribution

e) Technical Abuse
• Attempt to gain unauthorized access to admin systems
• Deploy bots or automated systems that burden the Service
• Attempt to disrupt or degrade Service performance

4. VICTIM PROTECTION

Special care must be taken regarding victims:
• Do not attempt to identify redacted victims
• Do not contact victims or their families based on document information
• Report any unredacted victim information to administrators

5. ENFORCEMENT

Violations of this AUP may result in:
• Temporary or permanent IP blocking
• Reporting to appropriate authorities for illegal activity
• Legal action where warranted

6. REPORTING VIOLATIONS

If you observe violations of this AUP, please report them to site administrators.

7. MODIFICATIONS

We reserve the right to modify this AUP at any time. Users are responsible for reviewing the policy periodically.`,
  },
}

export function LegalModal({ type, open, onClose }: LegalModalProps) {
  if (!open || !type) return null

  const content = legalContent[type]

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 p-4 border-b border-border bg-background">
        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] shrink-0" onClick={onClose}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0 text-center">
          <h1 className="font-semibold text-foreground truncate text-sm">{content.title}</h1>
        </div>
        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] shrink-0" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </header>

      {/* Content */}
      <ScrollArea className="h-[calc(100vh-73px)]">
        <div className="p-4 pb-8 max-w-2xl mx-auto">
          <div className="prose prose-sm dark:prose-invert">
            <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">
              {content.content}
            </pre>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
