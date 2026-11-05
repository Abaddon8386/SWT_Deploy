package com.swp391.scms.config.trigger;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * PostgreSQL provider checks for mandatory P2, P3, and P4 triggers.
 */
class TriggerPolymorphismIntegrationTest {

    @Test
    @DisplayName("P2/P3/P4 triggers: PostgreSQL trigger script must contain all mandatory business invariants")
    void testPostgreSqlTriggersContainAllInvariants() throws Exception {
        ClassPathResource resource = new ClassPathResource("db/triggers/postgresql-triggers.sql");
        assertTrue(resource.exists(), "PostgreSQL trigger script must exist in classpath");

        String sql;
        try (InputStream is = resource.getInputStream()) {
            sql = new String(is.readAllBytes(), StandardCharsets.UTF_8).toLowerCase();
        }

        // P2: Capacity check
        assertTrue(sql.contains("scms_check_enrollment_capacity"), "Must contain P2 capacity check function");
        assertTrue(sql.contains("trg_enrollments_check_capacity"), "Must contain P2 capacity trigger");

        // P3: Schedule conflicts (Coach & Room)
        assertTrue(sql.contains("scms_check_session_conflict"), "Must contain P3 conflict check function");
        assertTrue(sql.contains("trg_sessions_check_conflict"), "Must contain P3 conflict trigger");
        assertTrue(sql.contains("scms_guard_member_class_overlap"), "Must forbid one member in two overlapping classes");
        assertTrue(sql.contains("trg_member_overlap_session_booking"), "Must guard per-session bookings against member overlap");
        assertTrue(sql.contains("coach_id"), "Must check coach time overlap");
        assertTrue(sql.contains("room_id"), "Must check room time overlap");

        // P4: Membership invariants (Enrollments & Checkins)
        assertTrue(sql.contains("scms_require_active_membership_for_enrollment"), "Must contain P4 enrollment membership check function");
        assertTrue(sql.contains("scms_require_active_membership_for_checkin"), "Must contain P4 checkin membership check function");
        assertTrue(sql.contains("trg_checkins_check_membership"), "Must contain P4 checkin trigger");
        assertTrue(sql.contains("active"), "Must verify subscription status is active");
    }

    @ParameterizedTest
    @ValueSource(strings = {"PostgreSQL", "PostgreSQL 16", "postgresql"})
    @DisplayName("PostgreSqlTriggerProvider should correctly support PostgreSQL database names")
    void testPostgreSqlProviderSupport(String dbName) {
        PostgreSqlTriggerProvider provider = new PostgreSqlTriggerProvider();
        assertTrue(provider.supports(dbName));
        assertFalse(provider.supports(null));
        assertFalse(provider.supports("MySQL"));
    }

    @Test
    @DisplayName("DatabaseTriggerProvider should execute trigger statements cleanly")
    void testTriggerExecutionExecutionFlow() {
        JdbcTemplate mockJdbc = mock(JdbcTemplate.class);
        List<String> executedStatements = new ArrayList<>();

        doAnswer(inv -> {
            executedStatements.add(inv.getArgument(0));
            return null;
        }).when(mockJdbc).execute(anyString());

        PostgreSqlTriggerProvider postgreSqlProvider = new PostgreSqlTriggerProvider();
        postgreSqlProvider.applyTriggers(mockJdbc);

        assertFalse(executedStatements.isEmpty(), "PostgreSQL statements must be executed");
        assertEquals(1, executedStatements.size(), "PostgreSQL executes trigger script as a single batch");
    }
}
