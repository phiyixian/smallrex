export type FaultCategory =
  | "Isolator"
  | "TNB Power Supply"
  | "Charger"
  | "EV Distribution Board"
  | "unknown";

export interface FaultDefinition {
  category: FaultCategory;
  observations: string[];
  faultType: string;
  actions: string[];
}

export const FAULT_TAXONOMY: FaultDefinition[] = [
  {
    category: "Isolator",
    observations: ["Isolator off (open circuit)"],
    faultType: "Power cut",
    actions: ["Check isolator", "Check DB got trip or not"],
  },
  {
    category: "TNB Power Supply",
    observations: ["Burnt fuse"],
    faultType: "Supply issue",
    actions: [
      "Call TNB to fix fuse issue",
      "Arrange CPO to come check after TNB settle with fuse replacement",
    ],
  },
  {
    category: "Charger",
    observations: ["Red light/No light", "Error code (Blinking Red or Static Red)"],
    faultType: "Charger issue",
    actions: ["Repair or replace", "Power cycle (Switch Off 30 seconds and On back)"],
  },
  {
    category: "EV Distribution Board",
    observations: [
      "Missing MCB/Missing RCCB",
      "Wrong Component/Specs",
      "Burnt Breaker",
    ],
    faultType: "Protection issue / termination issue",
    actions: ["Repair or replace", "Advise customer if breaker is wrong specs"],
  },
];

export const CATEGORIES: FaultCategory[] = FAULT_TAXONOMY.map((f) => f.category);

export const CATEGORY_COLORS: Record<FaultCategory, string> = {
  "Isolator": "oklch(0.78 0.16 75)",
  "TNB Power Supply": "oklch(0.66 0.22 25)",
  "Charger": "oklch(0.72 0.17 158)",
  "EV Distribution Board": "oklch(0.78 0.11 195)",
  "unknown": "oklch(0.60 0.00 0)",
};
