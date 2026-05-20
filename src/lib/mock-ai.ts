import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FAULT_TAXONOMY, type FaultCategory } from "./fault-taxonomy";

export type AiProvider = "openai" | "gemini" | "custom";

export interface AiProviderInfo {
  id: AiProvider;
  name: string;
  model: string;
  description: string;
  speed: "fast" | "balanced" | "deep";
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    model: "gpt-4o-mini",
    description: "Strong general reasoning, broad object recognition.",
    speed: "balanced",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    model: "gemini-2.5-flash",
    description: "Long context, strong on diagrams & schematics.",
    speed: "fast",
  },
  {
    id: "custom",
    name: "Roboflow Model",
    model: "phiphi/detect-and-classify-2",
    description: "Roboflow-trained model fine-tuned on EV charger faults.",
    speed: "deep",
  },
];

export interface Annotation {
  /** Normalized [0..1] coordinates so SVG scales with image */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
}

export interface AnalysisResult {
  category: FaultCategory;
  observation: string;
  faultType: string;
  action: string;
  confidence: number;
  annotations: Annotation[];
  processingMs: number;
  tokensUsed: number;
  performance: {
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
  };
  aiProvider: AiProvider;
  aiModel: string;
}

const COLOR_FOR_CATEGORY: Record<FaultCategory, string> = {
  Isolator: "#fbbf24",
  "TNB Power Supply": "#ef4444", // was "TNB (Power supply)"
  Charger: "#10b981",
  "EV Distribution Board": "#22d3ee",
  unknown: "#6b7280", // add grey for unknown
};

const annotationSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  label: z.string().min(1),
  color: z.string().min(1),
});

const analysisSchema = z.object({
  category: z.enum([
    "Isolator",
    "TNB Power Supply",
    "unknown",
    "Charger",
    "EV Distribution Board",
  ]),
  observation: z.string().min(1),
  faultType: z.string().min(1),
  action: z.string().min(1),
  confidence: z.number().min(0).max(1),
  annotations: z.array(annotationSchema),
  processingMs: z.number().nonnegative(),
  tokensUsed: z.number().nonnegative(),
  performance: z.object({
    latencyMs: z.number().nonnegative(),
    promptTokens: z.number().nonnegative(),
    completionTokens: z.number().nonnegative(),
    costUsd: z.number().nonnegative(),
  }),
  aiProvider: z.enum(["openai", "gemini", "custom"]),
  aiModel: z.string().min(1),
});

const analyzeInputSchema = z.object({
  provider: z.enum(["openai", "gemini", "custom"]),
  mediaUrl: z.string().url(),
});

