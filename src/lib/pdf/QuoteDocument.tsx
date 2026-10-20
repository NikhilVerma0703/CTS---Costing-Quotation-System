import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { QuoteDocData } from "./quote-data";

const C = { ink: "#16202c", ink2: "#4a5a6a", ink3: "#7a8896", line: "#dfe5ec", brand: "#1f3a5f", soft: "#f3f5f8", accent: "#0f766e" };

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 54, paddingHorizontal: 40, fontSize: 9, color: C.ink, fontFamily: "Helvetica" },
  row: { flexDirection: "row" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: C.brand },
  company: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.brand },
  small: { fontSize: 8, color: C.ink2, marginTop: 2 },
  docTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "right", color: C.ink },
  draft: { marginTop: 4, alignSelf: "flex-end", fontSize: 8, fontFamily: "Helvetica-Bold", color: "#946200", backgroundColor: "#fff4d6", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3 },
  meta: { flexDirection: "row", marginTop: 16, gap: 16 },
  box: { flex: 1, padding: 10, backgroundColor: C.soft, borderRadius: 4 },
  boxTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.ink3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 },
  kv: { flexDirection: "row", marginBottom: 2.5 },
  k: { width: 78, color: C.ink2 },
  v: { flex: 1, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: C.brand, marginTop: 18, marginBottom: 6 },
  scope: { flexDirection: "row", gap: 8 },
  scopeCell: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 8 },
  scopeLabel: { fontSize: 7.5, color: C.ink3 },
  scopeValue: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 3 },
  th: { flexDirection: "row", backgroundColor: C.soft, borderBottomWidth: 1, borderBottomColor: C.line, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.ink2 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line },
  groupRow: { flexDirection: "row", backgroundColor: "#eaf2fb", color: C.brand, fontFamily: "Helvetica-Bold", fontSize: 8, paddingVertical: 4, paddingHorizontal: 5, borderBottomWidth: 0.5, borderBottomColor: C.line },
  tfoot: { flexDirection: "row", backgroundColor: C.soft, fontFamily: "Helvetica-Bold" },
  cell: { paddingVertical: 4, paddingHorizontal: 5 },
  num: { textAlign: "right" },
  priceBox: { marginTop: 18, flexDirection: "row", justifyContent: "flex-end" },
  priceInner: { width: 280, borderWidth: 1, borderColor: C.brand, borderRadius: 4 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: C.line },
  priceTotal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 10, backgroundColor: C.brand, color: "#fff" },
  note: { flexDirection: "row", marginBottom: 4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.ink3, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6 },
});

const money = (v: number | null, cur: string, d = 2) =>
  v === null || !Number.isFinite(v)
    ? "-"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (v: number) => v.toLocaleString("en-US");
const dim = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(3)));
const UNIT: Record<string, string> = { IN: '"', MM: " mm", CM: " cm", FT: "'", M: " m" };
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const COLS = [
  { key: "dwg", label: "Dwg#", w: 32 },
  { key: "area", label: "Area", w: 62 },
  { key: "piece", label: "Pc", w: 28 },
  { key: "desc", label: "Description", w: 132 },
  { key: "size", label: "Size (L x W)", w: 76, num: true },
  { key: "sink", label: "Sink", w: 64 },
  { key: "qty", label: "Qty", w: 32, num: true },
  { key: "sqft", label: "Sqft/Pc", w: 36, num: true },
  { key: "tsqft", label: "Total Sqft", w: 46, num: true },
] as const;
const W = Object.fromEntries(COLS.map((c) => [c.key, c.w])) as Record<(typeof COLS)[number]["key"], number>;

/** Consecutive pieces of the same plan group, in drawing order. */
function groupPieces(pieces: QuoteDocData["view"]["pieces"]) {
  const out: { group: string; items: typeof pieces; pcs: number; sqft: number }[] = [];
  for (const p of pieces) {
    const g = p.group ?? "";
    let last = out[out.length - 1];
    if (!last || last.group !== g) {
      last = { group: g, items: [], pcs: 0, sqft: 0 };
      out.push(last);
    }
    last.items.push(p);
    last.pcs += p.unitsQty;
    last.sqft += p.totalSqft;
  }
  return out;
}

