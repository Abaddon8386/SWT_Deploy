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
import org.springframework.stereotype.Component;

/** Seeds sample disciplines, rooms and packages into empty catalogs (idempotent). */
@Component
public class CatalogSeeder implements ApplicationRunner {

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

    // --- 6 THÁNG (180 NGÀY) - ƯU ĐÃI TIẾT KIỆM ~17% ---
    public static final String SILVER_6M_NAME = "SILVER 6 THÁNG";
    public static final String SILVER_6M_DESC = "BASIC – Đồng hành 6 tháng (Tiết kiệm 16%)\n"
            + "Quyền lợi:\n"
            + "- Tập luyện không giới hạn trong giờ hoạt động suốt 180 ngày.\n"
            + "- Tiết kiệm 16% so với đăng ký theo từng tháng (chỉ ~166.000đ/tháng).\n"
            + "- Sử dụng khu vực tập luyện tiêu chuẩn.\n"
            + "- Sử dụng phòng thay đồ và tủ khóa chung.\n"
            + "- Miễn phí nước uống.\n"
            + "- 12 lượt đăng ký lớp Group Fitness cơ bản theo lịch.\n"
            + "- Đánh giá thể trạng và chỉ số BMI định kỳ.\n"
            + "- Tặng 01 lần bảo lưu thẻ tối đa 30 ngày.";
    public static final BigDecimal SILVER_6M_PRICE = new BigDecimal("999000");
    public static final int SILVER_6M_DURATION = 180;
    public static final Integer SILVER_6M_CREDIT_LIMIT = 12;

    public static final String GOLD_6M_NAME = "GOLD 6 THÁNG";
    public static final String GOLD_6M_DESC = "STANDARD – Đồng hành 6 tháng (Tiết kiệm 17%)\n"
            + "Toàn bộ quyền lợi Silver, cộng thêm:\n"
            + "- 18 buổi tập Personal Trainer 1:1 trong 6 tháng.\n"
            + "- Sử dụng khu vực máy tập nâng cao.\n"
            + "- Cung cấp khăn tập riêng trong mỗi buổi tập.\n"
            + "- Tủ khóa cá nhân cố định suốt thời hạn thẻ.\n"
            + "- Đánh giá thể trạng định kỳ mỗi tháng.\n"
            + "- Xây dựng kế hoạch tập luyện cá nhân cơ bản.\n"
            + "- 30 lượt đặt chỗ trong các lớp Group Fitness.\n"
            + "- Giảm 10% dịch vụ PT bổ sung và sản phẩm tại trung tâm.\n"
            + "- Tặng 01 lần bảo lưu thẻ tối đa 30 ngày và 01 túi tập thể thao SÖL cao cấp.";
    public static final BigDecimal GOLD_6M_PRICE = new BigDecimal("1499000");
    public static final int GOLD_6M_DURATION = 180;
    public static final Integer GOLD_6M_CREDIT_LIMIT = 30;

    public static final String PLATINUM_6M_NAME = "PLATINUM 6 THÁNG";
    public static final String PLATINUM_6M_DESC = "VIP – Đồng hành 6 tháng (Đặc quyền VIP - Tiết kiệm 17%)\n"
            + "Toàn bộ quyền lợi Gold, cộng thêm:\n"
            + "- 36 buổi tập Personal Trainer 1:1 trong 6 tháng.\n"
            + "- Đặc quyền sử dụng phòng tập VIP riêng biệt.\n"
            + "- Sử dụng hệ thống máy tập cao cấp và thiết bị chuyên biệt.\n"
            + "- Khăn tập và khăn tắm cá nhân theo tiêu chuẩn VIP.\n"
            + "- Tủ đồ cá nhân cao cấp, có khóa riêng.\n"
            + "- Sử dụng phòng xông hơi không giới hạn.\n"
            + "- Miễn phí nước khoáng và đồ uống thể thao.\n"
            + "- Đánh giá chỉ số cơ thể chuyên sâu: BMI, Body Fat, Muscle Mass.\n"
            + "- Thiết kế giáo án tập luyện riêng theo mục tiêu và tư vấn dinh dưỡng cùng HLV.\n"
            + "- Ưu tiên cao nhất khi đặt lịch PT và lớp học.\n"
            + "- Giảm 20% dịch vụ PT bổ sung và sản phẩm tại trung tâm.\n"
            + "- Tặng 02 lần bảo lưu thẻ (tối đa 60 ngày) và 02 vé mời VIP cho người thân.";
    public static final BigDecimal PLATINUM_6M_PRICE = new BigDecimal("2999000");
    public static final int PLATINUM_6M_DURATION = 180;
    public static final Integer PLATINUM_6M_CREDIT_LIMIT = null;

