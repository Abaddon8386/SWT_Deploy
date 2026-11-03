package com.swp391.scms.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.data.repository.Repository;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

/**
 * Builds every Spring Data repository against the real entity model without a database: derived query method names
 * and every {@code @Query} (JPQL) are parsed and resolved exactly as at application start, so a typo fails here
 * instead of stopping the API from booting.
 */
class RepositoryQueryValidationTest {

    private static LocalContainerEntityManagerFactoryBean factoryBean;
    private static EntityManager entityManager;

    @BeforeAll
    static void bootHibernateWithoutDatabase() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource("jdbc:postgresql://localhost:1/never_connected");
        factoryBean = new LocalContainerEntityManagerFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setPackagesToScan("com.swp391.scms");
        factoryBean.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        factoryBean.setJpaPropertyMap(Map.of(
                "hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect",
                "hibernate.boot.allow_jdbc_metadata_access", "false",
                "hibernate.hbm2ddl.auto", "none"));
        factoryBean.afterPropertiesSet();
        entityManager = SharedEntityManagerCreator.createSharedEntityManager(factoryBean.getObject());
    }

    @AfterAll
    static void close() {
        if (factoryBean != null && factoryBean.getObject() != null) {
            factoryBean.getObject().close();
        }
    }

    @Test
    void everyRepositoryResolvesItsQueries() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(AnnotatedBeanDefinition definition) {
                return definition.getMetadata().isInterface() && definition.getMetadata().isIndependent();
            }
        };
        scanner.addIncludeFilter(new AssignableTypeFilter(Repository.class));
        JpaRepositoryFactory factory = new JpaRepositoryFactory(entityManager);

        List<String> failures = new ArrayList<>();
        int checked = 0;
        for (var candidate : scanner.findCandidateComponents("com.swp391.scms")) {
            Class<?> repository = Class.forName(candidate.getBeanClassName());
            try {
                factory.getRepository(repository);
                checked++;
            } catch (RuntimeException e) {
                Throwable root = e;
                while (root.getCause() != null) {
                    root = root.getCause();
                }
                failures.add(repository.getSimpleName() + ": " + root.getMessage());
            }
        }
        assertTrue(checked > 20, "expected to find the project repositories, found " + checked);
        assertEquals(List.of(), failures);
    }
}
