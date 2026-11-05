package com.swp391.scms.scheduling.repository;

import com.swp391.scms.scheduling.entity.GymClass;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GymClassRepository extends JpaRepository<GymClass, Long> {
    boolean existsByRoomId(Long roomId);

    boolean existsByDisciplineId(Long disciplineId);

    List<GymClass> findAllByOrderByIdDesc();

    List<GymClass> findByStatusOrderByIdDesc(String status);

    List<GymClass> findByCoachUserId(Long coachId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from GymClass c where c.id = :id")
    Optional<GymClass> findByIdForUpdate(@Param("id") Long id);
}
