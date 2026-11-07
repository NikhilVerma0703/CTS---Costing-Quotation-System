import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { calculate } from "./engine";
import { amountInWords, money, num } from "./format";
import type { ProjectData } from "./model";
import { termsFor } from "./quote-details";

/**
 * The customer PDF. It is given only customer-side figures, so internal costing
 * can't reach the document.
 */
const C = { ink: "#16202c", ink2: "#4a5a6a", ink3: "#7a8896", line: "#c9d1da", brand: "#0f4c5c", soft: "#f3f5f8" };

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 54, paddingHorizontal: 40, fontSize: 9, color: C.ink, fontFamily: "Helvetica" },
  frame: { borderWidth: 0.75, borderColor: C.ink3 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderBottomWidth: 0.75, borderBottomColor: C.ink3 },
  brand: { flexDirection: "row", alignItems: "center" },
  tile: { width: 34, height: 34, borderRadius: 6, backgroundColor: C.brand, alignItems: "center", justifyContent: "center", marginRight: 10 },
  logo: { width: 22, height: 22 },
  company: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.brand, letterSpacing: 1 },
  small: { fontSize: 8, color: C.ink2, marginTop: 2 },
  docTitle: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 0.5 },
  info: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: C.ink3 },
  infoLeft: { flex: 1.2, borderRightWidth: 0.75, borderRightColor: C.ink3 },
  infoRight: { flex: 1 },
  party: { padding: 8 },
  partyBorder: { borderBottomWidth: 0.75, borderBottomColor: C.line },
  partyTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginBottom: 2 },
  metaRow: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: C.line },
  metaCell: { flex: 1, paddingVertical: 5, paddingHorizontal: 7 },
  metaCellBorder: { borderRightWidth: 0.75, borderRightColor: C.line },
  valueCell: { paddingVertical: 5, paddingHorizontal: 7 },
  metaLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: C.ink2, letterSpacing: 0.3, marginBottom: 2 },
  value: { fontFamily: "Helvetica-Bold", fontSize: 11, color: C.brand },
  th: { flexDirection: "row", backgroundColor: C.soft, borderBottomWidth: 0.75, borderBottomColor: C.ink3, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.ink2 },
  tr: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: C.line },
  tfoot: { flexDirection: "row", backgroundColor: C.soft, borderBottomWidth: 0.75, borderBottomColor: C.ink3, fontFamily: "Helvetica-Bold" },
  cell: { paddingVertical: 5, paddingHorizontal: 6 },
  num: { textAlign: "right" },
  center: { textAlign: "center" },
  totals: { padding: 10, borderBottomWidth: 0.75, borderBottomColor: C.ink3 },
  totalLine: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  terms: { padding: 10, borderBottomWidth: 0.75, borderBottomColor: C.ink3 },
  termsTitle: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  note: { flexDirection: "row", marginBottom: 2.5 },
  signs: { flexDirection: "row", height: 70 },
  sign: { flex: 1, padding: 7, alignItems: "center" },
  signBorder: { borderRightWidth: 0.75, borderRightColor: C.ink3 },
  signTitle: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  authority: { alignItems: "flex-end", marginTop: 16, paddingRight: 2 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.ink2 },
});

