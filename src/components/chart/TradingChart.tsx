import { useEffect, useRef } from "react";
import type { Candle } from "@/lib/candles";
import { bollinger, ema, macd, rsi, sma } from "@/lib/indicators";
import type { StrategyResult } from "@/lib/strategy/jarvis";

// precyzja ceny z danych: tyle miejsc po przecinku, ile najwyżej ma któraś świeca (min. 2, maks. 8)
function pricePrecision(cs: Candle[]): number {
  let maxDec = 0;
  for (const c of cs) {
    for (const v of [c.open, c.high, c.low, c.close]) {
      let s = v.toString();
      if (s.includes("e")) s = v.toFixed(8).replace(/0+$/, "");
      const i = s.indexOf(".");
      if (i >= 0) maxDec = Math.max(maxDec, s.length - i - 1);
    }
  }
  return Math.min(Math.max(maxDec, 2), 8);
}


export type IndicatorSettings = {
  ma1: { on: boolean; length: number; type: "SMA" | "EMA" };
  ma2: { on: boolean; length: number; type: "SMA" | "EMA" };
  bb: { on: boolean; length: number; mult: number };
  volume: boolean;
  rsi: { on: boolean; length: number };
  macd: { on: boolean; fast: number; slow: number; signal: number };
};

type Props = {
  candles: Candle[];
  indicators: IndicatorSettings;
  chartType: "candles" | "bars" | "line" | "area";
  strategy?: StrategyResult | null;
  showPlots?: boolean;
  theme?: "light" | "dark";
  onHover?: (c: Candle | null) => void;
};

