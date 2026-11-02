package com.swp391.scms.coaching;

import com.swp391.scms.coaching.dto.CoachLeaderboardItemDto;
import com.swp391.scms.coaching.dto.CoachMonthlyReviewDto;
import com.swp391.scms.coaching.dto.CoachMonthlyReviewUpdateDto;
import com.swp391.scms.coaching.entity.CoachMonthlyReview;
import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.coaching.repository.CoachMonthlyReviewRepository;
import com.swp391.scms.coaching.repository.CoachReviewRepository;
import com.swp391.scms.coaching.service.CoachLeaderboardService;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CoachLeaderboardServiceTest {

    @Mock
    private CoachMonthlyReviewRepository monthlyReviewRepository;

    @Mock
    private CoachReviewRepository reviewRepository;

    @Mock
    private CoachRepository coachRepository;

    @Mock
    private CoachBookingRepository coachBookingRepository;

    @Mock
    private ClassSessionRepository classSessionRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private NotificationService notificationService;

    private CoachLeaderboardService leaderboardService;

    private Coach coach1;
    private Coach coach2;

    @BeforeEach
    void setUp() {
        leaderboardService = new CoachLeaderboardService(
                monthlyReviewRepository,
                reviewRepository,
                coachRepository,
                coachBookingRepository,
                classSessionRepository,
                userRepository,
                notificationService
        );

        User u1 = new User();
        u1.setId(21L);
        u1.setFullName("Coach One");

        coach1 = new Coach();
        coach1.setUserId(21L);
        coach1.setUser(u1);
        coach1.setSpecialization("Yoga");

        User u2 = new User();
        u2.setId(22L);
        u2.setFullName("Coach Two");

        coach2 = new Coach();
        coach2.setUserId(22L);
        coach2.setUser(u2);
        coach2.setSpecialization("Cardio");
    }

    @Test
    void getLeaderboard_returnsExistingPublishedReviews() {
        CoachMonthlyReview r1 = new CoachMonthlyReview();
        r1.setId(1L);
        r1.setCoach(coach1);
        r1.setYear(2026);
        r1.setMonth(10);
        r1.setAverageRating(new BigDecimal("4.95"));
        r1.setRankPosition(1);
        r1.setBadge("Top 1: Coach of the Month 🏆");
        r1.setBonusAmount(new BigDecimal("2000000.00"));
        r1.setTotalSessions(30);
        r1.setTotalReviews(15);
        r1.setStatus("published");

        when(monthlyReviewRepository.findLeaderboardByPeriod(2026, 10)).thenReturn(List.of(r1));

        List<CoachLeaderboardItemDto> result = leaderboardService.getLeaderboard(2026, 10);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).rankPosition()).isEqualTo(1);
        assertThat(result.get(0).coachName()).isEqualTo("Coach One");
        assertThat(result.get(0).badge()).contains("Top 1");
    }

    @Test
    void updateMonthlyReview_publishesAndNotifiesCoach() {
        CoachMonthlyReview r = new CoachMonthlyReview();
        r.setId(5L);
        r.setCoach(coach1);
        r.setYear(2026);
        r.setMonth(10);
        r.setRankPosition(1);
        r.setBadge("Top 1");
        r.setBonusAmount(new BigDecimal("2000000.00"));
        r.setStatus("draft");

        when(monthlyReviewRepository.findById(5L)).thenReturn(Optional.of(r));
        when(monthlyReviewRepository.save(any(CoachMonthlyReview.class))).thenAnswer(i -> i.getArgument(0));

        CoachMonthlyReviewUpdateDto updateDto = new CoachMonthlyReviewUpdateDto(
                1,
                "Master Coach of October 🌟",
                new BigDecimal("2500000.00"),
                "Xuất sắc đạt 100% học viên hài lòng!",
                "published"
        );

        CoachMonthlyReviewDto updated = leaderboardService.updateMonthlyReview(5L, updateDto, 99L);

        assertThat(updated).isNotNull();
        assertThat(updated.badge()).isEqualTo("Master Coach of October 🌟");
        assertThat(updated.bonusAmount()).isEqualByComparingTo("2500000.00");
        assertThat(updated.status()).isEqualTo("published");

        verify(notificationService).send(eq(21L), anyString(), anyString(), eq("system"), isNull(), eq(5L));
    }
    @Test
    void emptyLeaderboardDoesNotGenerateOrPublishReviews() {
        when(monthlyReviewRepository.findLeaderboardByPeriod(2026, 10)).thenReturn(List.of());
        assertThat(leaderboardService.getLeaderboard(2026, 10)).isEmpty();
        verifyNoInteractions(coachRepository, coachBookingRepository, reviewRepository);
        verify(monthlyReviewRepository, never()).save(any());
    }
    @Test
    void monthlyUpdateRejectsNegativeRankBonusAndInvalidStatusAtBoundary() {
        try (var factory = jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            var invalid = new CoachMonthlyReviewUpdateDto(0, "A".repeat(101),
                    new BigDecimal("-1"), null, "other");
            assertThat(factory.getValidator().validate(invalid)).hasSize(4);
            var valid = new CoachMonthlyReviewUpdateDto(1, "Top coach", BigDecimal.ZERO, null, "published");
            assertThat(factory.getValidator().validate(valid)).isEmpty();
        }
    }
}

