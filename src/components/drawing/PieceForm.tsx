"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { toast } from "sonner";
import { Field, inputClass } from "@/components/ui/Field";
import { savePiece } from "@/modules/drawing/actions";
import { EDGE_RULE_LABEL, UNIT_LABEL, pieceSchema, type PieceFormInput } from "@/modules/drawing/schema";

export const EMPTY_PIECE: PieceFormInput = {
  dwgNo: "",
  group: "",
  area: "",
  pieceNo: "",
  description: "",
  length: "" as unknown as number,
  width: "" as unknown as number,
  dimUnit: "IN",
  thickness: "",
  color: "",
  sinkModel: "",
  sinkCuts: 0,
  faucetHoles: 0,
  rCorners: 0,
  joints: 0,
  unitsQty: 1,
  cuttingRule: "FULL_PERIMETER",
  depRule: "ONE_LENGTH_ONE_WIDTH",
  notes: "",
};

/**
 * Manual entry of one Drawing Summary row. The fields are the sheet's input
 * columns (Dwg#, Group, Area, Piece, Description, L, W, Thickness, Color,
 * Sink Model, Sink Cuts, Faucet Holes, R-Corners, Joints, Units Qty, Notes)
 * plus the two edge rules the sheet applies per piece.
 */
export function PieceForm({
  projectId,
  pieceId,
  initial,
  suggestions,
  defaults,
  onDone,
}: {
  projectId: string;
  pieceId?: string;
  initial?: PieceFormInput;
  suggestions: { groups: string[]; areas: string[]; thicknesses: string[]; colors: string[]; sinkModels: string[] };
  /** Edge rules from the stored standard formulas, for new pieces. */
  defaults?: { cuttingRule: PieceFormInput["cuttingRule"]; depRule: PieceFormInput["depRule"] };
  onDone?: () => void;
}) {
  const [pending, start] = useTransition();
  const blankPiece: PieceFormInput = { ...EMPTY_PIECE, ...(defaults ? { cuttingRule: defaults.cuttingRule, depRule: defaults.depRule } : {}) };
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PieceFormInput>({ resolver: zodResolver(pieceSchema), defaultValues: initial ?? blankPiece });

  const onSubmit = (values: PieceFormInput) =>
    start(async () => {
      const res = await savePiece(projectId, pieceId ?? null, values);
      if (!res.ok) {
        for (const [k, msg] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof PieceFormInput, { message: msg });
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      if (!pieceId) {
        // Keep the drawing context for the next piece of the same drawing.
        reset({ ...blankPiece, dwgNo: values.dwgNo, group: values.group, area: values.area, dimUnit: values.dimUnit, thickness: values.thickness, color: values.color });
      }
      onDone?.();
    });

  const err = (k: keyof PieceFormInput) => errors[k]?.message as string | undefined;
  const id = (k: string) => `${pieceId ?? "new"}-${k}`;
  const list = (k: string) => `${pieceId ?? "new"}-list-${k}`;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Datalist id={list("group")} values={suggestions.groups} />
      <Datalist id={list("area")} values={suggestions.areas} />
      <Datalist id={list("thickness")} values={suggestions.thicknesses} />
      <Datalist id={list("color")} values={suggestions.colors} />
      <Datalist id={list("sink")} values={suggestions.sinkModels} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Field label="Dwg# *" htmlFor={id("dwg")} error={err("dwgNo")}>
          <input id={id("dwg")} className={inputClass(err("dwgNo"))} {...register("dwgNo")} />
        </Field>
        <Field label="Group" htmlFor={id("group")} className="col-span-2" error={err("group")}>
          <input id={id("group")} list={list("group")} className={inputClass(err("group"))} {...register("group")} />
        </Field>
        <Field label="Area" htmlFor={id("area")} error={err("area")}>
          <input id={id("area")} list={list("area")} className={inputClass(err("area"))} placeholder="Kitchen" {...register("area")} />
        </Field>
        <Field label="Piece *" htmlFor={id("piece")} error={err("pieceNo")}>
          <input id={id("piece")} className={inputClass(err("pieceNo"))} placeholder="1A" {...register("pieceNo")} />
        </Field>
        <Field label="Units Qty *" htmlFor={id("qty")} error={err("unitsQty")}>
          <input id={id("qty")} type="number" min={0} step={1} className={inputClass(err("unitsQty"))} {...register("unitsQty")} />
        </Field>

        <Field label="Description *" htmlFor={id("desc")} className="col-span-2 md:col-span-4 xl:col-span-3" error={err("description")}>
          <input id={id("desc")} className={inputClass(err("description"))} placeholder="Island Top" {...register("description")} />
        </Field>
        <Field label="L *" htmlFor={id("l")} error={err("length")}>
          <input id={id("l")} type="number" step="any" min={0} className={inputClass(err("length"))} {...register("length")} />
        </Field>
        <Field label="W *" htmlFor={id("w")} error={err("width")}>
          <input id={id("w")} type="number" step="any" min={0} className={inputClass(err("width"))} {...register("width")} />
        </Field>
        <Field label="L / W unit" htmlFor={id("unit")}>
          <select id={id("unit")} className="input" {...register("dimUnit")}>
            {Object.entries(UNIT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Thickness" htmlFor={id("thk")}>
          <input id={id("thk")} list={list("thickness")} className="input" placeholder="1.5cm" {...register("thickness")} />
        </Field>
        <Field label="Color" htmlFor={id("color")}>
          <input id={id("color")} list={list("color")} className="input" {...register("color")} />
        </Field>
        <Field label="Sink Model" htmlFor={id("sinkm")}>
          <input id={id("sinkm")} list={list("sink")} className="input" placeholder="ASI-2003" {...register("sinkModel")} />
        </Field>
        <Field label="Sink Cuts" htmlFor={id("sink")} error={err("sinkCuts")}>
          <input id={id("sink")} type="number" min={0} step={1} className={inputClass(err("sinkCuts"))} {...register("sinkCuts")} />
        </Field>
        <Field label="Faucet Holes" htmlFor={id("faucet")} error={err("faucetHoles")}>
          <input id={id("faucet")} type="number" min={0} step={1} className={inputClass(err("faucetHoles"))} {...register("faucetHoles")} />
        </Field>
        <Field label="R-Corners" htmlFor={id("rc")} error={err("rCorners")}>
          <input id={id("rc")} type="number" min={0} step={1} className={inputClass(err("rCorners"))} {...register("rCorners")} />
        </Field>
        <Field label="Joints" htmlFor={id("joints")} error={err("joints")}>
          <input id={id("joints")} type="number" min={0} step={1} className={inputClass(err("joints"))} {...register("joints")} />
        </Field>

        <Field label="Cutting LF rule" htmlFor={id("cut")} className="col-span-2 xl:col-span-2">
          <select id={id("cut")} className="input" {...register("cuttingRule")}>
            {Object.entries(EDGE_RULE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="DE&P LF rule" htmlFor={id("dep")} className="col-span-2 xl:col-span-2" hint="Island tops: full perimeter. Other pieces: one L + one W.">
          <select id={id("dep")} className="input" {...register("depRule")}>
            {Object.entries(EDGE_RULE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" htmlFor={id("notes")} className="col-span-2 md:col-span-4 xl:col-span-6">
          <input id={id("notes")} className="input" {...register("notes")} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {!pieceId && (
          <button type="button" className="btn-ghost" onClick={() => reset(EMPTY_PIECE)}>
            Clear
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : pieceId ? "Save changes" : "Add piece"}
        </button>
      </div>
    </form>
  );
}

function Datalist({ id, values }: { id: string; values: string[] }) {
  return (
    <datalist id={id}>
      {values.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}
