package com.swp391.scms.catalog.cache;

import com.swp391.scms.catalog.PublicCatalogService;
import com.swp391.scms.facilities.repository.MembershipPackageRepository;
import com.swp391.scms.scheduling.dto.ClassBookingCount;
import com.swp391.scms.scheduling.entity.*;
import com.swp391.scms.scheduling.mapper.SchedulingMapper;
import com.swp391.scms.scheduling.repository.*;
import com.swp391.scms.users.CoachRepository;
import java.time.*;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PublicCatalogCacheBoundaryTest {
    private final MembershipPackageRepository packages = mock(MembershipPackageRepository.class);
    private final CoachRepository coaches = mock(CoachRepository.class);
    private final ClassSessionRepository sessions = mock(ClassSessionRepository.class);
    private final ClassEnrollmentRepository enrollments = mock(ClassEnrollmentRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-03T07:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));

    @Test void warmCacheRemovesTwoCatalogQueriesPerRequestButSessionSeatsStayLive() {
        PublicCatalogCache cache = new PublicCatalogCache() {
            private Snapshot cached;
            public Snapshot getOrLoad(Supplier<Snapshot> loader) { if (cached == null) cached = loader.get(); return cached; }
            public void invalidate() { cached = null; }
        };
        var gymClass = new GymClass(); gymClass.setId(10L); gymClass.setCapacity(20);
        var session = new ClassSession(); session.setId(11L); session.setGymClass(gymClass);
        when(sessions.findPublicSessions(any(), any(), any())).thenReturn(List.of(session));
        when(enrollments.countByClassIdsAndStatus(List.of(10L), "booked"))
                .thenReturn(List.of(new ClassBookingCount(10L, 2L)), List.of(new ClassBookingCount(10L, 7L)));
        var reservations = mock(SessionBookingRepository.class);
        when(reservations.countBookedBySessionIds(List.of(11L)))
                .thenReturn(List.of(new com.swp391.scms.scheduling.dto.SessionBookingCount(11L, 1L)),
                        List.of(new com.swp391.scms.scheduling.dto.SessionBookingCount(11L, 6L)));
        var service = new PublicCatalogService(packages, coaches, sessions, enrollments, new SchedulingMapper(), clock, cache, reservations);
        assertThat(service.getCatalog().sessions().getFirst().bookedCount()).isEqualTo(3L);
        assertThat(service.getCatalog().sessions().getFirst().bookedCount()).isEqualTo(13L);
        verify(reservations, times(2)).countBookedBySessionIds(List.of(11L));
        verify(packages, times(1)).findByStatusOrderByPriceAsc("active");
        verify(coaches, times(1)).findPublicCoaches();
        verify(sessions, times(2)).findPublicSessions(any(), any(), any());
    }

    @Test void uncommittedWriteTransactionCannotFillSharedCache() {
        var cache = mock(PublicCatalogCache.class);
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
        try {
            new PublicCatalogService(packages, coaches, sessions, enrollments, new SchedulingMapper(), clock, cache).getCatalog();
            verifyNoInteractions(cache);
            verify(packages).findByStatusOrderByPriceAsc("active");
        } finally { TransactionSynchronizationManager.clear(); }
    }
}