function normalizeAnnotation(a: Annotation): Annotation {
  const w = Math.max(0.05, Math.min(1, a.w));
  const h = Math.max(0.05, Math.min(1, a.h));
  const x = Math.max(0, Math.min(1 - w, a.x));
  const y = Math.max(0, Math.min(1 - h, a.y));
  return { ...a, x, y, w, h };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildSystemPrompt() {
  return `You are an EV charging site fault analysis model for Rexcharge Solution.

Analyze the provided image. Respond with valid JSON only — no explanation, no markdown, no prose.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FAULT TAXONOMY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Category: EV Distribution Board
  Visual cues: MCB/RCCB breaker panel, fuse box, DIN-rail mounted breakers, wiring terminals
  Observations: Burnt or blackened breaker, tripped MCB, missing breaker slot, melted insulation, scorch marks on panel interior
  Fault types: burnt_component, tripped_breaker, missing_mcb, overload_damage, wiring_fault
  Recommended actions:
    - burnt_component → Do not reset. Isolate supply. Schedule urgent technician visit.
    - tripped_breaker → Reset MCB. If it trips again, escalate.
    - missing_mcb → Do not operate charger. Escalate immediately.
    - overload_damage / wiring_fault → Isolate supply. Escalate immediately.

Category: Charger
  Visual cues: EV charging unit enclosure, LED status indicator, display screen, charging cable, connector port
  Observations: Red LED lit, LED blinking, LED off (no power), error code on display, cable damage, connector damage
  Fault types: red_light, fast_blink_fault, slow_blink_power_cycle, no_power, display_error, cable_damage
  Recommended actions:
    - red_light → Power cycle charger. If persists, escalate.
    - fast_blink_fault → Hardware fault likely. Escalate.
    - slow_blink_power_cycle → Attempt power cycle (off 30 s, on).
    - no_power → Check isolator and distribution board.
    - display_error → Note error code and escalate.
    - cable_damage → Do not use. Escalate immediately.

Category: Isolator
  Visual cues: Wall-mounted rotary or toggle switch near charger, labeled "ISOLATOR" or "EV SUPPLY", single enclosed unit
  Observations: Switch in OFF position, switch physically damaged, door open or missing, signs of heat damage
  Fault types: isolator_off, isolator_damaged, isolator_open
  Recommended actions:
    - isolator_off → Turn isolator ON. Test charger.
    - isolator_damaged / isolator_open → Do not operate. Escalate.

Category: TNB Power Supply
  Visual cues: Utility meter, TNB (Tenaga Nasional Berhad) meter box, incoming supply fuse, supply cable from street
  Observations: Blown supply fuse, meter not registering, no incoming voltage, utility seal broken
  Fault types: blown_fuse, no_utility_supply, meter_fault
  Recommended actions:
    - blown_fuse → Contact TNB directly. This is a utility fault.
    - no_utility_supply → Confirm with TNB. No on-site fix available.
    - meter_fault → Contact TNB directly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANNOTATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Provide 1 to 3 bounding boxes. Each box must tightly frame the specific component or fault region — not the whole image.

Coordinates are normalized (0.0–1.0) relative to image width and height:
  x, y = top-left corner of box
  w, h = width and height of box

Color coding by fault severity:
  "red"    → immediate safety risk (burnt marks, blown fuse, missing MCB, cable damage)
  "orange" → charger-level fault (red LED, blinking LED, display error)
  "yellow" → configuration issue (isolator off, tripped breaker — resettable)
  "grey"   → uncertain or low-confidence region

Label the box with the fault_type string from the taxonomy (e.g. "burnt_component", "isolator_off").

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONFIDENCE SCORING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

confidence is a float between 0.0 and 1.0:
  ≥ 0.85 → clear visual evidence matches taxonomy exactly
  0.60–0.84 → probable match; some ambiguity in image quality or angle
  0.40–0.59 → possible match; image unclear, component partially visible
  < 0.40  → insufficient evidence; use category "unknown"

If confidence < 0.40, output:
{
  "category": "unknown",
  "observation": "<describe what is visible>",
  "faultType": "insufficient_evidence",
  "action": "Please send a clearer photo of the fault area.",
  "confidence": <value>,
  "annotations": []
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT SCHEMA (strict)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "category": "<EV Distribution Board | Charger | Isolator | TNB Power Supply | unknown>",
  "observation": "<one sentence describing the visible fault evidence>",
  "faultType": "<fault_type string from taxonomy>",
  "action": "<recommended action from taxonomy>",
  "confidence": <0.0–1.0>,
  "annotations": [
    {
      "x": <0.0–1.0>,
      "y": <0.0–1.0>,
      "w": <0.0–1.0>,
      "h": <0.0–1.0>,
      "label": "<fault_type>",
      "color": "<red | orange | yellow | grey>"
    }
  ]
}

CRITICAL:
- Output valid JSON only. No markdown. No code fences. No text before or after the JSON object.
- Use only category names exactly as written above.
- Use only fault_type strings from the taxonomy above.
- Never invent categories, fault types, or actions not listed.
- If multiple faults are visible, annotate each with its own box but return only the single highest-confidence category at the top level.`;
}

async function callOpenAi(mediaUrl: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const startedAt = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this EV charger related image." },
            { type: "image_url", image_url: { url: mediaUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty response");
  const parsed = JSON.parse(raw) as Omit<
    AnalysisResult,
    "processingMs" | "tokensUsed" | "performance" | "aiProvider" | "aiModel"
  >;
  const latencyMs = Date.now() - startedAt;
  const promptTokens = payload.usage?.prompt_tokens ?? 0;
  const completionTokens = payload.usage?.completion_tokens ?? 0;
  const tokensUsed =
    payload.usage?.total_tokens ?? promptTokens + completionTokens;
  const costUsd = Number(
    ((promptTokens / 1000) * 0.005 + (completionTokens / 1000) * 0.015).toFixed(
      6,
    ),
  );

  return {
    ...parsed,
    annotations: parsed.annotations.map(normalizeAnnotation),
    processingMs: latencyMs,
    tokensUsed,
    performance: { latencyMs, promptTokens, completionTokens, costUsd },
    aiProvider: "openai" as const,
    aiModel: model,
  };
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  throw new Error("AI response did not contain valid JSON");
}

async function callGemini(mediaUrl: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash";
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const startedAt = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${buildSystemPrompt()}\n\nAnalyze this EV charger related image URL: ${mediaUrl}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);

  const payload = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  const parsed = JSON.parse(extractJsonObject(text)) as Omit<
    AnalysisResult,
    "processingMs" | "tokensUsed" | "performance" | "aiProvider" | "aiModel"
  >;
  const latencyMs = Date.now() - startedAt;
  const promptTokens = payload.usageMetadata?.promptTokenCount ?? 0;
  const completionTokens = payload.usageMetadata?.candidatesTokenCount ?? 0;
  const tokensUsed =
    payload.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens;
  const costUsd = Number(((tokensUsed / 1000) * 0.0035).toFixed(6));

  return {
    ...parsed,
    annotations: parsed.annotations.map(normalizeAnnotation),
    processingMs: latencyMs,
    tokensUsed,
    performance: { latencyMs, promptTokens, completionTokens, costUsd },
    aiProvider: "gemini" as const,
    aiModel: model,
  };
}

/** Map a Roboflow class label (case-insensitive prefix match) to a FaultCategory. */
function roboflowClassToCategory(label: string): FaultCategory {
  const normalized = label.toLowerCase();
  if (normalized.includes("isolator")) return "Isolator";
  if (normalized.includes("tnb") || normalized.includes("power supply"))
    return "TNB Power Supply";
  if (normalized.includes("charger") || normalized.includes("ev charger"))
    return "Charger";
  if (
    normalized.includes("distribution") ||
    normalized.includes("board") ||
    normalized.includes("evdb")
  )
    return "EV Distribution Board";
  return "unknown";
}

interface RoboflowPrediction {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  confidence?: number;
  class?: string;
}

interface RoboflowClassification {
  class?: string;
  confidence?: number;
}

interface RoboflowOutput {
  predictions?: {
    image?: { width?: number | null; height?: number | null };
    predictions?: RoboflowPrediction[];
  };
  detection_predictions?: {
    image?: { width?: number | null; height?: number | null };
    predictions?: RoboflowPrediction[];
  };
  classification_predictions?: RoboflowClassification[];
}

async function callRoboflow(mediaUrl: string): Promise<AnalysisResult> {
  const apiKey = process.env.ROBOFLOW_API_KEY;
  if (!apiKey) throw new Error("Missing ROBOFLOW_API_KEY");

  const startedAt = Date.now();
  const res = await fetch(
    "https://serverless.roboflow.com/phiphi/workflows/detect-and-classify-2",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        inputs: { image: { type: "url", value: mediaUrl } },
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "(unreadable)");
    throw new Error(`Roboflow request failed (${res.status}): ${errBody}`);
  }

  const payload = (await res.json()) as { outputs?: RoboflowOutput[] };
  const latencyMs = Date.now() - startedAt;

  console.log("[Roboflow raw]", JSON.stringify(payload.outputs?.[0], null, 2));

  const output: RoboflowOutput = payload.outputs?.[0] ?? {};

  // Detections come from detection_predictions, fall back to predictions
  const detections: RoboflowPrediction[] =
    (output.detection_predictions?.predictions?.length
      ? output.detection_predictions.predictions
      : output.predictions?.predictions) ?? [];

  // Image dimensions for normalizing pixel coords (may be null)
  const imgW =
    output.detection_predictions?.image?.width ??
    output.predictions?.image?.width ??
    null;
  const imgH =
    output.detection_predictions?.image?.height ??
    output.predictions?.image?.height ??
    null;

  // Classification result — top entry by confidence
  const classifications: RoboflowClassification[] =
    output.classification_predictions ?? [];
  const topClassification =
    classifications.length > 0
      ? classifications.reduce((a, b) =>
          (b.confidence ?? 0) > (a.confidence ?? 0) ? b : a,
        )
      : null;

  // Best detection box
  const bestDetection =
    detections.length > 0
      ? detections.reduce((a, b) =>
          (b.confidence ?? 0) > (a.confidence ?? 0) ? b : a,
        )
      : null;

  const rawClass =
    topClassification?.class ?? bestDetection?.class ?? null;
  const confidence =
    topClassification?.confidence ?? bestDetection?.confidence ?? 0;
  const category = rawClass ? roboflowClassToCategory(rawClass) : "unknown";

  // No detections — return unknown immediately
  if (!rawClass || category === "unknown") {
    return {
      category: "unknown",
      observation: "No components detected in the image.",
      faultType: "insufficient_evidence",
      action: "Please send a clearer photo of the fault area.",
      confidence: 0,
      annotations: [],
      processingMs: latencyMs,
      tokensUsed: 0,
      performance: { latencyMs, promptTokens: 0, completionTokens: 0, costUsd: 0 },
      aiProvider: "custom",
      aiModel: "phiphi/detect-and-classify-2",
    };
  }

  const def = FAULT_TAXONOMY.find((f) => f.category === category)!;

  // Build normalized annotations from detections (cap at 3)
  // Roboflow bbox: center x/y + width/height in pixels → convert to top-left normalized
  const annotations: Annotation[] = (
    imgW && imgH
      ? detections.slice(0, 3).map((d) => {
          const cx = d.x ?? 0;
          const cy = d.y ?? 0;
          const pw = d.width ?? 0;
          const ph = d.height ?? 0;
          return normalizeAnnotation({
            x: (cx - pw / 2) / imgW,
            y: (cy - ph / 2) / imgH,
            w: pw / imgW,
            h: ph / imgH,
            label: d.class ?? rawClass,
            color:
              COLOR_FOR_CATEGORY[roboflowClassToCategory(d.class ?? rawClass)],
          });
        })
      : []
  );

  // Fallback annotation when the model returned no boxes
  if (annotations.length === 0) {
    annotations.push(
      normalizeAnnotation({
        x: 0.2,
        y: 0.2,
        w: 0.35,
        h: 0.35,
        label: rawClass,
        color: COLOR_FOR_CATEGORY[category],
      }),
    );
  }

  return {
    category,
    observation: def.observations[0],
    faultType: def.faultType,
    action: def.actions[0],
    confidence,
    annotations,
    processingMs: latencyMs,
    tokensUsed: 0,
    performance: {
      latencyMs,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    },
    aiProvider: "custom",
    aiModel: "phiphi/detect-and-classify-2",
  };
}

export const analyzeWithAi = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => analyzeInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { provider, mediaUrl } = data;
    const info = AI_PROVIDERS.find((p) => p.id === provider)!;
    let result: AnalysisResult;
    if (provider === "openai") result = await callOpenAi(mediaUrl);
    else if (provider === "gemini") result = await callGemini(mediaUrl);
    else result = await callRoboflow(mediaUrl);

    const validated = analysisSchema.parse(result);
    return {
      ...validated,
      aiProvider: provider,
      aiModel: result.aiModel || info.model,
    } satisfies AnalysisResult;
  });

/**
 * Extract still frames from a video file (client-side, canvas based).
 * Returns data URLs for each sampled frame.
 */
export async function extractVideoFrames(
  file: File,
  frameCount = 4,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);

    const frames: string[] = [];
    video.addEventListener("loadedmetadata", async () => {
      const duration = video.duration;
      if (!duration || !isFinite(duration)) {
        resolve([]);
        return;
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No canvas context"));
        return;
      }

      try {
        for (let i = 0; i < frameCount; i++) {
          const t = (duration * (i + 1)) / (frameCount + 1);
          await new Promise<void>((res, rej) => {
            const onSeeked = () => {
              video.removeEventListener("seeked", onSeeked);
              canvas.width = video.videoWidth || 640;
              canvas.height = video.videoHeight || 360;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              frames.push(canvas.toDataURL("image/jpeg", 0.85));
              res();
            };
            video.addEventListener("seeked", onSeeked, { once: true });
            video.addEventListener(
              "error",
              () => rej(new Error("video error")),
              { once: true },
            );
            video.currentTime = t;
          });
        }
        resolve(frames);
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(video.src);
      }
    });
    video.addEventListener("error", () =>
      reject(new Error("Failed to load video")),
    );
  });
}
