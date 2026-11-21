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
- `params`: nadpisania wartości z pliku strategii (nazwy zmiennych z pliku).
- `objective.maxDrawdownPct`: limit obsunięcia.
- `tune.parameters`: lista do przeszukania. Parametry liczbowe: `{name, step, min, max}`. Parametry włącz/wyłącz (bool): `{name, "bool": true}` — skrypt sprawdzi obie wartości.
- `tune.search: "broad"`: losuje całe zestawy parametrów (powtarzalny `seed`, liczba `randomTests`), następnie przeszukuje pełne zakresy pojedynczych parametrów. `maxTests` to twardy limit unikalnych ocen; `maxPasses` ogranicza liczbę przejść. To szukanie lepszego wyniku historycznego, nie gwarancja optimum ani przyszłego zysku. Kierunek BUY/SELL i wyższy interwał pozostają bez zmian.

Dostępne parametry (nazwy jak w pliku strategii): `hmaLength`, `conversionPeriod`, `basePeriod`, `laggingSpanPeriod`, `displacement`, `macdFastLength`, `macdSlowLength`, `macdSignalLength`, `swingLookback`, `swingBuffer`, `useSidewaysFilter` (bool), `sidewaysLookback`, `sidewaysMaxRangePct`, `sidewaysMaxAvgBodyPct`. Wszystkie są już wpisane w `config.json` — wystarczy zmieniać zakresy/kroki albo usuwać pozycje z listy.

`results.json`: `best.params`, `best.stats`, `changedParams`, `validation`, `months`, `trades`, `trials`.
Parametry ryzyka (Risk per trade, Max position, exposure, reserve) nie wpływają na wynik — nie tuninguj ich.

## Świeże dane z Binance
`node scripts/fetch-binance.mjs SUIUSDC 4h 6` — pobiera 6 miesięcy świec spot do `data/SUIUSDC_4h.json`.
Wpisz tę nazwę w `candleFiles` w `config.json` (pary: SUIUSDC, SOLUSDC, BNBUSDC; interwały np. 1h, 4h).

## Nowa strategia
Silnik `sol-ha4` obsługuje SOL HA-4H z załączonej strategii: tylko kupno spot i sprzedaż posiadanych SOL (bez shortów), sygnały na zamknięciu, wykonanie na kolejnym otwarciu, ATR SL w trakcie świecy i ponowne wejście dopiero po czerwonym HA po stopie. Domyślne parametry znajdują się w jego `strategy.txt` i `params.txt`. Okres testu ustawia wspólny zakres aplikacji/config (domyślnie ostatnie cztery miesiące), nie daty `input.time` zapisane w źródle. Świece wcześniejsze rozgrzewają wskaźniki; ticki i wysyłanie alertów nie są zaimplementowane. `alertHold` jest zachowane w oryginale, ale nie uruchamia powiadomień w testerze.

Obecny config wskazuje `sol-ha4-ls` i `mode: "evaluate"`, z danymi `HL_SOL_4h.json`. Lista strojenia jest pusta, aby stare parametry Jarvisa nie trafiły do nowej strategii. Strojenie tylko na żądanie po 3 stratach z rzędu; najpierw skonfiguruj zakresy zmiennych tej strategii.

1. Utwórz folder `src/strategies/<id>/` z `strategy.txt` (kod strategii) i `engine.ts` (silnik zgodny z `src/strategies/types.ts`).
2. Dopisz silnik w `src/strategies/registry.ts`.
3. Ustaw `"active": "<id>"` w `src/strategies/active.json` (powrót do starej = wpisanie starego id).
Tuning, config i results działają bez zmian.

## Hyperliquid SOL BUY + SELL
`bun scripts/fetch-hyperliquid.mjs 4h` pobiera sześć miesięcy danych SOL perpetual do `data/HL_SOL_4h.json`, bez strojenia. Aplikacja używa tego samego adaptera i odświeża bieżące świece co 15 sekund. Historyczne dane to świece, nie ticki; krótkie interwały bez pełnego pokrycia są odrzucane.

Silnik `sol-ha4-ls` zachowuje nowy plik: jedno konto USDC, niezależne HA i stany detektora BUY/SELL, dźwignia giełdowa 2×, ekspozycja po obu stronach 1,5×, ilość obliczana na zamknięciu i zaokrąglana w dół do 0,1 SOL, wykonanie na następnym otwarciu, osobne SL. Brak odwracania pozycji na zamknięciu generującym wyjście. Zlecenie niespełniające depozytu przy cenie wykonania (z prowizją) jest odrzucane. `margin_long/short = 25` ze źródła nie są modelem giełdowej likwidacji.

Model depozytu: cross, całe saldo USDC zabezpiecza jedną pozycję. P/L jest rozliczany w USDC, bez fikcyjnego salda spot SOL. Funding pominięty zgodnie z plikiem. SL i likwidacja używają OHLC transakcji, **nie historycznego mark price**; ceny, obsunięcie i likwidacje są przybliżeniem, bez poślizgu i backstop liquidation. Szacunek utrzymania używa aktualnych progów SOL: 2,5% do 70 mln USDC, następnie 5% z odliczeniem 1,75 mln. Historyczne progi nie są dostępne. Nie wysyła zleceń ani alertów do giełdy.
