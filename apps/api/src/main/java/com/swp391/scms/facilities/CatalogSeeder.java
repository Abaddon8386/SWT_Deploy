package com.swp391.scms.facilities;

import com.swp391.scms.facilities.dto.CatalogRequests.DisciplineRequest;
import com.swp391.scms.facilities.dto.CatalogRequests.PackageRequest;
import com.swp391.scms.facilities.dto.CatalogRequests.RoomRequest;
import com.swp391.scms.facilities.service.DisciplineService;
import com.swp391.scms.facilities.service.PackageService;
import com.swp391.scms.facilities.service.RoomService;
import java.math.BigDecimal;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** Seeds sample disciplines, rooms and packages into empty catalogs (idempotent). */
@Component
@Order(50)
public class CatalogSeeder implements ApplicationRunner {

    // --- GÓI TRẢI NGHIỆM 3 NGÀY ---
    public static final String TRIAL_PACKAGE_NAME = "Gói Trải Nghiệm 3 Ngày";
    public static final String TRIAL_PACKAGE_DESC = "GÓI TRẢI NGHIỆM – Khám phá SÖL Fitness trong 3 ngày\n"
            + "Quyền lợi:\n"
            + "- Toàn quyền sử dụng khu vực gym tiêu chuẩn và trang thiết bị hiện đại.\n"
            + "- 01 buổi tập Personal Trainer 1:1 cùng Huấn luyện viên chuyên nghiệp.\n"
            + "- Sử dụng tủ khóa và tiện ích phòng thay đồ.\n"
            + "- Không áp dụng chính sách bảo lưu.";
    public static final BigDecimal TRIAL_PACKAGE_PRICE = BigDecimal.ZERO;
    public static final int TRIAL_PACKAGE_DURATION = 3;
    public static final Integer TRIAL_PACKAGE_CREDIT_LIMIT = 3;
    public static final String TRIAL_PACKAGE_TIER = "GOLD";

    // --- 1 THÁNG (30 NGÀY) ---
    public static final String SILVER_NAME = "SILVER";
    public static final String SILVER_DESC = "BASIC – Cơ bản\n"
            + "Quyền lợi:\n"
            + "- Tập luyện không giới hạn trong giờ hoạt động.\n"
            + "- Sử dụng khu vực tập luyện tiêu chuẩn.\n"
            + "- Sử dụng phòng thay đồ và tủ khóa chung.\n"
            + "- Miễn phí nước uống.\n"
            + "- 2 lượt đăng ký lớp Group Fitness cơ bản theo lịch.\n"
            + "- Đánh giá thể trạng và chỉ số BMI ban đầu.";
    public static final BigDecimal SILVER_PRICE = new BigDecimal("199000");
    public static final int SILVER_DURATION = 30;
    public static final Integer SILVER_CREDIT_LIMIT = 2;

    public static final String GOLD_NAME = "GOLD";
    public static final String GOLD_DESC = "STANDARD – Trung cấp\n"
            + "Toàn bộ quyền lợi Silver, cộng thêm:\n"
            + "- 03 buổi tập Personal Trainer 1:1 mỗi tháng.\n"
            + "- Sử dụng khu vực máy tập nâng cao.\n"
            + "- Cung cấp khăn tập riêng trong mỗi buổi tập.\n"
            + "- Tủ khóa cá nhân cố định.\n"
            + "- Được đánh giá thể trạng định kỳ mỗi tháng.\n"
            + "- Xây dựng kế hoạch tập luyện cá nhân cơ bản.\n"
            + "- 5 lượt đặt chỗ trong các lớp Group Fitness.\n"
            + "- Giảm 10% dịch vụ PT bổ sung và sản phẩm tại trung tâm.";
    public static final BigDecimal GOLD_PRICE = new BigDecimal("299000");
    public static final int GOLD_DURATION = 30;
    public static final Integer GOLD_CREDIT_LIMIT = 5;

