package com.swp391.scms.users;

import com.swp391.scms.users.entity.Coach;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CoachRepository extends JpaRepository<Coach, Long> {
    @Query("""
            select c from Coach c join fetch c.user u
            where c.employmentStatus = 'active' and u.status = 'active' and u.deletedAt is null
            order by u.fullName, c.userId
            """)
    List<Coach> findPublicCoaches();

    @Query("""
            SELECT c FROM Coach c JOIN FETCH c.user u
            WHERE LOWER(c.employmentStatus) = 'active'
              AND u.deletedAt IS NULL
              AND LOWER(u.status) = 'active'
            """)
    List<Coach> findActiveWithUser();
}
