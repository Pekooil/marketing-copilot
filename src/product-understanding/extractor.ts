import { z } from "zod";

const whitespace = /\s+/g;
const tag = /<[^>]+>/g;

export const evidenceSnippetSchema = z.object({
  selector: z.string().min(1).max(120),
  quote: z.string().min(1).max(500),
});

const proposedFieldSchema = z.object({
  value: z.string().max(2_000),
  verificationState: z.literal("evidence_supported"),
  confidence: z.number().min(0).max(1),
  evidence: z.array(evidenceSnippetSchema).min(1).max(3),
});

export const productUnderstandingProposalSchema = z.object({
  companyName: proposedFieldSchema,
  productSummary: proposedFieldSchema,
  targetCustomer: proposedFieldSchema.optional(),
});

export type ProductUnderstandingProposal = z.infer<
  typeof productUnderstandingProposalSchema
>;

export interface ExtractedProductUnderstanding {
  title: string;
  description: string;
  proposal: ProductUnderstandingProposal;
}

export function extractProductUnderstanding(html: string): ExtractedProductUnderstanding {
  const safeHtml = html.replace(
    /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  const title = cleanText(
    metaContent(safeHtml, "property", "og:site_name") ||
      matchContent(safeHtml, /<title\b[^>]*>([\s\S]*?)<\/title>/i) ||
      matchContent(safeHtml, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i),
  );
  const description = cleanText(
    metaContent(safeHtml, "name", "description") ||
      metaContent(safeHtml, "property", "og:description") ||
      firstParagraph(safeHtml),
  );

  if (!title || !description) {
    throw new ProductExtractionError(
      "The page did not expose enough source text to propose a company profile.",
    );
  }

  const companyName = title.split(/\s+[|–—-]\s+/)[0].trim().slice(0, 200);
  const audience = extractAudience(description);
  return {
    title: title.slice(0, 300),
    description: description.slice(0, 1_000),
    proposal: productUnderstandingProposalSchema.parse({
      companyName: field(companyName, "page title", title, 0.86),
      productSummary: field(description.slice(0, 2_000), "meta description", description, 0.9),
      ...(audience
        ? { targetCustomer: field(audience, "meta description", description, 0.68) }
        : {}),
    }),
  };
}

export class ProductExtractionError extends Error {
  readonly code = "PRODUCT_EXTRACTION_FAILED";
}

function field(value: string, selector: string, quote: string, confidence: number) {
  return {
    value,
    verificationState: "evidence_supported" as const,
    confidence,
    evidence: [{ selector, quote: quote.slice(0, 500) }],
  };
}

function metaContent(html: string, attribute: "name" | "property", value: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const element = match[0];
    if (attributeValue(element, attribute)?.toLowerCase() === value) {
      return attributeValue(element, "content") ?? "";
    }
  }
  return "";
}

function attributeValue(element: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = element.match(
    new RegExp(`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function firstParagraph(html: string) {
  for (const match of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const value = cleanText(match[1]);
    if (value.length >= 40) return value;
  }
  return "";
}

function matchContent(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1] ?? "";
}

function cleanText(value: string) {
  return decodeEntities(value.replace(tag, " ")).replace(whitespace, " ").trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractAudience(description: string) {
  const match = description.match(
    /\b(?:for|built for|designed for)\s+([^.;:]{3,120})(?:[.;:]|$)/i,
  );
  return match?.[1]?.trim();
}