    public static final String PLATINUM_NAME = "PLATINUM";
    public static final String PLATINUM_DESC = "VIP – Cao cấp\n"
            + "Toàn bộ quyền lợi Gold, cộng thêm:\n"
            + "- 06 buổi tập Personal Trainer 1:1 mỗi tháng.\n"
            + "- Đặc quyền sử dụng phòng tập VIP riêng biệt.\n"
            + "- Sử dụng hệ thống máy tập cao cấp và thiết bị chuyên biệt.\n"
            + "- Khăn tập và khăn tắm cá nhân theo tiêu chuẩn VIP.\n"
            + "- Tủ đồ cá nhân cao cấp, có khóa riêng.\n"
            + "- Sử dụng phòng xông hơi.\n"
            + "- Miễn phí nước khoáng và đồ uống thể thao.\n"
            + "- Đánh giá chỉ số cơ thể chuyên sâu: BMI, Body Fat, Muscle Mass.\n"
            + "- Thiết kế giáo án tập luyện riêng theo mục tiêu.\n"
            + "- Tư vấn dinh dưỡng cơ bản cùng huấn luyện viên.\n"
            + "- Ưu tiên đặt lịch PT và lớp học.\n"
            + "- Giảm 20% dịch vụ PT bổ sung và sản phẩm tại trung tâm.\n"
            + "- Được mời tham gia các sự kiện và chương trình độc quyền.";
    public static final BigDecimal PLATINUM_PRICE = new BigDecimal("599000");
    public static final int PLATINUM_DURATION = 30;
    public static final Integer PLATINUM_CREDIT_LIMIT = null;

    // --- 3 THÁNG (90 NGÀY) - ĐỒNG HÀNH DÀI HẠN (giá thấp hơn mua 3 lần gói 1 tháng) ---
    public static final String SILVER_3M_NAME = "SILVER 3 THÁNG";
    public static final String SILVER_3M_DESC = "BASIC – Đồng hành 3 tháng (Tiết kiệm 8%)\n"
            + "Quyền lợi:\n"
            + "- Tập luyện không giới hạn trong giờ hoạt động suốt 90 ngày.\n"
            + "- Sử dụng khu vực tập luyện tiêu chuẩn, phòng thay đồ và tủ khóa chung.\n"
            + "- Miễn phí nước uống.\n"
            + "- 6 lượt đăng ký lớp Group Fitness cơ bản theo lịch.\n"
            + "- Đánh giá thể trạng và chỉ số BMI ban đầu.";
    public static final BigDecimal SILVER_3M_PRICE = new BigDecimal("549000");
    public static final int SILVER_3M_DURATION = 90;
    public static final Integer SILVER_3M_CREDIT_LIMIT = 6;

    public static final String GOLD_3M_NAME = "GOLD 3 THÁNG";
    public static final String GOLD_3M_DESC = "STANDARD – Đồng hành 3 tháng (Tiết kiệm 11%)\n"
            + "Toàn bộ quyền lợi Silver, cộng thêm:\n"
            + "- 09 buổi tập Personal Trainer 1:1 trong 3 tháng.\n"
            + "- Sử dụng khu vực máy tập nâng cao và khăn tập riêng mỗi buổi.\n"
            + "- Tủ khóa cá nhân cố định.\n"
            + "- 15 lượt đặt chỗ trong các lớp Group Fitness.\n"
            + "- Giảm 10% dịch vụ PT bổ sung và sản phẩm tại trung tâm.";
    public static final BigDecimal GOLD_3M_PRICE = new BigDecimal("799000");
    public static final int GOLD_3M_DURATION = 90;
    public static final Integer GOLD_3M_CREDIT_LIMIT = 15;

    public static final String PLATINUM_3M_NAME = "PLATINUM 3 THÁNG";
    public static final String PLATINUM_3M_DESC = "VIP – Đồng hành 3 tháng (Tiết kiệm 11%)\n"
            + "Toàn bộ quyền lợi Gold, cộng thêm:\n"
            + "- 18 buổi tập Personal Trainer 1:1 trong 3 tháng.\n"
            + "- Đặc quyền sử dụng phòng tập VIP riêng biệt và phòng xông hơi.\n"
            + "- Khăn tập, khăn tắm và tủ đồ cá nhân cao cấp.\n"
            + "- Giáo án tập luyện riêng và tư vấn dinh dưỡng cơ bản.\n"
            + "- Ưu tiên đặt lịch PT và lớp học.\n"
            + "- Giảm 20% dịch vụ PT bổ sung và sản phẩm tại trung tâm.";
    public static final BigDecimal PLATINUM_3M_PRICE = new BigDecimal("1599000");
    public static final int PLATINUM_3M_DURATION = 90;
    public static final Integer PLATINUM_3M_CREDIT_LIMIT = null;

