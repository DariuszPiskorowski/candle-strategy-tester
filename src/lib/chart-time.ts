/** Display exchange timestamps in Dublin without changing candle/strategy times. */
export const CHART_TIME_ZONE = "Europe/Dublin";

type ChartTime = number | string | { year: number; month: number; day: number };

function dateFor(time: ChartTime): Date {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") return new Date(`${time}T00:00:00Z`);
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

export function formatChartTime(time: ChartTime, tickType?: number): string {
  const options: Intl.DateTimeFormatOptions = { timeZone: CHART_TIME_ZONE, hourCycle: "h23" };
  switch (tickType) {
    case 0: options.year = "numeric"; break;
    case 1: options.month = "short"; break;
    case 2: options.day = "2-digit"; options.month = "2-digit"; break;
    case 3: options.hour = "2-digit"; options.minute = "2-digit"; break;
    case 4: options.hour = "2-digit"; options.minute = "2-digit"; options.second = "2-digit"; break;
    default:
      options.day = "2-digit"; options.month = "2-digit"; options.year = "numeric";
      options.hour = "2-digit"; options.minute = "2-digit";
  }
  return new Intl.DateTimeFormat("pl-PL", options).format(dateFor(time));
}