export function TradingChart({ candles, indicators, chartType, strategy, showPlots = true, theme = "dark", onHover }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  // zapamiętany widok (przybliżenie/przesunięcie) między przebudowami wykresu
  const viewRef = useRef<{ from: number; to: number } | null>(null);
  const priceRangeRef = useRef<{ from: number; to: number } | null>(null);
  const prevCandlesRef = useRef<Candle[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !candles.length) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;

      const isDark = theme === "dark";
      const grid = { color: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.08)" };
      const axis = isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.16)";
      const crosshair = isDark ? "#758696" : "#64748b";
      const crosshairLabel = isDark ? "#2a2e39" : "#475569";
      const chart = lc.createChart(el, {
        layout: {
          background: { color: "transparent" },
          textColor: isDark ? "#b2b5be" : "#475569",
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          attributionLogo: false,
          panes: { separatorColor: axis },
        },
        grid: { vertLines: grid, horzLines: grid },
        rightPriceScale: { borderColor: axis },
        timeScale: {
          borderColor: axis,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 6,
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: crosshair, labelBackgroundColor: crosshairLabel },
          horzLine: { color: crosshair, labelBackgroundColor: crosshairLabel },
        },
        localization: { locale: "pl-PL" },
        autoSize: true,
      });

      // Wykres rysuje czas w strefie przeglądarki; przesunięcie znaczników czasu
      // o offset strefy sprawia, że oś pokazuje czas UTC, tak jak Binance.
      const tzShift = new Date().getTimezoneOffset() * 60;
      const sh = (t: number) => (t + tzShift) as typeof t;
      const up = "#26a69a";
      const down = "#ef5350";
      const dec = pricePrecision(candles);
      const priceFormat = { type: "price" as const, precision: dec, minMove: Math.pow(10, -dec) };
      let main:
        | ReturnType<typeof chart.addSeries>
        | ReturnType<typeof chart.addSeries<"Line">>;

      if (chartType === "candles") {
        main = chart.addSeries(lc.CandlestickSeries, {
          priceFormat,
          upColor: up,
          downColor: down,
          borderUpColor: up,
          borderDownColor: down,
          wickUpColor: up,
          wickDownColor: down,
        });
        main.setData(candles.map((c) => ({ ...c, time: sh(c.time) })) as any);
      } else if (chartType === "bars") {
        main = chart.addSeries(lc.BarSeries, { priceFormat, upColor: up, downColor: down });
        main.setData(candles.map((c) => ({ ...c, time: sh(c.time) })) as any);
      } else if (chartType === "area") {
        main = chart.addSeries(lc.AreaSeries, {
          priceFormat,
          lineColor: "#2962ff",
          topColor: "rgba(41,98,255,0.35)",
          bottomColor: "rgba(41,98,255,0.02)",
          lineWidth: 2,
        });
        main.setData(candles.map((c) => ({ time: sh(c.time), value: c.close })) as any);
      } else {
        main = chart.addSeries(lc.LineSeries, { priceFormat, color: "#2962ff", lineWidth: 2 });
        main.setData(candles.map((c) => ({ time: sh(c.time), value: c.close })) as any);
      }

      if (indicators.volume) {
        const vol = chart.addSeries(
          lc.HistogramSeries,
          { priceFormat: { type: "volume" }, priceScaleId: "vol" },
          0,
        );
        vol.setData(
          candles.map((c) => ({
            time: sh(c.time),
            value: c.volume,
            color: c.close >= c.open ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)",
          })) as any,
        );
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      }

      const addLine = (data: { time: number; value: number }[], color: string, pane = 0, width = 2) => {
        const s = chart.addSeries(
          lc.LineSeries,
          {
            color,
            lineWidth: width as 1 | 2 | 3,
            ...(pane === 0 ? { priceFormat } : {}),
            priceLineVisible: false,
            lastValueVisible: false,
          },
          pane,
        );
        s.setData(data.map((point) => ({ ...point, time: sh(point.time) })) as any);
        return s;
      };

      for (const cfg of [indicators.ma1, indicators.ma2]) {
        if (!cfg.on) continue;
        const data = cfg.type === "SMA" ? sma(candles, cfg.length) : ema(candles, cfg.length);
        addLine(data, cfg === indicators.ma1 ? "#f7c744" : "#7e57c2");
      }

      if (indicators.bb.on) {
        const bands = bollinger(candles, indicators.bb.length, indicators.bb.mult);
        addLine(bands.upper, "rgba(41,98,255,0.9)", 0, 1);
        addLine(bands.middle, isDark ? "rgba(255,255,255,0.45)" : "rgba(15,23,42,0.45)", 0, 1);
        addLine(bands.lower, "rgba(41,98,255,0.9)", 0, 1);
      }

      let pane = 1;
      if (indicators.rsi.on) {
        const s = addLine(rsi(candles, indicators.rsi.length), "#b39ddb", pane);
        s.createPriceLine({ price: 70, color: "rgba(239,83,80,0.5)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });
        s.createPriceLine({ price: 30, color: "rgba(38,166,154,0.5)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });
        chart.panes()[pane]?.setHeight(120);
        pane++;
      }

      if (indicators.macd.on) {
        const m = macd(candles, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal);
        const hist = chart.addSeries(lc.HistogramSeries, { priceLineVisible: false }, pane);
        hist.setData(m.histogram.map((point) => ({ ...point, time: sh(point.time) })) as any);
        addLine(m.macdLine, "#2962ff", pane, 1);
        addLine(m.signalLine, "#ff9800", pane, 1);
        chart.panes()[pane]?.setHeight(120);
        pane++;
      }

      if (strategy) {
        if (showPlots) for (const pl of strategy.plots) if (pl.data.length) addLine(pl.data, pl.color, 0, pl.width);
        const markers = strategy.trades
          .flatMap((t) => [

            t.side === "SELL"
              ? {
                  time: t.entryTime,
                  position: "aboveBar" as const,
                  color: down,
                  shape: "arrowDown" as const,
                  size: 1.5,
                  text: `SELL @${t.entryPrice.toPrecision(5)}`,
                }
              : {
                  time: t.entryTime,
                  position: "belowBar" as const,
                  color: up,
                  shape: "arrowUp" as const,
                  size: 1.5,
                  text: `BUY @${t.entryPrice.toPrecision(5)}`,
                },
            ...(t.exitReason === "Otwarta"
              ? []
              : [
                  t.side === "SELL"
                    ? {
                        time: t.exitTime,
                        position: "belowBar" as const,
                        color: t.pnl >= 0 ? up : down,
                        shape: "arrowUp" as const,
                        size: 1.5,
                        text: `BUY ${t.pnlPct >= 0 ? "+" : ""}${t.pnlPct.toFixed(2)}%`,
                      }
                    : {
                        time: t.exitTime,
                        position: "aboveBar" as const,
                        color: t.pnl >= 0 ? up : down,
                        shape: "arrowDown" as const,
                        size: 1.5,
                        text: `${t.exitReason === "STOP_LOSS" ? "SL" : "SELL"} ${t.pnlPct >= 0 ? "+" : ""}${t.pnlPct.toFixed(2)}%`,
                      },
                ]),
          ])
          .sort((a, b) => a.time - b.time);
        lc.createSeriesMarkers(main, markers.map((m) => ({ ...m, time: sh(m.time) })) as any);
        for (const t of strategy.trades) {
          if (t.exitReason === "Otwarta") continue;
          const seg = chart.addSeries(
            lc.LineSeries,
            {
              color: "#ffffff",
              lineWidth: 1,
              lineStyle: lc.LineStyle.Dashed,
              priceFormat,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
              pointMarkersVisible: false,
            },
            0,
          );
          seg.setData([
            { time: sh(t.entryTime), value: t.entryPrice },
            { time: sh(t.exitTime), value: t.exitPrice },
          ] as any);
        }
        const eq = chart.addSeries(
          lc.AreaSeries,
          {
            lineColor: "#2962ff",
            topColor: "rgba(41,98,255,0.3)",
            bottomColor: "rgba(41,98,255,0.02)",
            lineWidth: 2,
            priceLineVisible: false,
            title: "Kapitał",
          },
          pane,
        );
        eq.setData(strategy.equity.map((point) => ({ ...point, time: sh(point.time) })) as any);
        chart.panes()[pane]?.setHeight(130);
        pane++;
      }

      chart.subscribeCrosshairMove((param) => {
        if (!param.time) {
          hoverRef.current?.(null);
          return;
        }
        const found = candles.find((c) => sh(c.time) === param.time);
        hoverRef.current?.(found ?? null);
      });

      // Zachowaj widok użytkownika, jeśli to tylko aktualizacja danych (np. tick na żywo),
      // a nie wczytanie zupełnie nowego zestawu świec.
      const prev = prevCandlesRef.current;
      const sameSeries =
        prev.length > 0 &&
        candles.length > 0 &&
        prev[0].time === candles[0].time &&
        Math.abs(candles.length - prev.length) <= 2;
      const saved = viewRef.current;
      if (sameSeries && saved) {
        chart.timeScale().setVisibleLogicalRange(saved);
        const pr = priceRangeRef.current;
        if (pr) {
          const ps = chart.priceScale("right");
          ps.setAutoScale(false);
          ps.setVisibleRange(pr);
        }
      } else {
        chart.timeScale().fitContent();
        priceRangeRef.current = null;
      }
      prevCandlesRef.current = candles;

      cleanup = () => {
        const range = chart.timeScale().getVisibleLogicalRange();
        if (range) viewRef.current = { from: range.from, to: range.to };
        const pr = chart.priceScale("right").getVisibleRange();
        priceRangeRef.current = pr ? { from: pr.from, to: pr.to } : null;
        chart.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [candles, indicators, chartType, strategy, showPlots, theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}
