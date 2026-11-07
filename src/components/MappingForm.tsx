"use client";

import { useState } from "react";

export interface MappingNeeded {
  headers: { index: number; text: string }[];
  missing: ("length" | "width" | "qty")[];
}

const NAMES: Record<MappingNeeded["missing"][number], string> = { length: "Length (L)", width: "Width (W)", qty: "Quantity" };

/** Shown only when a required Drawing Summary column could not be recognised. */
export function MappingForm({ mapping, busy, onSubmit }: { mapping: MappingNeeded; busy: boolean; onSubmit: (answers: Record<string, number>) => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const ready = mapping.missing.every((m) => answers[m] !== undefined);
  return (
    <div className="rounded-lg border border-warn-line bg-warn-bg p-3 text-[13px]">
      <p className="mb-2 font-medium text-warn-fg">Which column holds these?</p>
      <div className="space-y-2">
        {mapping.missing.map((field) => (
          <label key={field} className="flex items-center gap-2">
            <span className="w-24 shrink-0">{NAMES[field]}</span>
            <select className="input" value={answers[field] ?? ""} onChange={(e) => setAnswers({ ...answers, [field]: Number(e.target.value) })}>
              <option value="" disabled>
                Choose a column…
              </option>
              {mapping.headers.map((h) => (
                <option key={h.index} value={h.index}>
                  {h.text}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button type="button" className="btn-primary mt-3 w-full" disabled={!ready || busy} onClick={() => onSubmit(answers)}>
        Continue
      </button>
    </div>
  );
}
