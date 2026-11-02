package com.swp391.scms.users;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.swp391.scms.audit.AuditAspect;
import com.swp391.scms.audit.AuditLog;
import com.swp391.scms.audit.AuditLogRepository;
import com.swp391.scms.users.dto.ReceptionistProfileUpdateDto;
import com.swp391.scms.users.entity.Role;
import com.swp391.scms.users.entity.User;
import com.swp391.scms.users.mapper.UserMapper;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserServiceTransactionTest {
    private final UserRepository users = mock(UserRepository.class);
    private final ReceptionistRepository receptionists = mock(ReceptionistRepository.class);
    private final AuditLogRepository audit = mock(AuditLogRepository.class);

    private UserService proxiedService() {
        var target = new UserService(users, mock(RoleRepository.class), mock(PasswordEncoder.class),
                mock(UserMapper.class), receptionists);
        var manager = new AbstractPlatformTransactionManager() {
            @Override protected Object doGetTransaction() { return new Object(); }
            @Override protected void doBegin(Object transaction, TransactionDefinition definition) { }
            @Override protected void doCommit(DefaultTransactionStatus status) { }
            @Override protected void doRollback(DefaultTransactionStatus status) { }
        };
        var proxy = new AspectJProxyFactory(target);
        proxy.addAspect(new AuditAspect(audit, new ObjectMapper()));
        proxy.addAdvice(0, new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        return proxy.getProxy();
    }

    @Test
    void scheduledCleanupReadsAndAuditsWithinOneTransaction() {
        when(users.findAllByDeletedAtIsNullOrderByIdAsc()).thenAnswer(invocation -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            return List.of();
        });
        when(audit.save(any(AuditLog.class))).thenAnswer(invocation -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            return invocation.getArgument(0);
        });

        proxiedService().scheduleInactiveUsersCleanup();

        verify(audit).save(argThat(entry -> "USER_CLEANUP_INACTIVE".equals(entry.getAction())));
    }

    @Test
    void receptionistShiftReadsAndWritesWithinOneTransaction() {
        var user = new User();
        var role = new Role();
        role.setCode("RECEPTIONIST");
        user.setRole(role);
        when(users.findByIdAndDeletedAtIsNull(5L)).thenAnswer(invocation -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            return Optional.of(user);
        });
        when(receptionists.findById(5L)).thenReturn(Optional.empty());
        when(receptionists.save(any())).thenAnswer(invocation -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            return invocation.getArgument(0);
        });

        proxiedService().updateReceptionistShift(5L, new ReceptionistProfileUpdateDto("Morning"));

        verify(receptionists).save(argThat(profile -> "Morning".equals(profile.getShift())));
    }
}
