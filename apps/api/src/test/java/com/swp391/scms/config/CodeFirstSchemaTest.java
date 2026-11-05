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
import org.hibernate.SessionFactory;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;

/**
 * Code-first guard: the JPA entities alone must be able to generate every table of
 * databaseschema.sql on PostgreSQL, without a live connection or hand-written runtime DDL.
 */
class CodeFirstSchemaTest {
    /** Tables and checks of features that were dropped; the reference schema is historical and untouched. */
    private static final Set<String> REMOVED_TABLES = Set.of("class_waitlists");
    private static final Set<String> REMOVED_CHECKS = Set.of("ck_waitlist_status");


    private static final Path SCHEMA = Path.of("..", "..", "db", "databaseschema.sql");
    private static StandardServiceRegistry sharedRegistry;
    private static SessionFactory sharedFactory;
    private static String sharedDdl;

    @BeforeAll
    static void initSharedHibernateMetadata() throws Exception {
        Path out = Files.createTempFile("ddl", ".sql");
        sharedRegistry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect")
                .applySetting("hibernate.boot.allow_jdbc_metadata_access", "false")
                .applySetting("jakarta.persistence.schema-generation.database.action", "none")
                .applySetting("jakarta.persistence.schema-generation.scripts.action", "create")
                .applySetting("jakarta.persistence.schema-generation.scripts.create-target", out.toString())
                .build();
        MetadataSources sources = new MetadataSources(sharedRegistry);
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
        scanner.findCandidateComponents("com.swp391.scms").forEach(bd -> {
            try {
                sources.addAnnotatedClass(Class.forName(bd.getBeanClassName()));
            } catch (ClassNotFoundException e) {
                throw new IllegalStateException(e);
            }
        });
        sharedFactory = sources.buildMetadata().buildSessionFactory();
        sharedDdl = Files.readString(out, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
        Files.deleteIfExists(out);
    }

    @AfterAll
    static void closeSharedHibernateMetadata() {
        if (sharedFactory != null) {
            sharedFactory.close();
            sharedFactory = null;
        }
        if (sharedRegistry != null) {
            StandardServiceRegistryBuilder.destroy(sharedRegistry);
            sharedRegistry = null;
        }
    }

    private static String generateDdl() {
        return sharedDdl;
    }

    private static String generateDdl(java.util.function.Consumer<SessionFactory> verify) {
        verify.accept(sharedFactory);
        return sharedDdl;
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
        // The historical reference schema still lists the removed waitlist feature.

        assertTrue(Files.exists(SCHEMA), "db/databaseschema.sql must be reachable from the test working dir");
        String ddl = generateDdl();
        Set<String> tables = schemaTables();
        assertTrue(tables.size() >= 30, "reference schema should list its tables");
        for (String table : tables) {
            if (REMOVED_TABLES.contains(table)) {
                continue;
            }
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
    void classUtilizationQueryCompilesAgainstEntityMappingsWithoutDatabase() throws Exception {
        var repository = com.swp391.scms.reports.repository.SessionAttendanceReportRepository.class;
        var all = repository.getMethod("classUtilizationAll", java.time.LocalDate.class, java.time.LocalDate.class,
                java.time.LocalDateTime.class, java.time.LocalDateTime.class);
        var filtered = repository.getMethod("classUtilizationByDiscipline", java.time.LocalDate.class, java.time.LocalDate.class,
                java.time.LocalDateTime.class, java.time.LocalDateTime.class, Long.class);
        generateDdl(factory -> {
            try (var session = factory.openSession()) {
                for (var method : java.util.List.of(all, filtered)) {
                    String jpql = method.getAnnotation(org.springframework.data.jpa.repository.Query.class).value();
                    var query = session.createQuery(jpql, jakarta.persistence.Tuple.class)
                            .setParameter("start", java.time.LocalDate.of(2026, 11, 1))
                            .setParameter("end", java.time.LocalDate.of(2026, 11, 5))
                            .setParameter("startTs", java.time.LocalDateTime.of(2026, 11, 1, 0, 0))
                            .setParameter("endTs", java.time.LocalDateTime.of(2026, 11, 6, 0, 0));
                    if (method.equals(filtered)) query.setParameter("disciplineId", 1L);
                }
            }
        });
    }

    @Test
    void currentCoachAssignmentQueriesCompileAgainstEntityMappingsWithoutDatabase() throws Exception {
        var plans = com.swp391.scms.coaching.repository.TrainingPlanRepository.class.getMethod(
                "findCurrentAssignments", Long.class, java.time.LocalDate.class);
        var bookings = com.swp391.scms.coaching.repository.CoachBookingRepository.class.getMethod(
                "findCurrentAssignments", Long.class, java.time.LocalDate.class, java.time.LocalTime.class);
        var enrollments = com.swp391.scms.scheduling.repository.ClassEnrollmentRepository.class.getMethod(
                "findCurrentCoachAssignments", Long.class, java.time.LocalDate.class, java.time.LocalTime.class);
        var sessions = com.swp391.scms.scheduling.repository.SessionBookingRepository.class.getMethod(
                "findCurrentCoachAssignments", Long.class, java.time.LocalDate.class, java.time.LocalTime.class);
        generateDdl(factory -> {
            try (var session = factory.openSession()) {
                for (var method : java.util.List.of(plans, bookings, enrollments, sessions)) {
                    var query = session.createQuery(method.getAnnotation(org.springframework.data.jpa.repository.Query.class).value())
                            .setParameter("coachId", 20L)
                            .setParameter("today", java.time.LocalDate.of(2026, 11, 5));
                    if (!method.equals(plans)) query.setParameter("now", java.time.LocalTime.of(8, 0));
                }
            }
        });
    }

    @Test
    void abandonedVnpayAttemptQueryCompilesAgainstEntityMappingsWithoutDatabase() throws Exception {
        var method = com.swp391.scms.finance.repository.VnpayTransactionRepository.class.getMethod(
                "findPaymentIdsWithPendingExpiredBefore", java.time.LocalDateTime.class);
        generateDdl(factory -> {
            try (var session = factory.openSession()) {
                session.createQuery(method.getAnnotation(org.springframework.data.jpa.repository.Query.class).value(), Long.class)
                        .setParameter("cutoff", java.time.LocalDateTime.of(2026, 11, 5, 12, 0));
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
    void performanceOptimizedQueriesCompileAgainstEntityMappingsWithoutDatabase() throws Exception {
        var utilMethod = com.swp391.scms.reports.repository.SessionAttendanceReportRepository.class.getMethod(
                "classUtilizationAll", java.time.LocalDate.class, java.time.LocalDate.class,
                java.time.LocalDateTime.class, java.time.LocalDateTime.class);
        String utilJpql = utilMethod.getAnnotation(org.springframework.data.jpa.repository.Query.class).value();

        var coachMethod = com.swp391.scms.users.CoachRepository.class.getMethod("findActiveWithUser");
        String coachJpql = coachMethod.getAnnotation(org.springframework.data.jpa.repository.Query.class).value();

        var cancelMethod = com.swp391.scms.membership.repository.MembershipCancellationRequestRepository.class.getMethod("findAllForManager");
        String cancelJpql = cancelMethod.getAnnotation(org.springframework.data.jpa.repository.Query.class).value();

        generateDdl(factory -> {
            try (var session = factory.openSession()) {
                session.createQuery(utilJpql);
                session.createQuery(coachJpql, com.swp391.scms.users.entity.Coach.class);
                session.createQuery(cancelJpql, com.swp391.scms.membership.entity.MembershipCancellationRequest.class);
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
            if (!name.endsWith("_json") && !REMOVED_CHECKS.contains(name)) {
                assertTrue(ddl.contains("constraint " + name + " check"), "Missing PostgreSQL CHECK: " + name);
            }
        }
    }
}
