package com.swp391.scms.scheduling.service;

import com.swp391.scms.scheduling.repository.ClassWaitlistRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

/** Discovery does not load entities or retain locks; each class commits through EnrollmentService. */
@Service
public class WaitlistPromotionService {
    private static final int CHUNK_SIZE = 50;
    private final ClassWaitlistRepository waitlists;
    private final EnrollmentService enrollments;
    private final Clock clock;

    public WaitlistPromotionService(ClassWaitlistRepository waitlists, EnrollmentService enrollments, Clock clock) {
        this.waitlists = waitlists;
        this.enrollments = enrollments;
        this.clock = clock;
    }

    public int processExpiredWaitlists() {
        LocalDateTime now = LocalDateTime.now(clock);
        long afterId = 0;
        int totalExpired = 0;
        while (true) {
            List<Long> classIds = waitlists.findExpiredClassIds(afterId, now,
                    now.minusHours(EnrollmentService.WAITLIST_RESERVATION_HOURS), PageRequest.of(0, CHUNK_SIZE));
            if (classIds.isEmpty()) break;
            for (Long classId : classIds) {
                // External proxied call: one class per transaction, no waitlist-row -> class lock inversion.
                totalExpired += enrollments.processExpiredWaitlistReservations(classId, now);
            }
            afterId = classIds.getLast();
            if (classIds.size() < CHUNK_SIZE) break;
        }
        return totalExpired;
    }

    public int promoteNextCandidate(Long classId, LocalDateTime now) {
        return enrollments.promoteNextWaitlistEntry(classId, now);
    }
}
