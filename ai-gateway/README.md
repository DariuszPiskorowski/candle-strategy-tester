# ai-gateway — instrukcja dla zewnętrznego AI

1. Edytuj tylko `config.json` (nie ruszaj `src/lib/strategy/jarvis.ts` ani skryptu).
2. Uruchom: `node --experimental-strip-types scripts/tune-sui.mjs ai-gateway/config.json`
3. Odczytaj `ai-gateway/results.json`.

Pola `config.json`:
- `mode`: `evaluate` = przelicz podane ustawienia; `tune` = samodzielnie szukaj lepszych.
- `strategy`: id strategii (folder `src/strategies/<id>/`); `null` = aktywna z `src/strategies/active.json`.
- `saveBest`: `true` (domyślnie) = po tuningu najlepsze znalezione ustawienia zapisują się jako domyślne w `src/strategies/<id>/strategy.txt` — aplikacja od razu pokazuje je na wykresie.
- `dataDir`, `candleFiles`: pliki (świece wcześniejsze niż `testStart` służą tylko do rozgrzewki, np. 6 mies. danych na 4 mies. testu).
- `testStart` / `testEnd`: okres handlu (RRRR-MM-DD, UTC). `testStart: null` = 4 miesiące wstecz od teraz, `testEnd: null` = bieżąca data i godzina (domyślnie oba null — strategia handluje przez ostatnie 4 miesiące, a wcześniejsze świece tylko rozgrzewają wskaźniki).
- `validationStart`: opcjonalnie; od tej daty do `testEnd` jest okres sprawdzenia, którego tuning nie widzi.
- `params`: nadpisania wartości z pliku Pine (nazwy jak zmienne w Pine).
- `objective.maxDrawdownPct`: limit obsunięcia.
- `tune.parameters`: lista do przeszukania. Parametry liczbowe: `{name, step, min, max}`. Parametry włącz/wyłącz (bool): `{name, "bool": true}` — skrypt sprawdzi obie wartości.

Dostępne parametry (nazwy jak w pliku Pine): `hmaLength`, `conversionPeriod`, `basePeriod`, `laggingSpanPeriod`, `displacement`, `macdFastLength`, `macdSlowLength`, `macdSignalLength`, `swingLookback`, `swingBuffer`, `useSidewaysFilter` (bool), `sidewaysLookback`, `sidewaysMaxRangePct`, `sidewaysMaxAvgBodyPct`. Wszystkie są już wpisane w `config.json` — wystarczy zmieniać zakresy/kroki albo usuwać pozycje z listy.

`results.json`: `best.params`, `best.stats`, `changedParams`, `validation`, `months`, `trades`, `trials`.
Parametry ryzyka (Risk per trade, Max position, exposure, reserve) nie wpływają na wynik — nie tuninguj ich.

## Świeże dane z Binance
`node scripts/fetch-binance.mjs SUIUSDC 4h 6` — pobiera 6 miesięcy świec spot do `data/SUIUSDC_4h.json`.
Wpisz tę nazwę w `candleFiles` w `config.json` (pary: SUIUSDC, SOLUSDC, BNBUSDC; interwały np. 1h, 4h).

## Nowa strategia
1. Utwórz folder `src/strategies/<id>/` z `strategy.txt` (kod strategii) i `engine.ts` (silnik zgodny z `src/strategies/types.ts`).
2. Dopisz silnik w `src/strategies/registry.ts`.
3. Ustaw `"active": "<id>"` w `src/strategies/active.json` (powrót do starej = wpisanie starego id).
Tuning, config i results działają bez zmian.