    // --- 12 THÁNG (365 NGÀY) - ĐỒNG HÀNH TRỌN NĂM (TIẾT KIỆM 25% - TẶNG 3 THÁNG) ---
    public static final String SILVER_12M_NAME = "SILVER 12 THÁNG";
    public static final String SILVER_12M_DESC = "BASIC – Đồng hành 12 tháng (Tiết kiệm 25% - Tặng 3 tháng tập)\n"
            + "Quyền lợi:\n"
            + "- Tập luyện không giới hạn trong giờ hoạt động suốt 365 ngày.\n"
            + "- Tiết kiệm 25% chi phí (tương đương tặng 3 tháng tập miễn phí, chỉ ~149.000đ/tháng).\n"
            + "- Sử dụng khu vực tập luyện tiêu chuẩn.\n"
            + "- Sử dụng phòng thay đồ và tủ khóa chung.\n"
            + "- Miễn phí nước uống.\n"
            + "- 24 lượt đăng ký lớp Group Fitness cơ bản theo lịch.\n"
            + "- Đánh giá thể trạng và chỉ số BMI định kỳ hàng quý.\n"
            + "- Tặng 02 lần bảo lưu thẻ với tổng thời gian lên tới 60 ngày.";
    public static final BigDecimal SILVER_12M_PRICE = new BigDecimal("1799000");
    public static final int SILVER_12M_DURATION = 365;
    public static final Integer SILVER_12M_CREDIT_LIMIT = 24;

    public static final String GOLD_12M_NAME = "GOLD 12 THÁNG";
    public static final String GOLD_12M_DESC = "STANDARD – Đồng hành 12 tháng (Tiết kiệm 25% - Tặng 3 tháng tập)\n"
            + "Toàn bộ quyền lợi Silver, cộng thêm:\n"
            + "- 36 buổi tập Personal Trainer 1:1 suốt năm.\n"
            + "- Sử dụng khu vực máy tập nâng cao.\n"
            + "- Cung cấp khăn tập riêng trong mỗi buổi tập.\n"
            + "- Tủ khóa cá nhân cố định suốt cả năm.\n"
            + "- Đánh giá thể trạng chuyên sâu định kỳ mỗi tháng.\n"
            + "- Xây dựng kế hoạch tập luyện cá nhân toàn diện theo năm.\n"
            + "- 60 lượt đặt chỗ trong các lớp Group Fitness.\n"
            + "- Giảm 15% dịch vụ PT bổ sung và sản phẩm tại trung tâm.\n"
            + "- Hỗ trợ bảo lưu linh hoạt tới 90 ngày.\n"
            + "- Tặng trọn bộ quà tặng SÖL Premium (bình giữ nhiệt + khăn + túi thể thao).";
    public static final BigDecimal GOLD_12M_PRICE = new BigDecimal("2699000");
    public static final int GOLD_12M_DURATION = 365;
    public static final Integer GOLD_12M_CREDIT_LIMIT = 60;

    public static final String PLATINUM_12M_NAME = "PLATINUM 12 THÁNG";
    public static final String PLATINUM_12M_DESC = "VIP – Đồng hành 12 tháng (Đặc quyền VIP trọn năm - Tiết kiệm 25%)\n"
            + "Toàn bộ quyền lợi Gold, cộng thêm:\n"
            + "- 72 buổi tập Personal Trainer 1:1 cao cấp.\n"
            + "- Đặc quyền sử dụng phòng tập VIP riêng biệt 365 ngày.\n"
            + "- Sử dụng hệ thống máy tập cao cấp và thiết bị chuyên biệt.\n"
            + "- Khăn tập và khăn tắm cá nhân theo tiêu chuẩn VIP 5 sao.\n"
            + "- Tủ đồ cá nhân cao cấp, có chìa khóa riêng biệt cả năm.\n"
            + "- Sử dụng phòng xông hơi sauna/jacuzzi không giới hạn.\n"
            + "- Miễn phí nước khoáng và đồ uống thể thao mỗi buổi tập.\n"
            + "- Đánh giá chỉ số cơ thể chuyên sâu: BMI, Body Fat, Muscle Mass.\n"
            + "- Giáo án tập luyện cá nhân hóa và chế độ dinh dưỡng chuyên sâu cùng Master Coach.\n"
            + "- Ưu tiên cao nhất mọi lịch hẹn PT, lớp học và khu vực VIP.\n"
            + "- Giảm 25% dịch vụ PT bổ sung và sản phẩm tại trung tâm.\n"
            + "- Tặng bảo lưu linh hoạt 120 ngày và 04 vé mời trải nghiệm VIP cho người thân.\n"
            + "- Khách mời danh dự tham gia tất cả sự kiện, workshop và gala của trung tâm.";
    public static final BigDecimal PLATINUM_12M_PRICE = new BigDecimal("5399000");
    public static final int PLATINUM_12M_DURATION = 365;
    public static final Integer PLATINUM_12M_CREDIT_LIMIT = null;

    private final DisciplineService disciplines;
    private final RoomService rooms;
    private final PackageService packages;

