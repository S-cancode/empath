import OpenAI from "openai";
import { config } from "../config/index.js";
import { categories } from "../categories/categories.data.js";
import { ValidationError } from "../shared/errors.js";
import type { AnalyseRequest, AnalyseResult } from "./analyse.types.js";

const STUB_KEY = "sk-stub-placeholder-key";

const categoryList = categories
  .map(
    (c) =>
      `- ${c.id}: "${c.name}" (sub-tags: ${c.subTags.map((t) => t.id).join(", ")})`
  )
  .join("\n");

const SYSTEM_PROMPT = `You are a compassionate emotional support assistant for the Sympathy app.
A user has shared what is weighing on them. Your job is to:

1. Identify which of these support categories best fits their situation:
${categoryList}

2. Select a PRIMARY category (required) and optionally a SECONDARY category if the concern clearly spans two areas.
3. Select 1-3 relevant sub-tag IDs from the identified categories.
4. Rate the emotional intensity on a scale of 1-5 (1 = mild concern, 5 = deep distress).
5. Extract 8-12 keywords that capture both the emotional and situational essence of their message.
   Include a mix of: emotional words (e.g. "anxious", "overwhelmed"), situational words (e.g. "unemployment", "breakup"),
   and relatable themes (e.g. "self-worth", "loneliness"). More keywords = better matching.
6. Write a warm, empathetic summary (1-2 sentences) that acknowledges their feelings without being clinical.
   Use gentle language like "It sounds like..." or "It seems you're going through...".
   Never use diagnostic labels. Never minimize their experience.

Respond ONLY with valid JSON in this exact format:
{
  "primaryCategory": "<category-id>",
  "secondaryCategory": "<category-id or null>",
  "subTags": ["<sub-tag-id>", ...],
  "intensity": <1-5>,
  "keywords": ["<keyword>", ...],
  "summary": "<warm empathetic summary>"
}`;

const validCategoryIds = categories.map((c) => c.id);

function validateResult(raw: AnalyseResult): AnalyseResult {
  const result = { ...raw };

  if (!validCategoryIds.includes(result.primaryCategory)) {
    result.primaryCategory = "identity";
  }
  if (
    result.secondaryCategory &&
    !validCategoryIds.includes(result.secondaryCategory)
  ) {
    result.secondaryCategory = undefined;
  }
  if (result.secondaryCategory === null) {
    result.secondaryCategory = undefined;
  }
  result.intensity = Math.max(1, Math.min(5, Math.round(result.intensity)));
  result.keywords = (result.keywords ?? []).slice(0, 12);
  result.subTags = (result.subTags ?? []).slice(0, 3);

  if (!result.summary || typeof result.summary !== "string") {
    result.summary =
      "It sounds like you're going through something difficult. You deserve someone who understands.";
  }

  return result;
}

function getStubResult(text: string): AnalyseResult {
  const lower = text.toLowerCase();
  let primaryCategory = "identity";
  let secondaryCategory: string | undefined;

  const categoryKeywords: Record<string, string[]> = {
    "work-career": ["work", "job", "boss", "career", "laid off", "fired", "office", "colleague"],
    relationships: ["relationship", "partner", "breakup", "divorce", "family", "friend", "dating"],
    "financial-stress": ["money", "debt", "rent", "bills", "financial", "afford", "cost"],
    grief: ["loss", "died", "death", "grief", "mourning", "funeral", "passed away"],
    "academic-pressure": ["school", "exam", "university", "college", "grades", "thesis", "study"],
    health: ["health", "pain", "illness", "chronic", "diagnosis", "hospital", "doctor"],
    parenting: ["parent", "baby", "child", "kids", "motherhood", "fatherhood", "toddler"],
    identity: ["lost", "identity", "purpose", "direction", "transition", "who am i", "meaning"],
  };

  let bestScore = 0;
  for (const [catId, keywords] of Object.entries(categoryKeywords)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      if (primaryCategory !== "identity" && primaryCategory !== catId) {
        secondaryCategory = primaryCategory;
      }
      primaryCategory = catId;
    }
  }

  return {
    primaryCategory,
    secondaryCategory,
    subTags: [],
    intensity: 3,
    keywords: ["support", "understanding"],
    summary:
      "It sounds like you're going through something difficult. You deserve someone who understands.",
  };
}

export async function analyseText(request: AnalyseRequest): Promise<AnalyseResult> {
  if (request.text.length > 500) {
    throw new ValidationError("Text must be 500 characters or less");
  }
  if (request.text.trim().length < 10) {
    throw new ValidationError(
      "Please share a bit more about what you're going through"
    );
  }

  if (!config.OPENAI_API_KEY || config.OPENAI_API_KEY === STUB_KEY) {
    return getStubResult(request.text);
  }

  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 512,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: request.text },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Unexpected AI response: no content returned");
  }

  const parsed = JSON.parse(text) as AnalyseResult;
  return validateResult(parsed);
}
