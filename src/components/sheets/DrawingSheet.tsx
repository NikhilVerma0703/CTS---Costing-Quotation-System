"use client";

import { Plus, Trash2 } from "lucide-react";
import { NumCell, SelectCell, SheetTable, TextCell, type Col } from "@/components/cells";
import { ReplaceSheet, Toolbar, bandKey, rowSignature, type SheetProps } from "@/components/sheets/shared";
import type { RowResult } from "@/lib/engine";
import { int, num } from "@/lib/format";
import { EDGE_RULE_LABEL, UNITS_PER_FOOT, labelOf, newId, type ColumnKey, type EdgeRule, type Piece, type ProjectData } from "@/lib/model";

const RULES = (Object.keys(EDGE_RULE_LABEL) as EdgeRule[]).map((value) => ({ value, label: EDGE_RULE_LABEL[value] }));

export function DrawingSheet({ data, result, update, id, apply }: SheetProps & { id: string; apply: (next: ProjectData) => void }) {
  const edit = (pieceId: string, change: (p: Piece) => void) =>
    update((d) => {
      const p = d.pieces.find((x) => x.id === pieceId);
      if (p) change(p);
    });
  const setSize = (pieceId: string, change: (p: Piece) => void) =>
    edit(pieceId, (p) => {
      change(p);
      // A typed LF that follows a rule was only that rule's rounded figure: recalculate it.
      if (p.cutRule !== "manual") p.cutLf = null;
      if (p.depRule !== "manual") p.depLf = null;
    });
  const perFoot = UNITS_PER_FOOT[data.dimUnit];

  const text = (key: ColumnKey & keyof Piece, width: number, align: "left" | "center" = "left", sticky = false): Col<RowResult> => ({
    key,
    head: labelOf(data, key),
    width,
    align,
    sticky,
    edit: true,
    render: (r, i) => <TextCell value={String(r.piece[key] ?? "")} label={labelOf(data, key)} align={align} nav={{ col: key, row: i }} onCommit={(t) => edit(r.piece.id, (p) => void ((p[key] as string) = t))} />,
  });
  const count = (key: "sinkCuts" | "faucetHoles" | "rCorners" | "joints" | "qty", width: number, foot?: number): Col<RowResult> => ({
    key,
    head: labelOf(data, key),
    width,
    align: "center",
    edit: true,
    foot: foot === undefined ? undefined : int(foot),
    render: (r, i) => <NumCell value={r.piece[key]} min={0} label={labelOf(data, key)} align="center" nav={{ col: key, row: i }} onCommit={(n) => edit(r.piece.id, (p) => void (p[key] = n ?? 0))} />,
  });
  const size = (key: "length" | "width"): Col<RowResult> => ({
    key,
    head: labelOf(data, key),
    width: 74,
    align: "right",
    edit: true,
    render: (r, i) => <NumCell value={r.piece[key]} min={0} label={labelOf(data, key)} format={(n) => num(n, 3)} nav={{ col: key, row: i }} onCommit={(n) => setSize(r.piece.id, (p) => void (p[key] = n ?? 0))} />,
  });

  const cols: Col<RowResult>[] = [
    text("dwg", 46, "center", true),
    text("group", 190, "left", true),
    text("area", 96),
    text("piece", 50, "center"),
    text("description", 190),
    size("length"),
    size("width"),
    text("thickness", 74, "center"),
    ...(data.show.color ? [text("color", 98, "center")] : []),
    text("sinkModel", 84, "center"),
    count("sinkCuts", 52, result.drawing.sinkCuts),
    count("faucetHoles", 56, result.drawing.faucetHoles),
    count("rCorners", 62, result.drawing.rCorners),
    count("joints", 52, result.drawing.joints),
    count("qty", 54),
    {
      key: "cutRule",
      head: "Cut rule",
      width: 66,
      edit: true,
      render: (r) => <SelectCell value={r.piece.cutRule} options={RULES} label={`Cutting rule, piece ${r.piece.piece}`} onChange={(rule) => edit(r.piece.id, (p) => void ((p.cutRule = rule), (p.cutLf = rule === "manual" ? r.cutLf : null)))} />,
    },
    {
      key: "cutLf",
      head: "Cutting LF",
      width: 84,
      align: "right",
      edit: true,
      foot: num(result.drawing.cutLf),
      render: (r, i) => <NumCell value={r.cutLf} label="Cutting LF" format={(n) => num(n, 3)} nav={{ col: "cutLf", row: i }} className={r.piece.cutRule === "manual" ? "" : "cell-calc"} onCommit={(n) => edit(r.piece.id, (p) => void ((p.cutLf = n), (p.cutRule = n === null && p.cutRule === "manual" ? "perimeter" : n === null ? p.cutRule : "manual")))} />,
    },
    {
      key: "depRule",
      head: "DE&P rule",
      width: 70,
      edit: true,
      render: (r) => <SelectCell value={r.piece.depRule} options={RULES} label={`DE&P rule, piece ${r.piece.piece}`} onChange={(rule) => edit(r.piece.id, (p) => void ((p.depRule = rule), (p.depLf = rule === "manual" ? r.depLf : null)))} />,
    },
    ...(data.show.depIn
      ? [
          {
            key: "depIn",
            head: labelOf(data, "depIn"),
            width: 74,
            align: "right",
            edit: true,
            render: (r: RowResult, i: number) => <NumCell value={r.depLf * perFoot} label="DE&P inches" format={(n) => num(n, 3)} nav={{ col: "depIn", row: i }} className={r.piece.depRule === "manual" ? "" : "cell-calc"} onCommit={(n) => edit(r.piece.id, (p) => void ((p.depLf = n === null ? null : n / perFoot), (p.depRule = n === null ? (p.depRule === "manual" ? "l" : p.depRule) : "manual")))} />,
          } as Col<RowResult>,
        ]
      : []),
    {
      key: "depLf",
      head: "DE&P LF",
      width: 84,
      align: "right",
      edit: true,
      foot: num(result.drawing.depLf),
      render: (r, i) => <NumCell value={r.depLf} label="DE&P LF" format={(n) => num(n, 3)} nav={{ col: "depLf", row: i }} className={r.piece.depRule === "manual" ? "" : "cell-calc"} onCommit={(n) => edit(r.piece.id, (p) => void ((p.depLf = n), (p.depRule = n === null && p.depRule === "manual" ? "l+w" : n === null ? p.depRule : "manual")))} />,
    },
    ...(data.show.jointDepIn
      ? [
          {
            key: "jointDepIn",
            head: labelOf(data, "jointDepIn"),
            width: 74,
            align: "right",
            edit: true,
            render: (r: RowResult, i: number) => <NumCell value={r.piece.jointDepIn} label="Joint DE&P inches" nav={{ col: "jointDepIn", row: i }} title="Not charged" onCommit={(n) => edit(r.piece.id, (p) => void (p.jointDepIn = n))} />,
          } as Col<RowResult>,
        ]
      : []),
    { key: "sqftPerPc", head: "Sqft/Pc", width: 68, align: "right", render: (r) => num(r.sqftPerPc) },
    { key: "totalPcs", head: "Total Pcs", width: 58, align: "right", render: (r) => int(r.totalPcs), foot: int(result.drawing.pcs) },
    { key: "totalSqft", head: "Total Sqft", width: 86, align: "right", render: (r) => num(r.totalSqft), foot: num(result.drawing.sqft) },
    ...(data.show.notes ? [text("notes", 240)] : []),
    ...data.extraColumns.map(
      (name): Col<RowResult> => ({
        key: `extra-${name}`,
        head: name,
        width: 110,
        edit: true,
        render: (r) => <TextCell value={r.piece.extra?.[name] ?? ""} label={name} onCommit={(t) => edit(r.piece.id, (p) => void (p.extra = { ...p.extra, [name]: t }))} />,
      }),
    ),
    {
      key: "actions",
      head: "",
      width: 34,
      align: "center",
      render: (r) => (
        <button
          type="button"
          title="Remove this piece"
          aria-label={`Remove piece ${r.piece.piece}`}
          className="rounded p-0.5 text-ink-3 hover:bg-bad-bg hover:text-bad-fg"
          onClick={() =>
            update((d) => {
              d.pieces = d.pieces.filter((x) => x.id !== r.piece.id);
              delete d.overrides.internal[r.piece.id];
              delete d.overrides.customer[r.piece.id];
            })
          }
        >
          <Trash2 className="size-3.5" />
        </button>
      ),
    },
  ];
  // The TOTAL label goes in the group column, like the workbooks.
  cols[1] = { ...cols[1], foot: "TOTAL" };

  const addPiece = () =>
    update((d) => {
      const last = d.pieces[d.pieces.length - 1];
      d.pieces.push({
        id: newId("p"),
        dwg: last?.dwg ?? "",
        group: last?.group ?? "",
        area: last?.area ?? "",
        piece: "",
        description: "New piece",
        length: 0,
        width: 0,
        thickness: last?.thickness ?? "",
        color: last?.color ?? "",
        sinkModel: "",
        sinkCuts: 0,
        faucetHoles: 0,
        rCorners: 0,
        joints: 0,
        qty: last?.qty ?? 1,
        cutRule: "perimeter",
        cutLf: null,
        depRule: "l+w",
        depLf: null,
        jointDepIn: null,
        notes: "",
      });
    });

  return (
    <div>
      <Toolbar>
        <ReplaceSheet id={id} kind="drawing" label="Upload new Drawing Summary" data={data} apply={apply} />
        <button type="button" className="btn-secondary" onClick={addPiece}>
          <Plus className="size-4" />
          Add piece
        </button>
        <span className="ml-auto text-[12px] text-ink-2">{data.pieces.length} rows</span>
      </Toolbar>
      <SheetTable cols={cols} rows={result.rows} rowKey={(r) => r.piece.id} bandKey={bandKey} signature={rowSignature} />
    </div>
  );
}
