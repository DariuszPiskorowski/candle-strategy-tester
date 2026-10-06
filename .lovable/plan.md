# Przełącznik jasnego i ciemnego motywu

## Zakres
- Dodać ikonę słońca/księżyca w górnym pasku do natychmiastowej zmiany motywu.
- Zapamiętać wybór w tej przeglądarce; przy pierwszej wizycie zachować obecny ciemny wygląd.
- Dodać pełny jasny zestaw kolorów dla paneli, pól i tekstu.
- Dopasować kolory tła, siatki, osi i kursora wykresu do wybranego motywu.

## Szczegóły techniczne
- Motyw będzie sterowany klasą dokumentu i przekazywany do wykresu, aby wykres odświeżał własne kolory.
- Ustawienie zostanie odczytane dopiero po uruchomieniu strony, aby uniknąć niespójnego pierwszego renderowania.
- Przy okazji zostanie poprawiony istniejący błąd typów w opcjonalnym zakresie testu oraz komplet metadanych strony.

## Weryfikacja
- Sprawdzić przełączenie obu motywów, ponowne wczytanie strony i wygląd wykresu.
- Potwierdzić brak błędów kompilacji i działania strony.
