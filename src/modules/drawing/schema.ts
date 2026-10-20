import { z } from "zod";

const count = (label: string) =>
  z.coerce.number({ message: `${label} must be a number` }).int(`${label} must be a whole number`).min(0, `${label} can't be negative`);

/** Manual-entry fields = the Drawing Summary sheet's input columns (A–O, U) + edge rules. */
export const pieceSchema = z.object({
  dwgNo: z.string().trim().min(1, "Dwg# is required").max(20),
  group: z.string().trim().max(200).optional().or(z.literal("")),
  area: z.string().trim().max(100).optional().or(z.literal("")),
  pieceNo: z.string().trim().min(1, "Piece is required").max(20),
  description: z.string().trim().min(1, "Description is required").max(300),
  length: z.coerce.number({ message: "L must be a number" }).positive("L must be greater than 0").max(100000),
  width: z.coerce.number({ message: "W must be a number" }).positive("W must be greater than 0").max(100000),
  dimUnit: z.enum(["IN", "MM", "CM", "FT", "M"]),
  thickness: z.string().trim().max(30).optional().or(z.literal("")),
  color: z.string().trim().max(60).optional().or(z.literal("")),
  sinkModel: z.string().trim().max(60).optional().or(z.literal("")),
  sinkCuts: count("Sink Cuts"),
  faucetHoles: count("Faucet Holes"),
  rCorners: count("R-Corners"),
  joints: count("Joints"),
  unitsQty: count("Units Qty").max(1000000),
  cuttingRule: z.enum(["FULL_PERIMETER", "ONE_LENGTH_ONE_WIDTH", "NONE"]),
  depRule: z.enum(["FULL_PERIMETER", "ONE_LENGTH_ONE_WIDTH", "NONE"]),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type PieceFormInput = z.input<typeof pieceSchema>;

export const EDGE_RULE_LABEL = {
  FULL_PERIMETER: "Full perimeter — 2 × (L + W)",
  ONE_LENGTH_ONE_WIDTH: "One L + one W — (L + W)",
  NONE: "None — 0",
} as const;

export const UNIT_LABEL = { IN: "inches", MM: "millimetres", CM: "centimetres", FT: "feet", M: "metres" } as const;
