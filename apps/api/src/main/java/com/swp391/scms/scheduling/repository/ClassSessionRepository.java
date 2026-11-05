package com.swp391.scms.scheduling.repository;

import com.swp391.scms.scheduling.entity.ClassSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface ClassSessionRepository extends JpaRepository<ClassSession, Long> {

    @Query("""
            select s from ClassSession s
            join fetch s.gymClass c join fetch c.discipline join fetch c.room r
            join fetch c.coach co join fetch co.user u
            where s.status = 'scheduled' and c.status = 'active' and r.status = 'available'
              and co.employmentStatus = 'active' and u.status = 'active' and u.deletedAt is null
              and s.sessionDate between :fromDate and :toDate
              and (s.sessionDate > :fromDate or s.startTime > :now)
            order by s.sessionDate, s.startTime, s.id
            """)
    List<ClassSession> findPublicSessions(@Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate, @Param("now") java.time.LocalTime now);

    List<ClassSession> findByGymClassIdOrderBySessionDateAscStartTimeAsc(Long classId);

    /**
     * Fetch all sessions with class, discipline, coach, and room details ordered by date and time.
     */
    @Query("""
            select s from ClassSession s
            join fetch s.gymClass c
            join fetch c.discipline d
            join fetch c.coach co
            join fetch c.room r
            order by s.sessionDate asc, s.startTime asc
            """)
    List<ClassSession> findAllWithDetails();

    /**
     * SCRUM-72 BR-06: schedule lookup with optional filters by date range, discipline and coach.
     * Avoids PostgreSQL PSQLException ("could not determine data type of parameter $1") on (? is null).
     */
    default List<ClassSession> searchSessions(LocalDate fromDate,
                                              LocalDate toDate,
                                              Long disciplineId,
                                              Long coachId) {
        return findAllWithDetails().stream()
                .filter(s -> fromDate == null || (s.getSessionDate() != null && !s.getSessionDate().isBefore(fromDate)))
                .filter(s -> toDate == null || (s.getSessionDate() != null && !s.getSessionDate().isAfter(toDate)))
                .filter(s -> disciplineId == null || (s.getGymClass() != null
                        && s.getGymClass().getDiscipline() != null
                        && disciplineId.equals(s.getGymClass().getDiscipline().getId())))
                .filter(s -> coachId == null || (s.getGymClass() != null
                        && s.getGymClass().getCoach() != null
                        && coachId.equals(s.getGymClass().getCoach().getUserId())))
                .toList();
    }

    long countByGymClassIdAndStatus(Long classId, String status);

    @Query("""
            select s from ClassSession s
            join fetch s.gymClass c
            where s.status = 'scheduled'
              and s.sessionDate >= :startDate
              and s.sessionDate <= :endDate
            """)
    List<ClassSession> findScheduledSessionsBetweenDates(
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Query("""
            select s from ClassSession s
            where s.gymClass.coach.userId = :coachId
              and s.sessionDate = :date
              and s.status = 'scheduled'
            """)
    List<ClassSession> findActiveByCoachAndDate(@Param("coachId") Long coachId, @Param("date") LocalDate date);

    @Query("""
            select s from ClassSession s
            where s.gymClass.coach.userId = :coachId
            """)
    List<ClassSession> findByCoachId(@Param("coachId") Long coachId);

    void deleteByGymClassId(Long classId);
    @Query("select s from ClassSession s where s.status = 'scheduled' and s.sessionDate = :date " +
            "and (exists (select e.id from ClassEnrollment e where e.gymClass = s.gymClass " +
            "and e.member.userId = :memberId and e.status = 'booked') " +
            "or exists (select b.id from SessionBooking b where b.session = s " +
            "and b.member.userId = :memberId and b.status = 'booked'))")
    List<ClassSession> findActiveByMemberAndDate(@Param("memberId") Long memberId, @Param("date") LocalDate date);

    /**
     * Scheduled sessions of other classes on {@code date} overlapping {@code [start, end)} that a member of this
     * session also attends. Members of the session are those enrolled in {@code classId} or holding a seat in
     * {@code sessionId} (use -1 for a session that does not exist yet).
     */
    @Query("""
            select s from ClassSession s
            where s.status = 'scheduled' and s.sessionDate = :date and s.id <> :sessionId
              and s.gymClass.id <> :classId
              and s.startTime < :endTime and s.endTime > :startTime
              and exists (
                  select m.userId from Member m
                  where (exists (select e.id from ClassEnrollment e where e.member = m
                                 and e.gymClass.id = :classId and e.status = 'booked')
                         or exists (select b.id from SessionBooking b where b.member = m
                                 and b.session.id = :sessionId and b.status = 'booked'))
                    and (exists (select e2.id from ClassEnrollment e2 where e2.member = m
                                 and e2.gymClass = s.gymClass and e2.status = 'booked')
                         or exists (select b2.id from SessionBooking b2 where b2.member = m
                                 and b2.session = s and b2.status = 'booked')))
            order by s.startTime
            """)
    List<ClassSession> findMemberOverlaps(@Param("classId") Long classId, @Param("sessionId") Long sessionId,
                                          @Param("date") LocalDate date,
                                          @Param("startTime") java.time.LocalTime startTime,
                                          @Param("endTime") java.time.LocalTime endTime);

    @Query("""
            select (count(s) > 0) from ClassSession s
            where s.gymClass.coach.userId = :coachId and s.status = 'scheduled' and s.sessionDate >= :today
            """)
    boolean existsScheduledForCoachFrom(@Param("coachId") Long coachId, @Param("today") java.time.LocalDate today);

    @Query("""
            select count(s) from ClassSession s
            where s.gymClass.coach.userId = :coachId and s.status = 'scheduled'
              and s.sessionDate between :startDate and :endDate
            """)
    long countScheduledForCoachBetween(@Param("coachId") Long coachId,
                                       @Param("startDate") java.time.LocalDate startDate,
                                       @Param("endDate") java.time.LocalDate endDate);
}
