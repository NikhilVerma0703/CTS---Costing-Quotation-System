import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { AUDIENCE_LABEL, type Cell, type ColFormat, type ExportDoc, type ExportTable } from "./types";

const C = { ink: "#16202c", ink2: "#4a5a6a", ink3: "#7a8896", line: "#dfe5ec", brand: "#0f4c5c", soft: "#f3f5f8", internal: "#7c3aed", customer: "#047857" };

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 44, paddingHorizontal: 30, color: C.ink, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: C.brand },
  company: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.brand },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
  subtitle: { fontSize: 8.5, color: C.ink2, marginTop: 2 },
  tag: { fontSize: 7.5, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3 },
  meta: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 4 },
  metaItem: { flexDirection: "row", fontSize: 8, marginRight: 14 },
  h2: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.brand, marginTop: 14, marginBottom: 4 },
  table: { borderWidth: 0.75, borderColor: C.line },
  th: { flexDirection: "row", backgroundColor: C.soft, borderBottomWidth: 0.75, borderBottomColor: C.line, fontFamily: "Helvetica-Bold", color: C.ink2 },
  tr: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: C.line },
  tfoot: { flexDirection: "row", backgroundColor: C.soft, fontFamily: "Helvetica-Bold" },
  cell: { paddingVertical: 2.5, paddingHorizontal: 3 },
  note: { fontSize: 7.5, color: C.ink3, marginTop: 3 },
  footer: { position: "absolute", bottom: 18, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.ink3, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 5 },
});

function fmt(v: Cell, f: ColFormat | undefined, cur: string): string {
  if (v === null || v === "") return "";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return "-";
  const n = (min: number, max: number) => v.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
  switch (f) {
    case "int":
      return n(0, 0);
    case "dec2":
      return n(2, 2);
    case "dec4":
      return n(4, 4);
    case "money":
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    case "rate":
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v);
    case "pct":
      return `${(v * 100).toFixed(2)}%`;
    default:
      return String(v);
  }
}

function Table({ t, cur, fontSize }: { t: ExportTable; cur: string; fontSize: number }) {
  const widths = t.columns.map((c) => c.width ?? (c.format && c.format !== "text" ? 1 : 2));
  const total = widths.reduce((a, b) => a + b, 0);
  const cellStyle = (i: number) => ({
    ...s.cell,
    width: `${(widths[i] / total) * 100}%`,
    textAlign: (t.columns[i].format && t.columns[i].format !== "text" ? "right" : "left") as "right" | "left",
  });
  return (
    <View style={{ fontSize }}>
      <Text style={s.h2} minPresenceAhead={40}>
        {t.title}
      </Text>
      <View style={s.table}>
        <View style={s.th} fixed>
          {t.columns.map((c, i) => (
            <Text key={i} style={cellStyle(i)}>
              {c.header}
            </Text>
          ))}
        </View>
        {t.rows.map((r, ri) => (
          <View key={ri} style={s.tr} wrap={false}>
            {r.map((v, i) => (
              <Text key={i} style={cellStyle(i)}>
                {fmt(v, t.columns[i]?.format, cur)}
              </Text>
            ))}
          </View>
        ))}
        {t.rows.length === 0 && (
          <View style={s.tr}>
            <Text style={{ ...s.cell, color: C.ink3 }}>No rows.</Text>
          </View>
        )}
        {t.footer && (
          <View style={s.tfoot} wrap={false}>
            {t.footer.map((v, i) => (
              <Text key={i} style={cellStyle(i)}>
                {fmt(v, t.columns[i]?.format, cur)}
              </Text>
            ))}
          </View>
        )}
      </View>
      {t.note && <Text style={s.note}>{t.note}</Text>}
    </View>
  );
}

export function ExportDocument({ doc, company }: { doc: ExportDoc; company: string }) {
  const maxCols = Math.max(0, ...doc.tables.map((t) => t.columns.length));
  const landscape = maxCols > 8;
  const fontSize = maxCols > 16 ? 5.6 : maxCols > 12 ? 6.4 : maxCols > 8 ? 7.2 : 8;
  const tagColor = doc.audience === "internal" ? C.internal : C.customer;
  const when = new Date(doc.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return (
    <Document title={doc.title} author={company} creator="CTS — Costing & Quotation">
      <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.company}>{company}</Text>
            <Text style={s.title}>{doc.title}</Text>
            {doc.subtitle && <Text style={s.subtitle}>{doc.subtitle}</Text>}
          </View>
          {doc.audience !== "general" && (
            <Text style={{ ...s.tag, color: tagColor, borderWidth: 0.75, borderColor: tagColor }}>{AUDIENCE_LABEL[doc.audience]}</Text>
          )}
        </View>
        {doc.meta.length > 0 && (
          <View style={s.meta}>
            {doc.meta.map(([k, v]) => (
              <View key={k} style={s.metaItem}>
                <Text style={{ color: C.ink3 }}>{k}: </Text>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{v}</Text>
              </View>
            ))}
          </View>
        )}
        {doc.tables.map((t, i) => (
          <Table key={i} t={t} cur={doc.currency} fontSize={fontSize} />
        ))}
        <View style={s.footer} fixed>
          <Text>
            {doc.title}
            {doc.audience === "internal" ? " · Internal — not for customer" : ""} · {when}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
