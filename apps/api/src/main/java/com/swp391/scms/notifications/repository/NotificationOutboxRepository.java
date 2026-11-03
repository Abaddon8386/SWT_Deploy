package com.swp391.scms.notifications.repository;

import com.swp391.scms.notifications.entity.NotificationOutbox;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface NotificationOutboxRepository extends JpaRepository<NotificationOutbox, UUID> {
    @Query("select o.id from NotificationOutbox o where o.completedAt is null and o.nextAttemptAt <= :now order by o.createdAt")
    List<UUID> findDueIds(@Param("now") Instant now, Pageable page);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from NotificationOutbox o where o.id = :id")
    Optional<NotificationOutbox> lockById(@Param("id") UUID id);

    @Modifying
    @Query("delete from NotificationOutbox o where o.completedAt < :cutoff")
    int deleteCompletedBefore(@Param("cutoff") Instant cutoff);

    long countByCompletedAtIsNull();
}
