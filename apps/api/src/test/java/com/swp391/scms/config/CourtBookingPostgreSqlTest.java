package com.swp391.scms.config;

import com.swp391.scms.config.trigger.PostgreSqlTriggerProvider;
import jakarta.persistence.Entity;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/** Runs the actual Hibernate schema and PostgreSQL triggers, with independent database transactions. */
@EnabledIfEnvironmentVariable(named = "SCMS_POSTGRES_TEST_URL", matches = "jdbc:postgresql:.+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CourtBookingPostgreSqlTest {
    private final String schema = "court_test_" + UUID.randomUUID().toString().replace("-", "");
    private Connection connection;
    private JdbcTemplate jdbc;
    private long discipline;
    private long membershipPackage;
    private LocalDate tomorrow;

    @BeforeAll
    void createIsolatedHibernateSchema() throws Exception {
        connection = SupabaseTestDatabase.connect();
        try (var statement = connection.createStatement()) {
            statement.execute("create schema \"" + schema + "\"");
        }
        connection.setSchema(schema);
        var source = new SingleConnectionDataSource(connection, true);
        jdbc = new JdbcTemplate(source);
        synchronizeEntities(source, schema, "create");
        new PostgreSqlTriggerProvider().applyTriggers(jdbc);
        jdbc.update("insert into roles (code,name,created_at) values ('MEMBER','Court member',now()),('COACH','Court coach',now())");
        discipline = jdbc.queryForObject("insert into disciplines (name,created_at) values ('Tennis',now()) returning id", Long.class);
        membershipPackage = jdbc.queryForObject("""
                insert into membership_packages (name,price,duration_days,status,created_at,updated_at)
                values ('Court fixture',0,30,'active',now(),now()) returning id
                """, Long.class);
        tomorrow = jdbc.queryForObject("select (statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date + 1", LocalDate.class);
    }

    @AfterAll
    void removeOnlyGeneratedSchema() throws Exception {
        if (connection == null) return;
        try (var cleanup = connection; var statement = cleanup.createStatement()) {
            assertTrue(schema.matches("court_test_[a-f0-9]{32}"));
            statement.execute("drop schema if exists \"" + schema + "\" cascade");
        }
    }

    @Test
    void concurrentMembersCompetingForOneCourtHaveExactlyOneWinner() throws Exception {
        long room = room();
        long first = member(true);
        long second = member(true);
        race("room:" + room,
                worker -> booking(worker, room, first, 10),
                worker -> booking(worker, room, second, 10),
                "trg_court_bookings_check_conflict");
        assertEquals(1, count("room_id = " + room));
    }

    @Test
    void concurrentOverlappingCourtsForOneMemberHaveExactlyOneWinner() throws Exception {
        long firstRoom = room();
        long secondRoom = room();
        long member = member(true);
        race("court-member:" + member,
                worker -> booking(worker, firstRoom, member, 10),
                worker -> booking(worker, secondRoom, member, 10),
                "trg_court_bookings_check_conflict");
        assertEquals(1, count("member_id = " + member));
    }

    @Test
    void concurrentFifthBookingCannotExceedDailyLimit() throws Exception {
        long firstRoom = room();
        long secondRoom = room();
        long member = member(true);
        booking(jdbc, firstRoom, member, 8);
        booking(jdbc, firstRoom, member, 9);
        booking(jdbc, firstRoom, member, 11);
        race("court-member:" + member,
                worker -> booking(worker, firstRoom, member, 10),
                worker -> booking(worker, secondRoom, member, 12),
                "trg_court_bookings_check_limit");
        assertEquals(4, count("member_id = " + member));
    }

    @Test
    void classesAndBookingsBlockEachOtherInBothDirectionsAndCancellationReleasesSlot() {
        long room = room();
        long member = member(true);
        long gymClass = gymClass(room);
        session(jdbc, gymClass, 10);
        constraint("trg_court_bookings_check_conflict", () -> booking(jdbc, room, member, 10));
        long booking = booking(jdbc, room, member, 12);
        constraint("trg_court_bookings_check_conflict", () -> session(jdbc, gymClass, 12));
        jdbc.update("update court_bookings set status='cancelled',cancelled_at=now() where id=?", booking);
        session(jdbc, gymClass, 12);
        // Half-open intervals allow an adjacent hour.
        booking(jdbc, room, member, 13);
    }

    @Test
    void concurrentClassAndCourtInsertionHaveExactlyOneWinner() throws Exception {
        long room = room();
        long member = member(true);
        long gymClass = gymClass(room);
        race("room:" + room,
                worker -> booking(worker, room, member, 10),
                worker -> session(worker, gymClass, 10),
                "trg_court_bookings_check_conflict");
        int booked = count("room_id = " + room);
        int classes = jdbc.queryForObject("select count(*) from class_sessions where class_id=?", Integer.class, gymClass);
        assertEquals(1, booked + classes);
    }

    @Test
    void movingAClassIntoAnOccupiedCourtIsRejected() {
        long source = room();
        long target = room();
        long gymClass = gymClass(source);
        session(jdbc, gymClass, 10);
        booking(jdbc, target, member(true), 10);
        constraint("trg_court_bookings_check_conflict", () -> jdbc.update("update classes set room_id=? where id=?", target, gymClass));
        assertEquals(source, jdbc.queryForObject("select room_id from classes where id=?", Long.class, gymClass));
    }

    @Test
    void directSqlCannotBypassMembershipCoverageOrCourtAndTimeRules() {
        long room = room();
        long inactive = member(false);
        constraint("trg_court_bookings_check_membership", () -> booking(jdbc, room, inactive, 10));
        long expiresToday = member(true);
        jdbc.update("update membership_subscriptions set end_date=? where member_id=?", tomorrow.minusDays(1), expiresToday);
        constraint("trg_court_bookings_check_membership", () -> booking(jdbc, room, expiresToday, 10));
        long member = member(true);
        jdbc.update("update rooms set status='maintenance' where id=?", room);
        constraint("trg_court_bookings_check_court", () -> booking(jdbc, room, member, 10));
        jdbc.update("update rooms set status='available' where id=?", room);
        constraint("trg_court_bookings_check_slot", () -> insertBooking(jdbc, room, member, tomorrow, "10:30", "11:30"));
        constraint("trg_court_bookings_check_slot", () -> insertBooking(jdbc, room, member, tomorrow, "05:00", "06:00"));
        constraint("trg_court_bookings_check_past", () -> insertBooking(jdbc, room, member, tomorrow.minusDays(2), "10:00", "11:00"));
        constraint("trg_court_bookings_check_horizon", () -> insertBooking(jdbc, room, member, tomorrow.plusDays(7), "10:00", "11:00"));
    }

    @Test
    void upgradingLegacyRoomsPreservesRowsAndAddsNullableCourtConfiguration() throws Exception {
        String upgradeSchema = "court_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        try (var upgrade = SupabaseTestDatabase.connect(); var statement = upgrade.createStatement()) {
            statement.execute("create schema \"" + upgradeSchema + "\"");
            try {
                upgrade.setSchema(upgradeSchema);
                var source = new SingleConnectionDataSource(upgrade, true);
                var old = new JdbcTemplate(source);
                synchronizeEntities(source, upgradeSchema, "create");
                // Reproduce the pre-feature table while retaining all other entity-owned tables.
                old.execute("alter table rooms drop column discipline_id, drop column open_time, drop column close_time");
                long legacy = old.queryForObject("insert into rooms(name,capacity,status) values ('Legacy studio',20,'available') returning id", Long.class);
                synchronizeEntities(source, upgradeSchema, "update");
                assertEquals("Legacy studio", old.queryForObject("select name from rooms where id=?", String.class, legacy));
                assertEquals(1, old.queryForObject("select count(*) from rooms where id=? and discipline_id is null and open_time is null and close_time is null", Integer.class, legacy));
                assertEquals(3, old.queryForObject("""
                        select count(*) from information_schema.columns where table_schema=? and table_name='rooms'
                        and column_name in ('discipline_id','open_time','close_time') and is_nullable='YES'
                        """, Integer.class, upgradeSchema));
                new PostgreSqlTriggerProvider().applyTriggers(old);
            } finally {
                assertTrue(upgradeSchema.matches("court_upgrade_[a-f0-9]{32}"));
                statement.execute("drop schema if exists \"" + upgradeSchema + "\" cascade");
            }
        }
    }

    private void race(String resource, SqlAction first, SqlAction second, String expectedConstraint) throws Exception {
        var workers = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var firstPid = new AtomicInteger();
        var secondPid = new AtomicInteger();
        try (var blocker = workerConnection()) {
            blocker.setAutoCommit(false);
            new JdbcTemplate(new SingleConnectionDataSource(blocker, true)).queryForObject(
                    "select pg_advisory_xact_lock(hashtextextended(?,0))", Object.class, resource);
            Future<String> a = workers.submit(() -> concurrentWrite(ready, firstPid, first));
            Future<String> b = workers.submit(() -> concurrentWrite(ready, secondPid, second));
            try {
                assertTrue(ready.await(10, TimeUnit.SECONDS));
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                boolean blocked = false;
                while (System.nanoTime() < deadline) {
                    blocked = Boolean.TRUE.equals(jdbc.queryForObject("""
                            select count(*) = 2 from pg_stat_activity
                            where pid in (?,?) and wait_event_type='Lock'
                            """, Boolean.class, firstPid.get(), secondPid.get()));
                    if (blocked) break;
                    Thread.sleep(20);
                }
                assertTrue(blocked, "Both actual PostgreSQL transactions must contend before lock release");
            } finally {
                blocker.rollback();
            }
            List<String> results = List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS));
            assertEquals(1, results.stream().filter("success"::equals).count(), results.toString());
            assertEquals(1, results.stream().filter(expectedConstraint::equals).count(), results.toString());
        } finally {
            workers.shutdownNow();
            assertTrue(workers.awaitTermination(30, TimeUnit.SECONDS));
        }
    }

    private String concurrentWrite(CountDownLatch ready, AtomicInteger pid, SqlAction action) throws Exception {
        try (var worker = workerConnection()) {
            worker.setAutoCommit(false);
            var db = new JdbcTemplate(new SingleConnectionDataSource(worker, true));
            db.execute("set local statement_timeout='15s'");
            pid.set(db.queryForObject("select pg_backend_pid()", Integer.class));
            ready.countDown();
            try {
                action.run(db);
                worker.commit();
                return "success";
            } catch (DataIntegrityViolationException error) {
                worker.rollback();
                var sql = assertInstanceOf(org.postgresql.util.PSQLException.class, error.getMostSpecificCause());
                assertNotNull(sql.getServerErrorMessage());
                return sql.getServerErrorMessage().getConstraint();
            }
        }
    }

    private Connection workerConnection() throws SQLException {
        Connection worker = SupabaseTestDatabase.connect();
        worker.setSchema(schema);
        return worker;
    }

    private long member(boolean active) {
        long id = user("MEMBER");
        jdbc.update("insert into members (user_id,membership_code,join_date,fitness_level) values (?, ?, current_date, 'beginner')", id, "COURT-" + id);
        if (active) jdbc.update("""
                insert into membership_subscriptions (member_id,package_id,start_date,end_date,status,qr_code,created_at,updated_at)
                values (?, ?, ?, ?, 'active', ?, now(),now())
                """, id, membershipPackage, tomorrow.minusDays(2), tomorrow.plusDays(10), UUID.randomUUID().toString());
        return id;
    }

    private long user(String role) {
        return jdbc.queryForObject("""
                insert into users (role_id,full_name,email,password_hash,status,created_at,updated_at)
                values ((select id from roles where code=?),'Court fixture',?,'unused','active',now(),now()) returning id
                """, Long.class, role, UUID.randomUUID() + "@example.invalid");
    }

    private long room() {
        return jdbc.queryForObject("""
                insert into rooms (name,capacity,status,discipline_id,open_time,close_time)
                values ('Court fixture',2,'available',?,'06:00','22:00') returning id
                """, Long.class, discipline);
    }

    private long gymClass(long room) {
        long coach = user("COACH");
        jdbc.update("insert into coaches (user_id,employment_status) values (?,'active')", coach);
        return jdbc.queryForObject("""
                insert into classes (name,discipline_id,coach_id,room_id,capacity,level,status,created_at,updated_at)
                values ('Court class fixture',?,?,?,2,'all','active',now(),now()) returning id
                """, Long.class, discipline, coach, room);
    }

    private long booking(JdbcTemplate db, long room, long member, int hour) {
        return insertBooking(db, room, member, tomorrow, "%02d:00".formatted(hour), "%02d:00".formatted(hour + 1));
    }

    private long insertBooking(JdbcTemplate db, long room, long member, LocalDate date, String start, String end) {
        return db.queryForObject("""
                insert into court_bookings (room_id,member_id,booking_date,start_time,end_time,status,created_at)
                values (?,?,?,?::time,?::time,'booked',now()) returning id
                """, Long.class, room, member, date, start, end);
    }

    private long session(JdbcTemplate db, long gymClass, int hour) {
        return db.queryForObject("""
                insert into class_sessions (class_id,session_date,start_time,end_time,status,created_at,updated_at)
                values (?,?,?::time,?::time,'scheduled',now(),now()) returning id
                """, Long.class, gymClass, tomorrow, "%02d:00".formatted(hour), "%02d:00".formatted(hour + 1));
    }

    private int count(String condition) {
        return jdbc.queryForObject("select count(*) from court_bookings where status='booked' and " + condition, Integer.class);
    }

    private static void constraint(String name, Runnable action) {
        var error = assertThrows(DataIntegrityViolationException.class, action::run);
        var sql = assertInstanceOf(org.postgresql.util.PSQLException.class, error.getMostSpecificCause());
        assertNotNull(sql.getServerErrorMessage());
        assertEquals(name, sql.getServerErrorMessage().getConstraint());
    }

    private static void synchronizeEntities(SingleConnectionDataSource source, String schema, String action) throws Exception {
        var registry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.connection.datasource", source)
                .applySetting("hibernate.default_schema", schema)
                .applySetting("hibernate.hbm2ddl.auto", action)
                .applySetting("hibernate.hbm2ddl.halt_on_error", true).build();
        try {
            var mappings = new MetadataSources(registry);
            var scanner = new ClassPathScanningCandidateComponentProvider(false);
            scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
            for (var entity : scanner.findCandidateComponents("com.swp391.scms")) {
                mappings.addAnnotatedClass(Class.forName(entity.getBeanClassName()));
            }
            mappings.buildMetadata().buildSessionFactory().close();
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    @FunctionalInterface
    private interface SqlAction { void run(JdbcTemplate db); }
}