    // --- 6 và 12 THÁNG: đã ngừng bán ---
    // Chỉ giữ tên để chuyển gói đã có trong CSDL về inactive; không xóa vì hội viên có thể đang dùng.
    public static final String SILVER_6M_NAME = "SILVER 6 THÁNG";
    public static final String GOLD_6M_NAME = "GOLD 6 THÁNG";
    public static final String PLATINUM_6M_NAME = "PLATINUM 6 THÁNG";
    public static final String SILVER_12M_NAME = "SILVER 12 THÁNG";
    public static final String GOLD_12M_NAME = "GOLD 12 THÁNG";
    public static final String PLATINUM_12M_NAME = "PLATINUM 12 THÁNG";
    public static final BigDecimal SILVER_12M_PRICE = new BigDecimal("1990000");
    public static final BigDecimal GOLD_12M_PRICE = new BigDecimal("2990000");
    public static final BigDecimal PLATINUM_12M_PRICE = new BigDecimal("5990000");

    private final DisciplineService disciplines;
    private final RoomService rooms;
    private final PackageService packages;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.facilities.repository.EquipmentRepository equipmentRepository;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.facilities.repository.RoomRepository roomRepository;

    public CatalogSeeder(DisciplineService disciplines, RoomService rooms, PackageService packages) {
        this.disciplines = disciplines;
        this.rooms = rooms;
        this.packages = packages;
    }

    @Override
    @org.springframework.transaction.annotation.Transactional
    public void run(ApplicationArguments args) {
        // Bộ môn chuẩn: Gym là bộ môn chính; Bơi lội, Boxing, Tennis, Cầu lông, Yoga là bộ môn phụ.
        upsertDiscipline("Gym", "Sức mạnh, thể lực và kỹ thuật tập tạ", "Olympic Strength");
        upsertDiscipline("Bơi lội", "Kỹ thuật bơi, sức bền dưới nước và phục hồi", "Thermal Aquatics");
        upsertDiscipline("Boxing", "Kỹ thuật đấm, phản xạ và thể lực theo hiệp", "Boxing & Kickfit");
        upsertDiscipline("Tennis", "Kỹ thuật đánh bóng, di chuyển và đánh đôi");
        upsertDiscipline("Cầu lông", "Bộ chân, phản xạ và kỹ thuật đánh cầu");
        upsertDiscipline("Yoga", "Hơi thở, thăng bằng và giãn cơ", "Mindful Yoga");
        if (rooms.list().isEmpty()) {
            rooms.create(new RoomRequest("Phòng Gym Tiêu chuẩn", "Tầng 1 - Khu Gym Chính", 50, "available", null, null, null, "STANDARD"));
            rooms.create(new RoomRequest("Phòng Gym VIP", "Tầng 2 - Khu VIP Platinum", 25, "available", null, null, null, "PLATINUM"));
            rooms.create(new RoomRequest("Zen Garden Studio", "Penthouse", 18, "available", null, null, null, "STANDARD"));
            rooms.create(new RoomRequest("Ring Arena 01", "Level 1 - East Wing", 14, "maintenance", null, null, null, "STANDARD"));
            rooms.create(new RoomRequest("Oasis Lap Pool", "Sub-level Oasis", 20, "available", null, null, null, "STANDARD"));
        }

        // Upsert 3-day trial package
        upsertPackageWithTier(TRIAL_PACKAGE_NAME, TRIAL_PACKAGE_DESC, TRIAL_PACKAGE_PRICE, TRIAL_PACKAGE_DURATION, TRIAL_PACKAGE_CREDIT_LIMIT, TRIAL_PACKAGE_TIER, "GOLD TRIAL", "Gói Tập Thử 3 Ngày", "Gói Thử Gold");

        // Upsert 1-month base packages
        upsertPackage(SILVER_NAME, SILVER_DESC, SILVER_PRICE, SILVER_DURATION, SILVER_CREDIT_LIMIT, "The Essential");
        upsertPackage(GOLD_NAME, GOLD_DESC, GOLD_PRICE, GOLD_DURATION, GOLD_CREDIT_LIMIT, "The Sanctuary VIP");
        upsertPackage(PLATINUM_NAME, PLATINUM_DESC, PLATINUM_PRICE, PLATINUM_DURATION, PLATINUM_CREDIT_LIMIT, "The Sovereign Annual");

        // Upsert 3-month long-term packages
        upsertPackage(SILVER_3M_NAME, SILVER_3M_DESC, SILVER_3M_PRICE, SILVER_3M_DURATION, SILVER_3M_CREDIT_LIMIT);
        upsertPackage(GOLD_3M_NAME, GOLD_3M_DESC, GOLD_3M_PRICE, GOLD_3M_DURATION, GOLD_3M_CREDIT_LIMIT);
        upsertPackage(PLATINUM_3M_NAME, PLATINUM_3M_DESC, PLATINUM_3M_PRICE, PLATINUM_3M_DURATION, PLATINUM_3M_CREDIT_LIMIT);

        // Ngừng bán các gói 6 và 12 tháng đã seed trước đây
        for (String retired : new String[] {SILVER_6M_NAME, GOLD_6M_NAME, PLATINUM_6M_NAME,
                SILVER_12M_NAME, GOLD_12M_NAME, PLATINUM_12M_NAME}) {
            retirePackage(retired);
        }

        if (equipmentRepository != null && roomRepository != null && equipmentRepository.count() == 0) {
            seedInitialEquipment();
        }
    }

