import type { Annotation } from "@/lib/mock-ai";

interface Props {
  src: string;
  annotations: Annotation[];
  className?: string;
}

/**
 * Renders the image with SVG circles drawn over the AI-detected regions.
 * Coordinates are normalized [0..1] so the overlay scales with the image.
 */
export function AnnotatedMedia({ src, annotations, className }: Props) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-border bg-muted ${className ?? ""}`}>
      <img src={src} alt="Analyzed media" className="block w-full h-auto" />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {annotations.map((a, i) => {
          const cx = (a.x + a.w / 2) * 100;
          const cy = (a.y + a.h / 2) * 100;
          const rx = (a.w / 2) * 100;
          const ry = (a.h / 2) * 100;
          return (
            <g key={i}>
              <ellipse
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                fill="none"
                stroke={a.color}
                strokeWidth="0.6"
                strokeDasharray="1.5 1"
                style={{ filter: `drop-shadow(0 0 2px ${a.color})` }}
              />
              <text
                x={cx}
                y={Math.max(2, cy - ry - 1)}
                textAnchor="middle"
                fontSize="2.4"
                fontWeight="700"
                fill={a.color}
                style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 0.4 }}
              >
                {a.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
