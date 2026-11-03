package com.swp391.scms.users;

import com.swp391.scms.users.entity.User;
import com.swp391.scms.users.dto.AuthenticationUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    long countByRole_CodeAndDeletedAtIsNullAndStatus(String code, String status);
    List<User> findAllByDeletedAtIsNullAndRole_CodeInOrderByIdAsc(List<String> roleCodes);
    List<User> findAllByDeletedAtIsNullOrderByIdAsc();
    Optional<User> findByIdAndDeletedAtIsNull(Long id);
    @Query("select new com.swp391.scms.users.dto.AuthenticationUser(u.id, u.username, u.status, r.code) "
            + "from User u join u.role r where u.id = :id and u.deletedAt is null")
    Optional<AuthenticationUser> findAuthenticationById(@Param("id") Long id);
    Optional<User> findByUsernameIgnoreCase(String username);
    Optional<User> findByUsernameIgnoreCaseAndDeletedAtIsNull(String username);
    @Query("select u from User u where u.deletedAt is null and (lower(u.username) = lower(:identifier) or lower(u.email) = lower(:identifier))")
    Optional<User> findActiveByIdentifier(@Param("identifier") String identifier);
    Optional<User> findByEmailIgnoreCase(String email);
    Optional<User> findByEmailIgnoreCaseAndDeletedAtIsNull(String email);
    Optional<User> findByPhone(String phone);
    Optional<User> findByPhoneAndDeletedAtIsNull(String phone);
    Optional<User> findByGoogleSub(String googleSub);

    @Query("select u from User u join fetch u.role r where u.deletedAt is null and upper(r.code) in ('CENTER_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'ROLE_CENTER_MANAGER', 'ROLE_MANAGER', 'ROLE_RECEPTIONIST', 'ROLE_STAFF') order by u.id asc")
    List<User> findActiveStaffUsers();
    @Query("select u from User u join fetch u.role r where u.deletedAt is null and u.status = 'active' and upper(r.code) in ('MANAGER', 'CENTER_MANAGER', 'ROLE_MANAGER', 'ROLE_CENTER_MANAGER') order by u.id asc")
    List<User> findActiveManagers();
}
