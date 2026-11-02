package com.swp391.scms.config.trigger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.core.JdbcTemplate;

class TriggerProvidersTest {

    @Test
    void enrollmentMembershipUsesVietnamBusinessDateRegardlessOfDatabaseTimezone() throws Exception {
        List<String> sql = new ArrayList<>();
        JdbcTemplate jdbc = legacyCheckins(sql, true, DatabaseMetaData.columnNullable);

        new PostgreSqlTriggerProvider().applyTriggers(jdbc);

        String script = sql.stream()
                .filter(statement -> statement.contains("FUNCTION scms_require_active_membership_for_enrollment()")
                        && statement.contains("RETURNS trigger"))
                .findFirst().orElseThrow();
        int functionStart = script.indexOf("CREATE OR REPLACE FUNCTION scms_require_active_membership_for_enrollment()");
        String function = script.substring(functionStart, script.indexOf("\n$$;", functionStart));
        assertTrue(function.contains("statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh'"));
        assertTrue(function.contains("subscription.start_date <= business_date"));
        assertTrue(function.contains("subscription.end_date >= business_date"));
        assertFalse(function.contains("CURRENT_DATE"));
    }

    @Test
    void upgradesLegacyCheckinNullabilityBeforeInstallingTriggersAndOnlyOnce() throws Exception {
        List<String> sql = new ArrayList<>();
        JdbcTemplate jdbc = legacyCheckins(sql, true, DatabaseMetaData.columnNoNulls,
                DatabaseMetaData.columnNullable);
        DatabaseTriggerProvider provider = new PostgreSqlTriggerProvider();

        provider.applyTriggers(jdbc);
        provider.applyTriggers(jdbc);

        String upgrade = "alter table \"tenant\".\"center_checkins\" alter column \"member_id\" drop not null";
        assertEquals(upgrade, sql.getFirst().toLowerCase());
        assertEquals(1, sql.stream().filter(statement -> statement.toLowerCase().startsWith("alter table")).count());
        assertTrue(sql.stream().anyMatch(statement -> statement.contains("trg_checkins_check_membership")),
                "The upgrade must still install the membership trigger");
    }

    @Test
    void leavesFreshNullableCheckinsAndUnmappedTablesAlone() throws Exception {
        for (boolean exists : new boolean[]{true, false}) {
            List<String> sql = new ArrayList<>();
            JdbcTemplate jdbc = legacyCheckins(sql, exists, DatabaseMetaData.columnNullable);
            DatabaseTriggerProvider provider = new PostgreSqlTriggerProvider();

            provider.applyTriggers(jdbc);

            assertFalse(sql.stream().anyMatch(statement -> statement.toLowerCase().startsWith("alter table")));
        }
    }

    @Test
    void doesNotUpgradeOtherSchemasReturnedByJdbcMetadataPatterns() throws Exception {
        List<String> sql = new ArrayList<>();
        JdbcTemplate jdbc = legacyCheckins(sql, true, DatabaseMetaData.columnNoNulls);
        var columns = jdbc.getDataSource().getConnection().getMetaData()
                .getColumns("scms", "tenant", "center_checkins", "member_id");
        when(columns.getString("TABLE_SCHEM")).thenReturn("other_tenant");

        new PostgreSqlTriggerProvider().applyTriggers(jdbc);

        assertFalse(sql.stream().anyMatch(statement -> statement.toLowerCase().startsWith("alter table")));
    }

    @Test
    void refusesToChangeAnUnexpectedLegacyColumnType() throws Exception {
        List<String> sql = new ArrayList<>();
        JdbcTemplate jdbc = legacyCheckins(sql, true, DatabaseMetaData.columnNoNulls);
        var columns = jdbc.getDataSource().getConnection().getMetaData()
                .getColumns("scms", "tenant", "center_checkins", "member_id");
        when(columns.getInt("DATA_TYPE")).thenReturn(Types.VARCHAR);

        assertThrows(IllegalStateException.class, () -> new PostgreSqlTriggerProvider().applyTriggers(jdbc));

        assertTrue(sql.isEmpty(), "An unexpected column type must fail before any schema or trigger changes");
    }

    private JdbcTemplate legacyCheckins(List<String> sql, boolean exists, int... nullability) throws Exception {
        DataSource source = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        ResultSet columns = mock(ResultSet.class);
        Statement statement = mock(Statement.class);
        when(source.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(connection.getCatalog()).thenReturn("scms");
        when(connection.getSchema()).thenReturn("tenant");
        when(metadata.getColumns("scms", "tenant", "center_checkins", "member_id")).thenReturn(columns);
        when(columns.next()).thenReturn(exists, false, exists, false);
        when(columns.getString("TABLE_SCHEM")).thenReturn("tenant");
        when(columns.getString("TABLE_NAME")).thenReturn("center_checkins");
        when(columns.getString("COLUMN_NAME")).thenReturn("member_id");
        when(columns.getInt("DATA_TYPE")).thenReturn(Types.BIGINT);
        when(columns.getInt("NULLABLE")).thenReturn(nullability[0],
                nullability.length > 1 ? nullability[1] : nullability[0]);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.execute(anyString())).thenAnswer(invocation -> {
            sql.add(invocation.getArgument(0));
            return false;
        });
        when(statement.getUpdateCount()).thenReturn(-1);
        return new JdbcTemplate(source);
    }

    private static BadSqlGrammarException grammar(SQLException cause) {
        return new BadSqlGrammarException("sql", "select", cause);
    }

    @Test
    void postgresFailsStartupWhenMandatoryTablesOrTriggersAreMissing() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        PostgreSqlTriggerProvider provider = new PostgreSqlTriggerProvider();

        doThrow(grammar(new SQLException("missing", "42P01"))).when(jdbc).execute(anyString());
        assertThrows(IllegalStateException.class, () -> provider.applyTriggers(jdbc));

        doThrow(grammar(new SQLException("syntax", "42601"))).when(jdbc).execute(anyString());
        assertThrows(IllegalStateException.class, () -> provider.applyTriggers(jdbc));
    }

}
