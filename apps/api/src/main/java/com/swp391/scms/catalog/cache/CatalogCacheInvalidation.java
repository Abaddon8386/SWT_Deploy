package com.swp391.scms.catalog.cache;

import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Runs inside the transaction advisor: no eviction on rollback, and no stale write-transaction fills. */
@Aspect
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class CatalogCacheInvalidation {
    private final PublicCatalogCache cache;

    public CatalogCacheInvalidation(PublicCatalogCache cache) { this.cache = cache; }

    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public void afterStartup() { cache.invalidate(); }

    @AfterReturning(value = "@annotation(transaction) && ("
            + "execution(public * com.swp391.scms.facilities.service.PackageService.*(..)) || "
            + "execution(public * com.swp391.scms.users.UserService.*(..)) || "
            + "execution(public * com.swp391.scms.users.ProfileService.*(..)))", argNames = "transaction")
    public void afterMutation(Transactional transaction) {
        if (transaction.readOnly()) return;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { cache.invalidate(); }
            });
        } else {
            cache.invalidate();
        }
    }
}
