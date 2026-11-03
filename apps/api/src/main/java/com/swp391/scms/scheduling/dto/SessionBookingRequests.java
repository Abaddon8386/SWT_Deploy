package com.swp391.scms.scheduling.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Request payloads for per-session booking, including the bulk (week / month / hand-picked) option. */
public final class SessionBookingRequests {

    private SessionBookingRequests() {
    }

    public static final int MAX_BULK = 62;

    /** Sessions to book in one go; the client resolves "whole week" or "whole month" into concrete session ids. */
    public record BulkBookRequest(
            @NotEmpty(message = "{validation.scheduling.bulk.empty}")
            @Size(max = MAX_BULK, message = "{validation.scheduling.bulk.too_many}")
            List<Long> sessionIds) {
    }

    public record BulkCancelRequest(
            @NotEmpty(message = "{validation.scheduling.bulk.empty}")
            @Size(max = MAX_BULK, message = "{validation.scheduling.bulk.too_many}")
            List<Long> bookingIds) {
    }
}
