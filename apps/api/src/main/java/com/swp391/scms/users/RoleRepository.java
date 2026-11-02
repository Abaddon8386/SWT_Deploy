package com.swp391.scms.users;

import com.swp391.scms.users.entity.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select r from Role r where r.code = :code")
    Optional<Role> lockByCode(@org.springframework.data.repository.query.Param("code") String code);
    Optional<Role> findByCode(String code);
    Optional<Role> findByCodeIgnoreCase(String code);
}
