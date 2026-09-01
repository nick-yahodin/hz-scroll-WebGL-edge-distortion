// Design data — 1:1 from Figma "Folio / 2026" (node 1:2 "Home").
// The frame is treated as a fixed-height canvas (DESIGN.height -> 100vh) that
// scrolls horizontally. All coordinates are in Figma design pixels.

export const DESIGN = {
  width: 6489,
  height: 860,
  bg: "#d9d9d9",
  ink: "#000000",
  // Text style (ABC Diatype in Figma — substituted with a neutral grotesk)
  fontSize: 16,
  lineHeight: 20,
  tracking: -0.16, // px at 16px  == -0.01em
} as const;

export type Card = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  src?: string; // image fill
  color?: string; // solid fill (fallback / placeholder)
};

export const CARDS: Card[] = [
  { id: "1:5", x: 12, y: 233, w: 1416, h: 615, src: "/work/project1.png" },
  { id: "3:2", x: 1440, y: 233, w: 576, h: 615, src: "/work/project2.png" },
  { id: "3:3", x: 2028, y: 233, w: 576, h: 615, src: "/work/project3.png" },
  { id: "3:8", x: 3136, y: 233, w: 1093, h: 615, src: "/work/project2.png" },
  { id: "3:9", x: 4241, y: 233, w: 1093, h: 615, color: "#f3f39d" },
];

export type TextRun = { text: string; opacity?: number; marginTop?: number };

export type TextTile = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  runs: TextRun[];
  nowrap?: boolean;
};

const TAGLINE =
  "Product designer with 7 yoe, who crafts order from data and a bit of visual poetry";

// All copy lives in the WebGL layer so the edge distortion warps it too.
export const TEXT_TILES: TextTile[] = [
  { id: "name", x: 12, y: 12, w: 140, h: 20, nowrap: true, runs: [{ text: "Nick Yahodin" }] },
  { id: "tagline", x: 407, y: 12, w: 320, h: 44, runs: [{ text: TAGLINE }] },
  {
    id: "cap-wholesale",
    x: 2764,
    y: 233,
    w: 360,
    h: 72,
    runs: [{ text: "Wholesale Express" }, { text: TAGLINE, opacity: 0.4, marginTop: 8 }],
  },
];
