import { useCallback, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Upload,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  Video,
  Cpu,
  Clock,
  Coins,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

import { AppNav } from "@/components/AppNav";
import { AnnotatedMedia } from "@/components/AnnotatedMedia";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import {
  AI_PROVIDERS,
  analyzeWithAi,
  extractVideoFrames,
  type AiProvider,
  type AnalysisResult,
} from "@/lib/mock-ai";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/fault-taxonomy";

const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "ev-uploads";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VoltScope — EV Charger Fault AI Analyzer" },
      {
        name: "description",
        content:
          "Upload images or videos of EV chargers, isolators, and distribution boards. AI identifies faults, draws annotations, and recommends actions.",
      },
      { property: "og:title", content: "VoltScope — EV Charger Fault AI" },
      {
        property: "og:description",
        content:
          "AI-powered fault detection for EV charger installations. Annotates issues and suggests next steps.",
      },
    ],
  }),
  component: AnalyzePage,
});

interface FrameAnalysis {
  src: string;
  result: AnalysisResult;
}

function AnalyzePage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [frames, setFrames] = useState<FrameAnalysis[] | null>(null);
  const [annotatedSrc, setAnnotatedSrc] = useState<string | null>(null);

  const onPickFile = useCallback((f: File) => {
    setResult(null);
    setFrames(null);
    setAnnotatedSrc(null);
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setMediaType(f.type.startsWith("video/") ? "video" : "image");
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPickFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onPickFile(f);
  };

  const formatUploadError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err ?? "unknown");
    if (message.toLowerCase().includes("bucket not found")) {
      return `Storage bucket "${STORAGE_BUCKET}" not found. Create it in Supabase Storage or set VITE_SUPABASE_STORAGE_BUCKET to an existing bucket name.`;
    }
    return message;
  };

  const uploadToStorage = async (blob: Blob, ext: string): Promise<string> => {
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) {
      throw new Error(formatUploadError(error));
    }
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  const dataUrlToBlob = async (dataUrl: string) =>
    (await fetch(dataUrl)).blob();

  const analyze = async () => {
    if (!file || !previewUrl || !mediaType) return;
    setAnalyzing(true);
    setResult(null);
    setFrames(null);

    try {
      let publicUrl: string;
      let frameUrls: string[] = [];

      if (mediaType === "image") {
        publicUrl = await uploadToStorage(
          file,
          file.name.split(".").pop() || "jpg",
        );
        setAnnotatedSrc(publicUrl);
      } else {
        // Extract frames from video, upload first frame as thumbnail
        const dataUrls = await extractVideoFrames(file, 4);
        if (dataUrls.length === 0)
          throw new Error("Could not read video frames");
        const blobs = await Promise.all(dataUrls.map(dataUrlToBlob));
        const uploaded = await Promise.all(
          blobs.map((b) => uploadToStorage(b, "jpg")),
        );
        frameUrls = uploaded;
        publicUrl = uploaded[0];
        setAnnotatedSrc(uploaded[0]);
      }

      if (mediaType === "video") {
        // Run analysis on each frame
        const results: FrameAnalysis[] = [];
        for (let i = 0; i < frameUrls.length; i++) {
          const r = await analyzeWithAi({
            data: { provider, mediaUrl: frameUrls[i] },
          });
          results.push({ src: frameUrls[i], result: r });
        }
        setFrames(results);

        // Pick the most confident frame as primary
        const best = results.reduce((a, b) =>
          a.result.confidence > b.result.confidence ? a : b,
        );
        setResult(best.result);
        setAnnotatedSrc(best.src);

        // Aggregate processing time + tokens
        const totalMs = results.reduce((s, r) => s + r.result.processingMs, 0);
        const totalTokens = results.reduce(
          (s, r) => s + r.result.tokensUsed,
          0,
        );

        await persist(best.src, "video", best.result, {
          processingMs: totalMs,
          tokensUsed: totalTokens,
        });
      } else {
        const r = await analyzeWithAi({
          data: { provider, mediaUrl: publicUrl },
        });
        setResult(r);
        await persist(publicUrl, "image", r);
      }

      toast.success("Analysis complete");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const persist = async (
    url: string,
    type: "image" | "video",
    r: AnalysisResult,
    overrides?: { processingMs?: number; tokensUsed?: number },
  ) => {
    const { error } = await supabase.from("analyses").insert({
      media_url: url,
      media_type: type,
      ai_provider: r.aiProvider,
      ai_model: r.aiModel,
      category: r.category,
      observation: r.observation,
      fault_type: r.faultType,
      action: r.action,
      confidence: r.confidence,
      annotations: r.annotations as never,
      processing_ms: overrides?.processingMs ?? r.processingMs,
      tokens_used: overrides?.tokensUsed ?? r.tokensUsed,
      performance: r.performance as never,
    });
    if (error) console.error("DB insert error", error);
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setMediaType(null);
    setResult(null);
    setFrames(null);
    setAnnotatedSrc(null);
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--gradient-hero)" }}
    >
      <AppNav />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 max-w-2xl">
          <Badge
            variant="outline"
            className="mb-3 border-primary/30 text-primary"
          >
            <Sparkles className="mr-1 h-3 w-3" /> AI Vision
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            EV Charger Fault Analyzer
          </h1>
          <p className="mt-2 text-muted-foreground">
            Upload a photo or video of an EV charger, isolator, distribution
            board, or cabling. AI circles the issue and suggests next steps.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          {/* Left: Upload + Result */}
          <div className="space-y-6">
            <Card className="overflow-hidden border-border bg-card p-0">
              {!previewUrl ? (
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="flex cursor-pointer flex-col items-center justify-center gap-3 px-6 py-16 text-center transition-colors hover:bg-muted/40"
                >
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Upload className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-medium">Drop an image or video</div>
                    <div className="text-sm text-muted-foreground">
                      JPG, PNG, MP4, MOV — or click to browse
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </label>
              ) : (
                <div className="space-y-0">
                  {annotatedSrc && result ? (
                    <AnnotatedMedia
                      src={annotatedSrc}
                      annotations={result.annotations}
                    />
                  ) : mediaType === "image" ? (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="block w-full"
                    />
                  ) : (
                    <video
                      src={previewUrl}
                      controls
                      className="block w-full bg-black"
                    />
                  )}
                  <div className="flex items-center justify-between gap-3 border-t border-border p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {mediaType === "video" ? (
                        <Video className="h-4 w-4" />
                      ) : (
                        <ImageIcon className="h-4 w-4" />
                      )}
                      <span className="truncate">{file?.name}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={reset}>
                      Replace
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {frames && frames.length > 1 && (
              <Card className="border-border bg-card p-4">
                <div className="mb-3 text-sm font-medium">
                  Frames analyzed ({frames.length})
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {frames.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setResult(f.result);
                        setAnnotatedSrc(f.src);
                      }}
                      className={`overflow-hidden rounded-md border-2 transition-all ${
                        annotatedSrc === f.src
                          ? "border-primary"
                          : "border-transparent hover:border-border"
                      }`}
                    >
                      <img
                        src={f.src}
                        alt={`Frame ${i + 1}`}
                        className="block w-full"
                      />
                      <div className="bg-muted/60 px-2 py-1 text-left text-[10px] text-muted-foreground">
                        Frame {i + 1} · {(f.result.confidence * 100).toFixed(0)}
                        %
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {result && <ResultCard result={result} />}
          </div>

          {/* Right: Controls */}
          <div className="space-y-6">
            <Card className="border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">AI Provider</h2>
              </div>
              <div className="space-y-2">
                {AI_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      provider === p.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.model}
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase tracking-wide"
                      >
                        {p.speed}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  </button>
                ))}
              </div>
            </Card>

            <Button
              size="lg"
              className="w-full"
              disabled={!file || analyzing}
              onClick={analyze}
              style={{
                background: "var(--gradient-primary)",
                color: "var(--primary-foreground)",
                boxShadow: "var(--shadow-glow)",
              }}
            >
              {analyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  Run AI Analysis
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <Card className="border-border bg-card p-5">
              <div className="mb-3 text-sm font-semibold">Coverage</div>
              <p className="mb-3 text-xs text-muted-foreground">
                Detects faults across four areas:
              </p>
              <ul className="space-y-2 text-sm">
                {CATEGORIES.map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {c}
                  </li>
                ))}
              </ul>
              <Link
                to="/dashboard"
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View dashboard <ArrowRight className="h-3 w-3" />
              </Link>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function ResultCard({ result }: { result: AnalysisResult }) {
  const confPct = Math.round(result.confidence * 100);
  return (
    <Card className="border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <Badge
            variant="outline"
            className="mb-2 border-primary/30 text-primary"
          >
            <AlertTriangle className="mr-1 h-3 w-3" /> {result.category}
          </Badge>
          <h3 className="text-lg font-semibold">{result.observation}</h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-primary">{confPct}%</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Confidence
          </div>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label="Fault type" value={result.faultType} />
        <Field label="Recommended action" value={result.action} />
      </dl>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={<Clock className="h-4 w-4" />}
          label="Time"
          value={`${(result.processingMs / 1000).toFixed(2)}s`}
        />
        <Stat
          icon={<Coins className="h-4 w-4" />}
          label="Tokens"
          value={result.tokensUsed.toLocaleString()}
        />
        <Stat
          icon={<Gauge className="h-4 w-4" />}
          label="Cost"
          value={`$${result.performance.costUsd.toFixed(4)}`}
        />
        <Stat
          icon={<Cpu className="h-4 w-4" />}
          label="Model"
          value={result.aiModel}
          mono
        />
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div
        className={`mt-1 text-sm font-semibold ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
