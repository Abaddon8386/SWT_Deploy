package com.swp391.scms.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.swp391.scms.common.exception.BadRequestException;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class RecurrenceDatesTest {

    final LocalDate monday = LocalDate.of(2026, 11, 2);

    @Test void weekKeepsOnlyChosenWeekdaysWithinSevenDays() {
        assertEquals(List.of(monday, monday.plusDays(2), monday.plusDays(4)),
                RecurrenceDates.expand(monday, "week", List.of(5, 1, 3)));
    }

    @Test void defaultsToWeekdayOfStartDate() {
        assertEquals(List.of(monday), RecurrenceDates.expand(monday, "WEEK", null));
        assertEquals(List.of(monday, monday.plusDays(7), monday.plusDays(14), monday.plusDays(21), monday.plusDays(28)),
                RecurrenceDates.expand(monday, "month", List.of()));
    }

    @Test void monthSpansOneCalendarMonthIncludingShortMonths() {
        List<LocalDate> dates = RecurrenceDates.expand(LocalDate.of(2027, 1, 31), "month", List.of(1, 2, 3, 4, 5, 6, 7));
        assertEquals(LocalDate.of(2027, 1, 31), dates.get(0));
        assertEquals(LocalDate.of(2027, 2, 27), dates.get(dates.size() - 1));
    }

    @Test void everyWeekdayAppearsOnceInAWeekWhateverTheStartDay() {
        for (int offset = 0; offset < 7; offset++) {
            assertEquals(7, RecurrenceDates.expand(monday.plusDays(offset), "week", List.of(1, 2, 3, 4, 5, 6, 7)).size());
            assertEquals(1, RecurrenceDates.expand(monday.plusDays(offset), "week", List.of(4)).size());
        }
    }

    @Test void rejectsBadInput() {
        assertThrows(BadRequestException.class, () -> RecurrenceDates.expand(null, "week", null));
        assertThrows(BadRequestException.class, () -> RecurrenceDates.expand(monday, "year", null));
        assertThrows(BadRequestException.class, () -> RecurrenceDates.expand(monday, null, null));
        assertThrows(BadRequestException.class, () -> RecurrenceDates.expand(monday, "week", List.of(0)));
        assertThrows(BadRequestException.class, () -> RecurrenceDates.expand(monday, "week", List.of(8)));
    }
}
