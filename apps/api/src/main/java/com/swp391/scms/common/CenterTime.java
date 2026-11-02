package com.swp391.scms.common;

import java.time.ZoneId;
import java.util.TimeZone;

/** The center's single business timezone: every wall-clock value the API stores or compares uses it. */
public final class CenterTime {
    public static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private CenterTime() {}

    /** Makes `LocalDateTime.now()` and `Clock.systemDefaultZone()` agree with {@link #ZONE}, whatever the host's timezone. */
    public static void useAsDefault() {
        TimeZone.setDefault(TimeZone.getTimeZone(ZONE));
    }
}
