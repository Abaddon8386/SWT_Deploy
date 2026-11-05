package com.swp391.scms.reports;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.attendance.entity.SessionAttendance;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.reports.dto.ClassUtilizationDto;
import com.swp391.scms.reports.dto.DailyRevenueDto;
import com.swp391.scms.reports.dto.PackageRevenueDto;
import com.swp391.scms.reports.dto.RecentTransactionDto;
import com.swp391.scms.reports.dto.ReportSnapshotCreateDto;
import com.swp391.scms.reports.dto.ReportSnapshotDto;
import com.swp391.scms.reports.entity.ReportSnapshot;
import com.swp391.scms.reports.repository.ReportSnapshotRepository;
import com.swp391.scms.reports.repository.SessionAttendanceReportRepository;
import com.swp391.scms.reports.repository.TransactionReportRepository;
import com.swp391.scms.reports.service.RevenueReportService;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.GymClassRepository;
import com.swp391.scms.users.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RevenueReportServiceTest {

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private MembershipSubscriptionRepository subscriptionRepository;

    @Mock
    private ReportSnapshotRepository snapshotRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TransactionReportRepository transactionReportRepository;

    @Mock
    private GymClassRepository gymClassRepository;

    @Mock
    private ClassEnrollmentRepository classEnrollmentRepository;

    @Mock
    private SessionAttendanceReportRepository sessionAttendanceReportRepository;

    private ObjectMapper objectMapper;
    private Clock clock;
    private RevenueReportService service;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        clock = Clock.fixed(Instant.parse("2026-10-05T10:00:00Z"), ZoneOffset.UTC);
        service = new RevenueReportService(
                paymentRepository, subscriptionRepository,
                snapshotRepository, userRepository, objectMapper, clock,
                transactionReportRepository, gymClassRepository,
                classEnrollmentRepository, sessionAttendanceReportRepository);
    }

    @Test
    void returnsRealTransactionsWithInclusiveEndDateAndLimitOfTen() {
        LocalDate start = LocalDate.of(2026, 10, 1);
        LocalDate end = LocalDate.of(2026, 10, 5);
        var transaction = new RecentTransactionDto(78L, "SCMS-78", "Nguyễn An", "Gold",
                new BigDecimal("750000"), "cash", end.atTime(23, 59, 59, 999999999));
        when(transactionReportRepository.findRecentTransactions(start.atStartOfDay(),
                end.plusDays(1).atStartOfDay(), PageRequest.of(0, 10))).thenReturn(List.of(transaction));

        assertEquals(List.of(transaction), service.getRecentTransactions(start, end));
    }

    @Test
    void rejectsReversedTransactionDateRange() {
        assertThrows(BadRequestException.class, () -> service.getRecentTransactions(
                LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 1)));
        verifyNoInteractions(transactionReportRepository);
    }

    @Test
    void defaultsTransactionPeriodUsingApplicationClock() {
        when(transactionReportRepository.findRecentTransactions(LocalDate.of(2026, 9, 5).atStartOfDay(),
                LocalDate.of(2026, 10, 6).atStartOfDay(), PageRequest.of(0, 10))).thenReturn(List.of());
        assertTrue(service.getRecentTransactions(null, null).isEmpty());
    }

    @Test
    void renewalRateCountsOnlyExpiredPaidPeriodsInSelectedCohort() {
        LocalDate start = LocalDate.of(2026, 10, 1);
        LocalDate lastExpired = LocalDate.of(2026, 10, 4);
        when(subscriptionRepository.countExpiredPaidPeriods(start, lastExpired)).thenReturn(4L);
        when(subscriptionRepository.countRenewedExpiredPaidPeriods(start, lastExpired)).thenReturn(3L);

        var result = service.getRenewalRate(start, LocalDate.of(2026, 10, 31));

        assertEquals(4L, result.expiredCount());
        assertEquals(3L, result.renewedCount());
        assertEquals(75.0, result.renewalRate());
    }

    @Test
    void renewalRateIsUnavailableForAnEmptyCohort() {
        var result = service.getRenewalRate(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 10));

        assertEquals(0L, result.expiredCount());
        assertNull(result.renewalRate());
        verifyNoInteractions(subscriptionRepository);
    }

    @Test
    void renewalRateIsUnavailableWhenNoPaidPeriodsExpired() {
        LocalDate start = LocalDate.of(2026, 10, 1);
        LocalDate end = LocalDate.of(2026, 10, 4);
        when(subscriptionRepository.countExpiredPaidPeriods(start, end)).thenReturn(0L);

        assertNull(service.getRenewalRate(start, end).renewalRate());
        verify(subscriptionRepository, never()).countRenewedExpiredPaidPeriods(any(), any());
    }

    @Test
    void renewalRateRejectsReversedDateRange() {
        assertThrows(BadRequestException.class, () -> service.getRenewalRate(
                LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 1)));
        verifyNoInteractions(subscriptionRepository);
    }

    @Test
    @DisplayName("Should calculate daily revenue correctly for date range")
    void shouldCalculateDailyRevenueCorrectly() {
        LocalDate start = LocalDate.of(2026, 10, 1);
        LocalDate end = LocalDate.of(2026, 10, 2);

        Payment p1 = new Payment();
        p1.setAmount(new BigDecimal("1000000.00"));
        p1.setStatus("success");
        p1.setPaidAt(LocalDateTime.of(2026, 10, 1, 9, 0));

        Payment p2 = new Payment();
        p2.setAmount(new BigDecimal("500000.00"));
        p2.setStatus("success");
        p2.setPaidAt(LocalDateTime.of(2026, 10, 1, 14, 30));

        Payment p3 = new Payment();
        p3.setAmount(new BigDecimal("2000000.00"));
        p3.setStatus("success");
        p3.setPaidAt(LocalDateTime.of(2026, 10, 2, 11, 0));

        when(paymentRepository.findByStatusAndPaidAtBetween(eq("success"), any(), any()))
                .thenReturn(List.of(p1, p2, p3));

        List<DailyRevenueDto> result = service.getDailyRevenue(start, end);

        assertEquals(2, result.size());
        assertEquals(new BigDecimal("1500000.00"), result.get(0).getRevenue());
        assertEquals(2, result.get(0).getTransactionCount());
        assertEquals(new BigDecimal("2000000.00"), result.get(1).getRevenue());
        assertEquals(1, result.get(1).getTransactionCount());
    }

    @Test
    @DisplayName("Should throw BadRequestException when start date is after end date")
    void shouldThrowWhenStartDateAfterEndDate() {
        LocalDate start = LocalDate.of(2026, 10, 10);
        LocalDate end = LocalDate.of(2026, 10, 1);

        assertThrows(BadRequestException.class, () -> service.getDailyRevenue(start, end));
    }

    @Test
    @DisplayName("Should calculate revenue by package with correct percentages")
    void shouldCalculateRevenueByPackageCorrectly() {
        LocalDate start = LocalDate.of(2026, 10, 1);
        LocalDate end = LocalDate.of(2026, 10, 5);

        MembershipPackage gold = new MembershipPackage();
        gold.setName("Gold 6 Tháng");
        try {
            var idField = MembershipPackage.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(gold, 1L);
        } catch (Exception ignored) {}

        MembershipSubscription sub1 = new MembershipSubscription();
        sub1.setMembershipPackage(gold);

        Payment p1 = new Payment();
        p1.setAmount(new BigDecimal("3000000.00"));
        p1.setStatus("success");
        p1.setPaidAt(LocalDateTime.of(2026, 10, 2, 10, 0));
        p1.setSubscriptionId(10L);

        when(paymentRepository.findByStatusAndPaidAtBetween(eq("success"), any(), any()))
                .thenReturn(List.of(p1));
        when(subscriptionRepository.findById(10L)).thenReturn(Optional.of(sub1));

        List<PackageRevenueDto> result = service.getRevenueByPackage(start, end);

        assertEquals(1, result.size());
        assertEquals("Gold 6 Tháng", result.get(0).getPackageName());
        assertEquals(new BigDecimal("3000000.00"), result.get(0).getRevenue());
        assertEquals(100.0, result.get(0).getPercentage());
    }

    @Test
    @DisplayName("Should calculate class utilization and safely handle zero capacity or zero booked")
    void shouldCalculateClassUtilizationSafely() {
        SessionAttendanceReportRepository.ClassUtilizationRow row1 = new SessionAttendanceReportRepository.ClassUtilizationRow() {
            @Override public Long getClassId() { return 10L; }
            @Override public String getClassName() { return "Morning Yoga"; }
            @Override public Long getDisciplineId() { return 2L; }
            @Override public String getDisciplineName() { return "Yoga"; }
            @Override public String getRoomName() { return null; }
            @Override public Integer getCapacity() { return 20; }
            @Override public Long getEnrolledCount() { return 2L; }
            @Override public Long getPresentCount() { return 1L; }
        };
        SessionAttendanceReportRepository.ClassUtilizationRow row2 = new SessionAttendanceReportRepository.ClassUtilizationRow() {
            @Override public Long getClassId() { return 11L; }
            @Override public String getClassName() { return "Open Workshop"; }
            @Override public Long getDisciplineId() { return 2L; }
            @Override public String getDisciplineName() { return "Yoga"; }
            @Override public String getRoomName() { return null; }
            @Override public Integer getCapacity() { return 0; }
            @Override public Long getEnrolledCount() { return 0L; }
            @Override public Long getPresentCount() { return 0L; }
        };

        LocalDate start = LocalDate.of(2026, 10, 1);
        LocalDate end = LocalDate.of(2026, 10, 5);
        when(sessionAttendanceReportRepository.classUtilizationByDiscipline(
                start, end, start.atStartOfDay(), end.plusDays(1).atStartOfDay(), 2L))
                .thenReturn(List.of(row1, row2));

        List<ClassUtilizationDto> list = service.getClassUtilization(start, end, 2L);

        assertEquals(2, list.size());
        assertEquals(10.0, list.get(0).utilizationRate()); // 2 / 20 = 10%
        assertEquals(50.0, list.get(0).attendanceRate());  // 1 / 2 = 50%
        assertEquals(0.0, list.get(1).utilizationRate());  // zero capacity -> 0.0
        assertEquals(0.0, list.get(1).attendanceRate());   // zero booked -> 0.0
        verifyNoInteractions(gymClassRepository, classEnrollmentRepository);
    }

    @Test
    @DisplayName("Should generate snapshot when json data is valid including class_utilization type")
    void shouldGenerateSnapshotWhenJsonIsValid() {
        ReportSnapshotCreateDto dto = new ReportSnapshotCreateDto(
                "class_utilization",
                LocalDate.of(2026, 10, 1),
                LocalDate.of(2026, 10, 5),
                "{\"averageUtilization\": 75.0}",
                null
        );

        when(snapshotRepository.save(any(ReportSnapshot.class))).thenAnswer(inv -> {
            ReportSnapshot saved = inv.getArgument(0);
            saved.setData(dto.getData());
            return saved;
        });

        ReportSnapshotDto result = service.generateSnapshot(dto, 1L);
        assertNotNull(result);
        assertEquals("class_utilization", result.getReportType());
        verify(snapshotRepository).save(any(ReportSnapshot.class));
    }

    @Test
    @DisplayName("Should reject snapshot generation when json data is invalid syntax")
    void shouldRejectSnapshotWhenJsonIsInvalid() {
        ReportSnapshotCreateDto dto = new ReportSnapshotCreateDto(
                "revenue",
                LocalDate.of(2026, 10, 1),
                LocalDate.of(2026, 10, 5),
                "{invalid_json_format",
                null
        );

        assertThrows(BadRequestException.class, () -> service.generateSnapshot(dto, 1L));
    }
}
