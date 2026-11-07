"use client";

import { memo, useLayoutEffect, useRef, useState } from "react";
import { parseNumber } from "@/lib/format";

/**
 * Editable cells and the sheet table, built to feel like a spreadsheet. A cell
 * is plain text until you land on it, so a sheet with thousands of cells stays
 * fast. It commits on Enter, Tab or leaving it; every sheet then recalculates at
 * once. Enter and the arrow keys move up and down a column; Escape cancels.
 */

export interface Nav {
  col: string;
  row: number;
}

type Align = "left" | "center" | "right";

function moveFocus(el: HTMLElement, delta: number): boolean {
  const [col, row] = (el.dataset.nav ?? "").split(":");
  if (!col) return false;
  const next = document.querySelector<HTMLElement>(`[data-nav="${col}:${Number(row) + delta}"]`);
  next?.focus();
  return Boolean(next);
}

const navAttr = (nav?: Nav) => (nav ? `${nav.col}:${nav.row}` : undefined);

/** The input a cell turns into while it is being edited. */
function CellInput({ initial, onDone, className, align, nav, label, list, inputMode }: { initial: string; onDone: (text: string | null) => void; className: string; align: Align; nav?: Nav; label?: string; list?: string; inputMode?: "decimal" }) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initial);
  const cancelled = useRef(false);
  const justFocused = useRef(true);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className={className}
      style={{ textAlign: align }}
      value={text}
      aria-label={label}
      list={list}
      inputMode={inputMode}
      data-nav={navAttr(nav)}
      onChange={(e) => setText(e.target.value)}
      // A click would otherwise drop the selection when the mouse comes back up.
      onMouseUp={(e) => {
        if (justFocused.current) e.preventDefault();
        justFocused.current = false;
      }}
      onBlur={() => onDone(cancelled.current ? null : text)}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === "Enter") {
          e.preventDefault();
          if (!moveFocus(el, e.shiftKey ? -1 : 1)) el.blur();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          moveFocus(el, e.key === "ArrowDown" ? 1 : -1);
        } else if (e.key === "Escape") {
          cancelled.current = true;
          el.blur();
        }
      }}
    />
  );
}

interface NumCellProps {
  /** The value shown: typed or calculated. */
  value: number | null;
  /** Called with the new number, or null when the cell is cleared. */
  onCommit: (value: number | null) => void;
  format?: (value: number) => string;
  percent?: boolean;
  /** Shown when value is null, e.g. the calculated figure that applies. */
  placeholder?: string;
  nav?: Nav;
  title?: string;
  className?: string;
  align?: Align;
  label?: string;
  /** Lowest value allowed; anything below it is refused like a non-number. */
  min?: number;
}

const rawText =(value: number | null, percent?: boolean) => (value === null ? "" : String(+(percent ? value * 100 : value).toFixed(6)));

export function NumCell({ value, onCommit, format, percent, placeholder, nav, title, className = "", align = "right", label, min }: NumCellProps) {
  const [editing, setEditing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  if (editing) {
    return (
      <CellInput
        initial={rawText(value, percent)}
        className="cell"
        align={align}
        nav={nav}
        label={label}
        inputMode="decimal"
        onDone={(text) => {
          setEditing(false);
          if (text === null) return;
          const t = text.trim();
          if (t === rawText(value, percent)) return;
          if (t === "") return onCommit(null);
          const n = parseNumber(t.replace(/%$/, ""));
          if (n !== null && (min === undefined || n >= min)) return onCommit(percent ? n / 100 : n);
          // Not a usable number: the old value stays, and the cell says so.
          setInvalid(true);
          setTimeout(() => setInvalid(false), 1800);
        }}
      />
    );
  }
  const shown = value === null ? null : format ? format(value) : rawText(value, percent);
  return (
    <div
      role="textbox"
      tabIndex={0}
      className={`cell cell-idle ${className} ${invalid ? "cell-invalid" : ""}`}
      style={{ textAlign: align }}
      title={invalid ? `That is not ${min === undefined ? "a number" : `a number of ${min} or more`}, so the value was not changed.` : title}
      aria-label={label}
      aria-invalid={invalid || undefined}
      data-nav={navAttr(nav)}
      onFocus={() => setEditing(true)}
    >
      {shown ?? <span className="cell-placeholder">{placeholder}</span>}
    </div>
  );
}

export function TextCell({ value, onCommit, nav, title, className = "", align = "left", list, placeholder, label }: { value: string; onCommit: (value: string) => void; nav?: Nav; title?: string; className?: string; align?: Align; list?: string; placeholder?: string; label?: string }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <CellInput
        initial={value}
        className="cell cell-text"
        align={align}
        nav={nav}
        label={label}
        list={list}
        onDone={(text) => {
          setEditing(false);
          if (text !== null && text.trim() !== value) onCommit(text.trim());
        }}
      />
    );
  }
  return (
    <div role="textbox" tabIndex={0} className={`cell cell-idle cell-text ${className}`} style={{ textAlign: align }} title={title ?? (value || undefined)} aria-label={label} data-nav={navAttr(nav)} onFocus={() => setEditing(true)}>
      {value || <span className="cell-placeholder">{placeholder}</span>}
    </div>
  );
}

