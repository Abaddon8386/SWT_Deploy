package com.swp391.scms.audit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.security.AuthenticatedPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Captures selected fields before and after a successful {@link Audited} service call.
 * Transaction advice wraps this aspect, so the log participates in the business transaction.
 */
@Aspect
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class AuditAspect {

    private static final Logger log = LoggerFactory.getLogger(AuditAspect.class);

    private final AuditLogRepository repository;
    private final ObjectMapper objectMapper;
    private final EntityManager entityManager;

    public AuditAspect(AuditLogRepository repository, ObjectMapper objectMapper) {
        this(repository, objectMapper, null);
    }

    @Autowired
    public AuditAspect(AuditLogRepository repository, ObjectMapper objectMapper, EntityManager entityManager) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.entityManager = entityManager;
    }

    @Around("@annotation(audited)")
    public Object around(ProceedingJoinPoint joinPoint, Audited audited) throws Throwable {
        Object[] args = joinPoint.getArgs();
        Long id = args.length > 0 && args[0] instanceof Long value ? value : null;
        if ("class_sessions".equals(audited.entity()) && args.length > 1 && args[1] instanceof Long sessionId) {
            id = sessionId;
        }
        JsonNode oldValue = snapshot(audited.entity(), id, args);
        Object result = joinPoint.proceed();
        JsonNode newValue = snapshot(audited.entity(), id, args);
        record(joinPoint, audited, result, oldValue, newValue);
        return result;
    }

    public void record(JoinPoint joinPoint, Audited audited, Object result) {
        record(joinPoint, audited, result, null, null);
    }

    private void record(JoinPoint joinPoint, Audited audited, Object result, JsonNode oldValue, JsonNode snapshot) {
        try {
            JsonNode newValue = snapshot != null ? snapshot : result == null || "PROFILE_UPDATE".equals(audited.action())
                    ? null : objectMapper.valueToTree(result);
            AuditLog entry = new AuditLog();
            entry.setUserId(currentUserId());
            entry.setAction(audited.action());
            entry.setEntityType(audited.entity());
            entry.setEntityId(resolveEntityId(audited.entity(), joinPoint.getArgs(), newValue));
            entry.setOldValue(oldValue == null ? null : oldValue.toString());
            entry.setNewValue(newValue == null ? null : newValue.toString());
            entry.setIpAddress(currentIp());
            repository.save(entry);
        } catch (RuntimeException e) {
            log.warn("Could not write audit log for action {}", audited.action(), e);
        }
    }

    private JsonNode snapshot(String entity, Long id, Object[] args) {
        if (entityManager == null || id == null) return null;
        try {
            var node = objectMapper.createObjectNode();
            switch (entity) {
                case "users" -> {
                    var user = entityManager.find(com.swp391.scms.users.entity.User.class, id, LockModeType.PESSIMISTIC_WRITE);
                    if (user == null) return null;
                    node.put("id", id).put("fullName", user.getFullName()).put("email", user.getEmail())
                            .put("phone", user.getPhone()).put("status", user.getStatus())
                            .put("gender", user.getGender()).put("avatarUrl", user.getAvatarUrl())
                            .put("address", user.getAddress());
                    if (user.getDob() != null) node.put("dob", user.getDob().toString());
                    if (user.getDeletedAt() != null) node.put("deletedAt", user.getDeletedAt().toString());
                }
                case "coaches" -> {
                    var coach = entityManager.find(com.swp391.scms.users.entity.Coach.class, id, LockModeType.PESSIMISTIC_WRITE);
                    if (coach == null) return null;
                    node.put("id", id).put("specialization", coach.getSpecialization())
                            .put("bio", coach.getBio()).put("certification", coach.getCertification());
                }
                case "receptionists" -> {
                    var receptionist = entityManager.find(com.swp391.scms.users.entity.Receptionist.class, id, LockModeType.PESSIMISTIC_WRITE);
                    if (receptionist == null) return null;
                    node.put("id", id).put("shift", receptionist.getShift());
                }
                case "support_requests" -> {
                    var request = entityManager.find(com.swp391.scms.support.entity.SupportRequest.class, id, LockModeType.PESSIMISTIC_WRITE);
                    if (request == null) return null;
                    node.put("id", id).put("status", request.getStatus());
                    if (request.getAssignedTo() != null) node.put("assignedTo", request.getAssignedTo().getId());
                }
                case "membership_packages" -> {
                    var pkg = entityManager.find(com.swp391.scms.facilities.entity.MembershipPackage.class, id, LockModeType.PESSIMISTIC_WRITE);
                    if (pkg == null) return null;
                    node.put("id", id).put("name", pkg.getName()).put("description", pkg.getDescription())
                            .put("price", pkg.getPrice()).put("durationDays", pkg.getDurationDays())
                            .put("classCreditLimit", pkg.getClassCreditLimit()).put("status", pkg.getStatus());
                }
                case "payments" -> {
                    var payment = entityManager.find(com.swp391.scms.finance.entity.Payment.class, id, LockModeType.PESSIMISTIC_WRITE);
                    if (payment == null) return null;
                    node.put("id", id).put("amount", payment.getAmount()).put("method", payment.getMethod())
                            .put("status", payment.getStatus()).put("note", payment.getNote());
                }
                case "classes" -> {
                    var gymClass = entityManager.find(com.swp391.scms.scheduling.entity.GymClass.class, id);
                    if (gymClass == null) return null;
                    node.put("id", id).put("name", gymClass.getName()).put("capacity", gymClass.getCapacity())
                            .put("level", gymClass.getLevel()).put("status", gymClass.getStatus());
                    if (gymClass.getDiscipline() != null) node.put("disciplineId", gymClass.getDiscipline().getId());
                    if (gymClass.getCoach() != null) node.put("coachId", gymClass.getCoach().getUserId());
                    if (gymClass.getRoom() != null) node.put("roomId", gymClass.getRoom().getId());
                }
                case "class_sessions" -> {
                    var session = entityManager.find(com.swp391.scms.scheduling.entity.ClassSession.class, id);
                    if (session == null) return null;
                    node.put("id", id).put("status", session.getStatus());
                    if (session.getGymClass() != null) node.put("classId", session.getGymClass().getId());
                    if (session.getSessionDate() != null) node.put("sessionDate", session.getSessionDate().toString());
                    if (session.getStartTime() != null) node.put("startTime", session.getStartTime().toString());
                    if (session.getEndTime() != null) node.put("endTime", session.getEndTime().toString());
                }
                case "role_permissions" -> {
                    if (args.length < 2 || !(args[1] instanceof Long permissionId)) return null;
                    var role = entityManager.find(com.swp391.scms.users.entity.Role.class, id, LockModeType.PESSIMISTIC_WRITE);
                    if (role == null) return null;
                    boolean granted = role.getPermissions() != null && role.getPermissions().stream()
                            .anyMatch(permission -> permissionId.equals(permission.getId()));
                    node.put("roleId", id).put("permissionId", permissionId).put("granted", granted);
                }
                default -> { return null; }
            }
            return node;
        } catch (RuntimeException e) {
            log.warn("Could not capture audit snapshot for {}", entity, e);
            return null;
        }
    }

    private Long resolveEntityId(String entity, Object[] args, JsonNode newValue) {
        if ("class_sessions".equals(entity) && args.length > 1 && args[1] instanceof Long sessionId) {
            return sessionId;
        }
        if (args.length > 0 && args[0] instanceof Long id) {
            return id;
        }
        return newValue != null && newValue.hasNonNull("id") ? newValue.get("id").asLong() : null;
    }

    private Long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof AuthenticatedPrincipal principal ? principal.id() : null;
    }

    private String currentIp() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs
                ? ((HttpServletRequest) attrs.getRequest()).getRemoteAddr()
                : null;
    }
}
