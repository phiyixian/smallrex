import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Clock,
  Coins,
  Gauge,
  Loader2,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";

import { AppNav } from "@/components/AppNav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, CATEGORY_COLORS, type FaultCategory } from "@/lib/fault-taxonomy";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — VoltScope" },
      {
        name: "description",
        content:
          "Usage stats, fault distribution, AI accuracy and performance metrics for the EV Charger Fault Analyzer.",
      },
      { property: "og:title", content: "Dashboard — VoltScope" },
      {
        property: "og:description",
        content:
          "Stats and analytics for AI-powered EV charger fault detection.",
      },
    ],
  }),
  component: DashboardPage,
});

interface AnalysisRow {
  id: string;
  media_url: string;
  media_type: "image" | "video";
  ai_provider: string;
  ai_model: string | null;
  category: string;
  observation: string;
  fault_type: string;
  action: string;
  confidence: number;
  processing_ms: number;
  tokens_used: number;
  performance: { costUsd?: number };
  created_at: string;
}

function DashboardPage() {
  const [rows, setRows] = useState<AnalysisRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("analyses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) console.error(error);
        setRows((data as AnalysisRow[]) ?? []);
      });
  }, []);

  const stats = useMemo(() => {
    if (!rows) return null;
    const total = rows.length;
    const avgMs =
      total === 0 ? 0 : rows.reduce((s, r) => s + r.processing_ms, 0) / total;
    const avgConf =
      total === 0
        ? 0
        : rows.reduce((s, r) => s + Number(r.confidence), 0) / total;
    const totalTokens = rows.reduce((s, r) => s + r.tokens_used, 0);
    const totalCost = rows.reduce(
      (s, r) => s + (Number(r.performance?.costUsd) || 0),
      0,
    );
    return { total, avgMs, avgConf, totalTokens, totalCost };
  }, [rows]);

  const byCategory = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, { count: number; conf: number }>();
    for (const c of CATEGORIES) map.set(c, { count: 0, conf: 0 });
    for (const r of rows) {
      const cur = map.get(r.category) ?? { count: 0, conf: 0 };
      cur.count += 1;
      cur.conf += Number(r.confidence);
      map.set(r.category, cur);
    }
    return Array.from(map.entries()).map(([category, v]) => ({
      category,
      count: v.count,
      accuracy: v.count > 0 ? Math.round((v.conf / v.count) * 100) : 0,
      fill: CATEGORY_COLORS[category as FaultCategory] ?? "#888",
    }));
  }, [rows]);

  const byProvider = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, { count: number; ms: number; tokens: number }>();
    for (const r of rows) {
      const cur = map.get(r.ai_provider) ?? { count: 0, ms: 0, tokens: 0 };
      cur.count += 1;
      cur.ms += r.processing_ms;
      cur.tokens += r.tokens_used;
      map.set(r.ai_provider, cur);
    }
    return Array.from(map.entries()).map(([provider, v]) => ({
      provider,
      count: v.count,
      avgMs: Math.round(v.ms / v.count),
      avgTokens: Math.round(v.tokens / v.count),
    }));
  }, [rows]);

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-hero)" }}>
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
            <Activity className="mr-1 h-3 w-3" /> Analytics
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Performance Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Usage, fault distribution, accuracy and AI performance across all analyses.
          </p>
        </div>

        {!rows ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Total analyses"
                value={stats!.total.toLocaleString()}
              />
              <KpiCard
                icon={<Gauge className="h-4 w-4" />}
                label="Avg confidence"
                value={`${(stats!.avgConf * 100).toFixed(1)}%`}
              />
              <KpiCard
                icon={<Clock className="h-4 w-4" />}
                label="Avg processing"
                value={`${(stats!.avgMs / 1000).toFixed(2)}s`}
              />
              <KpiCard
                icon={<Coins className="h-4 w-4" />}
                label="Tokens used"
                value={stats!.totalTokens.toLocaleString()}
                sub={`$${stats!.totalCost.toFixed(4)}`}
              />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card className="border-border bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold">Fault distribution</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byCategory}
                        dataKey="count"
                        nameKey="category"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {byCategory.map((d) => (
                          <Cell key={d.category} fill={d.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        iconType="circle"
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="border-border bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold">Accuracy by category</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCategory}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="category"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v: number) => [`${v}%`, "Accuracy"]}
                      />
                      <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                        {byCategory.map((d) => (
                          <Cell key={d.category} fill={d.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <Card className="mt-6 border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">AI provider performance</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Provider</th>
                      <th className="py-2 pr-4 font-medium">Runs</th>
                      <th className="py-2 pr-4 font-medium">Avg time</th>
                      <th className="py-2 pr-4 font-medium">Avg tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProvider.map((p) => (
                      <tr key={p.provider} className="border-b border-border/60">
                        <td className="py-3 pr-4 font-medium capitalize">
                          {p.provider}
                        </td>
                        <td className="py-3 pr-4">{p.count}</td>
                        <td className="py-3 pr-4">
                          {(p.avgMs / 1000).toFixed(2)}s
                        </td>
                        <td className="py-3 pr-4">{p.avgTokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="mt-6 border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Recent analyses</h2>
              <div className="space-y-3">
                {rows.slice(0, 8).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-md border border-border bg-background/40 p-3"
                  >
                    <img
                      src={r.media_url}
                      alt=""
                      className="h-12 w-16 flex-none rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="text-[10px]"
                          style={{
                            background:
                              CATEGORY_COLORS[r.category as FaultCategory] +
                              "22",
                            color: CATEGORY_COLORS[r.category as FaultCategory],
                          }}
                        >
                          {r.category}
                        </Badge>
                        <span className="truncate text-sm font-medium">
                          {r.observation}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {r.action}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div className="font-mono">
                        {(Number(r.confidence) * 100).toFixed(0)}%
                      </div>
                      <div>{(r.processing_ms / 1000).toFixed(2)}s</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-border bg-card/50 p-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Activity className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="font-semibold">No analyses yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Run an analysis from the home page to populate the dashboard.
      </p>
    </Card>
  );
}
