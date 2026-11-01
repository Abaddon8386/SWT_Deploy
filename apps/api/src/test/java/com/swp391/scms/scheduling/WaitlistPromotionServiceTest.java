package com.swp391.scms.scheduling;

import com.swp391.scms.scheduling.repository.ClassWaitlistRepository;
import com.swp391.scms.scheduling.scheduler.WaitlistPromotionScheduler;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.scheduling.service.WaitlistPromotionService;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import java.time.*;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class WaitlistPromotionServiceTest {
    private final ClassWaitlistRepository repository = mock(ClassWaitlistRepository.class);
    private final EnrollmentService enrollments = mock(EnrollmentService.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-01T03:00:00Z"), ZoneOffset.UTC);
    private final WaitlistPromotionService service = new WaitlistPromotionService(repository, enrollments, clock);

    @Test
    void discoveryDelegatesEachClassToTransactionalServiceWithoutLoadingEntities() {
        when(repository.findExpiredClassIds(eq(0L), any(), any(), any())).thenReturn(List.of(1L, 2L));
        when(enrollments.processExpiredWaitlistReservations(eq(1L), any())).thenReturn(2);
        when(enrollments.processExpiredWaitlistReservations(eq(2L), any())).thenReturn(0);
        assertEquals(2, service.processExpiredWaitlists());
        var order = inOrder(enrollments);
        order.verify(enrollments).processExpiredWaitlistReservations(eq(1L), any());
        order.verify(enrollments).processExpiredWaitlistReservations(eq(2L), any());
        verifyNoMoreInteractions(enrollments);
    }

    @Test
    void keysetPagingDoesNotSkipClassesAsEarlierOffersDisappear() {
        List<Long> first = java.util.stream.LongStream.rangeClosed(1, 50).boxed().toList();
        when(repository.findExpiredClassIds(eq(0L), any(), any(), any(Pageable.class))).thenReturn(first);
        when(repository.findExpiredClassIds(eq(50L), any(), any(), any(Pageable.class))).thenReturn(List.of(51L));
        service.processExpiredWaitlists();
        verify(enrollments, times(51)).processExpiredWaitlistReservations(anyLong(), any());
        verify(repository, times(2)).findExpiredClassIds(anyLong(), any(), any(), any());
    }

    @Test
    void emptyJobAndSchedulerDoNotMutateAnything() {
        when(repository.findExpiredClassIds(anyLong(), any(), any(), any())).thenReturn(List.of());
        assertEquals(0, service.processExpiredWaitlists());
        new WaitlistPromotionScheduler(service).scheduleWaitlistPromotion();
        verifyNoInteractions(enrollments);
    }

    @Test
    void explicitPromotionUsesSameCapacityAndLockProtocol() {
        LocalDateTime now = LocalDateTime.now(clock);
        when(enrollments.promoteNextWaitlistEntry(5L, now)).thenReturn(1);
        assertEquals(1, service.promoteNextCandidate(5L, now));
        verify(enrollments).promoteNextWaitlistEntry(5L, now);
        verifyNoInteractions(repository);
    }
}
