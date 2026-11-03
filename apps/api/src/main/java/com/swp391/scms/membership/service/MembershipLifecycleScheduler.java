package com.swp391.scms.membership.service;

import com.swp391.scms.common.i18n.MessageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Daily membership housekeeping. Each item runs in its own transaction through the service proxies, so one
 * failure is logged and the rest still run.
 * <ul>
 *   <li>Holds that reached {@link MembershipSubscriptionService#MAX_HOLD_DAYS} resume on their own.</li>
 *   <li>Classes, 1:1 sessions and courts booked for dates no active membership covers any more (it expired or
 *   was not renewed) are released so the seat or slot goes to someone else.</li>
 * </ul>
 */
@Component
public class MembershipLifecycleScheduler {

    private static final Logger log = LoggerFactory.getLogger(MembershipLifecycleScheduler.class);

    private final MembershipSubscriptionService subscriptions;
    private final EntitlementRevocationService revocation;
    private final MessageService messages;

    public MembershipLifecycleScheduler(MembershipSubscriptionService subscriptions,
                                        EntitlementRevocationService revocation,
                                        MessageService messages) {
        this.subscriptions = subscriptions;
        this.revocation = revocation;
        this.messages = messages;
    }

    @Scheduled(cron = "${app.membership.lifecycle.cron:0 15 0 * * ?}")
    public void runDaily() {
        int resumed = resumeExpiredHolds();
        int released = releaseUncoveredBookings();
        log.info("[MembershipLifecycle] resumed {} hold(s), released {} booking(s)", resumed, released);
    }

    public int resumeExpiredHolds() {
        int resumed = 0;
        for (Long id : subscriptions.findHoldsDueForResume()) {
            try {
                if (subscriptions.autoResumeHold(id)) resumed++;
            } catch (RuntimeException ex) {
                log.warn("[MembershipLifecycle] could not resume hold on subscription {}", id, ex);
            }
        }
        return resumed;
    }

    public int releaseUncoveredBookings() {
        String reason = messages != null ? messages.getMessage("scheduling.enrollment.cancelled_by_expiry") : null;
        int released = 0;
        for (Long memberId : revocation.membersWithUpcomingBookings()) {
            try {
                released += revocation.revokeUncoveredBookings(memberId, reason);
            } catch (RuntimeException ex) {
                log.warn("[MembershipLifecycle] could not release bookings of member {}", memberId, ex);
            }
        }
        return released;
    }
}
