package com.swp391.scms.facilities.service;

import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.facilities.dto.CatalogRequests.DisciplineRequest;
import com.swp391.scms.facilities.dto.CatalogResponses.DisciplineDto;
import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Business logic for the discipline catalog (SCRUM-58). */
@Service
public class DisciplineService {

    private final DisciplineRepository disciplines;

    public DisciplineService(DisciplineRepository disciplines) {
        this.disciplines = disciplines;
    }

    @Transactional(readOnly = true)
    public List<DisciplineDto> list() {
        return disciplines.findAllByOrderByNameAsc().stream().map(DisciplineDto::of).toList();
    }

    @Transactional
    public DisciplineDto create(DisciplineRequest request) {
        String name = request.name().trim();
        if (disciplines.existsByNameIgnoreCase(name)) {
            throw duplicate(name);
        }
        Discipline discipline = new Discipline();
        apply(discipline, request);
        return DisciplineDto.of(disciplines.save(discipline));
    }

    @Transactional
    public DisciplineDto update(Long id, DisciplineRequest request) {
        Discipline discipline = disciplines.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.discipline", id));
        String name = request.name().trim();
        if (disciplines.existsByNameIgnoreCaseAndIdNot(name, id)) {
            throw duplicate(name);
        }
        apply(discipline, request);
        return DisciplineDto.of(discipline);
    }

    private void apply(Discipline discipline, DisciplineRequest request) {
        discipline.setName(request.name().trim());
        discipline.setDescription(request.description());
    }

    private ConflictException duplicate(String name) {
        return new ConflictException("DISCIPLINE_EXISTS", "catalog.discipline.name_exists", new Object[]{name}, null);
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.scheduling.repository.GymClassRepository classes;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.facilities.repository.RoomRepository rooms;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.coaching.repository.CoachBookingRepository coachBookings;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.users.MemberRepository members;

    /** A discipline still used by a class, room or 1:1 booking cannot be removed; member favourites are cleared. */
    @Transactional
    public void delete(Long id) {
        Discipline discipline = disciplines.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.discipline", id));
        if ((classes != null && classes.existsByDisciplineId(id)) || (rooms != null && rooms.existsByDisciplineId(id))
                || (coachBookings != null && coachBookings.existsByDisciplineId(id))) {
            throw new ConflictException("DISCIPLINE_IN_USE", "catalog.discipline.in_use", null, null);
        }
        if (members != null) {
            members.removeFavoriteDiscipline(id);
        }
        disciplines.delete(discipline);
    }
}
