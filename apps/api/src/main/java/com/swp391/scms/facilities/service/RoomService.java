package com.swp391.scms.facilities.service;

import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import com.swp391.scms.courts.service.CourtBookingService;
import com.swp391.scms.facilities.dto.CatalogRequests.RoomRequest;
import com.swp391.scms.facilities.dto.CatalogResponses.RoomDto;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.repository.RoomRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Business logic for the room catalog (SCRUM-59). */
@Service
public class RoomService {

    private final RoomRepository rooms;
    private final DisciplineRepository disciplines;

    public RoomService(RoomRepository rooms) {
        this(rooms, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public RoomService(RoomRepository rooms, DisciplineRepository disciplines) {
        this.rooms = rooms;
        this.disciplines = disciplines;
    }

    @Transactional(readOnly = true)
    public List<RoomDto> list() {
        return rooms.findAllByOrderByNameAsc().stream().map(RoomDto::of).toList();
    }

    @Transactional
    public RoomDto create(RoomRequest request) {
        Room room = new Room();
        apply(room, request);
        return RoomDto.of(rooms.save(room));
    }

    @Transactional
    public RoomDto update(Long id, RoomRequest request) {
        Room room = rooms.findById(id).orElseThrow(() -> new ResourceNotFoundException("resource.room", id));
        apply(room, request);
        return RoomDto.of(room);
    }

    private void apply(Room room, RoomRequest request) {
        Discipline discipline = request.disciplineId() == null ? null : disciplines.findById(request.disciplineId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.discipline", request.disciplineId()));
        if (discipline != null && !CourtBookingService.isCourtDiscipline(discipline.getName())) {
            throw new BadRequestException("COURT_BOOKING_INVALID_COURT", "error.courts.invalid_court", null, null);
        }
        if (discipline != null && !CourtBookingService.validHours(request.openTime(), request.closeTime())) {
            throw new BadRequestException("COURT_BOOKING_INVALID_SLOT", "error.courts.invalid_hours", null, null);
        }
        room.setDiscipline(discipline);
        room.setOpenTime(discipline == null ? null : request.openTime());
        room.setCloseTime(discipline == null ? null : request.closeTime());
        room.setName(request.name().trim());
        room.setLocation(request.location());
        room.setCapacity(request.capacity());
        if (request.status() != null) {
            room.setStatus(request.status());
        }
        if (request.tier() != null && !request.tier().isBlank()) {
            room.setTier(request.tier().trim().toUpperCase(java.util.Locale.ROOT));
        } else if (room.getTier() == null) {
            room.setTier("STANDARD");
        }
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.scheduling.repository.GymClassRepository classes;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.courts.repository.CourtBookingRepository courtBookings;

    /** A room that was ever used by a class or a court booking is kept (set status to closed instead). */
    @Transactional
    public void delete(Long id) {
        Room room = rooms.findById(id).orElseThrow(() -> new ResourceNotFoundException("resource.room", id));
        if ((classes != null && classes.existsByRoomId(id)) || (courtBookings != null && courtBookings.existsByRoomId(id))) {
            throw new com.swp391.scms.common.exception.ConflictException("ROOM_IN_USE", "catalog.room.in_use", null, null);
        }
        rooms.delete(room);
    }
}
