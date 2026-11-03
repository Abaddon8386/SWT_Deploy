package com.swp391.scms.config;

import com.swp391.scms.attendance.dto.CheckinRequests;
import com.swp391.scms.attendance.dto.CheckinResponses.CheckinDto;
import com.swp391.scms.attendance.service.CenterCheckinService;
import com.swp391.scms.attendance.repository.CenterCheckinRepository;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.scheduling.service.EnrollmentService;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;

/** SCRUM-75 concurrency and membership boundaries against a dedicated Supabase test schema. */
@SpringBootTest
@ActiveProfiles("supabase")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@EnabledIfEnvironmentVariable(named = "SCMS_POSTGRES_TEST_URL", matches = "jdbc:postgresql:.+")
class OperationsConcurrencyPostgreSqlTest {
    private static final String SCHEMA = "operations_test_" + UUID.randomUUID().toString().replace("-", "");

    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired CenterCheckinService checkins;
    @Autowired CenterCheckinRepository visits;
    @Autowired MembershipSubscriptionRepository subscriptions;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired Clock clock;
    @Autowired EnrollmentService bookingService;
    @Autowired com.swp391.scms.membership.service.MembershipSubscriptionService membershipService;
    private static final AtomicInteger BOOKING_DAY = new AtomicInteger(60);

