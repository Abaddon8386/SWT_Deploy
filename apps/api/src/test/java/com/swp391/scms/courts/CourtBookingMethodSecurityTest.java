package com.swp391.scms.courts;

import com.swp391.scms.courts.controller.CourtBookingController;
import com.swp391.scms.courts.dto.CourtBookingRequests.BookRequest;
import com.swp391.scms.courts.service.CourtBookingService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = CourtBookingMethodSecurityTest.Config.class)
class CourtBookingMethodSecurityTest {
    @Configuration @EnableMethodSecurity static class Config {
        @Bean CourtBookingService service() { return mock(CourtBookingService.class); }
        @Bean CourtBookingController controller(CourtBookingService s) { return new CourtBookingController(s); }
    }
    @Autowired CourtBookingController controller;
    final AuthenticatedPrincipal member = new AuthenticatedPrincipal(1L, "member", "MEMBER");
    @Test @WithMockUser(roles="MEMBER") void memberCanBookButCannotListOthers() {
        assertDoesNotThrow(() -> controller.book(member, new BookRequest(1L, LocalDate.now(), LocalTime.NOON)));
        assertDoesNotThrow(() -> controller.my(member, 0, 20));
        assertThrows(AccessDeniedException.class, () -> controller.daily(member, LocalDate.now(), null, 0, 20));
    }
    @Test @WithMockUser(roles="RECEPTIONIST") void receptionistCanListAndCancelButCannotBook() {
        assertDoesNotThrow(() -> controller.daily(member, LocalDate.now(), null, 0, 20));
        assertDoesNotThrow(() -> controller.cancel(member, 1L, null));
        assertDoesNotThrow(() -> controller.courts(null));
        assertThrows(AccessDeniedException.class, () -> controller.book(member, null));
        assertThrows(AccessDeniedException.class, () -> controller.my(member, 0, 20));
    }
    @Test @WithMockUser(roles="CENTER_MANAGER") void managerCanManageAndViewAvailability() {
        assertDoesNotThrow(() -> controller.daily(member, LocalDate.now(), null, 0, 20));
        assertDoesNotThrow(() -> controller.availability(1L, LocalDate.now()));
        assertDoesNotThrow(() -> controller.cancel(member, 1L, null));
        assertThrows(AccessDeniedException.class, () -> controller.book(member, null));
    }
    @Test @WithMockUser(roles="COACH") void coachCannotAccessAnyCourtRoutes() {
        assertThrows(AccessDeniedException.class, () -> controller.courts(null));
        assertThrows(AccessDeniedException.class, () -> controller.availability(1L, LocalDate.now()));
        assertThrows(AccessDeniedException.class, () -> controller.book(member, null));
        assertThrows(AccessDeniedException.class, () -> controller.cancel(member, 1L, null));
        assertThrows(AccessDeniedException.class, () -> controller.my(member, 0, 20));
        assertThrows(AccessDeniedException.class, () -> controller.daily(member, LocalDate.now(), null, 0, 20));
    }
}
