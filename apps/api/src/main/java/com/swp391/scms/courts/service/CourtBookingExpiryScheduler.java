package com.swp391.scms.courts.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Periodically frees court slots held by bookings that were never paid. */
@Component
public class CourtBookingExpiryScheduler {
    private static final Logger log = LoggerFactory.getLogger(CourtBookingExpiryScheduler.class);
    private final CourtBookingService service;

    public CourtBookingExpiryScheduler(CourtBookingService service) { this.service = service; }

    @Scheduled(fixedDelayString = "${app.courts.expiry-interval-ms:60000}", initialDelayString = "${app.courts.expiry-interval-ms:60000}")
    public void releaseUnpaid() {
        try {
            int released = service.expireUnpaid();
            if (released > 0) log.info("Released {} unpaid court booking(s)", released);
        } catch (RuntimeException e) {
            log.warn("Could not release unpaid court bookings", e);
        }
    }
}