    private void seedInitialEquipment() {
        upsertRoom("Phòng Gym Tiêu chuẩn", "Tầng 1 - Khu Gym Chính", 50, "available", "STANDARD");
        upsertRoom("Phòng Gym VIP", "Tầng 2 - Khu VIP Platinum", 25, "available", "PLATINUM");
        var allRooms = roomRepository.findAll();
        com.swp391.scms.facilities.entity.Room standard = allRooms.stream()
                .filter(r -> "Phòng Gym Tiêu chuẩn".equalsIgnoreCase(r.getName()))
                .findFirst().orElse(null);
        com.swp391.scms.facilities.entity.Room vip = allRooms.stream()
                .filter(r -> "Phòng Gym VIP".equalsIgnoreCase(r.getName()))
                .findFirst().orElse(null);

        if (standard != null) {
            seedEquipmentIfMissing("Máy chạy bộ điện Commercial Pro", "EQ-RUN-01", "Cardio", standard, 8, "active");
            seedEquipmentIfMissing("Xe đạp tập Upright Bike", "EQ-BIKE-01", "Cardio", standard, 6, "active");
            seedEquipmentIfMissing("Giàn tạ đa năng Smith Machine", "EQ-SMI-01", "Strength", standard, 3, "active");
            seedEquipmentIfMissing("Máy kéo xô đôi Dual Lat Pulldown", "EQ-LAT-01", "Strength", standard, 2, "active");
            seedEquipmentIfMissing("Dàn tạ tay cao su Dumbbell (2.5-40kg)", "EQ-DUMB-01", "Free Weights", standard, 2, "active");
            seedEquipmentIfMissing("Khung gánh tạ Squat Rack", "EQ-SQUAT-01", "Strength", standard, 2, "active");
            seedEquipmentIfMissing("Ghế đẩy ngực đa năng Adjustable Bench", "EQ-BENCH-01", "Free Weights", standard, 6, "active");
        }
        if (vip != null) {
            seedEquipmentIfMissing("Máy chạy bộ cao cấp Technogym Artis Run", "EQ-VIP-RUN-01", "Cardio", vip, 4, "active");
            seedEquipmentIfMissing("Máy tập toàn thân Synchro Elliptical VIP", "EQ-VIP-SYN-01", "Cardio", vip, 3, "active");
            seedEquipmentIfMissing("Dàn tạ khối thông minh Technogym Kinesis One", "EQ-VIP-KIN-01", "Strength", vip, 2, "active");
            seedEquipmentIfMissing("Dàn tạ đơn Urethane bọc crôm VIP", "EQ-VIP-DUMB-01", "Free Weights", vip, 1, "active");
            seedEquipmentIfMissing("Máy đo chỉ số cơ thể chuyên sâu InBody 770", "EQ-VIP-INBODY-01", "Diagnostic", vip, 1, "active");
        }
    }

