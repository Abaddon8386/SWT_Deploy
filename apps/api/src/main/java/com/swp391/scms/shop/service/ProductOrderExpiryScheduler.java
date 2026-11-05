package com.swp391.scms.shop.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Periodically releases stock held by product orders that were never paid within their window. */
@Component
public class ProductOrderExpiryScheduler {
    private static final Logger log = LoggerFactory.getLogger(ProductOrderExpiryScheduler.class);
    private final ProductOrderService service;

    public ProductOrderExpiryScheduler(ProductOrderService service) {
        this.service = service;
    }

    @Scheduled(fixedDelayString = "${app.shop.expiry-interval-ms:60000}", initialDelayString = "${app.shop.expiry-interval-ms:60000}")
    public void releaseUnpaid() {
        try {
            int released = service.expireUnpaid();
            if (released > 0) {
                log.info("Released {} unpaid product order(s)", released);
            }
        } catch (RuntimeException e) {
            log.warn("Could not release unpaid product orders", e);
        }
    }
}
