import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { TradingChart, type IndicatorSettings } from "@/components/chart/TradingChart";
import { StrategyPanel } from "@/components/strategy/StrategyPanel";
import {
  isJarvisStrategy,
  parsePineHeader,
  parsePineInputs,
  parseStrategyColors,
  runJarvis,
  type PineInput,
  type StrategyColor,
} from "@/lib/strategy/jarvis";
import { aggregate, detectInterval, parseCandles, TIMEFRAMES, type Candle } from "@/lib/candles";
import { BINANCE_INTERVALS, BINANCE_PAIRS, fetchHistory, fetchLatest } from "@/lib/binance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CandleLab — wykres świecowy do testowania wskaźników" },
      {
        name: "description",
        content:
          "Wgraj własny plik ze świecami (czas, O, H, L, C) i analizuj go na wykresie ze wskaźnikami oraz testerem strategii.",
      },
      { property: "og:title", content: "CandleLab — wykres świecowy dla własnych danych" },
      {
        property: "og:description",
        content:
          "Własny terminal wykresowy: świece, wolumen, MA, Bollinger, RSI, MACD i tester strategii na Twoich danych.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const DEFAULTS: IndicatorSettings = {
  ma1: { on: false, length: 50, type: "SMA" },
  ma2: { on: false, length: 200, type: "SMA" },
  bb: { on: false, length: 20, mult: 2 },
  volume: false,
  rsi: { on: false, length: 14 },
  macd: { on: false, fast: 12, slow: 26, signal: 9 },
};