    private void seedEquipmentIfMissing(String name, String code, String category, com.swp391.scms.facilities.entity.Room room, int quantity, String status) {
        if (equipmentRepository != null && !equipmentRepository.existsByCode(code)) {
            equipmentRepository.save(new com.swp391.scms.facilities.entity.Equipment(name, code, category, room, quantity, status));
        }
    }

    private void upsertRoom(String name, String location, int capacity, String status, String tier) {
        for (var r : rooms.list()) {
            if (name.equalsIgnoreCase(r.name())) {
                if (tier != null && !tier.equalsIgnoreCase(r.tier())) {
                    rooms.update(r.id(), new RoomRequest(r.name(), r.location(), r.capacity(), r.status(), r.disciplineId(), r.openTime(), r.closeTime(), tier));
                }
                return;
            }
        }
        rooms.create(new RoomRequest(name, location, capacity, status, null, null, null, tier));
    }

    /** Tạo bộ môn chuẩn nếu chưa có; đổi tên bộ môn cũ tương ứng (giữ nguyên id và lớp học đang gắn). */
    private void upsertDiscipline(String name, String description, String... legacyNames) {
        for (var discipline : disciplines.list()) {
            if (name.equalsIgnoreCase(discipline.name())) {
                return;
            }
            for (String legacy : legacyNames) {
                if (legacy.equalsIgnoreCase(discipline.name())) {
                    disciplines.update(discipline.id(), new DisciplineRequest(name,
                            discipline.description() != null ? discipline.description() : description));
                    return;
                }
            }
        }
        disciplines.create(new DisciplineRequest(name, description));
    }

    /** Đặt gói đang active về inactive (idempotent); không tạo mới, không xóa. */
    private void retirePackage(String name) {
        for (var pkg : packages.list()) {
            if (name.equalsIgnoreCase(pkg.name()) && "active".equals(pkg.status())) {
                packages.updateStatus(pkg.id(), "inactive");
            }
        }
    }

    private void upsertPackage(String name, String desc, BigDecimal price, int duration, Integer creditLimit, String... legacyAliases) {
        upsertPackageWithTier(name, desc, price, duration, creditLimit, null, legacyAliases);
    }

    private void upsertPackageWithTier(String name, String desc, BigDecimal price, int duration, Integer creditLimit, String tier, String... legacyAliases) {
        var existingList = packages.list();
        for (var pkg : existingList) {
            if (name.equalsIgnoreCase(pkg.name())) {
                return;
            }
            if (legacyAliases != null) {
                for (String alias : legacyAliases) {
                    if (alias.equalsIgnoreCase(pkg.name())) {
                        packages.update(pkg.id(), new PackageRequest(name, pkg.description(),
                                correctedLegacyPrice(pkg.name(), pkg.price()), pkg.durationDays(), pkg.classCreditLimit(), pkg.status(), tier));
                        return;
                    }
                }
            }
        }
        packages.create(new PackageRequest(name, desc, price, duration, creditLimit, "active", tier));
    }
    /**
     * Preserves any price customized by a Manager in the database; only converts the original
     * unedited seed prices when renaming legacy package aliases ("The Essential", etc.) for the first time.
     */
    private BigDecimal correctedLegacyPrice(String name, BigDecimal currentPrice) {
        if (currentPrice == null) return null;
        if ("The Essential".equalsIgnoreCase(name) && currentPrice.compareTo(new BigDecimal("2800000")) == 0) return new BigDecimal("299000");
        if ("The Sanctuary VIP".equalsIgnoreCase(name) && currentPrice.compareTo(new BigDecimal("7500000")) == 0) return new BigDecimal("499000");
        if ("The Sovereign Annual".equalsIgnoreCase(name) && currentPrice.compareTo(new BigDecimal("26000000")) == 0) return new BigDecimal("999000");
        return currentPrice;
    }
}
