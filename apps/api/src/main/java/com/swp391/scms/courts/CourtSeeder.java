package com.swp391.scms.courts;

import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.repository.DisciplineRepository;
import com.swp391.scms.facilities.repository.RoomRepository;
import java.time.LocalTime;
import java.util.List;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds bookable courts (Tennis, Cầu lông, Bơi lội) so members can book a court straight away (idempotent).
 * A court is a room that has a court discipline and whole-hour opening hours; existing rooms are never touched.
 */
@Component
@Order(100)
public class CourtSeeder implements ApplicationRunner {

    private static final LocalTime OPEN = LocalTime.of(6, 0);
    private static final LocalTime CLOSE = LocalTime.of(22, 0);

    private record CourtSpec(String name, String location, int capacity, String discipline, String description) {}

    private static final List<CourtSpec> COURTS = List.of(
            new CourtSpec("Sân Tennis 01", "Khu thể thao ngoài trời - Sân A", 4, "Tennis", "Kỹ thuật đánh bóng, di chuyển và đánh đôi"),
            new CourtSpec("Sân Tennis 02", "Khu thể thao ngoài trời - Sân B", 4, "Tennis", "Kỹ thuật đánh bóng, di chuyển và đánh đôi"),
            new CourtSpec("Sân Cầu lông 01", "Nhà thi đấu - Tầng 1", 4, "Cầu lông", "Bộ chân, phản xạ và kỹ thuật đánh cầu"),
            new CourtSpec("Sân Cầu lông 02", "Nhà thi đấu - Tầng 1", 4, "Cầu lông", "Bộ chân, phản xạ và kỹ thuật đánh cầu"),
            new CourtSpec("Sân Cầu lông 03", "Nhà thi đấu - Tầng 1", 4, "Cầu lông", "Bộ chân, phản xạ và kỹ thuật đánh cầu"),
            new CourtSpec("Sân Cầu lông 04", "Nhà thi đấu - Tầng 1", 4, "Cầu lông", "Bộ chân, phản xạ và kỹ thuật đánh cầu"),
            new CourtSpec("Làn bơi 01", "Hồ bơi - Tầng hầm Oasis", 6, "Bơi lội", "Kỹ thuật bơi, sức bền dưới nước và phục hồi"),
            new CourtSpec("Làn bơi 02", "Hồ bơi - Tầng hầm Oasis", 6, "Bơi lội", "Kỹ thuật bơi, sức bền dưới nước và phục hồi"));

    private final RoomRepository rooms;
    private final DisciplineRepository disciplines;

    public CourtSeeder(RoomRepository rooms, DisciplineRepository disciplines) {
        this.rooms = rooms;
        this.disciplines = disciplines;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<Room> existing = rooms.findAllByOrderByNameAsc();
        for (CourtSpec spec : COURTS) {
            boolean present = existing.stream().anyMatch(r -> spec.name().equalsIgnoreCase(r.getName()));
            if (present) {
                continue;
            }
            Room court = new Room();
            court.setName(spec.name());
            court.setLocation(spec.location());
            court.setCapacity(spec.capacity());
            court.setStatus("available");
            court.setDiscipline(discipline(spec));
            court.setOpenTime(OPEN);
            court.setCloseTime(CLOSE);
            rooms.save(court);
        }
    }

    private Discipline discipline(CourtSpec spec) {
        return disciplines.findAllByOrderByNameAsc().stream()
                .filter(d -> spec.discipline().equalsIgnoreCase(d.getName()))
                .findFirst()
                .orElseGet(() -> {
                    Discipline created = new Discipline();
                    created.setName(spec.discipline());
                    created.setDescription(spec.description());
                    return disciplines.save(created);
                });
    }
}
