import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseVariablesSheet } from "@/lib/import/variables-sheet";
import { BRIGHTON_PARK } from "@/lib/reference/brighton-park";

const file = path.resolve(__dirname, "..", "reference-sheets", "1_Variables.xlsx");
const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe("variables sheet import", () => {
  it("reads the reference Variables sheet exactly, keeping formula meanings", async () => {
    const r = await parseVariablesSheet("1_Variables.xlsx", buf(fs.readFileSync(file)));
    expect(r.errors).toEqual([]);
    expect(r.data.slabSpec).toEqual(BRIGHTON_PARK.slabSpec);
    expect(r.data.packing).toEqual(BRIGHTON_PARK.packing);
    expect(r.data.rates.map((x) => x.code)).toEqual(BRIGHTON_PARK.rates.map((x) => x.code));
    for (const ref of BRIGHTON_PARK.rates) {
      const got = r.data.rates.find((x) => x.code === ref.code)!;
      expect(got).toMatchObject({
        myCostMode: ref.myCostMode,
        myCost: ref.myCost,
        customerChargeMode: ref.customerChargeMode,
        customerCharge: ref.customerCharge,
      });
    }
    expect(r.data.checks.totalSqft).toBeCloseTo(15828.2786, 3);
    expect(r.data.checks.packingPerSqft).toBeCloseTo(0.39902, 5);
    expect(r.materialLabel).toBe("1.5cm Material (color TBD)");
    expect(r.warnings).toEqual([]);
  });

  it("refuses a file that is not a Variables sheet", async () => {
    const r = await parseVariablesSheet("x.csv", buf(Buffer.from("Dwg#,Piece\n1,1\n")));
    expect(r.ok).toBe(false);
  });
});
