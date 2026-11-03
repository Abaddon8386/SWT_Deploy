package com.swp391.scms.facilities.repository;

import com.swp391.scms.facilities.entity.Equipment;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EquipmentRepository extends JpaRepository<Equipment, Long> {

    @Query("SELECT e FROM Equipment e LEFT JOIN FETCH e.room ORDER BY e.name ASC")
    List<Equipment> findAllWithRoom();

    @Query("SELECT e FROM Equipment e LEFT JOIN FETCH e.room WHERE e.room.id = :roomId ORDER BY e.name ASC")
    List<Equipment> findByRoomId(@Param("roomId") Long roomId);

    @Query("SELECT e FROM Equipment e LEFT JOIN FETCH e.room WHERE e.id = :id")
    Optional<Equipment> findByIdWithRoom(@Param("id") Long id);

    boolean existsByCode(String code);

    boolean existsByCodeAndIdNot(String code, Long id);

    long countByStatus(String status);
}