function Index() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [raw, setRaw] = useState<Candle[]>([]);
  const [fileName, setFileName] = useState("poczatek.customization_6");
  const [error, setError] = useState<string | null>(null);
  const [tf, setTf] = useState<number | null>(null);
  const [chartType, setChartType] = useState<"candles" | "bars" | "line" | "area">("candles");
  const [ind, setInd] = useState<IndicatorSettings>(DEFAULTS);
  const [hover, setHover] = useState<Candle | null>(null);
  const [strategy, setStrategy] = useState<{ name: string; code: string } | null>(null);
  const [stratDragging, setStratDragging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [indMenuOpen, setIndMenuOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [bnPair, setBnPair] = useState<string>("SUIUSDC");
  const [bnInterval, setBnInterval] = useState<string>("4h");
  const [bnLoading, setBnLoading] = useState(false);
  const [liveSrc, setLiveSrc] = useState<{ pair: string; interval: string } | null>(null);
  const [live, setLive] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const stratInputRef = useRef<HTMLInputElement>(null);
  const indMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("candlelab-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("candlelab-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!indMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!indMenuRef.current?.contains(e.target as Node)) setIndMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIndMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [indMenuOpen]);

  useEffect(() => {
    fetch("/data/demo-candles.json")
      .then((r) => r.text())
      .then((t) => setRaw(parseCandles(t)))
      .catch(() => setError("Nie udało się wczytać danych demo."));
  }, []);

  const baseInterval = useMemo(() => (raw.length ? detectInterval(raw) : 60), [raw]);
  const dateBounds = useMemo(() => {
    if (!raw.length) return { min: "", max: "" };
    const toISO = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
    return { min: toISO(raw[0].time), max: toISO(raw[raw.length - 1].time) };
  }, [raw]);
  const calculationCandles = useMemo(
    () => (tf && tf > baseInterval ? aggregate(raw, tf) : raw),
    [raw, tf, baseInterval],
  );
  const candles = useMemo(() => {
    const base = calculationCandles;
    if (!fromDate && !toDate) return base;
    const from = fromDate ? Date.parse(`${fromDate}T00:00:00Z`) / 1000 : -Infinity;
    const to = toDate ? Date.parse(`${toDate}T23:59:59Z`) / 1000 : Infinity;
    return base.filter((c) => c.time >= from && c.time <= to);
  }, [calculationCandles, fromDate, toDate]);

  async function loadStrategy(files: File[]) {
    const f = files[0];
    if (!f) return;
    const text = await f.text();
    setStrategy({ name: f.name, code: text });
    setParams(parsePineInputs(text));
    setStrategyColors(parseStrategyColors(text));
  }

  const [params, setParams] = useState<PineInput[]>([]);
  const [strategyColors, setStrategyColors] = useState<StrategyColor[]>([]);
  const [showPlots, setShowPlots] = useState(true);
  const supported = strategy ? isJarvisStrategy(strategy.code) : false;
  const header = useMemo(() => (strategy ? parsePineHeader(strategy.code) : null), [strategy]);
  const result = useMemo(() => {
    if (!strategy || !supported || !header || candles.length < 50) return null;
    const startTime = fromDate ? Date.parse(`${fromDate}T00:00:00Z`) / 1000 : undefined;
    const endTime = toDate ? Date.parse(`${toDate}T23:59:59Z`) / 1000 : undefined;
    const tested = runJarvis(
      calculationCandles,
      Object.fromEntries(params.map((p) => [p.name, p.value])),
      header,
      strategyColors,
      {
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
      },
    );
    const from = candles[0].time;
    const to = candles[candles.length - 1].time;
    return { ...tested, plots: tested.plots.map((plot) => ({ ...plot, data: plot.data.filter((point) => point.time >= from && point.time <= to) })) };
  }, [strategy, supported, header, candles, calculationCandles, fromDate, toDate, params, strategyColors]);


  async function loadFiles(files: File[], merge: boolean) {
    try {
      const lists: Candle[][] = [];
      for (const f of files) {
        const parsed = parseCandles(await f.text());
        if (!parsed.length) throw new Error(`Brak rozpoznanych świec w pliku ${f.name}.`);
        lists.push(parsed);
      }
      const base = merge ? raw : [];
      const intervals = [...(base.length ? [base] : []), ...lists].map(detectInterval);
      if (new Set(intervals).size > 1)
        throw new Error("Pliki mają różne interwały świec — nie można ich połączyć.");
      const map = new Map<number, Candle>();
      for (const c of base) map.set(c.time, c);
      for (const l of lists) for (const c of l) map.set(c.time, c);
      const mergedList = [...map.values()].sort((a, b) => a.time - b.time);
      setRaw(mergedList);
      const names = files.map((f) => f.name.replace(/\.customization$/i, "")).join(" + ");
      setFileName(merge && base.length ? `${fileName} + ${names}` : names);
      setTf(null);
      setLiveSrc(null);
      setFromDate("");
      setToDate("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się odczytać pliku.");
    }
  }
  const mergeRef = useRef<HTMLInputElement>(null);

  async function loadBinance() {
    setBnLoading(true);
    try {
      const list = await fetchHistory(bnPair, bnInterval, 6);
      if (!list.length) throw new Error("Binance nie zwrócił świec.");
      setRaw(list);
      setFileName(`Binance ${bnPair} ${bnInterval}`);
      setTf(null);
      setFromDate("");
      setToDate("");
      setError(null);
      setLiveSrc({ pair: bnPair, interval: bnInterval });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać danych z Binance.");
    } finally {
      setBnLoading(false);
    }
  }

  useEffect(() => {
    if (!live || !liveSrc) return;
    let stop = false;
    const tick = async () => {
      try {
        const latest = await fetchLatest(liveSrc.pair, liveSrc.interval);
        if (stop) return;
        setRaw((prev) => {
          if (!prev.length) return prev;
          const lastTime = prev[prev.length - 1].time;
          // tylko aktualizacja bieżącej świecy i ewentualnie nowych — nigdy nie rusza historii ani interwału
          const fresh = latest.filter((c) => c.time >= lastTime);
          if (!fresh.length) return prev;
          const map = new Map(prev.map((c) => [c.time, c]));
          for (const c of fresh) map.set(c.time, c);
          return [...map.values()].sort((a, b) => a.time - b.time);
        });
      } catch {
        /* chwilowy błąd sieci — spróbuje ponownie */
      }
    };
    void tick();
    const id = window.setInterval(tick, 15000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [live, liveSrc]);

  const last = hover ?? candles[candles.length - 1];
  const prev = last ? candles[candles.indexOf(last) - 1] : undefined;
  const changePct = last && prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const dec = last && last.close < 10 ? 5 : 2;

  // Odliczanie do zamknięcia ostatniej świecy — tyka co sekundę, dane odświeża „Na żywo" co 15 s
  const candleSec = tf && tf > baseInterval ? tf : baseInterval;
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  const lastCandle = candles[candles.length - 1];
  const countdownSec = lastCandle ? lastCandle.time + candleSec - nowSec : null;
  const showCountdown = countdownSec !== null && countdownSec >= -30;
  const fmtCountdown = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
  };

  return (
    <div
      className="flex h-screen flex-col bg-background text-foreground"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const fs = Array.from(e.dataTransfer.files ?? []);
        if (fs.length) void loadFiles(fs, true);
      }}
    >
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <button className="tv-btn" onClick={() => inputRef.current?.click()}>
          Wczytaj plik
        </button>
        <button
          className="tv-btn"
          title="Połącz z aktualnymi danymi (np. wcześniejszy zakres dat)"
          onClick={() => mergeRef.current?.click()}
        >
          + Dołącz plik
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".customization,.json,.txt,.csv"
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            if (fs.length) void loadFiles(fs, false);
            e.target.value = "";
          }}
        />
        <input
          ref={mergeRef}
          type="file"
          multiple
          accept=".customization,.json,.txt,.csv"
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            if (fs.length) void loadFiles(fs, true);
            e.target.value = "";
          }}
        />
        <div className="tv-divider" />
        <select className="tv-btn px-1.5 py-0.5 text-xs" value={bnPair} onChange={(e) => setBnPair(e.target.value)}>
          {BINANCE_PAIRS.map((p) => (
            <option key={p} value={p}>{p.replace("USDC", "/USDC")}</option>
          ))}
        </select>
        <select
          className="tv-btn px-1.5 py-0.5 text-xs"
          value={bnInterval}
          onChange={(e) => {
            setBnInterval(e.target.value);
            // zmiana interwału wymaga ponownego pobrania historii — wyłączam odświeżanie, żeby nie mieszać rozdzielczości
            setLiveSrc(null);
          }}
        >
          {BINANCE_INTERVALS.map((i) => (
            <option key={i} value={i}>{i.toUpperCase()}</option>
          ))}
        </select>
        <button className="tv-btn" disabled={bnLoading} onClick={() => void loadBinance()}>
          {bnLoading ? "Pobieram…" : "Pobierz z Binance"}
        </button>
        <label className={`flex items-center gap-1 text-xs ${liveSrc ? "" : "opacity-50"}`} title="Aktualizuje cenę bieżącej świecy co 15 s (interwał zostaje bez zmian)">
          <input type="checkbox" className="tv-check" disabled={!liveSrc} checked={live && !!liveSrc} onChange={(e) => setLive(e.target.checked)} />
          Na żywo
          {live && liveSrc && <span className="animate-pulse text-bull">●</span>}
        </label>
        <span className="font-mono text-xs text-muted-foreground">
          {fileName} · {candles.length} świec
        </span>

        <div className="tv-divider" />
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Zakres:</span>
          <input
            type="date"
            className="tv-btn px-1.5 py-0.5 font-mono text-xs"
            value={fromDate}
            min={dateBounds.min}
            max={toDate || dateBounds.max}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span>–</span>
          <input
            type="date"
            className="tv-btn px-1.5 py-0.5 font-mono text-xs"
            value={toDate}
            min={fromDate || dateBounds.min}
            max={dateBounds.max}
            onChange={(e) => setToDate(e.target.value)}
          />
          {(fromDate || toDate) && (
            <button
              className="tv-btn px-1.5 py-0.5"
              title="Wyczyść zakres dat"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
            >
              ✕
            </button>
          )}
        </div>

        <div className="tv-divider" />
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.filter((t) => t.sec >= baseInterval).map((t) => (
            <button
              key={t.label}
              className={`tv-tf ${(tf ?? baseInterval) === t.sec ? "tv-tf-active" : ""}`}
              onClick={() => setTf(t.sec)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="tv-divider" />
        <div className="relative" ref={indMenuRef}>
          <button
            className={`tv-btn ${indMenuOpen ? "tv-tf-active" : ""}`}
            onClick={() => setIndMenuOpen((v) => !v)}
          >
            Wskaźniki ▾
          </button>
          {indMenuOpen && (
            <div className="absolute left-0 top-full z-40 mt-1 w-[260px] space-y-2 rounded-md border border-border bg-card p-3 shadow-xl">
              <h2 className="tv-h">Wskaźniki</h2>
              {([1, 2] as const).map((n) => {
                const key = n === 1 ? "ma1" : "ma2";
                const cfg = ind[key];
                return (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="tv-check"
                      checked={cfg.on}
                      onChange={(e) => setInd({ ...ind, [key]: { ...cfg, on: e.target.checked } })}
                    />
                    <select
                      className="tv-input w-16"
                      value={cfg.type}
                      onChange={(e) =>
                        setInd({ ...ind, [key]: { ...cfg, type: e.target.value as "SMA" | "EMA" } })
                      }
                    >
                      <option>SMA</option>
                      <option>EMA</option>
                    </select>
                    <input
                      type="number"
                      className="tv-input w-16"
                      value={cfg.length}
                      min={1}
                      onChange={(e) =>
                        setInd({ ...ind, [key]: { ...cfg, length: Number(e.target.value) || 1 } })
                      }
                    />
                    <span
                      className="h-1 w-5 rounded"
                      style={{ background: n === 1 ? "#f7c744" : "#7e57c2" }}
                    />
                  </div>
                );
              })}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="tv-check"
                  checked={ind.bb.on}
                  onChange={(e) => setInd({ ...ind, bb: { ...ind.bb, on: e.target.checked } })}
                />
                <span className="flex-1 text-xs">Bollinger</span>
                <input
                  type="number"
                  className="tv-input w-14"
                  value={ind.bb.length}
                  onChange={(e) =>
                    setInd({ ...ind, bb: { ...ind.bb, length: Number(e.target.value) || 1 } })
                  }
                />
                <input
                  type="number"
                  step={0.5}
                  className="tv-input w-14"
                  value={ind.bb.mult}
                  onChange={(e) =>
                    setInd({ ...ind, bb: { ...ind.bb, mult: Number(e.target.value) || 2 } })
                  }
                />
              </div>

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="tv-check"
                  checked={ind.volume}
                  onChange={(e) => setInd({ ...ind, volume: e.target.checked })}
                />
                Wolumen
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="tv-check"
                  checked={ind.rsi.on}
                  onChange={(e) => setInd({ ...ind, rsi: { ...ind.rsi, on: e.target.checked } })}
                />
                <span className="flex-1 text-xs">RSI</span>
                <input
                  type="number"
                  className="tv-input w-14"
                  value={ind.rsi.length}
                  onChange={(e) =>
                    setInd({ ...ind, rsi: { ...ind.rsi, length: Number(e.target.value) || 1 } })
                  }
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="tv-check"
                  checked={ind.macd.on}
                  onChange={(e) => setInd({ ...ind, macd: { ...ind.macd, on: e.target.checked } })}
                />
                <span className="flex-1 text-xs">MACD</span>
                <input
                  type="number"
                  className="tv-input w-12"
                  value={ind.macd.fast}
                  onChange={(e) =>
                    setInd({ ...ind, macd: { ...ind.macd, fast: Number(e.target.value) || 12 } })
                  }
                />
                <input
                  type="number"
                  className="tv-input w-12"
                  value={ind.macd.slow}
                  onChange={(e) =>
                    setInd({ ...ind, macd: { ...ind.macd, slow: Number(e.target.value) || 26 } })
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="tv-divider" />
        <div className="flex items-center gap-0.5">
          {(["candles", "bars", "line", "area"] as const).map((t) => (
            <button
              key={t}
              className={`tv-tf ${chartType === t ? "tv-tf-active" : ""}`}
              onClick={() => setChartType(t)}
            >
              {t === "candles" ? "Świece" : t === "bars" ? "Bary" : t === "line" ? "Linia" : "Obszar"}
            </button>
          ))}
        </div>
        <button
          className="tv-btn ml-auto grid size-7 shrink-0 place-items-center p-0"
          title={theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw"}
          aria-label={theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw"}
          onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        >
          {theme === "dark" ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Chart area */}
        <main className="relative min-w-0 flex-1">
          {last && (
            <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-wrap items-center gap-3 font-mono text-xs">
              <span className="text-muted-foreground">
                O <span className="text-foreground">{last.open.toFixed(dec)}</span>
              </span>
              <span className="text-muted-foreground">
                H <span className="text-bull">{last.high.toFixed(dec)}</span>
              </span>
              <span className="text-muted-foreground">
                L <span className="text-bear">{last.low.toFixed(dec)}</span>
              </span>
              <span className="text-muted-foreground">
                C <span className="text-foreground">{last.close.toFixed(dec)}</span>
              </span>
              <span className={changePct >= 0 ? "text-bull" : "text-bear"}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
              <span className="text-muted-foreground">
                Vol <span className="text-foreground">{last.volume.toLocaleString("pl-PL")}</span>
              </span>
            </div>
          )}
          {showCountdown && (
            <div className="pointer-events-none absolute right-3 top-2 z-10 rounded border border-border bg-card/80 px-2 py-1 font-mono text-xs">
              <span className="text-muted-foreground">Zamknięcie za </span>
              <span className="text-foreground">{fmtCountdown(Math.max(0, countdownSec ?? 0))}</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-x-0 top-10 z-20 mx-auto w-fit rounded-md border border-bear/40 bg-card px-3 py-1.5 text-xs text-bear">
              {error}
            </div>
          )}
          {dragging && (
            <div className="absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-primary bg-background/70 text-sm">
              Upuść plik ze świecami
            </div>
          )}
          <ClientOnly fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Ładowanie wykresu…</div>}>
            <TradingChart
              candles={candles}
              indicators={ind}
              chartType={chartType}
              onHover={setHover}
              strategy={result}
              showPlots={showPlots}
              theme={theme}
            />
          </ClientOnly>
        </main>

        {/* Right panel */}
        <aside className="w-[340px] shrink-0 space-y-4 overflow-y-auto border-l border-border p-3">
          <section className="space-y-2">
            <h2 className="tv-h">Strategia</h2>
            <input
              ref={stratInputRef}
              type="file"
              accept=".pine,.ps,.txt,.customization,.json,.js"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void loadStrategy(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <div
              className={`rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground transition-colors ${
                stratDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setStratDragging(true);
              }}
              onDragLeave={() => setStratDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setStratDragging(false);
                void loadStrategy(Array.from(e.dataTransfer.files));
              }}
              onClick={() => stratInputRef.current?.click()}
              role="button"
              aria-label="Wgraj plik strategii"
            >
              Przeciągnij plik strategii (Pine Script) tutaj lub kliknij, aby wybrać.
            </div>
            {strategy && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-mono">{strategy.name}</span>
                <span className="shrink-0 text-muted-foreground">{strategy.code.split("\n").length} linii</span>
                <button
                  className="shrink-0 text-muted-foreground hover:text-bear"
                  aria-label="Usuń strategię"
                  onClick={() => setStrategy(null)}
                >
                  ✕
                </button>
              </div>
            )}
            {strategy && !supported && (
              <p className="text-[11px] leading-relaxed text-bear">
                Ten skrypt nie jest jeszcze obsługiwany przez symulator. Obsługiwana jest strategia
                Ichimoku + HullMA + Hull MACD + Jarvis RM.
              </p>
            )}
            {strategy && supported && header && (
              <StrategyPanel
                header={header}
                params={params}
                onParams={setParams}
                colors={strategyColors}
                onColors={setStrategyColors}
                result={result}
                showPlots={showPlots}
                onShowPlots={setShowPlots}
                dec={dec}
                onPdf={async () => {
                  if (!result) return;
                  const { downloadStrategyPdf } = await import("@/lib/strategy/report");
                  await downloadStrategyPdf({
                    header,
                    params,
                    result,
                    dec,
                    dataLabel: `${fileName} · ${candles.length} świec`,
                    range: candles.length ? { from: candles[0].time, to: candles[candles.length - 1].time } : null,
                  });
                }}
              />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}


