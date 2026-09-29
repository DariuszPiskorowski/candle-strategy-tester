import { useEffect, useRef } from "react";
import type { Candle } from "@/lib/candles";
import { bollinger, ema, macd, rsi, sma } from "@/lib/indicators";
import type { BacktestResult } from "@/lib/backtest";

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
  backtest?: BacktestResult | null;
  onHover?: (c: Candle | null) => void;
};

export function TradingChart({ candles, indicators, chartType, backtest, onHover }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !candles.length) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;

      const grid = { color: "rgba(255,255,255,0.06)" };
      const chart = lc.createChart(el, {
        layout: {
          background: { color: "transparent" },
          textColor: "#b2b5be",
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          panes: { separatorColor: "rgba(255,255,255,0.12)" },
        },
        grid: { vertLines: grid, horzLines: grid },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" },
        timeScale: {
          borderColor: "rgba(255,255,255,0.12)",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 6,
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: "#758696", labelBackgroundColor: "#2a2e39" },
          horzLine: { color: "#758696", labelBackgroundColor: "#2a2e39" },
        },
        localization: { locale: "pl-PL" },
        autoSize: true,
      });

      const up = "#26a69a";
      const down = "#ef5350";
      let main:
        | ReturnType<typeof chart.addSeries>
        | ReturnType<typeof chart.addSeries<"Line">>;

      if (chartType === "candles") {
        main = chart.addSeries(lc.CandlestickSeries, {
          upColor: up,
          downColor: down,
          borderUpColor: up,
          borderDownColor: down,
          wickUpColor: up,
          wickDownColor: down,
        });
        main.setData((candles) as any);
      } else if (chartType === "bars") {
        main = chart.addSeries(lc.BarSeries, { upColor: up, downColor: down });
        main.setData((candles) as any);
      } else if (chartType === "area") {
        main = chart.addSeries(lc.AreaSeries, {
          lineColor: "#2962ff",
          topColor: "rgba(41,98,255,0.35)",
          bottomColor: "rgba(41,98,255,0.02)",
          lineWidth: 2,
        });
        main.setData((candles.map((c) => ({ time: c.time, value: c.close }))) as any);
      } else {
        main = chart.addSeries(lc.LineSeries, { color: "#2962ff", lineWidth: 2 });
        main.setData((candles.map((c) => ({ time: c.time, value: c.close }))) as any);
      }

      if (indicators.volume) {
        const vol = chart.addSeries(
          lc.HistogramSeries,
          { priceFormat: { type: "volume" }, priceScaleId: "vol" },
          0,
        );
        vol.setData(
          candles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)",
          })),
        );
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      }

      const addLine = (data: { time: number; value: number }[], color: string, pane = 0, width = 2) => {
        const s = chart.addSeries(
          lc.LineSeries,
          { color, lineWidth: width as 1 | 2 | 3, priceLineVisible: false, lastValueVisible: false },
          pane,
        );
        s.setData((data) as any);
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
        addLine(bands.middle, "rgba(255,255,255,0.45)", 0, 1);
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
        hist.setData((m.histogram) as any);
        addLine(m.macdLine, "#2962ff", pane, 1);
        addLine(m.signalLine, "#ff9800", pane, 1);
        chart.panes()[pane]?.setHeight(120);
        pane++;
      }

      if (backtest?.trades.length) {
        const markers = backtest.trades.flatMap((t) => [
          {
            time: t.entryTime,
            position: "belowBar" as const,
            color: up,
            shape: "arrowUp" as const,
            text: "BUY",
          },
          {
            time: t.exitTime,
            position: "aboveBar" as const,
            color: t.pnlPct >= 0 ? up : down,
            shape: "arrowDown" as const,
            text: `SELL ${t.pnlPct.toFixed(1)}%`,
          },
        ]);
        lc.createSeriesMarkers(main, markers);
      }

      chart.subscribeCrosshairMove((param) => {
        if (!param.time) {
          hoverRef.current?.(null);
          return;
        }
        const found = candles.find((c) => c.time === param.time);
        hoverRef.current?.(found ?? null);
      });

      chart.timeScale().fitContent();
      cleanup = () => chart.remove();
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [candles, indicators, chartType, backtest]);

  return <div ref={containerRef} className="h-full w-full" />;
}
