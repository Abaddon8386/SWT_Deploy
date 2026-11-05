package com.swp391.scms.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.security.AuthenticatedPrincipal;
import java.util.Map;
import org.aspectj.lang.JoinPoint;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

@ExtendWith(MockitoExtension.class)
class AuditAspectTest {

    @Test
    void capturesOldAndNewUserStateWithoutPassword() throws Throwable {
        var entityManager = mock(jakarta.persistence.EntityManager.class);
        var point = mock(org.aspectj.lang.ProceedingJoinPoint.class);
        var user = new com.swp391.scms.users.entity.User();
        user.setId(42L);
        user.setFullName("Before");
        user.setPasswordHash("secret");
        user.setAvatarUrl("data:image/png;base64,c2Vuc2l0aXZlLWltYWdl");
        when(point.getArgs()).thenReturn(new Object[]{42L});
        when(entityManager.find(com.swp391.scms.users.entity.User.class, 42L, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)).thenReturn(user);
        when(point.proceed()).thenAnswer(invocation -> { user.setFullName("After"); return null; });

        new AuditAspect(repository, new ObjectMapper(), entityManager)
                .around(point, audited("USER_UPDATE", "users"));

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(repository).save(captor.capture());
        assertEquals("Before", new ObjectMapper().readTree(captor.getValue().getOldValue()).get("fullName").asText());
        assertEquals("After", new ObjectMapper().readTree(captor.getValue().getNewValue()).get("fullName").asText());
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().getOldValue().contains("secret"));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().getOldValue().contains("c2Vuc2l0aXZlLWltYWdl"));
        org.junit.jupiter.api.Assertions.assertFalse(captor.getValue().getNewValue().contains("c2Vuc2l0aXZlLWltYWdl"));
    }

    @Mock AuditLogRepository repository;
    @Mock JoinPoint joinPoint;

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private Audited audited(String action, String entity) {
        Audited audited = mock(Audited.class);
        when(audited.action()).thenReturn(action);
        when(audited.entity()).thenReturn(entity);
        return audited;
    }

    @Test
    void recordsActorEntityIdFromFirstArgAndResultJson() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(7L, "boss", "CENTER_MANAGER"), null));
        when(joinPoint.getArgs()).thenReturn(new Object[]{42L, "ignored"});
        AuditAspect aspect = new AuditAspect(repository, new ObjectMapper());

        aspect.record(joinPoint, audited("USER_UPDATE", "users"), Map.of("id", 42, "status", "locked"));

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(repository).save(captor.capture());
        AuditLog log = captor.getValue();
        assertEquals(7L, log.getUserId());
        assertEquals(42L, log.getEntityId());
        assertEquals("USER_UPDATE", log.getAction());
        assertEquals("users", log.getEntityType());
        assertEquals(true, log.getNewValue().contains("locked"));
    }

    @Test
    void takesEntityIdFromResultWhenFirstArgIsNotAnId() {
        when(joinPoint.getArgs()).thenReturn(new Object[]{"dto"});
        AuditAspect aspect = new AuditAspect(repository, new ObjectMapper());

        aspect.record(joinPoint, audited("USER_CREATE", "users"), Map.of("id", 5));

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(repository).save(captor.capture());
        assertEquals(5L, captor.getValue().getEntityId());
        assertNull(captor.getValue().getUserId());
    }

    @Test
    void repositoryFailureNeverBreaksTheBusinessCall() {
        when(joinPoint.getArgs()).thenReturn(new Object[]{1L});
        when(repository.save(any())).thenThrow(new IllegalStateException("db down"));
        AuditAspect aspect = new AuditAspect(repository, new ObjectMapper());

        aspect.record(joinPoint, audited("USER_DELETE", "users"), null);
    }
}