/** A dropdown cell: plain text until used, and opens on click. */
export function SelectCell<V extends string>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (value: V) => void; label: string }) {
  const [editing, setEditing] = useState(false);
  const clicked = useRef(false);
  const ref = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => {
    if (!editing) return;
    ref.current?.focus();
    if (clicked.current) {
      try {
        ref.current?.showPicker();
      } catch {
        // Not every browser allows opening it from code; a second click does.
      }
    }
    clicked.current = false;
  }, [editing]);
  if (editing) {
    return (
      <select ref={ref} aria-label={label} className="cell cell-text cursor-pointer text-center" value={value} onBlur={() => setEditing(false)} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div
      role="combobox"
      aria-expanded={false}
      aria-controls=""
      tabIndex={0}
      aria-label={label}
      className="cell cell-idle cell-text cursor-pointer text-center"
      onMouseDown={() => {
        clicked.current = true;
      }}
      onFocus={() => setEditing(true)}
    >
      {options.find((o) => o.value === value)?.label}
    </div>
  );
}

export interface Col<T> {
  key: string;
  head: React.ReactNode;
  width: number;
  align?: Align;
  sticky?: boolean;
  /** The cell holds an editable input and takes no padding. */
  edit?: boolean;
  render: (row: T, index: number) => React.ReactNode;
  foot?: React.ReactNode;
  cellClass?: (row: T) => string;
  title?: (row: T) => string | undefined;
}

interface RowProps<T> {
  cols: Col<T>[];
  row: T;
  index: number;
  band: boolean;
  lefts: Map<string, number>;
  /** The row's content as text: a row whose signature hasn't changed isn't redrawn. */
  signature: string;
  layout: string;
}

function RowInner<T>({ cols, row, index, band, lefts }: RowProps<T>) {
  return (
    <tr className={band ? "band" : undefined}>
      {cols.map((c) => (
        <td key={c.key} className={[c.edit ? "has-input" : "", c.sticky ? "is-sticky" : "", c.cellClass?.(row) ?? ""].filter(Boolean).join(" ") || undefined} style={{ textAlign: c.align, left: lefts.get(c.key) }} title={c.title?.(row)}>
          {c.render(row, index)}
        </td>
      ))}
    </tr>
  );
}

const Row = memo(RowInner, (a, b) => a.signature === b.signature && a.band === b.band && a.index === b.index && a.layout === b.layout) as typeof RowInner;

export function SheetTable<T>({ cols, rows, rowKey, bandKey, signature, hasFoot = true }: { cols: Col<T>[]; rows: T[]; rowKey: (row: T) => string; bandKey?: (row: T) => string; signature: (row: T) => string; hasFoot?: boolean }) {
  const total = cols.reduce((s, c) => s + c.width, 0);
  let left = 0;
  const lefts = new Map<string, number>();
  for (const c of cols) {
    if (c.sticky) {
      lefts.set(c.key, left);
      left += c.width;
    }
  }
  const layout = cols.map((c) => `${c.key}:${c.width}:${String(c.head)}`).join("|");
  let band = false;
  let previous: string | null = null;
  return (
    <div className="sheet-wrap">
      <table className="sheet" style={{ width: total }}>
        <colgroup>
          {cols.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={c.sticky ? "is-sticky" : undefined} style={{ left: lefts.get(c.key) }}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            if (bandKey) {
              const key = bandKey(row);
              if (previous !== null && key !== previous) band = !band;
              previous = key;
            }
            return <Row key={rowKey(row)} cols={cols} row={row} index={i} band={band} lefts={lefts} signature={signature(row)} layout={layout} />;
          })}
        </tbody>
        {hasFoot && (
          <tfoot>
            <tr>
              {cols.map((c) => (
                <td key={c.key} className={c.sticky ? "is-sticky" : undefined} style={{ textAlign: c.align, left: lefts.get(c.key) }}>
                  {c.foot}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
