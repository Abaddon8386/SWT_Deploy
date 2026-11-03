package com.swp391.scms.config;

import com.swp391.scms.chat.dto.SendChatMessage;
import com.swp391.scms.chat.service.ChatService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static com.swp391.scms.config.SupabaseTestDatabase.credential;

/** Hibernate creates the tables in a disposable schema, never in public. */
@SpringBootTest
@ActiveProfiles("supabase")
@EnabledIfEnvironmentVariable(named = "SCMS_POSTGRES_TEST_URL", matches = "jdbc:postgresql:.+")
class ChatPostgreSqlTest {
    static final String SCHEMA = "chat_test_" + UUID.randomUUID().toString().replace("-", "");
    @Autowired JdbcTemplate jdbc;
    @Autowired ChatService service;

    @DynamicPropertySource static void database(DynamicPropertyRegistry p) throws Exception {
        try (var c = SupabaseTestDatabase.connect(); var s = c.createStatement()) { s.execute("create schema \"" + SCHEMA + "\""); }
        p.add("spring.datasource.url", () -> credential("SCMS_POSTGRES_TEST_URL"));
        p.add("spring.datasource.username", () -> credential("SCMS_POSTGRES_TEST_USERNAME"));
        p.add("spring.datasource.password", () -> credential("SCMS_POSTGRES_TEST_PASSWORD"));
        p.add("spring.datasource.hikari.schema", () -> SCHEMA);
        p.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        p.add("spring.jpa.hibernate.ddl-auto", () -> "update");
        p.add("app.jwt.secret", () -> "chat-integration-test-private-key-at-least-32-bytes");
        p.add("app.bootstrap.manager.email", () -> "");
        p.add("app.bootstrap.manager.password", () -> "");
        p.add("app.supabase.chat-jwt-secret", () -> "");
    }

    @AfterAll static void cleanup() throws Exception {
        assertThat(SCHEMA).matches("chat_test_[a-f0-9]{32}");
        try (var c = SupabaseTestDatabase.connect(); var s = c.createStatement()) { s.execute("drop schema if exists \"" + SCHEMA + "\" cascade"); }
    }

    @Test void concurrentOpenAndRetryProduceOneConversationAndOneMessage() throws Exception {
        long member = user("MEMBER"), coach = user("COACH");
        var p = new AuthenticatedPrincipal(member, "fixture", "MEMBER");
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
            Callable<Long> open = () -> { ready.countDown(); start.await(); return service.open(p, coach).id(); };
            var a = executor.submit(open); var b = executor.submit(open);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue(); start.countDown();
            long id = a.get(30, TimeUnit.SECONDS);
            assertThat(b.get(30, TimeUnit.SECONDS)).isEqualTo(id);
            assertThat(jdbc.queryForObject("select count(*) from chat_conversations where member_user_id = ? and staff_user_id = ?", Long.class, member, coach)).isEqualTo(1);
            UUID retry = UUID.randomUUID(); var text = new SendChatMessage(retry, "Hello from concurrent retry");
            Callable<Long> send = () -> service.send(p, id, text).id();
            var x = executor.submit(send); var y = executor.submit(send);
            assertThat(x.get(30, TimeUnit.SECONDS)).isEqualTo(y.get(30, TimeUnit.SECONDS));
            assertThat(service.history(p, id, null, null).items()).hasSize(1);
            assertThat(jdbc.queryForObject("select relrowsecurity from pg_class where oid = ?::regclass", Boolean.class, SCHEMA + ".chat_messages")).isTrue();
        }
    }

    @Test void unreadCountsFollowEachSidesReadMarker() {
        long member = user("MEMBER"), coach = user("COACH");
        var m = new AuthenticatedPrincipal(member, "fixture", "MEMBER");
        var c = new AuthenticatedPrincipal(coach, "fixture", "COACH");
        long id = service.open(m, coach).id();
        service.send(m, id, new SendChatMessage(UUID.randomUUID(), "Chào HLV"));
        long last = service.send(m, id, new SendChatMessage(UUID.randomUUID(), "Em muốn hỏi lịch")).id();
        assertThat(service.unreadCount(m).count()).isZero();
        assertThat(service.unreadCount(c).count()).isEqualTo(2);
        var row = service.list(c, 0).getContent().getFirst();
        assertThat(row.unreadCount()).isEqualTo(2);
        assertThat(row.lastMessage()).isEqualTo("Em muốn hỏi lịch");
        assertThat(service.markRead(c, id, new com.swp391.scms.chat.dto.MarkChatRead(last)).count()).isZero();
        service.send(c, id, new SendChatMessage(UUID.randomUUID(), "Chào em"));
        assertThat(service.unreadCount(m).count()).isEqualTo(1);
    }

    @Test void databaseEnforcesUniquePairAndForeignKeys() {
        long member = user("MEMBER"), staff = user("RECEPTIONIST");
        var p = new AuthenticatedPrincipal(member, "fixture", "MEMBER");
        service.open(p, staff);
        assertThatThrownBy(() -> jdbc.update("insert into chat_conversations(member_user_id,staff_user_id,created_at,last_activity_at) values (?,?,now(),now())", member, staff))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("insert into chat_conversations(member_user_id,staff_user_id,created_at,last_activity_at) values (?,?,now(),now())", member, -999L))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    private long user(String role) {
        return jdbc.queryForObject("insert into users(role_id,full_name,email,username,password_hash,status,created_at,updated_at) "
                + "select id,'Chat fixture',?,?,'unused','active',now(),now() from roles where code = ? returning id", Long.class,
                UUID.randomUUID() + "@example.invalid", UUID.randomUUID().toString(), role);
    }
}
