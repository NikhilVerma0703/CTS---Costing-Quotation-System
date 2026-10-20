import { BRIGHTON_PARK, COST_ITEMS, CONVERSION_RULES } from "@/lib/reference/brighton-park";
import type { EngineInput } from "@/lib/engine/types";

/** Engine input equal to the uploaded workbooks (Brighton Park, Ver 5). */
export function referenceEngineInput(): EngineInput {
  const bp = BRIGHTON_PARK;
  return {
    currency: "USD",
    slabSpec: bp.slabSpec,
    packing: bp.packing,
    slab: {
      optimizerSlabs: bp.slab.optimizerSlabs,
      sourceNote: bp.slab.sourceNote,
      adjustments: bp.slab.adjustments,
      drivers: bp.slab.drivers,
    },
    conversionRules: CONVERSION_RULES,
    costInputs: bp.rates.map((r) => {
      const item = COST_ITEMS.find((c) => c.code === r.code)!;
      return {
        code: item.code,
        name: r.label,
        unitLabel: item.unitLabel,
        driver: item.driver,
        isMaterial: item.isMaterial,
        sortOrder: item.sortOrder,
        myCostMode: r.myCostMode,
        myCost: r.myCost,
        customerChargeMode: r.customerChargeMode,
        customerCharge: r.customerCharge,
      };
    }),
    pieces: bp.pieces.map((p, i) => ({
      id: `p${i}`,
      ...p,
      dimUnit: "IN",
      cuttingRule: "FULL_PERIMETER",
    })),
  };
}
