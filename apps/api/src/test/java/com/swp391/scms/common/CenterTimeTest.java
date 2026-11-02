package com.swp391.scms.common;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.swp391.scms.config.WebConfig;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class CenterTimeTest {
    @Test
    void applicationClockRunsInTheCenterTimezone() {
        var clock = new WebConfig("http://localhost:5173").clock();

        assertEquals(CenterTime.ZONE, clock.getZone());
        var utcHour = java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC).getHour();
        assertEquals((utcHour + 7) % 24, LocalDateTime.now(clock).getHour());
    }

    @Test
    void defaultTimezoneFollowsTheCenter() {
        var previous = java.util.TimeZone.getDefault();
        try {
            CenterTime.useAsDefault();
            assertEquals(CenterTime.ZONE.getId(), java.util.TimeZone.getDefault().getID());
        } finally {
            java.util.TimeZone.setDefault(previous);
        }
    }
}
