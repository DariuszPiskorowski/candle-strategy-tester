# ai-gateway — instrukcja dla zewnętrznego AI

1. Edytuj tylko `config.json` (nie ruszaj `src/lib/strategy/jarvis.ts` ani skryptu).
2. Uruchom: `node --experimental-strip-types scripts/tune-sui.mjs ai-gateway/config.json`
3. Odczytaj `ai-gateway/results.json`.

Pola `config.json`:
- `mode`: `evaluate` = przelicz podane ustawienia; `tune` = samodzielnie szukaj lepszych.
- `strategy`: id strategii (folder `src/strategies/<id>/`); `null` = aktywna z `src/strategies/active.json`.
- `saveBest`: `true` (domyślnie) = lepsze znalezione ustawienia zapisują się w `src/strategies/<id>/params.txt`; aplikacja czyta je przy ponownym uruchomieniu.
- `dataDir`, `candleFiles`: pliki (świece wcześniejsze niż `testStart` służą tylko do rozgrzewki, np. 6 mies. danych na 4 mies. testu).
- `testStart` / `testEnd`: okres handlu (RRRR-MM-DD, UTC). `testStart: null` = 4 miesiące wstecz od teraz, `testEnd: null` = bieżąca data i godzina (domyślnie oba null — strategia handluje przez ostatnie 4 miesiące, a wcześniejsze świece tylko rozgrzewają wskaźniki).
- `validationStart`: opcjonalnie; od tej daty do `testEnd` jest okres sprawdzenia, którego tuning nie widzi.
- `params`: nadpisania wartości z pliku Pine (nazwy jak zmienne w Pine).
- `objective.maxDrawdownPct`: limit obsunięcia.
- `tune.parameters`: lista do przeszukania. Parametry liczbowe: `{name, step, min, max}`. Parametry włącz/wyłącz (bool): `{name, "bool": true}` — skrypt sprawdzi obie wartości.
- `tune.search: "broad"`: losuje całe zestawy parametrów (powtarzalny `seed`, liczba `randomTests`), następnie przeszukuje pełne zakresy pojedynczych parametrów. `maxTests` to twardy limit unikalnych ocen; `maxPasses` ogranicza liczbę przejść. To szukanie lepszego wyniku historycznego, nie gwarancja optimum ani przyszłego zysku. Kierunek BUY/SELL i wyższy interwał pozostają bez zmian.

Dostępne parametry (nazwy jak w pliku Pine): `hmaLength`, `conversionPeriod`, `basePeriod`, `laggingSpanPeriod`, `displacement`, `macdFastLength`, `macdSlowLength`, `macdSignalLength`, `swingLookback`, `swingBuffer`, `useSidewaysFilter` (bool), `sidewaysLookback`, `sidewaysMaxRangePct`, `sidewaysMaxAvgBodyPct`. Wszystkie są już wpisane w `config.json` — wystarczy zmieniać zakresy/kroki albo usuwać pozycje z listy.

`results.json`: `best.params`, `best.stats`, `changedParams`, `validation`, `months`, `trades`, `trials`.
Parametry ryzyka (Risk per trade, Max position, exposure, reserve) nie wpływają na wynik — nie tuninguj ich.

## Świeże dane z Binance
`node scripts/fetch-binance.mjs SUIUSDC 4h 6` — pobiera 6 miesięcy świec spot do `data/SUIUSDC_4h.json`.
Wpisz tę nazwę w `candleFiles` w `config.json` (pary: SUIUSDC, SOLUSDC, BNBUSDC; interwały np. 1h, 4h).

## Nowa strategia
Silnik `sol-ha4` obsługuje SOL HA-4H z załączonej strategii: tylko kupno spot i sprzedaż posiadanych SOL (bez shortów), sygnały na zamknięciu, wykonanie na kolejnym otwarciu, ATR SL w trakcie świecy i ponowne wejście dopiero po czerwonym HA po stopie. Domyślne parametry znajdują się w jego `strategy.txt` i `params.txt`. Okres testu ustawia wspólny zakres aplikacji/config (domyślnie ostatnie cztery miesiące), nie daty `input.time` zapisane w źródle. Świece wcześniejsze rozgrzewają wskaźniki; ticki i wysyłanie alertów nie są zaimplementowane. `alertHold` jest zachowane w oryginale, ale nie uruchamia powiadomień w testerze.

Obecny config strojenia wskazuje jawnie `jarvis`, żeby wcześniejsze zakresy parametrów nie trafiły do nowej aktywnej strategii. Aby przeliczyć HA-4H, ustaw `strategy: "sol-ha4"`, `mode: "evaluate"`; do strojenia najpierw zastąp `tune.parameters` nazwami z nowego pliku. Nie uruchamiać strojenia automatycznie.

1. Utwórz folder `src/strategies/<id>/` z `strategy.txt` (kod strategii) i `engine.ts` (silnik zgodny z `src/strategies/types.ts`).
2. Dopisz silnik w `src/strategies/registry.ts`.
3. Ustaw `"active": "<id>"` w `src/strategies/active.json` (powrót do starej = wpisanie starego id).
Tuning, config i results działają bez zmian.
