export type EntryBlocker = 'disabled' | 'ha4h' | 'dailyHa' | 'range' | 'afterStop' | 'quantity';
export type EntrySideState = {
  enabled: boolean;
  ha4h: boolean;
  dailyHa: boolean;
  range: boolean;
  afterStop: boolean;
  quantity: number;
};
export type EntrySignal = {
  signal: 'BUY' | 'SELL' | 'CZEKAJ';
  common: ('noData' | 'outsideWindow' | 'accountBusy')[];
  buy: EntryBlocker[];
  sell: EntryBlocker[];
};

/** Read-only entry assessment; never submits or changes orders. */
export function entrySignal(buy: EntrySideState, sell: EntrySideState, context: {
  hasData: boolean; inWindow: boolean; accountBusy: boolean;
}): EntrySignal {
  const blockers = (side: EntrySideState): EntryBlocker[] => {
    if (!side.enabled) return ['disabled'];
    return [
      ...(!side.ha4h ? ['ha4h' as const] : []),
      ...(!side.dailyHa ? ['dailyHa' as const] : []),
      ...(side.range ? ['range' as const] : []),
      ...(side.afterStop ? ['afterStop' as const] : []),
      ...(!(side.quantity > 0) ? ['quantity' as const] : []),
    ];
  };
  const common: EntrySignal['common'] = [
    ...(!context.hasData ? ['noData' as const] : []),
    ...(!context.inWindow ? ['outsideWindow' as const] : []),
    ...(context.accountBusy ? ['accountBusy' as const] : []),
  ];
  const long = blockers(buy), short = blockers(sell);
  return { signal: common.length ? 'CZEKAJ' : !long.length ? 'BUY' : !short.length ? 'SELL' : 'CZEKAJ', common, buy: long, sell: short };
}