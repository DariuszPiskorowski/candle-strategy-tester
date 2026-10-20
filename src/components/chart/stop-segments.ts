type StopPoint = { time: number; value?: number };

// A separate series for each uninterrupted, unchanged active stop.
// Whitespace in lightweight-charts alone does not break a line.
export function stopSegments(data: StopPoint[], entryTimes: number[] = []): { time: number; value: number }[][] {
  const entries = new Set(entryTimes);
  const segments: { time: number; value: number }[][] = [];
  let current: { time: number; value: number }[] | undefined;
  for (const point of data) {
    if (point.value === undefined || !Number.isFinite(point.value)) {
      current = undefined;
      continue;
    }
    if (!current || current[0].value !== point.value || entries.has(point.time)) {
      current = [];
      segments.push(current);
    }
    current.push({ time: point.time, value: point.value });
  }
  return segments;
}