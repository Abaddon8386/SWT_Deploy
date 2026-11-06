package com.swp391.scms.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static com.swp391.scms.config.SupabaseTestDatabase.credential;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real Supabase PostgreSQL. Uses a fresh, uniquely named schema and never resets public. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("supabase")
@EnabledIfEnvironmentVariable(named = "SCMS_POSTGRES_TEST_URL", matches = "jdbc:postgresql:.+")
class PostgreSqlDatabaseIntegrationTest {
    private static final String SCHEMA = "scrum91_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String ADMIN_EMAIL = "scrum91-test@example.invalid";
    private static final String ADMIN_PASSWORD = "IntegrationTest_91!";

    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManagerFactory entities;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired DataSource dataSource;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) throws Exception {
        // The schema name is generated here, never supplied by external configuration.
        try (var connection = SupabaseTestDatabase.connect();
             var statement = connection.createStatement()) {
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
        properties.add("app.bootstrap.manager.email", () -> ADMIN_EMAIL);
        properties.add("app.bootstrap.manager.password", () -> ADMIN_PASSWORD);
        properties.add("app.auth.otp.delivery", () -> "disabled");
    }

    @AfterAll
    static void cleanup() throws Exception {
        assertTrue(SCHEMA.matches("scrum91_test_[a-f0-9]{32}"));
        try (var connection = SupabaseTestDatabase.connect();
             var statement = connection.createStatement()) {
            statement.execute("drop schema if exists \"" + SCHEMA + "\" cascade");
        }
    }

    @Autowired com.swp391.scms.membership.service.MembershipRealtimeService realtime;

    @Test
    @EnabledIfEnvironmentVariable(named = "SUPABASE_PUBLISHABLE_KEY", matches = "sb_publishable_.+")
    void supabaseBroadcastIsDataFreeAndOnlyDeliveredAfterCommit() throws Exception {
        long owner = member();
        var session = realtime.open(new com.swp391.scms.security.AuthenticatedPrincipal(owner, "fixture", "MEMBER"));
        assertEquals(session.topic(), "membership:" + jdbc.queryForObject("select payment_realtime_topic from members where user_id = ?", String.class, owner));
        assertTrue(session.enabled(), "Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for live Realtime QA");
        var joined = new CountDownLatch(1);
        var events = new LinkedBlockingQueue<com.fasterxml.jackson.databind.JsonNode>();
        var buffer = new StringBuilder();
        var uri = java.net.URI.create(session.url().replace("https://", "wss://")
                + "/realtime/v1/websocket?apikey=" + session.publishableKey() + "&vsn=1.0.0");
        var socket = java.net.http.HttpClient.newHttpClient().newWebSocketBuilder()
                .buildAsync(uri, new java.net.http.WebSocket.Listener() {
                    @Override public void onOpen(java.net.http.WebSocket ws) { ws.request(1); }
                    @Override public java.util.concurrent.CompletionStage<?> onText(java.net.http.WebSocket ws, CharSequence text, boolean last) {
                        buffer.append(text);
                        if (last) {
                            try {
                                var frame = json.readTree(buffer.toString());
                                if ("phx_reply".equals(frame.path("event").asText())
                                        && "ok".equals(frame.path("payload").path("status").asText())) joined.countDown();
                                if ("broadcast".equals(frame.path("event").asText())) events.add(frame.path("payload"));
                            } catch (Exception e) { throw new RuntimeException(e); }
                            buffer.setLength(0);
                        }
                        ws.request(1);
                        return null;
                    }
                }).get(20, TimeUnit.SECONDS);
        try {
            socket.sendText(json.writeValueAsString(java.util.Map.of("topic", "realtime:" + session.topic(),
                    "event", "phx_join", "payload", java.util.Map.of("config", java.util.Map.of(
                        "broadcast", java.util.Map.of("ack", false, "self", false),
                        "presence", java.util.Map.of("enabled", false), "postgres_changes", java.util.List.of(), "private", false)), "ref", "1")), true).join();
            assertTrue(joined.await(15, TimeUnit.SECONDS), "Supabase channel must subscribe");
            try (var connection = dataSource.getConnection()) {
                connection.setAutoCommit(false);
                try (var insert = connection.prepareStatement("insert into payments (member_id,amount,method,status,created_at) values (?,299000,'cash','pending',now())")) {
                    insert.setLong(1, owner); insert.executeUpdate();
                    var warning = insert.getWarnings();
                    assertNull(warning, "Realtime SQL warning: " + String.valueOf(warning));
                    assertNull(events.poll(800, TimeUnit.MILLISECONDS), "Uncommitted data must not emit");
                    connection.commit();
                    var event = events.poll(15, TimeUnit.SECONDS);
                    assertNotNull(event, "Committed payment must emit through Supabase Realtime");
                    assertEquals("changed", event.path("event").asText());
                    assertTrue(event.path("payload").isObject());
                    assertTrue(event.path("payload").size() <= 1, "Only Supabase-generated delivery ID is allowed");
                    assertTrue(!event.path("payload").has("id") || event.path("payload").path("id").asText().matches("[a-f0-9-]{36}"));
                    insert.executeUpdate();
                    connection.rollback();
                    assertNull(events.poll(1200, TimeUnit.MILLISECONDS), "Rollback must not emit");
                } finally { connection.rollback(); connection.setAutoCommit(true); }
            }
            // Changing another member's payment must not reach this capability channel.
            long other = member();
            jdbc.update("insert into payments (member_id,amount,method,status,created_at) values (?,499000,'cash','pending',now())", other);
            assertNull(events.poll(800, TimeUnit.MILLISECONDS));
        } finally { socket.sendClose(1000, "done").join(); }
    }

    private long user(String role) {
        return jdbc.queryForObject("""
                insert into users (role_id, full_name, email, password_hash, status, created_at, updated_at)
                values ((select id from roles where code = ?), 'Nguyễn Test', ?, 'unused', 'active', now(), now()) returning id
                """, Long.class, role, UUID.randomUUID() + "@example.invalid");
    }

    private long member() {
        long id = user("MEMBER");
        jdbc.update("insert into members (user_id, membership_code, join_date, fitness_level) values (?, ?, current_date, 'beginner')",
                id, "TEST-" + id);
        return id;
    }

    private void subscription(long member, String status, int startOffset, int endOffset) {
        jdbc.update("""
                insert into membership_subscriptions
                    (member_id, package_id, start_date, end_date, status, created_at, updated_at)
                values (?, (select min(id) from membership_packages), current_date + ?, current_date + ?, ?, now(), now())
                """, member, startOffset, endOffset, status);
    }

    private long activeMember() {
        long id = member();
        subscription(id, "active", -1, 30);
        return id;
    }

    private long coach() {
        long id = user("COACH");
        jdbc.update("insert into coaches (user_id, employment_status) values (?, 'active')", id);
        return id;
    }

    private long room() {
        return jdbc.queryForObject("insert into rooms (name, capacity, status) values (?, 10, 'available') returning id",
                Long.class, "Room " + UUID.randomUUID());
    }

    private long gymClass(int capacity, long coach, long room) {
        return jdbc.queryForObject("""
                insert into classes (name, discipline_id, coach_id, room_id, capacity, level, status, created_at, updated_at)
                values (?, (select min(id) from disciplines), ?, ?, ?, 'all', 'active', now(), now()) returning id
                """, Long.class, "Class " + UUID.randomUUID(), coach, room, capacity);
    }

    private void enroll(long gymClass, long member, String status) {
        jdbc.update("insert into class_enrollments (class_id, member_id, status, enrolled_at) values (?, ?, ?, now())",
                gymClass, member, status);
    }

    private void session(long gymClass, String start, String end, String status) {
        jdbc.update("""
                insert into class_sessions (class_id, session_date, start_time, end_time, status, created_at, updated_at)
                values (?, current_date, cast(? as time), cast(? as time), ?, now(), now())
                """, gymClass, start, end, status);
    }

    private void ptBooking(long member, long coach, String start, String end) {
        jdbc.update("""
                insert into coach_bookings (member_id, coach_id, booking_date, start_time, end_time,
                    hourly_rate, payment_method, payment_status, status, created_at)
                values (?, ?, current_date, cast(? as time), cast(? as time), 200000, 'cash', 'pending', 'confirmed', now())
                """, member, coach, start, end);
    }

    @Test
    void ptTriggerRequiresRestEvenForOutOfOrderBookings() {
        for (int missing : new int[]{10, 11, 12, 13}) {
            long coach = coach();
            for (int hour = 10; hour <= 13; hour++) {
                if (hour != missing) ptBooking(activeMember(), coach, hour + ":00", (hour + 1) + ":00");
            }
            var failure = assertThrows(DataIntegrityViolationException.class,
                    () -> ptBooking(activeMember(), coach, missing + ":00", (missing + 1) + ":00"));
            assertTrue(failure.getMostSpecificCause().getMessage().contains("trg_coach_bookings_rest_required"));
        }
        long coach = coach();
        ptBooking(activeMember(), coach, "10:00", "11:00");
        ptBooking(activeMember(), coach, "11:00", "12:00");
        ptBooking(activeMember(), coach, "12:00", "13:00");
        ptBooking(activeMember(), coach, "14:00", "15:00");
    }

    @Test
    void ptTriggerRejectsConflictsInBothBookingDirectionsAndRequiresMembership() {
        long coach = coach(), member = activeMember();
        ptBooking(member, coach, "14:00", "15:00");
        assertThrows(DataIntegrityViolationException.class, () -> ptBooking(activeMember(), coach, "14:30", "15:30"));
        assertThrows(DataIntegrityViolationException.class, () -> ptBooking(member, coach(), "14:30", "15:30"));
        assertThrows(DataIntegrityViolationException.class, () -> ptBooking(member(), coach(), "16:00", "17:00"));
        long group = gymClass(10, coach(), room());
        session(group, "14:00", "15:00", "scheduled");
        assertThrows(DataIntegrityViolationException.class, () -> enroll(group, member, "booked"));
        long other = activeMember();
        enroll(group, other, "booked");
        assertThrows(DataIntegrityViolationException.class, () -> ptBooking(other, coach(), "14:30", "15:30"));
        long coachedGroup = gymClass(10, coach, room());
        assertThrows(DataIntegrityViolationException.class, () -> session(coachedGroup, "14:30", "15:30", "scheduled"));
        ptBooking(member, coach, "15:00", "16:00");
    }

    @Test
    void concurrentPtBookingsCannotDoubleBookCoach() throws Exception {
        long coach = coach(), first = activeMember(), second = activeMember();
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var one = executor.submit(() -> ptAfterLatch(start, first, coach));
            var two = executor.submit(() -> ptAfterLatch(start, second, coach));
            start.countDown();
            assertEquals(1, (one.get(15, TimeUnit.SECONDS) ? 1 : 0) + (two.get(15, TimeUnit.SECONDS) ? 1 : 0));
        }
    }

    private boolean ptAfterLatch(CountDownLatch start, long member, long coach) throws Exception {
        start.await();
        try {
            ptBooking(member, coach, "18:00", "19:00");
            return true;
        } catch (DataIntegrityViolationException expected) {
            String reason = expected.getMostSpecificCause().getMessage();
            assertTrue(reason.contains("trg_sessions_check_conflict") || reason.contains("trg_pt_schedule_busy"));
            return false;
        }
    }

    @Test
    void hibernateBootstrapsAllReferenceTablesAndMandatoryTriggers() {
        assertTrue(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema = ?",
                Integer.class, SCHEMA) >= 33);
        assertEquals(5, jdbc.queryForObject("""
                select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = ? and not t.tgisinternal
                """, Integer.class, SCHEMA));
    }

    @Test
    void capacityTriggerRejectsOverflowAndRollsBack() {
        long gymClass = gymClass(1, coach(), room());
        enroll(gymClass, activeMember(), "booked");
        long rejected = activeMember();
        var error = assertThrows(DataIntegrityViolationException.class, () -> enroll(gymClass, rejected, "booked"));
        assertTrue(error.getMostSpecificCause().getMessage().contains("Lớp học đã đầy chỗ (vượt quá capacity cho phép)."));
        assertEquals(1, jdbc.queryForObject("select count(*) from class_enrollments where class_id = ?", Integer.class, gymClass));
    }

    @Test
    void concurrentBookingsCannotTakeTheSameLastSlot() throws Exception {
        long gymClass = gymClass(1, coach(), room());
        long first = activeMember(), second = activeMember();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Boolean> booking1 = () -> bookAfterLatch(start, gymClass, first);
            Callable<Boolean> booking2 = () -> bookAfterLatch(start, gymClass, second);
            Future<Boolean> a = pool.submit(booking1), b = pool.submit(booking2);
            start.countDown();
            int successes = (a.get(30, TimeUnit.SECONDS) ? 1 : 0) + (b.get(30, TimeUnit.SECONDS) ? 1 : 0);
            assertEquals(1, successes);
            assertEquals(1, jdbc.queryForObject("select count(*) from class_enrollments where class_id = ? and status = 'booked'", Integer.class, gymClass));
        } finally {
            pool.shutdownNow();
        }
    }

    private boolean bookAfterLatch(CountDownLatch start, long gymClass, long member) throws Exception {
        assertTrue(start.await(10, TimeUnit.SECONDS));
        try {
            enroll(gymClass, member, "booked");
            return true;
        } catch (DataIntegrityViolationException e) {
            assertTriggerViolation(e, "Lớp học đã đầy chỗ (vượt quá capacity cho phép).");
            return false;
        }
    }

    private static void assertTriggerViolation(DataIntegrityViolationException error, String expectedMessage) {
        // PostgreSQL sends CONSTRAINT as a protocol field, not as part of getMessage().
        var cause = assertInstanceOf(SQLException.class, error.getMostSpecificCause());
        assertEquals("23514", cause.getSQLState());
        assertTrue(cause.getMessage().contains(expectedMessage), cause.getMessage());
    }

    @Test
    void partialIndexAllowsHistoryButRejectsDuplicateActiveEnrollment() {
        long gymClass = gymClass(10, coach(), room()), member = activeMember();
        enroll(gymClass, member, "cancelled");
        enroll(gymClass, member, "cancelled");
        enroll(gymClass, member, "booked");
        var duplicate = assertThrows(DataIntegrityViolationException.class, () -> enroll(gymClass, member, "booked"));
        assertTrue(duplicate.getMostSpecificCause().getMessage().contains("uq_enrollment_active"));
    }

    @Test
    void sessionTriggerRejectsCoachAndRoomOverlapButAllowsAdjacentOrCancelledSessions() {
        long coach = coach(), room = room();
        long original = gymClass(10, coach, room);
        session(original, "09:00", "10:00", "scheduled");
        long sameCoach = gymClass(10, coach, room());
        long sameRoom = gymClass(10, coach(), room);
        for (long conflicting : new long[]{sameCoach, sameRoom}) {
            var error = assertThrows(DataIntegrityViolationException.class, () -> session(conflicting, "09:30", "10:30", "scheduled"));
            assertTrue(error.getMostSpecificCause().getMessage().contains("Huấn luyện viên hoặc phòng tập đã có lịch trùng khung giờ này."));
        }
        session(sameCoach, "10:00", "11:00", "scheduled");
        session(sameRoom, "09:30", "10:30", "cancelled");
    }

    @Test
    void membershipTriggersRejectMissingExpiredInactiveAndFutureSubscriptions() {
        long gymClass = gymClass(10, coach(), room());
        for (String state : new String[]{"missing", "expired", "pending_payment", "future"}) {
            long member = member();
            if (!state.equals("missing")) {
                subscription(member, state.equals("future") ? "active" : state,
                        state.equals("future") ? 1 : -30, state.equals("expired") ? -1 : 30);
            }
            var booking = assertThrows(DataIntegrityViolationException.class, () -> enroll(gymClass, member, "booked"));
            assertTriggerViolation(booking, "Học viên không có gói thành viên còn hiệu lực để đăng ký lớp.");
            var checkin = assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                    "insert into center_checkins (member_id, check_in_time, method) values (?, now(), 'qr')", member));
            assertTriggerViolation(checkin, "Học viên không có gói thành viên còn hiệu lực để check-in.");
        }
        long valid = activeMember();
        enroll(gymClass, valid, "booked");
        jdbc.update("insert into center_checkins (member_id, check_in_time, method) values (?, now(), 'qr')", valid);
    }

    @Test
    void generatedColumnsAreStoredAndRecomputedByDatabase() {
        long member = activeMember();
        long payment = jdbc.queryForObject("""
                insert into payments (member_id, amount, method, status, created_at)
                values (?, 100, 'cash', 'success', now()) returning id
                """, Long.class, member);
        long invoice = jdbc.queryForObject("""
                insert into invoices (payment_id, invoice_number, issued_at, subtotal_amount, tax_amount, created_at)
                values (?, ?, now(), 100, 10, now()) returning id
                """, Long.class, payment, UUID.randomUUID().toString());
        assertEquals(0, new BigDecimal("110").compareTo(jdbc.queryForObject("select total_amount from invoices where id = ?", BigDecimal.class, invoice)));
        jdbc.update("update invoices set subtotal_amount = 200 where id = ?", invoice);
        assertEquals(0, new BigDecimal("210").compareTo(jdbc.queryForObject("select total_amount from invoices where id = ?", BigDecimal.class, invoice)));
        long item = jdbc.queryForObject("insert into invoice_items (invoice_id, description, quantity, unit_price) values (?, 'Test', 2, 25) returning id", Long.class, invoice);
        assertEquals(0, new BigDecimal("50").compareTo(jdbc.queryForObject("select amount from invoice_items where id = ?", BigDecimal.class, item)));
        jdbc.update("update invoice_items set quantity = 3 where id = ?", item);
        assertEquals(0, new BigDecimal("75").compareTo(jdbc.queryForObject("select amount from invoice_items where id = ?", BigDecimal.class, item)));
    }

    @Test
    void jsonIsNativeJsonbAndRejectsInvalidInput() {
        assertEquals("jsonb", jdbc.queryForObject("select udt_name from information_schema.columns where table_schema = ? and table_name = 'report_snapshots' and column_name = 'data'", String.class, SCHEMA));
        jdbc.update("insert into report_snapshots (report_type, period_start, period_end, data, generated_at) values ('revenue', current_date, current_date, ?::jsonb, now())", "{\"total\":91}");
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update(
                "insert into report_snapshots (report_type, period_start, period_end, data, generated_at) values ('revenue', current_date, current_date, ?::jsonb, now())", "not-json"));
    }

    @Test
    void entityChecksRejectInvalidBusinessStatesOnTheDatabase() {
        long gymClass = gymClass(10, coach(), room());
        var error = assertThrows(DataIntegrityViolationException.class,
                () -> jdbc.update("update classes set status = 'invalid' where id = ?", gymClass));
        assertTrue(error.getMostSpecificCause().getMessage().contains("ck_classes_status"));
    }

    @Test
    void supabaseRlsIsEnabledForApplicationTablesAndOwnerCanStillRead() {
        new PostgreSqlDataSecurityInitializer(entities, jdbc).run(new DefaultApplicationArguments());
        assertEquals(0, jdbc.queryForObject("select count(*) from pg_tables where schemaname = ? and not rowsecurity", Integer.class, SCHEMA));
        assertTrue(jdbc.queryForObject("select count(*) from roles", Integer.class) >= 4);
    }

    @Test
    void rlsDeniesReadsForAnAvailableNonBypassRoleEvenWithTableGrants() throws Exception {
        var roles = jdbc.queryForList("""
                select rolname from pg_roles
                where rolname in ('anon', 'pg_read_all_data')
                  and not rolbypassrls and not rolsuper and pg_has_role(oid, 'MEMBER')
                order by rolname limit 1
                """, String.class);
        Assumptions.assumeFalse(roles.isEmpty(), "Test JDBC role must be allowed to SET ROLE anon or pg_read_all_data");
        String role = roles.getFirst(); // Selected from a fixed allowlist, never user input.
        new PostgreSqlDataSecurityInitializer(entities, jdbc).run(new DefaultApplicationArguments());
        jdbc.execute("grant usage on schema \"" + SCHEMA + "\" to \"" + role + "\"");
        jdbc.execute("grant select on all tables in schema \"" + SCHEMA + "\" to \"" + role + "\"");
        try (var connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (var statement = connection.createStatement()) {
                statement.execute("set local role \"" + role + "\"");
                try (var result = statement.executeQuery("select count(*) from roles")) {
                    assertTrue(result.next());
                    assertEquals(0, result.getInt(1));
                }
            } finally {
                connection.rollback();
                connection.setAutoCommit(true);
            }
        }
    }

    @Test
    void existingHttpEndpointsUseRealPostgresPersistenceAndJwt() throws Exception {
        mvc.perform(get("/api/v1/health")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/payments/member/1")).andExpect(status().isUnauthorized());
        String login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"" + ADMIN_PASSWORD + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String token = json.readTree(login).path("data").path("token").asText();
        assertFalse(token.isBlank());
        long member = activeMember();
        for (String route : new String[]{"/api/v1/disciplines", "/api/v1/rooms", "/api/v1/packages", "/api/v1/payments/member/" + member}) {
            mvc.perform(get(route).header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        }
        String payment = mvc.perform(post("/api/v1/payments").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"memberId\":" + member
                                + ",\"amount\":91000,\"method\":\"cash\",\"status\":\"success\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long paymentId = json.readTree(payment).path("data").path("id").asLong();
        assertTrue(paymentId > 0);
        mvc.perform(post("/api/v1/invoices/auto-issue/" + paymentId).header("Authorization", "Bearer " + token))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.totalAmount").value(91000));
        mvc.perform(get("/api/v1/invoices/by-payment/" + paymentId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].amount").value(91000));
    }
}
