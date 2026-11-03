package com.swp391.scms.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.withSettings;

import com.swp391.scms.scheduling.repository.SessionBookingRepository;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class SessionBookingRepositoryBoundsTest {

    @Test
    @DisplayName("findForMember thay mốc ngày null bằng mốc mở để PostgreSQL suy được kiểu tham số")
    void findForMember_nullBoundsBecomeSentinelDates() {
        SessionBookingRepository repo = mock(SessionBookingRepository.class, withSettings().defaultAnswer(Mockito.CALLS_REAL_METHODS));
        doReturn(List.of()).when(repo).findForMemberBetween(any(), any(), any(), any());

        assertThat(repo.findForMember(5L, null, null, null)).isEmpty();

        verify(repo).findForMemberBetween(5L, null, LocalDate.of(1900, 1, 1), LocalDate.of(9999, 12, 31));
    }
}
