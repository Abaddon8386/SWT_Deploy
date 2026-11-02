package com.swp391.scms.facilities.dto;

import com.swp391.scms.facilities.entity.Discipline;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.facilities.entity.Room;
import java.math.BigDecimal;
import java.time.LocalTime;

/** Response DTOs for the master catalogs; entities never leave the service layer. */
public final class CatalogResponses {
    private CatalogResponses() {}

    public record DisciplineDto(Long id, String name, String description) {
        public static DisciplineDto of(Discipline d) {
            return new DisciplineDto(d.getId(), d.getName(), d.getDescription());
        }
    }

    public record RoomDto(Long id, String name, String location, int capacity, String status,
                          Long disciplineId, String disciplineName, LocalTime openTime, LocalTime closeTime) {
        public RoomDto(Long id, String name, String location, int capacity, String status) {
            this(id, name, location, capacity, status, null, null, null, null);
        }
        public static RoomDto of(Room r) {
            return new RoomDto(r.getId(), r.getName(), r.getLocation(), r.getCapacity(), r.getStatus(),
                    r.getDiscipline() == null ? null : r.getDiscipline().getId(),
                    r.getDiscipline() == null ? null : r.getDiscipline().getName(), r.getOpenTime(), r.getCloseTime());
        }
    }

    public record PackageDto(Long id, String name, String description, BigDecimal price, int durationDays,
                             Integer classCreditLimit, String status) {
        public static PackageDto of(MembershipPackage p) {
            return new PackageDto(p.getId(), p.getName(), p.getDescription(), p.getPrice(), p.getDurationDays(),
                    p.getClassCreditLimit(), p.getStatus());
        }
    }
}
