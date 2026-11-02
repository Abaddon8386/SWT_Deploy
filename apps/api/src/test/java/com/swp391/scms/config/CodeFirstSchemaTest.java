package com.swp391.scms.config;

import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.persistence.Entity;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;

/**
 * Code-first guard: the JPA entities alone must be able to generate every table of
 * databaseschema.sql on PostgreSQL, without a live connection or hand-written runtime DDL.
 */
class CodeFirstSchemaTest {

    private static final Path SCHEMA = Path.of("..", "..", "db", "databaseschema.sql");

    private static String generateDdl() throws Exception {
        return generateDdl(factory -> {});
    }

    private static String generateDdl(java.util.function.Consumer<org.hibernate.SessionFactory> verify) throws Exception {
        Path out = Files.createTempFile("ddl", ".sql");
        StandardServiceRegistry registry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect")
                .applySetting("hibernate.boot.allow_jdbc_metadata_access", "false")
                .applySetting("jakarta.persistence.schema-generation.database.action", "none")
                .applySetting("jakarta.persistence.schema-generation.scripts.action", "create")
                .applySetting("jakarta.persistence.schema-generation.scripts.create-target", out.toString())
                .build();
        try {
            MetadataSources sources = new MetadataSources(registry);
            ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
            scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
            scanner.findCandidateComponents("com.swp391.scms").forEach(bd -> {
                try {
                    sources.addAnnotatedClass(Class.forName(bd.getBeanClassName()));
                } catch (ClassNotFoundException e) {
                    throw new IllegalStateException(e);
                }
            });
            try (var factory = sources.buildMetadata().buildSessionFactory()) {
                verify.accept(factory);
            }
            return Files.readString(out, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    private static Set<String> schemaTables() throws IOException {
        Matcher m = Pattern.compile("CREATE TABLE dbo\\.(\\w+)", Pattern.CASE_INSENSITIVE)
                .matcher(Files.readString(SCHEMA, StandardCharsets.UTF_8));
        Set<String> tables = new TreeSet<>();
        while (m.find()) {
            tables.add(m.group(1).toLowerCase(Locale.ROOT));
        }
        return tables;
    }

    @Test
    void entitiesGenerateEveryTableOfTheReferenceSchema() throws Exception {
        assertTrue(Files.exists(SCHEMA), "db/databaseschema.sql must be reachable from the test working dir");
        String ddl = generateDdl();
        Set<String> tables = schemaTables();
        assertTrue(tables.size() >= 30, "reference schema should list its tables");
        for (String table : tables) {
            assertTrue(ddl.matches("(?s).*create table \"?" + table + "\\b.*"),
                    "No entity generates PostgreSQL table " + table);
        }
    }

    @Test
    void cancellationPaymentQueryCompilesAgainstEntityMappingsWithoutDatabase() throws Exception {
        var method = com.swp391.scms.finance.repository.PaymentRepository.class.getMethod(
                "hasUnsettledUpcomingEnrollmentPayment", Long.class, java.time.LocalDate.class, java.time.LocalTime.class);
        String jpql = method.getAnnotation(org.springframework.data.jpa.repository.Query.class).value();
        generateDdl(factory -> {
            try (var session = factory.openSession()) {
                session.createQuery(jpql, Boolean.class)
                        .setParameter("memberId", 10L)
                        .setParameter("today", java.time.LocalDate.of(2026, 10, 22))
                        .setParameter("nowTime", java.time.LocalTime.of(8, 0));
            }
        });
    }

    @Test
    void authenticationProjectionCompilesAgainstEntityMappingsWithoutDatabase() throws Exception {
        var method = com.swp391.scms.users.UserRepository.class.getMethod("findAuthenticationById", Long.class);
        String jpql = method.getAnnotation(org.springframework.data.jpa.repository.Query.class).value();
        generateDdl(factory -> {
            try (var session = factory.openSession()) {
                session.createQuery(jpql, com.swp391.scms.users.dto.AuthenticationUser.class)
                        .setParameter("id", 10L);
            }
        });
    }

    @Test
    void groupedEnrollmentCountsCompileAgainstEntityMappingsWithoutDatabase() throws Exception {
        var method = com.swp391.scms.scheduling.repository.ClassEnrollmentRepository.class.getMethod(
                "countByClassIdsAndStatus", java.util.List.class, String.class);
        String jpql = method.getAnnotation(org.springframework.data.jpa.repository.Query.class).value();
        generateDdl(factory -> {
            try (var session = factory.openSession()) {
                session.createQuery(jpql, com.swp391.scms.scheduling.dto.ClassBookingCount.class)
                        .setParameter("classIds", java.util.List.of(11L, 12L))
                        .setParameter("status", "booked");
            }
        });
    }

    @Test
    void paymentsReferenceSubscriptionsAndEnrollments() throws Exception {
        String ddl = generateDdl();
        assertTrue(ddl.contains("foreign key (subscription_id) references membership_subscriptions"));
        assertTrue(ddl.contains("foreign key (class_enrollment_id) references class_enrollments"));
    }

    @Test
    void courtsAreCodeFirstAndNewRoomConfigurationPreservesLegacyNullability() throws Exception {
        String ddl = generateDdl();
        assertTrue(ddl.contains("create table court_bookings"), ddl);
        assertTrue(ddl.contains("foreign key (room_id) references rooms"), ddl);
        assertTrue(ddl.contains("booking_date"), ddl);
        var room = com.swp391.scms.facilities.entity.Room.class;
        assertTrue(room.getDeclaredField("discipline").getAnnotation(jakarta.persistence.JoinColumn.class).nullable());
        assertTrue(room.getDeclaredField("openTime").getAnnotation(jakarta.persistence.Column.class).nullable());
        assertTrue(room.getDeclaredField("closeTime").getAnnotation(jakarta.persistence.Column.class).nullable());
    }

    @Test
    void courtJpqlCompilesAgainstEntityMappingsWithoutConnectingToDatabase() throws Exception {
        Class<?> repository = Class.forName("com.swp391.scms.courts.repository.CourtBookingRepository");
        generateDdl(factory -> {
            try (var session = factory.openSession()) {
                for (var method : repository.getMethods()) {
                    var query = method.getAnnotation(org.springframework.data.jpa.repository.Query.class);
                    if (query != null && !query.nativeQuery()) {
                        session.createQuery(query.value());
                        if (!query.countQuery().isBlank()) session.createQuery(query.countQuery());
                    }
                }
            }
        });
    }

    @Test
    void postgresGeneratesStoredComputedColumnsAndNativeJson() throws Exception {
        String ddl = generateDdl();
        assertTrue(ddl.contains("generated always as (subtotal_amount + tax_amount) stored"), ddl);
        assertTrue(ddl.contains("generated always as (quantity * unit_price) stored"), ddl);
        assertTrue(ddl.contains("data jsonb"), ddl);
        assertTrue(ddl.contains("old_value jsonb"), ddl);
        assertTrue(ddl.contains("recommended_content jsonb"), ddl);
    }

    @Test
    void preservesReferenceCheckConstraintsExceptJsonWhichUsesNativeMapping() throws Exception {
        String ddl = generateDdl();
        Matcher checks = Pattern.compile("CONSTRAINT\\s+(ck_\\w+)\\s+CHECK", Pattern.CASE_INSENSITIVE)
                .matcher(Files.readString(SCHEMA, StandardCharsets.UTF_8));
        while (checks.find()) {
            String name = checks.group(1).toLowerCase(Locale.ROOT);
            if (!name.endsWith("_json")) {
                assertTrue(ddl.contains("constraint " + name + " check"), "Missing PostgreSQL CHECK: " + name);
            }
        }
    }
}
