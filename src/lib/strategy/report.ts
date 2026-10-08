import type { PineHeader, PineInput, StrategyResult } from "./jarvis";

const fmt = (v: number, d = 2) =>
  Number.isFinite(v) ? v.toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d }) : "∞";
const dt = (t: number) =>
  new Date(t * 1000).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function fontB64(url: string) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function downloadStrategyPdf(opts: {
  header: PineHeader;
  params: PineInput[];
  result: StrategyResult;
  dec: number;
  dataLabel: string;
  range: { from: number; to: number } | null;
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const [reg, bold] = await Promise.all([fontB64("/fonts/DejaVuSans.ttf"), fontB64("/fonts/DejaVuSans-Bold.ttf")]);
  doc.addFileToVFS("DejaVu.ttf", reg);
  doc.addFont("DejaVu.ttf", "DejaVu", "normal");
  doc.addFileToVFS("DejaVuB.ttf", bold);
  doc.addFont("DejaVuB.ttf", "DejaVu", "bold");
  doc.setFont("DejaVu", "bold");

  const { header, params, result, dec } = opts;
  const s = result.stats;
  doc.setFontSize(15);
  doc.text(header.title, 40, 46);
  doc.setFont("DejaVu", "normal");
  doc.setFontSize(9);
  const lines = [
    `Dane: ${opts.dataLabel}`,
    opts.range ? `Zakres: ${dt(opts.range.from)} – ${dt(opts.range.to)}` : "",
    `Kapitał początkowy ${fmt(header.initialCapital)} USD · prowizja ${header.commissionPct}% · wygenerowano ${new Date().toLocaleString("pl-PL")}`,
  ].filter(Boolean);
  lines.forEach((l, i) => doc.text(l, 40, 64 + i * 12));

  const base = { styles: { font: "DejaVu", fontSize: 8 }, headStyles: { font: "DejaVu", fontStyle: "bold" as const, fillColor: [41, 98, 255] as [number, number, number] }, margin: { left: 40, right: 40 } };
  const title = (t: string, y: number) => {
    doc.setFont("DejaVu", "bold");
    doc.setFontSize(11);
    doc.text(t, 40, y);
    doc.setFont("DejaVu", "normal");
  };
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  title("Wyniki", 110);
  autoTable(doc, {
    ...base,
    startY: 118,
    head: [["Miara", "Wartość"]],
    body: [
      ["Zysk netto", `${fmt(s.netProfit)} USD (${fmt(s.netProfitPct)}%)`],
      ["Kapitał końcowy", `${fmt(s.finalEquity)} USD`],
      ["Kup i trzymaj", `${fmt(s.buyHoldPct)}%`],
      ["Transakcje", `${s.totalTrades}`],
      ["Zyskowne / stratne", `${s.winners} (${fmt(s.winRate, 1)}%) / ${s.losers}`],
      ["Profit factor", fmt(s.profitFactor)],
      ["Zysk brutto / strata brutto", `${fmt(s.grossProfit)} / ${fmt(-s.grossLoss)} USD`],
      ["Śr. transakcja", `${fmt(s.avgTrade)} USD`],
      ["Śr. zysk / strata", `${fmt(s.avgWin)} / ${fmt(s.avgLoss)} USD`],
      ["Największy zysk / strata", `${fmt(s.largestWin)} / ${fmt(s.largestLoss)} USD`],
      ["Maks. obsunięcie", `${fmt(s.maxDrawdown)} USD (${fmt(s.maxDrawdownPct)}%)`],
      ["Prowizje", `${fmt(s.commission)} USD`],
      ["Śr. długość", `${fmt(s.avgBars, 1)} świec`],
      ["Wyjścia SELL / SL", `${s.signalExits} / ${s.stopExits}`],
    ],
  });

  title("Parametry", lastY() + 24);
  autoTable(doc, {
    ...base,
    startY: lastY() + 32,
    head: [["Parametr", "Nazwa", "Wartość"]],
    body: params.map((p) => [p.title, p.name, p.kind === "bool" ? (p.value ? "Włączony" : "Wyłączony") : String(p.value)]),
  });

  doc.addPage();
  title("Transakcje", 46);
  autoTable(doc, {
    ...base,
    styles: { ...base.styles, fontSize: 7 },
    startY: 54,
    head: [["#", "Wejście", "Cena", "Wyjście", "Cena", "Powód", "Wartość", "SL", "Świece", "Wynik USD", "%"]],
    body: result.trades.map((t, i) => [
      i + 1,
      dt(t.entryTime),
      t.entryPrice.toFixed(dec),
      dt(t.exitTime),
      t.exitPrice.toFixed(dec),
      t.exitReason,
      fmt(t.notional),
      Number.isFinite(t.stop) ? t.stop.toFixed(dec) : "—",
      t.bars,
      fmt(t.pnl),
      fmt(t.pnlPct),
    ]),
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index >= 9) {
        const v = result.trades[d.row.index]?.pnl ?? 0;
        d.cell.styles.textColor = v >= 0 ? [8, 153, 129] : [242, 54, 69];
      }
    },
  });

  const safe = header.title.replace(/[^\w\-]+/g, "_").slice(0, 60) || "strategia";
  doc.save(`${safe}_raport.pdf`);
}
