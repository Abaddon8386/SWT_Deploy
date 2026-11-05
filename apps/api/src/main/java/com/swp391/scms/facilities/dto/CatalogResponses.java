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
                          Long disciplineId, String disciplineName, LocalTime openTime, LocalTime closeTime,
                          String tier) {
        public RoomDto(Long id, String name, String location, int capacity, String status) {
            this(id, name, location, capacity, status, null, null, null, null, "STANDARD");
        }
        public RoomDto(Long id, String name, String location, int capacity, String status,
                       Long disciplineId, String disciplineName, LocalTime openTime, LocalTime closeTime) {
            this(id, name, location, capacity, status, disciplineId, disciplineName, openTime, closeTime, "STANDARD");
        }
        public static RoomDto of(Room r) {
            return new RoomDto(r.getId(), r.getName(), r.getLocation(), r.getCapacity(), r.getStatus(),
                    r.getDiscipline() == null ? null : r.getDiscipline().getId(),
                    r.getDiscipline() == null ? null : r.getDiscipline().getName(), r.getOpenTime(), r.getCloseTime(),
                    r.getTier() != null ? r.getTier() : "STANDARD");
        }
    }

    public record PackageDto(Long id, String name, String description, BigDecimal price, int durationDays,
                             Integer classCreditLimit, String status, String tier) {
        public PackageDto(Long id, String name, String description, BigDecimal price, int durationDays,
                          Integer classCreditLimit, String status) {
            this(id, name, description, price, durationDays, classCreditLimit, status, inferTier(name, null));
        }

        public static PackageDto of(MembershipPackage p) {
            return new PackageDto(p.getId(), p.getName(), p.getDescription(), p.getPrice(), p.getDurationDays(),
                    p.getClassCreditLimit(), p.getStatus(), inferTier(p.getName(), p.getTier()));
        }

        public static String inferTier(String name, String explicitTier) {
            if (explicitTier != null && !explicitTier.isBlank()) {
                return explicitTier.trim().toUpperCase();
            }
            if (name != null) {
                String upper = name.toUpperCase();
                if (upper.contains("PLATINUM") || upper.contains("VIP")) return "PLATINUM";
                if (upper.contains("GOLD") || upper.contains("STANDARD")) return "GOLD";
            }
            return "SILVER";
        }
    }
}