    public CatalogSeeder(DisciplineService disciplines, RoomService rooms, PackageService packages) {
        this.disciplines = disciplines;
        this.rooms = rooms;
        this.packages = packages;
    }

    @Override
    @org.springframework.transaction.annotation.Transactional
    public void run(ApplicationArguments args) {
        if (disciplines.list().isEmpty()) {
            disciplines.create(new DisciplineRequest("Reformer Pilates", "Core strength and spine recovery on Reformer machines"));
            disciplines.create(new DisciplineRequest("Olympic Strength", "Explosive strength with Olympic barbells"));
            disciplines.create(new DisciplineRequest("Mindful Yoga", "Breathwork, deep stretching and meditation"));
            disciplines.create(new DisciplineRequest("Boxing & Kickfit", "Combat tactics, reflexes and high-intensity fat burn"));
            disciplines.create(new DisciplineRequest("Thermal Aquatics", "Hydrodynamic swimming and warm-water recovery"));
        }
        if (rooms.list().isEmpty()) {
            rooms.create(new RoomRequest("Studio 01", "Level 2 - North Wing", 12, "available"));
            rooms.create(new RoomRequest("Arena 02 (Strength)", "Level 1 - Main Floor", 25, "available"));
            rooms.create(new RoomRequest("Zen Garden Studio", "Penthouse", 18, "available"));
            rooms.create(new RoomRequest("Ring Arena 01", "Level 1 - East Wing", 14, "maintenance"));
            rooms.create(new RoomRequest("Oasis Lap Pool", "Sub-level Oasis", 20, "available"));
        }

        // Upsert 1-month base packages
        upsertPackage(SILVER_NAME, SILVER_DESC, SILVER_PRICE, SILVER_DURATION, SILVER_CREDIT_LIMIT, "The Essential");
        upsertPackage(GOLD_NAME, GOLD_DESC, GOLD_PRICE, GOLD_DURATION, GOLD_CREDIT_LIMIT, "The Sanctuary VIP");
        upsertPackage(PLATINUM_NAME, PLATINUM_DESC, PLATINUM_PRICE, PLATINUM_DURATION, PLATINUM_CREDIT_LIMIT, "The Sovereign Annual");

        // Upsert 6-month long-term packages
        upsertPackage(SILVER_6M_NAME, SILVER_6M_DESC, SILVER_6M_PRICE, SILVER_6M_DURATION, SILVER_6M_CREDIT_LIMIT);
        upsertPackage(GOLD_6M_NAME, GOLD_6M_DESC, GOLD_6M_PRICE, GOLD_6M_DURATION, GOLD_6M_CREDIT_LIMIT);
        upsertPackage(PLATINUM_6M_NAME, PLATINUM_6M_DESC, PLATINUM_6M_PRICE, PLATINUM_6M_DURATION, PLATINUM_6M_CREDIT_LIMIT);

        // Upsert 12-month long-term packages
        upsertPackage(SILVER_12M_NAME, SILVER_12M_DESC, SILVER_12M_PRICE, SILVER_12M_DURATION, SILVER_12M_CREDIT_LIMIT);
        upsertPackage(GOLD_12M_NAME, GOLD_12M_DESC, GOLD_12M_PRICE, GOLD_12M_DURATION, GOLD_12M_CREDIT_LIMIT);
        upsertPackage(PLATINUM_12M_NAME, PLATINUM_12M_DESC, PLATINUM_12M_PRICE, PLATINUM_12M_DURATION, PLATINUM_12M_CREDIT_LIMIT);
    }

    private void upsertPackage(String name, String desc, BigDecimal price, int duration, Integer creditLimit, String... legacyAliases) {
        var existingList = packages.list();
        for (var pkg : existingList) {
            if (name.equalsIgnoreCase(pkg.name())) {
                return;
            }
            if (legacyAliases != null) {
                for (String alias : legacyAliases) {
                    if (alias.equalsIgnoreCase(pkg.name())) {
                        packages.update(pkg.id(), new PackageRequest(name, pkg.description(),
                                correctedLegacyPrice(pkg.name(), pkg.price()), pkg.durationDays(), pkg.classCreditLimit(), pkg.status()));
                        return;
                    }
                }
            }
        }
        packages.create(new PackageRequest(name, desc, price, duration, creditLimit, "active"));
    }
    private BigDecimal correctedLegacyPrice(String name, BigDecimal currentPrice) {
        if ("The Essential".equalsIgnoreCase(name) && currentPrice.compareTo(new BigDecimal("2800000")) == 0) return new BigDecimal("299000");
        if ("The Sanctuary VIP".equalsIgnoreCase(name) && currentPrice.compareTo(new BigDecimal("7500000")) == 0) return new BigDecimal("499000");
        if ("The Sovereign Annual".equalsIgnoreCase(name) && currentPrice.compareTo(new BigDecimal("26000000")) == 0) return new BigDecimal("999000");
        return currentPrice;
    }
}