    private ExecutorService workers;
    private AuthenticatedPrincipal staff;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) throws Exception {
        try (var connection = connectTestDatabase(); var statement = connection.createStatement()) {
            statement.execute("create schema \"" + SCHEMA + "\"");
        }
        properties.add("spring.datasource.url", () -> credential("SCMS_POSTGRES_TEST_URL"));
        properties.add("spring.datasource.username", () -> credential("SCMS_POSTGRES_TEST_USERNAME"));
        properties.add("spring.datasource.password", () -> credential("SCMS_POSTGRES_TEST_PASSWORD"));
        properties.add("spring.datasource.hikari.schema", () -> SCHEMA);
        properties.add("spring.datasource.hikari.maximum-pool-size", () -> 5);
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "update");
        properties.add("app.jwt.secret", () -> "c2Ntc19sb2NhbF9qd3Rfc2VjcmV0X2tleV9mb3Jfc3dwMzkxX3Byb2plY3RfMjAyNg==");
        properties.add("app.bootstrap.manager.email", () -> "operations-test@example.invalid");
        properties.add("app.bootstrap.manager.password", () -> "OperationsTest_75!");
        properties.add("app.auth.otp.delivery", () -> "disabled");
    }

    @AfterAll
    static void cleanupSchema() throws Exception {
        assertTrue(SCHEMA.matches("operations_test_[a-f0-9]{32}"));
        try (var connection = connectTestDatabase(); var statement = connection.createStatement()) {
            statement.execute("drop schema if exists \"" + SCHEMA + "\" cascade");
        }
    }

    @BeforeEach
    void setupWorkersAndStaff() {
        workers = Executors.newFixedThreadPool(2);
        staff = new AuthenticatedPrincipal(user("CENTER_MANAGER"), "operations-test", "CENTER_MANAGER");
    }

    @AfterEach
    void stopWorkers() throws InterruptedException {
        workers.shutdownNow();
        assertTrue(workers.awaitTermination(20, TimeUnit.SECONDS), "Database workers must finish before schema cleanup");
    }

    @Test
    void simultaneousDistinctQrsForOneMemberPersistOneGrantAndOneDenial() throws Exception {
        long member = member();
        String firstQr = subscription(member, "active", -1, 30);
        String secondQr = subscription(member, "active", -1, 30);
        var ready = new CountDownLatch(2);
        var firstPid = new AtomicInteger();
        var secondPid = new AtomicInteger();
        Future<CheckinDto> first;
        Future<CheckinDto> second;
        try (var blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            try {
                lockRow(blocker, "select user_id from members where user_id = ? for update", member);
                first = submit(ready, firstPid, () -> scan(firstQr));
                second = submit(ready, secondPid, () -> scan(secondQr));
                awaitBlocked(ready, firstPid, secondPid);
            } finally {
                blocker.rollback();
            }
        }
        var results = List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
        assertEquals(1, results.stream().filter(result -> "GRANTED".equals(result.status())).count());
        assertEquals(1, results.stream().filter(result -> "DENIED".equals(result.status())).count());
        assertEquals(2, countVisits(member, "true"));
        assertEquals(1, countVisits(member, "status = 'GRANTED' and check_out_time is null"));
        assertEquals(1, countVisits(member, "status = 'DENIED' and denial_reason = 'error.attendance.already_checked_in'"));
    }

    @Test
    void simultaneousCheckoutsHaveOneWinnerAndPreserveItsTimestamp() throws Exception {
        long member = member();
        CheckinDto visit = scan(subscription(member, "active", -1, 30));
        LocalDateTime originalCheckin = timestamp(visit.id(), "check_in_time");
        var ready = new CountDownLatch(2);
        var firstPid = new AtomicInteger();
        var secondPid = new AtomicInteger();
        Future<CheckinDto> first;
        Future<CheckinDto> second;
        try (var blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            try {
                lockRow(blocker, "select id from center_checkins where id = ? for update", visit.id());
                first = submit(ready, firstPid, () -> checkins.checkout(staff, visit.id()));
                second = submit(ready, secondPid, () -> checkins.checkout(staff, visit.id()));
                awaitBlocked(ready, firstPid, secondPid);
            } finally {
                blocker.rollback();
            }
        }
        CheckinDto firstResult = checkoutResult(first);
        CheckinDto secondResult = checkoutResult(second);
        assertTrue((firstResult == null) != (secondResult == null), "Exactly one checkout must fail with BadRequestException");
        CheckinDto winner = firstResult != null ? firstResult : secondResult;
        LocalDateTime storedCheckout = visits.findById(visit.id()).orElseThrow().getCheckOutTime();
        assertNotNull(winner.checkOutTime());
        // PostgreSQL timestamps round Java nanoseconds to microseconds.
        assertTrue(Duration.between(winner.checkOutTime(), storedCheckout).abs().toNanos() <= 1_000);
        assertEquals(originalCheckin, timestamp(visit.id(), "check_in_time"));
        assertEquals(1, countVisits(member, "status = 'GRANTED' and check_out_time is not null"));
        assertEquals(1, countVisits(member, "true"));
    }

    @Test
    void scanWaitsForCancellationAndRejectsThatQrEvenWithAnotherActiveSubscription() throws Exception {
        long member = member();
        String cancelledQr = subscription(member, "active", -1, 30);
        subscription(member, "active", -1, 30); // Keep the general membership trigger satisfied.
        var ready = new CountDownLatch(1);
        var scannerPid = new AtomicInteger();
        Future<CheckinDto> scan;
        try (var cancellation = dataSource.getConnection()) {
            cancellation.setAutoCommit(false);
            try {
                try (var update = cancellation.prepareStatement("update membership_subscriptions set status = 'cancelled' where qr_code = ?")) {
                    update.setString(1, cancelledQr);
                    assertEquals(1, update.executeUpdate());
                }
                scan = submit(ready, scannerPid, () -> scan(cancelledQr));
                awaitBlocked(ready, scannerPid);
                cancellation.commit();
            } finally {
                cancellation.rollback();
            }
        }
        assertEquals("DENIED", scan.get(20, TimeUnit.SECONDS).status());
        assertEquals(1, countVisits(member, "true"));
        assertEquals(1, countVisits(member, "status = 'DENIED' and denial_reason = 'error.attendance.subscription_not_active'"));
        assertTrue(subscriptions.hasActiveMembership(member, LocalDate.now(clock)));
    }

    @Test
    void activeMembershipQueryIncludesBothDateBoundariesAndExcludesFutureExpiredOrInactive() {
        long missing = member();
        assertFalse(subscriptions.hasActiveMembership(missing, LocalDate.now(clock)));
        for (String state : List.of("future", "expired", "pending_payment", "cancelled", "today")) {
            long member = member();
            String status = List.of("pending_payment", "cancelled").contains(state) ? state : "active";
            int start = state.equals("future") ? 1 : state.equals("today") ? 0 : -30;
            int end = state.equals("expired") ? -1 : state.equals("today") ? 0 : 30;
            subscription(member, status, start, end);
            assertEquals(state.equals("today"), subscriptions.hasActiveMembership(member, LocalDate.now(clock)), state);
        }
    }

    // SCRUM-74: real PostgreSQL locks, independent connections, bounded blocking barriers.
    // These tests require the explicitly configured isolated Supabase test project/schema.
    @Test
    void twoMembersCompeteForLastSeatThroughRealClassLock() throws Exception {
        long first = bookingMember();
        long second = bookingMember();
        long gymClass = bookingClass(1);
        long session = bookingSession(gymClass);
        var results = raceOnClass(gymClass,
                () -> bookingService.enroll(memberPrincipal(first), session),
                () -> bookingService.enroll(memberPrincipal(second), session));
        assertEquals(1, results.stream().filter(this::succeeded).count());
        assertEquals(1, rowCount("class_enrollments", gymClass, "booked"));
    }

    @Test
    void membershipHoldAndEnrollmentSerializeOnMemberBeforeClass() throws Exception {
        long owner = bookingMember();
        long gymClass = bookingClass(1);
        long session = bookingSession(gymClass);
        long subscriptionId = jdbc.queryForObject("select id from membership_subscriptions where member_id = ?", Long.class, owner);
        jdbc.update("update membership_subscriptions set hold_status = 'PENDING', hold_reason = 'Fixture', hold_requested_at = ? where id = ?",
                LocalDateTime.now(clock), subscriptionId);
        var ready = new CountDownLatch(2);
        var holdPid = new AtomicInteger();
        var enrollPid = new AtomicInteger();
        Future<Object> hold;
        Future<Object> enrollment;
        try (var blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            try {
                lockRow(blocker, "select user_id from members where user_id = ? for update", owner);
                hold = submit(ready, holdPid, () -> membershipService.approveHold(staff, subscriptionId));
                enrollment = submit(ready, enrollPid, () -> bookingService.enroll(memberPrincipal(owner), session));
                awaitBlocked(ready, holdPid, enrollPid);
                blocker.commit();
            } finally {
                blocker.rollback();
            }
        }
        hold.get(20, TimeUnit.SECONDS);
        succeeded(enrollment); // Allowed to book before hold, or to be rejected after it; no deadlock is allowed.
        assertEquals("frozen", jdbc.queryForObject("select status from membership_subscriptions where id = ?", String.class, subscriptionId));
        assertEquals(0, rowCount("class_enrollments", gymClass, "booked"));
    }

    @Test
    void rollbackDoesNotPersistCancellationOrNotifications() {
        long owner = bookingMember();
        long gymClass = bookingClass(1);
        long booking = booked(gymClass, owner);
        new TransactionTemplate(transactionManager).execute(status -> {
            bookingService.cancel(memberPrincipal(owner), booking);
            status.setRollbackOnly();
            return null;
        });
        assertEquals(1, rowCount("class_enrollments", gymClass, "booked"));
        assertEquals(0, notificationCount("class_enrollment", booking));
    }

    private List<Future<Object>> raceOnClass(long gymClass, Supplier<?> first, Supplier<?> second) throws Exception {
        var ready = new CountDownLatch(2);
        var firstPid = new AtomicInteger();
        var secondPid = new AtomicInteger();
        Future<Object> a;
        Future<Object> b;
        try (var blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            try {
                lockRow(blocker, "select id from classes where id = ? for update", gymClass);
                a = submit(ready, firstPid, () -> (Object) first.get());
                b = submit(ready, secondPid, () -> (Object) second.get());
                awaitBlocked(ready, firstPid, secondPid);
                blocker.commit();
            } finally {
                blocker.rollback();
            }
        }
        return List.of(a, b);
    }

    private boolean succeeded(Future<?> result) {
        try {
            result.get(20, TimeUnit.SECONDS);
            return true;
        } catch (ExecutionException error) {
            assertInstanceOf(AppException.class, error.getCause(), "A database failure/deadlock is not a valid business rejection");
            return false;
        } catch (Exception error) {
            throw new AssertionError(error);
        }
    }

    private AuthenticatedPrincipal memberPrincipal(long member) {
        return new AuthenticatedPrincipal(member, "booking-fixture", "MEMBER");
    }

    private long bookingMember() {
        long member = member();
        subscription(member, "active", -1, 365);
        return member;
    }

    private long bookingClass(int capacity) {
        long coach = user("COACH");
        jdbc.update("insert into coaches (user_id, employment_status) values (?, 'active')", coach);
        return jdbc.queryForObject("""
                insert into classes (name, discipline_id, coach_id, room_id, capacity, level, status, created_at, updated_at)
                values (?, (select min(id) from disciplines), ?, (select min(id) from rooms),
                        ?, 'all', 'active', now(), now()) returning id
                """, Long.class, "Concurrency-" + UUID.randomUUID(), coach, capacity);
    }

    private long bookingSession(long gymClass) {
        return jdbc.queryForObject("""
                insert into class_sessions (class_id, session_date, start_time, end_time, status, created_at, updated_at)
                values (?, ?, '10:00', '11:00', 'scheduled', now(), now()) returning id
                """, Long.class, gymClass, LocalDate.now(clock).plusDays(BOOKING_DAY.getAndIncrement()));
    }

    private long booked(long gymClass, long member) {
        return jdbc.queryForObject("insert into class_enrollments (class_id, member_id, status, enrolled_at) values (?, ?, 'booked', now()) returning id",
                Long.class, gymClass, member);
    }

    private int rowCount(String table, long gymClass, String status) {
        assertTrue(Set.of("class_enrollments").contains(table));
        return jdbc.queryForObject("select count(*) from " + table + " where class_id = ? and status = ?",
                Integer.class, gymClass, status);
    }

    private int notificationCount(String type, long id) {
        return jdbc.queryForObject("select count(*) from notifications where related_entity_type = ? and related_entity_id = ?",
                Integer.class, type, id);
    }

    private <T> Future<T> submit(CountDownLatch ready, AtomicInteger backendPid, Supplier<T> action) {
        return workers.submit(() -> new TransactionTemplate(transactionManager).execute(status -> {
            jdbc.execute("set local statement_timeout = '15s'");
            backendPid.set(jdbc.queryForObject("select pg_backend_pid()", Integer.class));
            ready.countDown();
            return action.get();
        }));
    }

    private void awaitBlocked(CountDownLatch ready, AtomicInteger... backendPids) throws InterruptedException {
        assertTrue(ready.await(10, TimeUnit.SECONDS), "All workers must enter their transactions");
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            boolean allBlocked = true;
            for (AtomicInteger backendPid : backendPids) {
                allBlocked &= Boolean.TRUE.equals(jdbc.queryForObject(
                        "select exists(select 1 from pg_stat_activity where pid = ? and wait_event_type = 'Lock')",
                        Boolean.class, backendPid.get()));
            }
            if (allBlocked) return;
            Thread.sleep(25);
        }
        fail("Every operation must actually wait on a PostgreSQL row lock before release");
    }

    private static void lockRow(Connection connection, String sql, long id) throws Exception {
        try (var statement = connection.prepareStatement(sql)) {
            statement.setLong(1, id);
            try (var result = statement.executeQuery()) {
                assertTrue(result.next());
            }
        }
    }

    private static CheckinDto checkoutResult(Future<CheckinDto> result) throws Exception {
        try {
            return result.get(20, TimeUnit.SECONDS);
        } catch (ExecutionException error) {
            var failure = assertInstanceOf(BadRequestException.class, error.getCause());
            assertEquals("CHECKIN_ALREADY_CHECKED_OUT", failure.getErrorCode());
            return null;
        }
    }

    private CheckinDto scan(String qr) {
        return checkins.scan(staff, new CheckinRequests.Scan(qr, "Integration gate"));
    }

    private int countVisits(long member, String condition) {
        return jdbc.queryForObject("select count(*) from center_checkins where member_id = ? and " + condition,
                Integer.class, member);
    }

    private LocalDateTime timestamp(long visit, String column) {
        return jdbc.queryForObject("select " + column + " from center_checkins where id = ?", LocalDateTime.class, visit);
    }

    private long user(String role) {
        return jdbc.queryForObject("""
                insert into users (role_id, full_name, email, password_hash, status, created_at, updated_at)
                values ((select id from roles where code = ?), 'Operations fixture', ?, 'unused', 'active', now(), now()) returning id
                """, Long.class, role, UUID.randomUUID() + "@example.invalid");
    }

    private long member() {
        long member = user("MEMBER");
        jdbc.update("insert into members (user_id, membership_code, join_date, fitness_level) values (?, ?, current_date, 'beginner')",
                member, "OPERATIONS-" + member);
        return member;
    }

    private String subscription(long member, String status, int startOffset, int endOffset) {
        String qr = UUID.randomUUID().toString();
        LocalDate today = LocalDate.now(clock);
        jdbc.update("""
                insert into membership_subscriptions
                    (member_id, package_id, start_date, end_date, status, qr_code, created_at, updated_at)
                values (?, (select min(id) from membership_packages), ?, ?, ?, ?, now(), now())
                """, member, today.plusDays(startOffset), today.plusDays(endOffset), status, qr);
        return qr;
    }

    private static String credential(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Set " + name + " for Supabase tests");
        return value;
    }

    private static Connection connectTestDatabase() throws SQLException {
        String url = credential("SCMS_POSTGRES_TEST_URL");
        String sslMode = System.getenv().getOrDefault("DB_SSL_MODE", "require");
        if (!url.startsWith("jdbc:postgresql:")
                || url.matches("(?is).*[?&](?:user|password|ssl|sslmode|sslfactory)=.*")
                || !Set.of("require", "verify-ca", "verify-full").contains(sslMode)) {
            throw new IllegalStateException("Supabase tests require a PostgreSQL URL and encrypted TLS");
        }
        Properties settings = new Properties();
        settings.setProperty("user", credential("SCMS_POSTGRES_TEST_USERNAME"));
        settings.setProperty("password", credential("SCMS_POSTGRES_TEST_PASSWORD"));
        settings.setProperty("sslmode", sslMode);
        String certificate = System.getenv("DB_SSL_ROOT_CERT");
        if (certificate != null && !certificate.isBlank()) settings.setProperty("sslrootcert", certificate);
        return DriverManager.getConnection(url, settings);
    }
}