export function QuoteDocument({ data }: { data: QuoteDocData }) {
  const { view, project, company, options } = data;
  const cur = view.currency;
  return (
    <Document title={`${data.quoteNumber} - ${project.name}`} author={company.name} subject="Quotation">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.company}>{company.name}</Text>
            {company.address ? <Text style={s.small}>{company.address}</Text> : null}
            <Text style={s.small}>{[company.email, company.phone].filter(Boolean).join("  |  ")}</Text>
          </View>
          <View>
            <Text style={s.docTitle}>QUOTATION</Text>
            <Text style={[s.small, { textAlign: "right" }]}>{data.quoteNumber}</Text>
            {data.isDraft ? <Text style={s.draft}>DRAFT - NOT ISSUED</Text> : null}
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.box}>
            <Text style={s.boxTitle}>Prepared for</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10.5 }}>{project.customerName ?? "-"}</Text>
            {project.contactName ? <Text style={s.small}>Attn: {project.contactName}</Text> : null}
            {project.contactEmail ? <Text style={s.small}>{project.contactEmail}</Text> : null}
            {project.siteAddress ? <Text style={s.small}>Site: {project.siteAddress}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.boxTitle}>Quotation</Text>
            <View style={s.kv}><Text style={s.k}>Project</Text><Text style={s.v}>{project.name}</Text></View>
            <View style={s.kv}><Text style={s.k}>Reference</Text><Text style={s.v}>{project.code}{project.versionLabel ? ` (${project.versionLabel})` : ""}</Text></View>
            <View style={s.kv}><Text style={s.k}>Date</Text><Text style={s.v}>{date(data.issuedAt)}</Text></View>
            <View style={s.kv}><Text style={s.k}>Valid until</Text><Text style={s.v}>{date(data.validUntil)}</Text></View>
            {view.materialBasis ? <View style={s.kv}><Text style={s.k}>Material</Text><Text style={s.v}>{view.materialBasis}</Text></View> : null}
          </View>
        </View>

        <Text style={s.h2}>Scope</Text>
        <View style={s.scope}>
          {[
            ["Pieces", n0(view.scope.totalPcs)],
            ["Countertop area", `${n2(view.scope.totalSqft)} sqft`],
            ["Sink cutouts", n0(view.scope.sinkCutouts)],
            ["Slabs", n0(view.scope.totalSlabs)],
          ].map(([l, v]) => (
            <View key={l} style={s.scopeCell}>
              <Text style={s.scopeLabel}>{l}</Text>
              <Text style={s.scopeValue}>{v}</Text>
            </View>
          ))}
        </View>

        {options.pieceSchedule && (
          <>
            <Text style={s.h2}>Piece schedule</Text>
            <View style={s.table}>
              <View style={s.th} fixed>
                {COLS.map((c) => (
                  <Text key={c.key} style={[s.cell, { width: c.w }, "num" in c && c.num ? s.num : {}]}>{c.label}</Text>
                ))}
              </View>
              {groupPieces(view.pieces).map((g, gi) => (
                <View key={gi}>
                  {g.group ? (
                    <View style={s.groupRow} wrap={false} minPresenceAhead={30}>
                      <Text style={{ flex: 1 }}>{g.group}</Text>
                      <Text>
                        {n0(g.pcs)} pcs  |  {n2(g.sqft)} sqft
                      </Text>
                    </View>
                  ) : null}
                  {g.items.map((p, i) => (
                    <View key={i} style={s.tr} wrap={false}>
                      <Text style={[s.cell, { width: W.dwg }]}>{p.dwgNo}</Text>
                      <Text style={[s.cell, { width: W.area }]}>{p.area ?? "-"}</Text>
                      <Text style={[s.cell, { width: W.piece }]}>{p.pieceNo}</Text>
                      <Text style={[s.cell, { width: W.desc }]}>{p.description}</Text>
                      <Text style={[s.cell, s.num, { width: W.size }]}>{`${dim(p.length)} x ${dim(p.width)}${UNIT[p.dimUnit]}`}</Text>
                      <Text style={[s.cell, { width: W.sink }]}>{p.sinkCuts ? `${p.sinkCuts} x ${p.sinkModel ?? ""}`.trim() : "-"}</Text>
                      <Text style={[s.cell, s.num, { width: W.qty }]}>{n0(p.unitsQty)}</Text>
                      <Text style={[s.cell, s.num, { width: W.sqft }]}>{n2(p.sqftPerPc)}</Text>
                      <Text style={[s.cell, s.num, { width: W.tsqft }]}>{n2(p.totalSqft)}</Text>
                    </View>
                  ))}
                </View>
              ))}
              <View style={s.tfoot} wrap={false}>
                <Text style={[s.cell, { width: W.dwg + W.area + W.piece + W.desc + W.size + W.sink }]}>Total</Text>
                <Text style={[s.cell, s.num, { width: W.qty }]}>{n0(view.scope.totalPcs)}</Text>
                <Text style={[s.cell, { width: W.sqft }]} />
                <Text style={[s.cell, s.num, { width: W.tsqft }]}>{n2(view.scope.totalSqft)}</Text>
              </View>
            </View>
          </>
        )}

        <View style={s.priceBox} wrap={false}>
          <View style={s.priceInner}>
            {options.priceSplit && (
              <>
                <View style={s.priceRow}>
                  <Text>Fabrication, finishing &amp; packing</Text>
                  <Text>{money(view.pricing.fabrication, cur)}</Text>
                </View>
                <View style={s.priceRow}>
                  <Text>Material ({n0(view.scope.totalSlabs)} slabs)</Text>
                  <Text>{money(view.pricing.material, cur)}</Text>
                </View>
              </>
            )}
            <View style={s.priceRow}>
              <Text style={{ color: C.ink2 }}>Rate per sqft</Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{money(view.pricing.ratePerSqft, cur, 4)}</Text>
            </View>
            <View style={s.priceTotal}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10.5 }}>TOTAL QUOTATION ({cur})</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{money(view.pricing.totalQuote, cur)}</Text>
            </View>
          </View>
        </View>

        {data.notes.length > 0 && (
          <View wrap={false}>
            <Text style={s.h2}>Notes, inclusions &amp; exclusions</Text>
            {data.notes.map((n, i) => (
              <View key={i} style={s.note}>
                <Text style={{ width: 14, color: C.ink3 }}>{i + 1}.</Text>
                <Text style={{ flex: 1, fontSize: 9, lineHeight: 1.25 }}>{n}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={[s.row, { marginTop: 28, justifyContent: "space-between" }]} wrap={false}>
          <View style={{ width: 200 }}>
            <Text style={{ borderTopWidth: 0.5, borderTopColor: C.ink3, paddingTop: 4, color: C.ink2 }}>For {company.name}</Text>
          </View>
          <View style={{ width: 200 }}>
            <Text style={{ borderTopWidth: 0.5, borderTopColor: C.ink3, paddingTop: 4, color: C.ink2 }}>Accepted by (customer)</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>
            {data.quoteNumber} | {project.name}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
