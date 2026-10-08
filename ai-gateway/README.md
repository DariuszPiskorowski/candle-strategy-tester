# ai-gateway — instrukcja dla zewnętrznego AI

1. Edytuj tylko `config.json` (nie ruszaj `src/lib/strategy/jarvis.ts` ani skryptu).
2. Uruchom: `node --experimental-strip-types scripts/tune-sui.mjs ai-gateway/config.json`
3. Odczytaj `ai-gateway/results.json`.

Pola `config.json`:
- `mode`: `evaluate` = przelicz podane ustawienia; `tune` = samodzielnie szukaj lepszych.
- `dataDir`, `strategyFile`, `candleFiles`: pliki (świece wcześniejsze niż `testStart` służą tylko do rozgrzewki, np. 6 mies. danych na 4 mies. testu).
- `testStart` / `testEnd`: okres handlu (RRRR-MM-DD, UTC).
- `validationStart`: opcjonalnie; od tej daty do `testEnd` jest okres sprawdzenia, którego tuning nie widzi.
- `params`: nadpisania wartości z pliku Pine (nazwy jak zmienne w Pine).
- `objective.maxDrawdownPct`: limit obsunięcia.
- `tune.parameters`: lista `{name, step, min, max}` do przeszukania.

`results.json`: `best.params`, `best.stats`, `changedParams`, `validation`, `months`, `trades`, `trials`.
Parametry ryzyka (Risk per trade, Max position, exposure, reserve) i przesunięcie linii nie wpływają na wynik — nie tuninguj ich.