const CURRENCY = "USD";
const date =(d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(d)
    .replace(/\//g, "-");

const W = { sno: 34, uom: 56, qty: 84, amount: 96 };

interface QuoteDocData {
  company: { name: string; address: string; phone: string };
  meta: ProjectData["meta"];
  projectTitle: string;
  terms: string[];
  materialBasis: string;
  totalSqft: number;
  total: number;
  number: string;
  issued: Date;
  validUntil: Date;
}

function QuoteDocument({ data }: { data: QuoteDocData }) {
  const { company, meta, projectTitle, terms, materialBasis, total } = data;
  const remarks = meta.remarks.trim();
  const description = `Countertops — supply, fabrication & packing${materialBasis ? ` (${materialBasis})` : ""}`;
  return (
    <Document title={`${data.number} - ${projectTitle}`} author={company.name} subject="Quotation">
      <Page size="A4" style={s.page}>
        <View style={s.frame}>
          <View style={s.header}>
            <View style={s.brand}>
              <View style={s.tile}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt */}
                <Image style={s.logo} src={{ data: readFileSync(path.join(process.cwd(), "public", "logo-white.png")), format: "png" }} />
              </View>
              <View>
                <Text style={s.company}>{company.name.toUpperCase()}</Text>
                {company.address ? <Text style={s.small}>{company.address}</Text> : null}
                {company.phone ? <Text style={s.small}>{company.phone}</Text> : null}
              </View>
            </View>
            <Text style={s.docTitle}>QUOTATION</Text>
          </View>

          <View style={s.info}>
            <View style={s.infoLeft}>
              {meta.customerName || meta.contactName || meta.contactEmail || meta.siteAddress ? (
                <View style={[s.party, s.partyBorder]}>
                  {meta.customerName ? <Text style={s.partyTitle}>To : {meta.customerName}</Text> : null}
                  {meta.contactName ? <Text style={s.small}>Attn: {meta.contactName}</Text> : null}
                  {meta.contactEmail ? <Text style={s.small}>{meta.contactEmail}</Text> : null}
                  {meta.siteAddress ? <Text style={s.small}>Site: {meta.siteAddress}</Text> : null}
                </View>
              ) : null}
              <View style={s.party}>
                <Text style={s.partyTitle}>Project : {projectTitle}</Text>
                {meta.code || meta.version ? <Text style={s.small}>Reference: {[meta.code, meta.version].filter(Boolean).join("  ·  ")}</Text> : null}
                {materialBasis ? <Text style={s.small}>Material: {materialBasis}</Text> : null}
              </View>
            </View>
            <View style={s.infoRight}>
              <View style={s.metaRow}>
                <View style={[s.metaCell, s.metaCellBorder]}>
                  <Text style={s.metaLabel}>QUOTATION NO</Text>
                  <Text>{data.number}</Text>
                </View>
                <View style={s.metaCell}>
                  <Text style={s.metaLabel}>QUOTE DATE</Text>
                  <Text>{date(data.issued)}</Text>
                </View>
              </View>
              <View style={s.metaRow}>
                <View style={[s.metaCell, s.metaCellBorder]}>
                  <Text style={s.metaLabel}>CURRENCY</Text>
                  <Text>{CURRENCY}</Text>
                </View>
                <View style={s.metaCell}>
                  <Text style={s.metaLabel}>VALID UNTIL</Text>
                  <Text>{date(data.validUntil)}</Text>
                </View>
              </View>
              <View style={s.valueCell}>
                <Text style={s.metaLabel}>QUOTATION VALUE</Text>
                <Text style={s.value}>{money(total)}</Text>
              </View>
            </View>
          </View>

          <View style={s.th}>
            <Text style={[s.cell, s.center, { width: W.sno }]}>SNO</Text>
            <Text style={[s.cell, { flex: 1 }]}>DESCRIPTION</Text>
            <Text style={[s.cell, s.center, { width: W.uom }]}>UOM</Text>
            <Text style={[s.cell, s.num, { width: W.qty }]}>QTY</Text>
            <Text style={[s.cell, s.num, { width: W.amount }]}>AMOUNT</Text>
          </View>
          <View style={s.tr} wrap={false}>
            <Text style={[s.cell, s.center, { width: W.sno }]}>1</Text>
            <Text style={[s.cell, s.bold, { flex: 1 }]}>{description}</Text>
            <Text style={[s.cell, s.center, { width: W.uom }]}>SQFT</Text>
            <Text style={[s.cell, s.num, { width: W.qty }]}>{num(data.totalSqft)}</Text>
            <Text style={[s.cell, s.num, { width: W.amount }]}>{money(total)}</Text>
          </View>
          <View style={s.tfoot} wrap={false}>
            <Text style={[s.cell, s.num, { flex: 1 }]}>TOTAL ({CURRENCY})</Text>
            <Text style={[s.cell, s.num, { width: W.amount }]}>{money(total)}</Text>
          </View>

          <View style={s.totals} wrap={false}>
            <View style={s.totalLine}>
              <Text style={s.bold}>TOTAL AMOUNT: </Text>
              <Text style={s.value}>{money(total)}</Text>
            </View>
            <Text>
              <Text style={s.bold}>IN WORDS: </Text>
              {amountInWords(total)}
            </Text>
          </View>

          {(terms.length > 0 || remarks) && (
            <View style={s.terms}>
              {terms.length > 0 && <Text style={s.termsTitle}>TERMS &amp; NOTES:</Text>}
              {terms.map((n, i) => (
                <View key={i} style={s.note} wrap={false}>
                  <Text style={{ width: 14 }}>{i + 1}.</Text>
                  <Text style={{ flex: 1, fontSize: 9, lineHeight: 1.25 }}>{n}</Text>
                </View>
              ))}
              {remarks ? (
                <Text style={{ marginTop: terms.length ? 4 : 0 }}>
                  <Text style={s.bold}>REMARKS: </Text>
                  {remarks}
                </Text>
              ) : null}
            </View>
          )}

          <View style={s.signs} wrap={false}>
            <View style={[s.sign, s.signBorder]}>
              <Text style={s.signTitle}>APPROVED BY</Text>
            </View>
            <View style={s.sign}>
              <Text style={s.signTitle}>ACCEPTED BY (CUSTOMER)</Text>
            </View>
          </View>
        </View>

        <View style={s.authority} wrap={false}>
          <Text style={[s.signTitle, { marginBottom: 26 }]}>FOR {company.name.toUpperCase()}</Text>
          <Text style={s.signTitle}>AUTHORISED SIGNATORY</Text>
        </View>

        <Text style={s.footer} fixed>
          {company.name.toUpperCase()}
        </Text>
      </Page>
    </Document>
  );
}

export async function buildQuotePdf(d: ProjectData, fallbackNumber: string): Promise<{ buffer: Buffer; fileName: string }> {
  const r = calculate(d);
  const issued = new Date();
  const number = d.meta.quoteNumber.trim() || `Q-${d.meta.code || fallbackNumber}`;
  const data: QuoteDocData = {
    company: { name: process.env.COMPANY_NAME?.trim() || "Pacific Surfaces", address: process.env.COMPANY_ADDRESS?.trim() || "", phone: process.env.COMPANY_PHONE?.trim() || "" },
    meta: d.meta,
    // The line already reads "Project :", so a title starting "Project #1624" doesn't repeat the word.
    projectTitle: (d.meta.quoteTitle.trim() || d.meta.name).replace(/^project\s+/i, ""),
    terms: termsFor(d, r),
    materialBasis: d.variables.materialBasis,
    totalSqft: r.drawing.sqft,
    total: r.summary.totalCustomer,
    number,
    issued,
    validUntil: new Date(issued.getTime() + (d.meta.validityDays || 30) * 86_400_000),
  };
  const buffer = await renderToBuffer(<QuoteDocument data={data} />);
  return { buffer, fileName: `${number.replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf` };
}
