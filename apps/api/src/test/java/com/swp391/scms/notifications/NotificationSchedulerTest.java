package com.swp391.scms.notifications;

import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.scheduling.entity.ClassEnrollment;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.entity.GymClass;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationSchedulerTest {

    @Mock
    private MembershipSubscriptionRepository subscriptionRepository;

    @Mock
    private ClassSessionRepository sessionRepository;

    @Mock
    private ClassEnrollmentRepository enrollmentRepository;

    @Mock
    private NotificationRepository notificationRepository;

    @Mock
    private NotificationService notificationService;

    @Mock
    private MessageService messageService;

    @InjectMocks
    private NotificationScheduler notificationScheduler;

    private User user1;
    private User user2;
    private Member member1;
    private Member member2;
    private MembershipPackage membershipPackage;

    @BeforeEach
    void setUp() {
        user1 = new User();
        user1.setId(101L);
        user1.setFullName("Nguyễn Văn A");

        user2 = new User();
        user2.setId(102L);
        user2.setFullName("Trần Thị B");

        member1 = new Member();
        member1.setUserId(101L);
        member1.setUser(user1);

        member2 = new Member();
        member2.setUserId(102L);
        member2.setUser(user2);

        membershipPackage = new MembershipPackage();
        membershipPackage.setId(1L);
        membershipPackage.setName("Gói Platinum 12 Tháng");
    }

    // =========================================================================
    // Job 1: Membership Subscription Expiry Tests
    // =========================================================================

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "Gói tập sắp hết hạn|Gói tập Platinum sắp hết hạn",
            "Membership package expiring soon|Your membership package \"Gold 1 Month\" will expire on 29/10/2026 (in 7 days). Please renew to continue using our services."
    })
    @DisplayName("Job 1: Sends package_expiry notification when subscription expires in 7 days")
    void scanAndNotifyExpiringSubscriptions_Success(String resolvedTitle, String resolvedBody) {
        LocalDate targetDate = LocalDate.of(2026, 10, 29);

        MembershipSubscription subscription = new MembershipSubscription();
        subscription.setId(201L);
        subscription.setMember(member1);
        subscription.setMembershipPackage(membershipPackage);
        subscription.setEndDate(targetDate);
        subscription.setStatus("active");

        when(subscriptionRepository.findActiveSubscriptionsExpiringOn(targetDate))
                .thenReturn(List.of(subscription));
        when(notificationRepository.existsNotification(101L, "package_expiry", "membership_subscription", 201L))
                .thenReturn(false);
        when(messageService.getMessage(eq("notifications.package_expiry.title"), any(Object[].class)))
                .thenReturn(resolvedTitle);
        when(messageService.getMessage(eq("notifications.package_expiry.body"), any(Object[].class)))
                .thenReturn(resolvedBody);

        int sentCount = notificationScheduler.scanAndNotifyExpiringSubscriptions(targetDate);

        assertThat(sentCount).isEqualTo(1);
        verify(notificationService).send(
                eq(101L),
                eq(resolvedTitle),
                eq(resolvedBody),
                eq("package_expiry"),
                eq("membership_subscription"),
                eq(201L)
        );
    }

    @Test
    @DisplayName("Job 1: Skips notification if already sent (Idempotency)")
    void scanAndNotifyExpiringSubscriptions_AlreadySent_Skips() {
        LocalDate targetDate = LocalDate.of(2026, 10, 29);

        MembershipSubscription subscription = new MembershipSubscription();
        subscription.setId(201L);
        subscription.setMember(member1);
        subscription.setMembershipPackage(membershipPackage);
        subscription.setEndDate(targetDate);
        subscription.setStatus("active");

        when(subscriptionRepository.findActiveSubscriptionsExpiringOn(targetDate))
                .thenReturn(List.of(subscription));
        when(notificationRepository.existsNotification(101L, "package_expiry", "membership_subscription", 201L))
                .thenReturn(true);

        int sentCount = notificationScheduler.scanAndNotifyExpiringSubscriptions(targetDate);

        assertThat(sentCount).isEqualTo(0);
        verify(notificationService, never()).send(anyLong(), anyString(), anyString(), anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("Job 1: Returns 0 when no subscriptions are expiring on target date")
    void scanAndNotifyExpiringSubscriptions_NoData_ReturnsZero() {
        LocalDate targetDate = LocalDate.of(2026, 10, 29);

        when(subscriptionRepository.findActiveSubscriptionsExpiringOn(targetDate))
                .thenReturn(Collections.emptyList());

        int sentCount = notificationScheduler.scanAndNotifyExpiringSubscriptions(targetDate);

        assertThat(sentCount).isEqualTo(0);
        verify(notificationService, never()).send(anyLong(), anyString(), anyString(), anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("Job 1: schedulePackageExpiryJob executes properly at 08:00")
    void schedulePackageExpiryJob_ExecutesProperly() {
        when(subscriptionRepository.findActiveSubscriptionsExpiringOn(any(LocalDate.class)))
                .thenReturn(Collections.emptyList());

        notificationScheduler.schedulePackageExpiryJob();

        verify(subscriptionRepository).findActiveSubscriptionsExpiringOn(any(LocalDate.class));
    }

    // =========================================================================
    // Job 2: Upcoming Class Reminder Tests
    // =========================================================================

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "Nhắc nhở lịch học|Lớp học sắp bắt đầu",
            "Upcoming class reminder|Your class \"Yoga Vinyasa\" is starting at 11:00 on 22/10/2026. Get ready!"
    })
    @DisplayName("Job 2: Sends class_reminder notification for booked members within 2 hours")
    void scanAndNotifyUpcomingClasses_Success(String resolvedTitle, String resolvedBody) {
        LocalDateTime referenceTime = LocalDateTime.of(2026, 10, 22, 10, 0); // 10:00
        LocalDate sessionDate = LocalDate.of(2026, 10, 22);
        LocalTime startTime = LocalTime.of(11, 0); // 11:00 (1 hour later, within 2h)
        LocalTime endTime = LocalTime.of(12, 0);

        GymClass gymClass = new GymClass();
        gymClass.setId(10L);
        gymClass.setName("Yoga Vinyasa");

        ClassSession session = new ClassSession();
        session.setId(301L);
        session.setGymClass(gymClass);
        session.setSessionDate(sessionDate);
        session.setStartTime(startTime);
        session.setEndTime(endTime);
        session.setStatus("scheduled");

        ClassEnrollment enrollment1 = new ClassEnrollment();
        enrollment1.setId(401L);
        enrollment1.setGymClass(gymClass);
        enrollment1.setMember(member1);
        enrollment1.setStatus("booked");

        ClassEnrollment enrollment2 = new ClassEnrollment();
        enrollment2.setId(402L);
        enrollment2.setGymClass(gymClass);
        enrollment2.setMember(member2);
        enrollment2.setStatus("booked");

        when(sessionRepository.findScheduledSessionsBetweenDates(sessionDate, sessionDate))
                .thenReturn(List.of(session));
        when(enrollmentRepository.findByGymClassIdAndStatus(10L, "booked"))
                .thenReturn(List.of(enrollment1, enrollment2));

        when(notificationRepository.existsNotification(101L, "class_reminder", "class_session", 301L))
                .thenReturn(false);
        when(notificationRepository.existsNotification(102L, "class_reminder", "class_session", 301L))
                .thenReturn(false);

        when(messageService.getMessage(eq("notifications.class_reminder.title"), any(Object[].class)))
                .thenReturn(resolvedTitle);
        when(messageService.getMessage(eq("notifications.class_reminder.body"), any(Object[].class)))
                .thenReturn(resolvedBody);

        int sentCount = notificationScheduler.scanAndNotifyUpcomingClasses(referenceTime);

        assertThat(sentCount).isEqualTo(2);
        verify(notificationService).send(eq(101L), eq(resolvedTitle), eq(resolvedBody), eq("class_reminder"), eq("class_session"), eq(301L));
        verify(notificationService).send(eq(102L), eq(resolvedTitle), eq(resolvedBody), eq("class_reminder"), eq("class_session"), eq(301L));
    }

    @Test
    @DisplayName("Job 2: Skips members who already received class_reminder (Idempotency)")
    void scanAndNotifyUpcomingClasses_AlreadySent_Skips() {
        LocalDateTime referenceTime = LocalDateTime.of(2026, 10, 22, 10, 0);
        LocalDate sessionDate = LocalDate.of(2026, 10, 22);

        GymClass gymClass = new GymClass();
        gymClass.setId(10L);
        gymClass.setName("Cardio HIIT");

        ClassSession session = new ClassSession();
        session.setId(301L);
        session.setGymClass(gymClass);
        session.setSessionDate(sessionDate);
        session.setStartTime(LocalTime.of(11, 30));
        session.setEndTime(LocalTime.of(12, 30));
        session.setStatus("scheduled");

        ClassEnrollment enrollment1 = new ClassEnrollment();
        enrollment1.setId(401L);
        enrollment1.setGymClass(gymClass);
        enrollment1.setMember(member1);
        enrollment1.setStatus("booked");

        when(sessionRepository.findScheduledSessionsBetweenDates(sessionDate, sessionDate))
                .thenReturn(List.of(session));
        when(enrollmentRepository.findByGymClassIdAndStatus(10L, "booked"))
                .thenReturn(List.of(enrollment1));

        // Already sent
        when(notificationRepository.existsNotification(101L, "class_reminder", "class_session", 301L))
                .thenReturn(true);

        int sentCount = notificationScheduler.scanAndNotifyUpcomingClasses(referenceTime);

        assertThat(sentCount).isEqualTo(0);
        verify(notificationService, never()).send(anyLong(), anyString(), anyString(), anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("Job 2: Ignores class sessions starting after 2 hours")
    void scanAndNotifyUpcomingClasses_AfterTwoHours_Ignored() {
        LocalDateTime referenceTime = LocalDateTime.of(2026, 10, 22, 10, 0);
        LocalDate sessionDate = LocalDate.of(2026, 10, 22);

        GymClass gymClass = new GymClass();
        gymClass.setId(10L);

        ClassSession session = new ClassSession();
        session.setId(301L);
        session.setGymClass(gymClass);
        session.setSessionDate(sessionDate);
        session.setStartTime(LocalTime.of(13, 0)); // 3 hours later (> 2 hours window)
        session.setEndTime(LocalTime.of(14, 0));
        session.setStatus("scheduled");

        when(sessionRepository.findScheduledSessionsBetweenDates(sessionDate, sessionDate))
                .thenReturn(List.of(session));

        int sentCount = notificationScheduler.scanAndNotifyUpcomingClasses(referenceTime);

        assertThat(sentCount).isEqualTo(0);
        verify(enrollmentRepository, never()).findByGymClassIdAndStatus(anyLong(), anyString());
        verify(notificationService, never()).send(anyLong(), anyString(), anyString(), anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("Job 2: Ignores class sessions in the past")
    void scanAndNotifyUpcomingClasses_InThePast_Ignored() {
        LocalDateTime referenceTime = LocalDateTime.of(2026, 10, 22, 10, 0);
        LocalDate sessionDate = LocalDate.of(2026, 10, 22);

        GymClass gymClass = new GymClass();
        gymClass.setId(10L);

        ClassSession session = new ClassSession();
        session.setId(301L);
        session.setGymClass(gymClass);
        session.setSessionDate(sessionDate);
        session.setStartTime(LocalTime.of(9, 0)); // 1 hour ago
        session.setEndTime(LocalTime.of(10, 0));
        session.setStatus("scheduled");

        when(sessionRepository.findScheduledSessionsBetweenDates(sessionDate, sessionDate))
                .thenReturn(List.of(session));

        int sentCount = notificationScheduler.scanAndNotifyUpcomingClasses(referenceTime);

        assertThat(sentCount).isEqualTo(0);
        verify(enrollmentRepository, never()).findByGymClassIdAndStatus(anyLong(), anyString());
        verify(notificationService, never()).send(anyLong(), anyString(), anyString(), anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("Job 2: scheduleClassReminderJob executes properly every 30 minutes")
    void scheduleClassReminderJob_ExecutesProperly() {
        when(sessionRepository.findScheduledSessionsBetweenDates(any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(Collections.emptyList());

        notificationScheduler.scheduleClassReminderJob();

        verify(sessionRepository).findScheduledSessionsBetweenDates(any(LocalDate.class), any(LocalDate.class));
    }

    @Test
    @DisplayName("Spring context verifies Autowired constructor exists and bean instantiates without NoSuchMethodException")
    void springContextResolvesAutowiredConstructor() {
        org.springframework.context.annotation.AnnotationConfigApplicationContext context =
                new org.springframework.context.annotation.AnnotationConfigApplicationContext();
        context.getDefaultListableBeanFactory().registerSingleton("subscriptionRepository", subscriptionRepository);
        context.getDefaultListableBeanFactory().registerSingleton("sessionRepository", sessionRepository);
        context.getDefaultListableBeanFactory().registerSingleton("enrollmentRepository", enrollmentRepository);
        context.getDefaultListableBeanFactory().registerSingleton("notificationRepository", notificationRepository);
        context.getDefaultListableBeanFactory().registerSingleton("notificationService", notificationService);
        context.getDefaultListableBeanFactory().registerSingleton("messageService", messageService);
        context.register(NotificationScheduler.class);
        context.refresh();

        NotificationScheduler bean = context.getBean(NotificationScheduler.class);
        assertThat(bean).isNotNull();
        context.close();
    }
}
