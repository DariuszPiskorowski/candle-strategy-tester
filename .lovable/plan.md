# Edytowalne kolory strategii

## Cel
Na końcu zakładki „Parametry” dodać sekcję „Kolory”, która pokazuje próbkę każdego koloru używanego przez obsługiwaną strategię i pozwala zmienić go selektorem koloru.

## Zakres
- Odczytać z wgranego kodu kolory linii `plot(...)`, w tym zapis szesnastkowy (`#0496ff`), standardowe kolory Pine (`color.green`, `color.red`, `color.orange`, `color.black`) oraz kolory przypisane przez zmienne.
- Dla linii o kolorze zależnym od warunku pokazać osobne ustawienia wariantu wzrostowego i spadkowego, np. HMA zielony/czerwony.
- Użyć odczytanych kolorów jako domyślnych zamiast obecnych kolorów wpisanych na stałe.
- Dodać na dole „Parametrów” wiersze z nazwą elementu, kolorowym kwadratem i polem wyboru koloru; zmiana ma od razu aktualizować wykres bez wpływu na wyniki symulacji.
- Po wgraniu kolejnej strategii zresetować paletę do kolorów z tego pliku.
- Zachować bezpieczne kolory domyślne, gdy dany zapis Pine nie może zostać jednoznacznie odczytany.

## Szczegóły techniczne
- Rozszerzyć parser strategii o osobny model ustawień kolorów, niezależny od parametrów obliczeniowych `input.*`.
- Przekazać paletę do symulatora, aby generowane linie wykresu korzystały z wybranych wartości.
- Nie dodawać kolorów do raportu PDF, ponieważ prośba dotyczy ustawień wyglądu wykresu.
- Sprawdzić pliki z kolorami bezpośrednimi i warunkowymi oraz zweryfikować zmianę `#0496ff` na żywym wykresie.
