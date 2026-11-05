package com.swp391.scms.shop;

import com.swp391.scms.config.PostgreSqlDataSecurityInitializer;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityManagerFactory;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Runs the actual Hibernate schema and PostgreSQL invariants for Supplement Shop on a dedicated test schema. */
@EnabledIfEnvironmentVariable(named = "SCMS_POSTGRES_TEST_URL", matches = "jdbc:postgresql:.+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ProductOrderPostgreSqlTest {
    private final String schema = "shop_test_" + UUID.randomUUID().toString().replace("-", "");
    private Connection connection;
    private SingleConnectionDataSource source;
    private JdbcTemplate jdbc;

    @BeforeAll
    void createIsolatedHibernateSchema() throws Exception {
        connection = connect();
        try (var statement = connection.createStatement()) {
            statement.execute("create schema \"" + schema + "\"");
        }
        connection.setSchema(schema);
        source = new SingleConnectionDataSource(connection, true);
        jdbc = new JdbcTemplate(source);
        synchronizeEntities(source, schema, "create");
    }

    @AfterAll
    void removeOnlyGeneratedSchema() throws Exception {
        if (connection == null) return;
        try (var cleanup = connection; var statement = cleanup.createStatement()) {
            assertTrue(schema.matches("shop_test_[a-f0-9]{32}"));
            statement.execute("drop schema if exists \"" + schema + "\" cascade");
        }
    }

    @Test
    void negativeStockViolatesCheckConstraint() {
        long catId = jdbc.queryForObject("""
                insert into product_categories (name, slug, sort_order, active, created_at)
                values ('Whey', 'whey-' || gen_random_uuid(), 1, true, now()) returning id
                """, Long.class);
        long prodId = jdbc.queryForObject("""
                insert into products (category_id, name, slug, form, short_description, description, serving_size, active, featured, created_at, updated_at)
                values (?, 'Whey Isolate', 'whey-iso-' || gen_random_uuid(), 'powder', 'Short desc', 'Full desc', '33g', true, false, now(), now()) returning id
                """, Long.class, catId);
        long varId = jdbc.queryForObject("""
                insert into product_variants (product_id, sku, label, price, stock, active, sort_order)
                values (?, 'SKU-' || substr(md5(random()::text), 1, 8), '2lb', 1000000, 1, true, 1) returning id
                """, Long.class, prodId);

        var error = assertThrows(DataIntegrityViolationException.class,
                () -> jdbc.update("update product_variants set stock = -1 where id = ?", varId));
        var sql = assertInstanceOf(org.postgresql.util.PSQLException.class, error.getMostSpecificCause());
        assertNotNull(sql.getServerErrorMessage());
        assertEquals("ck_product_variants_stock_nonneg", sql.getServerErrorMessage().getConstraint());
    }

    @Test
    void concurrentPurchasesOfLastUnitHaveExactlyOneWinner() throws Exception {
        long catId = jdbc.queryForObject("""
                insert into product_categories (name, slug, sort_order, active, created_at)
                values ('Creatine', 'creatine-' || gen_random_uuid(), 1, true, now()) returning id
                """, Long.class);
        long prodId = jdbc.queryForObject("""
                insert into products (category_id, name, slug, form, short_description, description, serving_size, active, featured, created_at, updated_at)
                values (?, 'Creatine', 'creatine-' || gen_random_uuid(), 'powder', 'Short desc', 'Full desc', '5g', true, false, now(), now()) returning id
                """, Long.class, catId);
        long varId = jdbc.queryForObject("""
                insert into product_variants (product_id, sku, label, price, stock, active, sort_order)
                values (?, 'SKU-' || substr(md5(random()::text), 1, 8), '300g', 590000, 1, true, 1) returning id
                """, Long.class, prodId);

        var workers = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var firstPid = new AtomicInteger();
        var secondPid = new AtomicInteger();
        try (var blocker = workerConnection()) {
            blocker.setAutoCommit(false);
            new JdbcTemplate(new SingleConnectionDataSource(blocker, true))
                    .queryForObject("select id from product_variants where id = ? for update", Long.class, varId);
            Future<String> a = workers.submit(() -> decrementStock(ready, firstPid, varId));
            Future<String> b = workers.submit(() -> decrementStock(ready, secondPid, varId));
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
                assertTrue(blocked);
            } finally {
                blocker.rollback();
            }
            List<String> results = List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS));
            assertEquals(1, results.stream().filter("success"::equals).count(), results.toString());
            assertEquals(1, results.stream().filter("ck_product_variants_stock_nonneg"::equals).count(), results.toString());
            assertEquals(0, jdbc.queryForObject("select stock from product_variants where id = ?", Integer.class, varId));
        } finally {
            workers.shutdownNow();
            assertTrue(workers.awaitTermination(30, TimeUnit.SECONDS));
        }
    }

    @Test
    void upgradingLegacyPaymentsTableAddsNullableProductOrderIdColumnAndEnablesRlsOnProductGoals() throws Exception {
        jdbc.execute("alter table payments drop column if exists product_order_id");
        try (var emf = buildSessionFactory(source, schema, "update")) {
            Integer colCount = jdbc.queryForObject("""
                    select count(*) from information_schema.columns
                    where table_schema = ? and table_name = 'payments'
                      and column_name = 'product_order_id' and is_nullable = 'YES'
                    """, Integer.class, schema);
            assertEquals(1, colCount);

            new PostgreSqlDataSecurityInitializer(emf, jdbc).run(new DefaultApplicationArguments());
            for (String table : List.of("product_categories", "products", "product_goals", "product_variants",
                    "product_nutrients", "product_images", "product_stock_movements", "member_addresses",
                    "product_orders", "product_order_items")) {
                Boolean rls = jdbc.queryForObject("""
                        select c.relrowsecurity from pg_class c
                        join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = ? and c.relname = ?
                        """, Boolean.class, schema, table);
                assertEquals(Boolean.TRUE, rls, "RLS must be enabled on " + table);
            }
        }
    }

    private String decrementStock(CountDownLatch ready, AtomicInteger pid, long varId) throws Exception {
        try (var worker = workerConnection()) {
            worker.setAutoCommit(false);
            var db = new JdbcTemplate(new SingleConnectionDataSource(worker, true));
            db.execute("set local statement_timeout='15s'");
            pid.set(db.queryForObject("select pg_backend_pid()", Integer.class));
            ready.countDown();
            try {
                db.queryForObject("select id from product_variants where id = ? for update", Long.class, varId);
                db.update("update product_variants set stock = stock - 1 where id = ?", varId);
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
        Connection worker = connect();
        worker.setSchema(schema);
        return worker;
    }

    private static Connection connect() throws SQLException {
        String url = credential("SCMS_POSTGRES_TEST_URL");
        String sslMode = System.getenv().getOrDefault("DB_SSL_MODE", "require");
        if (!url.startsWith("jdbc:postgresql:") || url.matches("(?is).*[?&](?:user|password|ssl|sslmode|sslfactory)=.*")) {
            throw new IllegalStateException("Use a PostgreSQL JDBC URL; configure credentials and TLS separately");
        }
        if (!Set.of("require", "verify-ca", "verify-full").contains(sslMode.toLowerCase(Locale.ROOT))) {
            throw new IllegalStateException("Supabase requires encrypted SSL connections");
        }
        Properties properties = new Properties();
        properties.setProperty("user", credential("SCMS_POSTGRES_TEST_USERNAME"));
        properties.setProperty("password", credential("SCMS_POSTGRES_TEST_PASSWORD"));
        properties.setProperty("sslmode", sslMode);
        String certificate = System.getenv("DB_SSL_ROOT_CERT");
        if (certificate != null && !certificate.isBlank()) {
            properties.setProperty("sslrootcert", certificate);
        }
        return DriverManager.getConnection(url, properties);
    }

    private static String credential(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Set " + name + " for Supabase integration tests");
        }
        return value;
    }

    private static void synchronizeEntities(SingleConnectionDataSource source, String schema, String action) throws Exception {
        buildSessionFactory(source, schema, action).close();
    }

    private static EntityManagerFactory buildSessionFactory(SingleConnectionDataSource source, String schema, String action) throws Exception {
        var registry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.connection.datasource", source)
                .applySetting("hibernate.default_schema", schema)
                .applySetting("hibernate.hbm2ddl.auto", action)
                .applySetting("hibernate.hbm2ddl.halt_on_error", true)
                .build();
        try {
            var mappings = new MetadataSources(registry);
            var scanner = new ClassPathScanningCandidateComponentProvider(false);
            scanner.addIncludeFilter(new AnnotationTypeFilter(Entity.class));
            for (var entity : scanner.findCandidateComponents("com.swp391.scms")) {
                mappings.addAnnotatedClass(Class.forName(entity.getBeanClassName()));
            }
            return mappings.buildMetadata().buildSessionFactory();
        } catch (Exception e) {
            StandardServiceRegistryBuilder.destroy(registry);
            throw e;
        }
    }
}
