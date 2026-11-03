package com.swp391.scms.catalog.cache;

import com.swp391.scms.facilities.dto.CatalogRequests.PackageRequest;
import com.swp391.scms.facilities.repository.MembershipPackageRepository;
import com.swp391.scms.facilities.service.PackageService;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.core.Ordered;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Actual Spring service proxy + transaction advisor, without substituting a database engine. */
class CatalogCacheInvalidationTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAspectJAutoProxy
    @EnableTransactionManagement(order = Ordered.LOWEST_PRECEDENCE - 1)
    static class Config {
        @Bean PublicCatalogCache cache() { return mock(PublicCatalogCache.class); }
        @Bean CatalogCacheInvalidation invalidation(PublicCatalogCache cache) { return new CatalogCacheInvalidation(cache); }
        @Bean MembershipPackageRepository packages() {
            var repo = mock(MembershipPackageRepository.class);
            when(repo.save(any())).thenAnswer(call -> call.getArgument(0));
            return repo;
        }
        @Bean PackageService packagesService(MembershipPackageRepository repo) { return new PackageService(repo); }
        @Bean PlatformTransactionManager transactionManager() {
            return new AbstractPlatformTransactionManager() {
                @Override protected Object doGetTransaction() { return new Object(); }
                @Override protected void doBegin(Object tx, TransactionDefinition definition) { }
                @Override protected void doCommit(DefaultTransactionStatus status) { }
                @Override protected void doRollback(DefaultTransactionStatus status) { }
            };
        }
    }

    private PackageRequest request() { return new PackageRequest("Silver", "Gym", BigDecimal.TEN, 30, 8, "active"); }

    @Test void mutationEvictsAfterCommitThroughRealServiceProxy() {
        try (var context = new AnnotationConfigApplicationContext(Config.class)) {
            var cache = context.getBean(PublicCatalogCache.class);
            context.getBean(PackageService.class).create(request());
            verify(cache).invalidate();
        }
    }

    @Test void deferredInvalidationDoesNotRunOnRollback() {
        var cache = mock(PublicCatalogCache.class);
        var aspect = new CatalogCacheInvalidation(cache);
        var annotation = org.springframework.core.annotation.AnnotationUtils.synthesizeAnnotation(
                org.springframework.transaction.annotation.Transactional.class);
        TransactionSynchronizationManager.initSynchronization();
        try {
            aspect.afterMutation(annotation);
            verifyNoInteractions(cache);
            TransactionSynchronizationManager.getSynchronizations().forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
            verifyNoInteractions(cache);
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
    }

    @Test void readOnlyQueryDoesNotEvict() {
        try (var context = new AnnotationConfigApplicationContext(Config.class)) {
            context.getBean(PackageService.class).list();
            verifyNoInteractions(context.getBean(PublicCatalogCache.class));
        }
    }
}
