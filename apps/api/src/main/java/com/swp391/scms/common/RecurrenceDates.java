package com.swp391.scms.common;

import com.swp391.scms.common.exception.BadRequestException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.TreeSet;

/**
 * Expands a weekly or monthly standing booking into concrete dates. "week" covers seven days from the start
 * date, "month" covers one calendar month from the start date; only the chosen ISO weekdays (1 = Monday ... 7 = Sunday)
 * are kept, defaulting to the weekday of the start date.
 */
public final class RecurrenceDates {

    public static final String WEEK = "week";
    public static final String MONTH = "month";

    /** An occurrence that could not be booked, with the API error code and a localised reason. */
    public record Skipped(LocalDate date, String code, String message) {}

    private RecurrenceDates() {}

    public static List<LocalDate> expand(LocalDate start, String period, Collection<Integer> isoDays) {
        if (start == null) {
            throw new BadRequestException("RECURRING_INVALID_START", "error.recurring.invalid_start", null, null);
        }
        String normalized = period == null ? "" : period.trim().toLowerCase(Locale.ROOT);
        LocalDate end;
        if (WEEK.equals(normalized)) {
            end = start.plusDays(6);
        } else if (MONTH.equals(normalized)) {
            end = start.plusMonths(1).minusDays(1);
        } else {
            throw new BadRequestException("RECURRING_INVALID_PERIOD", "error.recurring.invalid_period", null, null);
        }
        TreeSet<Integer> days = new TreeSet<>();
        if (isoDays == null || isoDays.isEmpty()) {
            days.add(start.getDayOfWeek().getValue());
        } else {
            for (Integer day : isoDays) {
                if (day == null || day < 1 || day > 7) {
                    throw new BadRequestException("RECURRING_INVALID_DAYS", "error.recurring.invalid_days", null, null);
                }
                days.add(day);
            }
        }
        List<LocalDate> dates = new ArrayList<>();
        for (LocalDate date = start; !date.isAfter(end); date = date.plusDays(1)) {
            if (days.contains(date.getDayOfWeek().getValue())) {
                dates.add(date);
            }
        }
        return dates;
    }
}
