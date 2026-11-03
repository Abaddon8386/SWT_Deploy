package com.swp391.scms.catalog;

import com.swp391.scms.facilities.dto.CatalogResponses.PackageDto;
import com.swp391.scms.scheduling.repository.SessionBookingRepository;
import com.swp391.scms.scheduling.dto.SessionBookingCount;
import com.swp391.scms.facilities.repository.MembershipPackageRepository;
import com.swp391.scms.scheduling.dto.SchedulingResponses.ClassSessionDto;
import com.swp391.scms.scheduling.dto.ClassBookingCount;
import com.swp391.scms.scheduling.mapper.SchedulingMapper;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.users.CoachRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Public read model over the same catalogs and profiles used by the portal. */
@Service
public class PublicCatalogService {
    public record CoachDto(Long id, String name, String specialization, String bio,
                           String certification, String avatarUrl) {}
    public record CatalogDto(List<PackageDto> packages, List<CoachDto> coaches,
                             List<ClassSessionDto> sessions) {}

    private final MembershipPackageRepository packages;
    private final CoachRepository coaches;
    private final ClassSessionRepository sessions;
    private final ClassEnrollmentRepository enrollments;

    private final SessionBookingRepository sessionBookings;
    private final SchedulingMapper mapper;
    private final Clock clock;

    public PublicCatalogService(MembershipPackageRepository packages, CoachRepository coaches,
            ClassSessionRepository sessions, ClassEnrollmentRepository enrollments,
            SchedulingMapper mapper, Clock clock) {
        this(packages, coaches, sessions, enrollments, mapper, clock, null);
    }

    @Autowired
    public PublicCatalogService(MembershipPackageRepository packages, CoachRepository coaches,
            ClassSessionRepository sessions, ClassEnrollmentRepository enrollments,
            SchedulingMapper mapper, Clock clock, SessionBookingRepository sessionBookings) {
        this.sessionBookings = sessionBookings;
        this.packages = packages;
        this.coaches = coaches;
        this.sessions = sessions;
        this.enrollments = enrollments;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public CatalogDto getCatalog() {
        var today = LocalDate.now(clock);
        var publicPackages = packages.findByStatusOrderByPriceAsc("active").stream().map(PackageDto::of).toList();
        var publicCoaches = coaches.findPublicCoaches().stream().map(c -> new CoachDto(c.getUserId(),
                c.getUser().getFullName(), c.getSpecialization(), c.getBio(), c.getCertification(),
                c.getUser().getAvatarUrl())).toList();
        var visibleSessions = sessions.findPublicSessions(today, today.plusDays(6), LocalTime.now(clock));
        var classIds = visibleSessions.stream().map(s -> s.getGymClass().getId()).distinct().toList();
        var bookedCounts = classIds.isEmpty() ? Map.<Long, Long>of()
                : enrollments.countByClassIdsAndStatus(classIds, "booked").stream()
                        .collect(Collectors.toMap(ClassBookingCount::classId, ClassBookingCount::bookedCount));
        var sessionCounts = sessionBookings == null || visibleSessions.isEmpty() ? Map.<Long, Long>of()
                : sessionBookings.countBookedBySessionIds(visibleSessions.stream().map(s -> s.getId()).toList()).stream()
                        .collect(Collectors.toMap(SessionBookingCount::sessionId,
                                SessionBookingCount::bookedCount));
        var publicSessions = visibleSessions.stream()
                .map(s -> mapper.toDto(s, bookedCounts.getOrDefault(s.getGymClass().getId(), 0L)
                        + sessionCounts.getOrDefault(s.getId(), 0L))).toList();
        return new CatalogDto(publicPackages, publicCoaches, publicSessions);
    }
}
