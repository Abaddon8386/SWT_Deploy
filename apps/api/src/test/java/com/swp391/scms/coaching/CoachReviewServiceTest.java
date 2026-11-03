package com.swp391.scms.coaching;

import com.swp391.scms.coaching.dto.CoachReviewCreateDto;
import com.swp391.scms.coaching.dto.CoachReviewDto;
import com.swp391.scms.coaching.entity.CoachReview;
import com.swp391.scms.coaching.repository.CoachReviewRepository;
import com.swp391.scms.coaching.service.CoachReviewService;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CoachReviewServiceTest {

    @Mock
    private CoachReviewRepository reviewRepository;

    @Mock
    private CoachRepository coachRepository;

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private NotificationService notificationService;

    @Mock private com.swp391.scms.coaching.repository.CoachBookingRepository bookingRepository;
    @Mock private com.swp391.scms.scheduling.repository.ClassSessionRepository sessionRepository;
    @Mock private com.swp391.scms.scheduling.repository.ClassEnrollmentRepository enrollmentRepository;
    private CoachReviewService reviewService;

    private Member member;
    private Coach coach;
    private User memberUser;
    private User coachUser;

    @BeforeEach
    void setUp() {
        reviewService = new CoachReviewService(reviewRepository, coachRepository, memberRepository, notificationService, null,
                bookingRepository, sessionRepository, enrollmentRepository, java.time.Clock.systemDefaultZone());

        memberUser = new User();
        memberUser.setId(10L);
        memberUser.setFullName("Nguyen Van Member");

        member = new Member();
        member.setUserId(10L);
        member.setUser(memberUser);

        coachUser = new User();
        coachUser.setId(20L);
        coachUser.setFullName("Tran Coach");

        coach = new Coach();
        coach.setUserId(20L);
        coach.setUser(coachUser);
        coach.setSpecialization("Fitness");
        var booking = new com.swp391.scms.coaching.entity.CoachBooking();
        booking.setId(55L);
        booking.setMember(member);
        booking.setCoach(coach);
        booking.setStatus("completed");
        booking.setBookingDate(java.time.LocalDate.now().minusDays(1));
        booking.setEndTime(java.time.LocalTime.NOON);
        lenient().when(bookingRepository.findById(55L)).thenReturn(Optional.of(booking));
    }

    @Test
    void createReview_success_savesAndNotifiesCoach() {
        when(memberRepository.findById(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(reviewRepository.save(any(CoachReview.class))).thenAnswer(invocation -> {
            CoachReview r = invocation.getArgument(0);
            r.setId(100L);
            r.setCreatedAt(LocalDateTime.now());
            return r;
        });

        CoachReviewCreateDto request = new CoachReviewCreateDto(20L, 55L, null, 5, "HLV dạy rất nhiệt tình!", false);
        CoachReviewDto result = reviewService.createReview(10L, request);

        assertThat(result).isNotNull();
        assertThat(result.id()).isEqualTo(100L);
        assertThat(result.rating()).isEqualTo(5);
        assertThat(result.comment()).isEqualTo("HLV dạy rất nhiệt tình!");
        assertThat(result.coachName()).isEqualTo("Tran Coach");
        assertThat(result.memberName()).isEqualTo("Nguyen Van Member");

        verify(notificationService).send(eq(20L), anyString(), anyString(), eq("system"), isNull(), eq(100L));
    }

    @Test
    void createReview_anonymous_hidesMemberName() {
        when(memberRepository.findById(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(reviewRepository.save(any(CoachReview.class))).thenAnswer(invocation -> {
            CoachReview r = invocation.getArgument(0);
            r.setId(101L);
            r.setCreatedAt(LocalDateTime.now());
            return r;
        });

        CoachReviewCreateDto request = new CoachReviewCreateDto(20L, 55L, null, 4, "Tốt!", true);
        CoachReviewDto result = reviewService.createReview(10L, request);

        assertThat(result.memberName()).isEqualTo("Học viên ẩn danh");
        assertThat(result.isAnonymous()).isTrue();
        assertThat(result.memberId()).isEqualTo(10L);
        assertThat(result.bookingId()).isEqualTo(55L);
        assertThat(result.classSessionId()).isNull();
    }

    @Test
    void createReview_invalidRating_throwsBadRequest() {
        CoachReviewCreateDto request = new CoachReviewCreateDto(20L, 55L, null, 6, "Quá sao", false);
        assertThatThrownBy(() -> reviewService.createReview(10L, request))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void getApprovedReviewsForCoach_returnsMappedList() {
        CoachReview r = new CoachReview();
        r.setId(1L);
        r.setCoach(coach);
        r.setMember(member);
        r.setRating(5);
        r.setComment("Tuyệt vời");
        r.setStatus("approved");
        r.setCreatedAt(LocalDateTime.now());

        when(reviewRepository.findApprovedByCoachId(20L)).thenReturn(List.of(r));

        List<CoachReviewDto> list = reviewService.getApprovedReviewsForCoach(20L);
        assertThat(list).hasSize(1);
        assertThat(list.get(0).coachId()).isEqualTo(20L);
        assertThat(list.get(0).comment()).isEqualTo("Tuyệt vời");
    }
    @Test
    void publicAnonymousReviewRedactsOwnerAndSessionLinks() {
        CoachReview r = new CoachReview();
        r.setCoach(coach); r.setMember(member); r.setIsAnonymous(true);
        r.setBookingId(55L); r.setClassSessionId(66L);
        when(reviewRepository.findApprovedByCoachId(20L)).thenReturn(List.of(r));
        var dto = reviewService.getApprovedReviewsForCoach(20L).getFirst();
        assertThat(dto.memberId()).isNull();
        assertThat(dto.bookingId()).isNull();
        assertThat(dto.classSessionId()).isNull();
    }

    @Test
    void rejectsOtherMembersBooking() {
        when(memberRepository.findById(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        var booking = bookingRepository.findById(55L).orElseThrow();
        Member other = new Member(); other.setUserId(99L); booking.setMember(other);
        assertThatThrownBy(() -> reviewService.createReview(10L,
                new CoachReviewCreateDto(20L, 55L, null, 5, "Review", false)))
                .isInstanceOf(com.swp391.scms.common.exception.ForbiddenException.class);
        verify(reviewRepository, never()).save(any());
    }

    @Test
    void rejectsDuplicateBookingReview() {
        when(memberRepository.findById(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        when(reviewRepository.existsByMemberUserIdAndBookingId(10L, 55L)).thenReturn(true);
        assertThatThrownBy(() -> reviewService.createReview(10L,
                new CoachReviewCreateDto(20L, 55L, null, 5, "Review", false)))
                .isInstanceOf(com.swp391.scms.common.exception.ConflictException.class);
        verify(reviewRepository, never()).save(any());
    }

    @Test
    void classSessionReviewRequiresAttendance() {
        when(memberRepository.findById(10L)).thenReturn(Optional.of(member));
        when(coachRepository.findById(20L)).thenReturn(Optional.of(coach));
        var gymClass = new com.swp391.scms.scheduling.entity.GymClass();
        org.springframework.test.util.ReflectionTestUtils.setField(gymClass, "id", 7L);
        gymClass.setCoach(coach);
        var session = new com.swp391.scms.scheduling.entity.ClassSession();
        org.springframework.test.util.ReflectionTestUtils.setField(session, "id", 70L);
        session.setGymClass(gymClass);
        session.setStatus("completed");
        session.setSessionDate(java.time.LocalDate.now().minusDays(1));
        session.setEndTime(java.time.LocalTime.NOON);
        var enrollment = new com.swp391.scms.scheduling.entity.ClassEnrollment();
        enrollment.setMember(member);
        enrollment.setStatus("booked");
        when(sessionRepository.findById(70L)).thenReturn(Optional.of(session));
        when(enrollmentRepository.findByGymClassId(7L)).thenReturn(java.util.List.of(enrollment));
        var attendance = mock(com.swp391.scms.attendance.repository.SessionAttendanceRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(reviewService, "attendanceRepository", attendance);
        var absent = new com.swp391.scms.attendance.entity.SessionAttendance();
        absent.setStatus("absent");
        when(attendance.findBySessionIdAndMemberUserId(70L, 10L)).thenReturn(Optional.of(absent));

        assertThatThrownBy(() -> reviewService.createReview(10L,
                new CoachReviewCreateDto(20L, null, 70L, 4, "Review", false)))
                .isInstanceOf(com.swp391.scms.common.exception.ForbiddenException.class);
        verify(reviewRepository, never()).save(any());
    }
}

