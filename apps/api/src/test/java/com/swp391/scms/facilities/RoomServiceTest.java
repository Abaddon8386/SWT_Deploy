package com.swp391.scms.facilities;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.facilities.dto.CatalogRequests.RoomRequest;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import com.swp391.scms.common.exception.BadRequestException;
import java.time.LocalTime;
import com.swp391.scms.facilities.repository.RoomRepository;
import com.swp391.scms.facilities.service.RoomService;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RoomServiceTest {

    @Mock RoomRepository rooms;
    @Mock DisciplineRepository disciplines;
    @InjectMocks RoomService service;

    @Test
    void createDefaultsToAvailableWhenStatusOmitted() {
        when(rooms.save(any(Room.class))).thenAnswer(i -> i.getArgument(0));

        assertEquals("available", service.create(new RoomRequest("Studio", "L1", 10, null)).status());
    }

    @Test
    void updateChangesStatusAndCapacity() {
        when(rooms.findById(1L)).thenReturn(Optional.of(new Room()));

        var dto = service.update(1L, new RoomRequest("Studio", "L1", 15, "maintenance"));

        assertEquals("maintenance", dto.status());
        assertEquals(15, dto.capacity());
    }

    @Test
    void updateMissingThrowsNotFound() {
        when(rooms.findById(9L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> service.update(9L, new RoomRequest("A", null, 1, null)));
    }

    @Test void assignsCourtDisciplineAndHours() {
        Discipline tennis = new Discipline(); tennis.setName("Tennis");
        when(disciplines.findById(2L)).thenReturn(Optional.of(tennis));
        when(rooms.save(any(Room.class))).thenAnswer(i -> i.getArgument(0));
        var dto = service.create(new RoomRequest("Court A", "L1", 2, "available", 2L, LocalTime.of(6,0), LocalTime.of(22,0)));
        assertEquals("Tennis", dto.disciplineName()); assertEquals(LocalTime.of(6,0), dto.openTime());
    }
    @Test void rejectsCourtHoursAndUnsupportedDiscipline() {
        Discipline tennis = new Discipline(); tennis.setName("Tennis");
        when(disciplines.findById(2L)).thenReturn(Optional.of(tennis));
        assertThrows(BadRequestException.class, () -> service.create(new RoomRequest("Court", null, 2, null, 2L, LocalTime.of(22,0), LocalTime.of(6,0))));
        assertThrows(BadRequestException.class, () -> service.create(new RoomRequest("Court", null, 2, null, 2L, LocalTime.of(6,30), LocalTime.of(22,0))));
        assertThrows(BadRequestException.class, () -> service.create(new RoomRequest("Court", null, 2, null, 2L, null, null)));
        tennis.setName("Gym");
        assertThrows(BadRequestException.class, () -> service.create(new RoomRequest("Gym", null, 2, null, 2L, LocalTime.of(6,0), LocalTime.of(22,0))));
    }

    @Test void deleteRemovesRoomNobodyUses() {
        Room room = new Room();
        var classes = org.mockito.Mockito.mock(com.swp391.scms.scheduling.repository.GymClassRepository.class);
        var bookings = org.mockito.Mockito.mock(com.swp391.scms.courts.repository.CourtBookingRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "classes", classes);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "courtBookings", bookings);
        when(rooms.findById(1L)).thenReturn(Optional.of(room));
        service.delete(1L);
        org.mockito.Mockito.verify(rooms).delete(room);
    }

    @Test void deleteBlockedWhenClassOrCourtBookingUsesRoom() {
        var classes = org.mockito.Mockito.mock(com.swp391.scms.scheduling.repository.GymClassRepository.class);
        var bookings = org.mockito.Mockito.mock(com.swp391.scms.courts.repository.CourtBookingRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "classes", classes);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "courtBookings", bookings);
        when(rooms.findById(1L)).thenReturn(Optional.of(new Room()));
        when(classes.existsByRoomId(1L)).thenReturn(true);
        assertThrows(com.swp391.scms.common.exception.ConflictException.class, () -> service.delete(1L));
        when(classes.existsByRoomId(1L)).thenReturn(false);
        when(bookings.existsByRoomId(1L)).thenReturn(true);
        assertThrows(com.swp391.scms.common.exception.ConflictException.class, () -> service.delete(1L));
        org.mockito.Mockito.verify(rooms, org.mockito.Mockito.never()).delete(any(Room.class));
    }

    @Test void deleteMissingRoomThrowsNotFound() {
        when(rooms.findById(9L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> service.delete(9L));
    }
}
