package com.swp391.scms.config;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.Table;
import jakarta.persistence.JoinTable;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.TreeSet;

/** Supabase Data API must not expose the tables managed by our JWT-protected backend. */
@Component
@Profile("supabase")
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class PostgreSqlDataSecurityInitializer implements ApplicationRunner {
    private final EntityManagerFactory entityManagerFactory;
    private final JdbcTemplate jdbc;

    public PostgreSqlDataSecurityInitializer(EntityManagerFactory entityManagerFactory, JdbcTemplate jdbc) {
        this.entityManagerFactory = entityManagerFactory;
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        String currentSchema = jdbc.queryForObject("select current_schema()", String.class);
        if (currentSchema == null || currentSchema.isBlank()) {
            throw new IllegalStateException("Cannot determine application database schema");
        }
        var tables = new TreeSet<Target>(Comparator.comparing(Target::schema).thenComparing(Target::name));
        for (var entity : entityManagerFactory.getMetamodel().getEntities()) {
            Class<?> type = entity.getJavaType();
            Table table = type.getAnnotation(Table.class);
            if (table != null && !table.name().isBlank()) {
                tables.add(new Target(table.schema().isBlank() ? currentSchema : table.schema(), table.name()));
            }
            // Join tables (role_permissions) also belong to the application schema.
            for (var field : type.getDeclaredFields()) {
                JoinTable join = field.getAnnotation(JoinTable.class);
                if (join != null && !join.name().isBlank()) {
                    tables.add(new Target(join.schema().isBlank() ? currentSchema : join.schema(), join.name()));
                }
                CollectionTable collection = field.getAnnotation(CollectionTable.class);
                if (collection != null && !collection.name().isBlank()) {
                    tables.add(new Target(collection.schema().isBlank() ? currentSchema : collection.schema(), collection.name()));
                }
            }
        }

        // Validate all owners first: our existing JWT is not a Supabase Auth JWT.
        for (Target table : tables) {
            Boolean accessible = jdbc.queryForObject("""
                    select exists (
                        select 1 from pg_class c
                        join pg_namespace n on n.oid = c.relnamespace
                        join pg_roles r on r.rolname = current_user
                        where n.nspname = ? and c.relname = ?
                          and (r.rolsuper or r.rolbypassrls or pg_has_role(c.relowner, 'USAGE'))
                    )
                    """, Boolean.class, table.schema(), table.name());
            if (!Boolean.TRUE.equals(accessible)) {
                throw new IllegalStateException("Supabase JDBC role must own application tables or bypass RLS");
            }
        }
        for (Target table : tables) {
            jdbc.execute("alter table " + quote(table.schema()) + "." + quote(table.name()) + " enable row level security");
        }
    }

    private static String quote(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    private record Target(String schema, String name) {}
}
