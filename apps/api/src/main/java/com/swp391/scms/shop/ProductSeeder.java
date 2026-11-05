package com.swp391.scms.shop;

import com.swp391.scms.shop.entity.Product;
import com.swp391.scms.shop.entity.ProductCategory;
import com.swp391.scms.shop.entity.ProductForm;
import com.swp391.scms.shop.entity.ProductGoal;
import com.swp391.scms.shop.entity.ProductImage;
import com.swp391.scms.shop.entity.ProductNutrient;
import com.swp391.scms.shop.entity.ProductVariant;
import com.swp391.scms.shop.repository.ProductCategoryRepository;
import com.swp391.scms.shop.repository.ProductRepository;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class ProductSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ProductSeeder.class);
    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final ShopProperties props;
    private final ProductCategoryRepository categories;
    private final ProductRepository products;
    private final Clock clock;

    public ProductSeeder(ShopProperties props,
                         ProductCategoryRepository categories,
                         ProductRepository products) {
        this(props, categories, products, Clock.system(VN_ZONE));
    }

    @Autowired
    public ProductSeeder(ShopProperties props,
                         ProductCategoryRepository categories,
                         ProductRepository products,
                         Clock clock) {
        this.props = props;
        this.categories = categories;
        this.products = products;
        this.clock = clock != null ? clock : Clock.system(VN_ZONE);
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (props == null || !props.seedSamples()) {
            return;
        }
        if (products.count() > 0) {
            return;
        }
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), VN_ZONE);

        ProductCategory catWhey = category("Whey", "whey", 1, now);
        ProductCategory catCreatine = category("Creatine", "creatine", 2, now);
        ProductCategory catPre = category("Trước tập", "pre-workout", 3, now);
        ProductCategory catHydration = category("Điện giải", "dien-giai", 4, now);
        ProductCategory catVitamin = category("Vitamin & khoáng chất", "vitamin", 5, now);
        ProductCategory catBar = category("Thanh protein", "thanh-protein", 6, now);

        products.save(product(
                catWhey,
                "SÖL Whey Isolate 100%",
                "sol-whey-isolate",
                ProductForm.powder.name(),
                "Đạm whey tách béo lọc lạnh, dễ tiêu hóa sau buổi tập nặng.",
                "Đạm whey isolate tinh khiết từ sữa bò ăn cỏ, hàm lượng lactose thấp, hỗ trợ bổ sung đạm nhanh sau buổi tập.",
                "1 muỗng (33 g)",
                "Pha 1 muỗng với 250–300 ml nước lạnh hoặc sữa hạt, lắc đều 20 giây.",
                "Chứa thành phần từ sữa. Bảo quản nơi khô thoáng, đậy kín nắp sau khi mở.",
                true,
                Set.of(ProductGoal.muscle_gain, ProductGoal.recovery),
                List.of(
                        variant("SOL-WHEY-CHO-2LB", "Vị Sô-cô-la · 908 g", "1090000", 27, 25, 1),
                        variant("SOL-WHEY-CHO-5LB", "Vị Sô-cô-la · 2,27 kg", "2290000", 68, 18, 2),
                        variant("SOL-WHEY-VAN-5LB", "Vị Vani tự nhiên · 2,27 kg", "2290000", 68, 15, 3)
                ),
                List.of(
                        nutrient("Năng lượng", "130", "kcal", null, false, false, 1),
                        nutrient("Đạm", "25", "g", 50, false, true, 2),
                        nutrient("BCAA tự nhiên", "5.5", "g", null, true, false, 3),
                        nutrient("Carbohydrate", "2", "g", 1, false, false, 4),
                        nutrient("Chất béo", "1", "g", 1, false, false, 5),
                        nutrient("Natri", "90", "mg", 4, false, false, 6)
                ),
                now.minusDays(1)
        ));

        products.save(product(
                catCreatine,
                "SÖL Creatine Monohydrate Micronized",
                "sol-creatine-monohydrate",
                ProductForm.powder.name(),
                "Creatine monohydrate hạt siêu mịn không mùi vị, dễ pha cùng nước hoặc whey.",
                "100% Creatine Monohydrate độ mịn 200 mesh, không chất độn, không hương liệu nhân tạo.",
                "1 muỗng (5 g)",
                "Dùng 1 muỗng (5 g) mỗi ngày cùng 250 ml nước lọc hoặc nước trái cây.",
                "Uống đủ tối thiểu 2 lít nước mỗi ngày khi sử dụng sản phẩm.",
                true,
                Set.of(ProductGoal.muscle_gain, ProductGoal.energy),
                List.of(
                        variant("SOL-CRE-300G", "Không vị · 300 g", "590000", 60, 8, 1),
                        variant("SOL-CRE-500G", "Không vị · 500 g", "850000", 100, 20, 2)
                ),
                List.of(
                        nutrient("Creatine Monohydrate", "5", "g", null, false, true, 1)
                ),
                now.minusDays(1)
        ));

        products.save(product(
                catPre,
                "SÖL Pre-Workout Ignition",
                "sol-pre-workout-ignition",
                ProductForm.powder.name(),
                "Công thức tỉnh táo trước buổi tập với L-Citrulline, Beta-Alanine và Caffeine tự nhiên.",
                "Kết hợp axit amin và chiết xuất hạt cà phê xanh với liều lượng minh bạch trên từng thành phần.",
                "1 muỗng (14 g)",
                "Pha 1 muỗng với 300 ml nước lạnh, dùng trước buổi tập 20–30 phút.",
                "Mỗi khẩu phần chứa 175 mg caffeine. Không dùng trong vòng 5 giờ trước khi ngủ.",
                true,
                Set.of(ProductGoal.energy),
                List.of(
                        variant("SOL-PRE-CIT-30", "Vị Cam Yuzu · 420 g", "890000", 30, 22, 1),
                        variant("SOL-PRE-BER-30", "Vị Dâu rừng · 420 g", "890000", 30, 14, 2)
                ),
                List.of(
                        nutrient("L-Citrulline", "6", "g", null, false, true, 1),
                        nutrient("Beta-Alanine", "3.2", "g", null, false, false, 2),
                        nutrient("Caffeine tự nhiên", "175", "mg", null, false, false, 3),
                        nutrient("L-Theanine", "100", "mg", null, false, false, 4),
                        nutrient("Vitamin B12", "2.4", "mcg", 100, false, false, 5)
                ),
                now.minusDays(5)
        ));

        products.save(product(
                catHydration,
                "SÖL Electrolyte Hydro Salts",
                "sol-electrolyte-hydro-salts",
                ProductForm.powder.name(),
                "Muối điện giải không đường bù khoáng nhanh cho các buổi HIIT, chạy bộ và đánh sân.",
                "Tỷ lệ Natri – Kali – Magie cân đối, vị thanh nhẹ từ chanh muối tự nhiên, không phẩm màu.",
                "1 gói (6 g)",
                "Hòa 1 gói vào bình 500–600 ml nước mát, uống từng ngụm trong và sau khi tập.",
                "Bảo quản nơi khô mát, tránh ánh nắng trực tiếp.",
                false,
                Set.of(ProductGoal.recovery, ProductGoal.energy),
                List.of(
                        variant("SOL-HYD-LMN-30", "Vị Chanh muối · Hộp 30 gói", "490000", 30, 40, 1),
                        variant("SOL-HYD-PCH-30", "Vị Đào trắng · Hộp 30 gói", "490000", 30, 28, 2)
                ),
                List.of(
                        nutrient("Năng lượng", "10", "kcal", null, false, false, 1),
                        nutrient("Natri", "500", "mg", 22, false, true, 2),
                        nutrient("Kali", "200", "mg", 4, false, false, 3),
                        nutrient("Magie", "60", "mg", 14, false, false, 4),
                        nutrient("Vitamin C", "90", "mg", 100, false, false, 5)
                ),
                now.minusDays(7)
        ));

        products.save(product(
                catVitamin,
                "SÖL Daily Omega-3 & D3+K2",
                "sol-daily-omega-3-d3-k2",
                ProductForm.capsule.name(),
                "Viên nang dầu cá biển sâu chuẩn rTG kết hợp Vitamin D3 và K2 MK-7.",
                "Chiết xuất từ cá cơm vùng biển lạnh được chưng cất phân tử, viên mềm không tanh.",
                "2 viên nang mềm",
                "Uống 2 viên mỗi ngày ngay sau bữa ăn chính có chất béo.",
                "Tham khảo ý kiến chuyên gia y tế nếu đang dùng thuốc chống đông máu.",
                false,
                Set.of(ProductGoal.wellness, ProductGoal.recovery),
                List.of(
                        variant("SOL-OMG-90", "Lọ 90 viên (45 lần dùng)", "650000", 45, 7, 1)
                ),
                List.of(
                        nutrient("Dầu cá tinh khiết", "2000", "mg", null, false, false, 1),
                        nutrient("EPA + DHA", "1200", "mg", null, true, true, 2),
                        nutrient("Vitamin D3", "25", "mcg", 125, false, false, 3),
                        nutrient("Vitamin K2 (MK-7)", "90", "mcg", 75, false, false, 4)
                ),
                now.minusDays(10)
        ));

        products.save(product(
                catBar,
                "SÖL Crunch Protein Bar",
                "sol-crunch-protein-bar",
                ProductForm.bar.name(),
                "Thanh protein nướng giòn 20 g đạm, ít đường, tiện mang theo trong túi tập.",
                "Kết hợp whey isolate và hạt hạnh nhân rang, giàu chất xơ prebiotic, không phủ siro đường.",
                "1 thanh (60 g)",
                "Dùng trực tiếp như bữa phụ trước hoặc sau giờ tập.",
                "Chứa sữa và hạt cây (hạnh nhân).",
                false,
                Set.of(ProductGoal.muscle_gain, ProductGoal.weight_management),
                List.of(
                        variant("SOL-BAR-ALM-12", "Hạnh nhân Cacao · Hộp 12 thanh", "690000", 12, 24, 1),
                        variant("SOL-BAR-PNT-12", "Bơ đậu phộng muối biển · Hộp 12 thanh", "690000", 12, 16, 2)
                ),
                List.of(
                        nutrient("Năng lượng", "210", "kcal", null, false, false, 1),
                        nutrient("Đạm", "20", "g", 40, false, true, 2),
                        nutrient("Carbohydrate", "18", "g", 7, false, false, 3),
                        nutrient("Chất xơ", "7", "g", 25, true, false, 4),
                        nutrient("Đường", "2", "g", null, true, false, 5),
                        nutrient("Chất béo", "7", "g", 9, false, false, 6)
                ),
                now.minusDays(14)
        ));

        log.info("Seeded 6 sample SÖL Nutrition products across 6 categories");
    }

    private ProductCategory category(String name, String slug, int sortOrder, LocalDateTime now) {
        return categories.findBySlug(slug).orElseGet(() -> {
            ProductCategory c = new ProductCategory();
            c.setName(name);
            c.setSlug(slug);
            c.setSortOrder(sortOrder);
            c.setActive(true);
            c.setCreatedAt(now);
            ProductCategory saved = categories.save(c);
            return saved != null ? saved : c;
        });
    }

    private Product product(ProductCategory category,
                            String name,
                            String slug,
                            String form,
                            String shortDescription,
                            String description,
                            String servingSize,
                            String usageInstructions,
                            String warnings,
                            boolean featured,
                            Set<ProductGoal> goals,
                            List<ProductVariant> variants,
                            List<ProductNutrient> nutrients,
                            LocalDateTime now) {
        Product p = new Product();
        p.setCategory(category);
        p.setName(name);
        p.setSlug(slug);
        p.setBrand("SÖL Nutrition");
        p.setForm(form);
        p.setShortDescription(shortDescription);
        p.setDescription(description);
        p.setServingSize(servingSize);
        p.setUsageInstructions(usageInstructions);
        p.setWarnings(warnings);
        p.setRegistrationNumber(null);
        p.setActive(true);
        p.setFeatured(featured);
        p.setGoals(new LinkedHashSet<>(goals));
        p.setCreatedAt(now);
        p.setUpdatedAt(now);
        for (ProductVariant v : variants) {
            v.setProduct(p);
            p.getVariants().add(v);
        }
        for (ProductNutrient n : nutrients) {
            n.setProduct(p);
            p.getNutrients().add(n);
        }
        try (InputStream is = getClass().getResourceAsStream("/shop-seed-images/" + slug + ".jpg")) {
            if (is != null) {
                byte[] bytes = is.readAllBytes();
                if (bytes.length > 0) {
                    ProductImage img = new ProductImage();
                    img.setProduct(p);
                    img.setContentType("image/jpeg");
                    img.setDataUrl("data:image/jpeg;base64," + Base64.getEncoder().encodeToString(bytes));
                    img.setAltText(name);
                    img.setSortOrder(1);
                    img.setCreatedAt(now);
                    p.getImages().add(img);
                }
            }
        } catch (Exception ex) {
            log.warn("Could not seed image for {}: {}", slug, ex.getMessage());
        }
        return p;
    }

    private static ProductVariant variant(String sku, String label, String price, int servings, int stock, int sortOrder) {
        ProductVariant v = new ProductVariant();
        v.setSku(sku);
        v.setLabel(label);
        v.setPrice(new BigDecimal(price));
        v.setServingsPerContainer(servings);
        v.setStock(stock);
        v.setActive(true);
        v.setSortOrder(sortOrder);
        return v;
    }

    private static ProductNutrient nutrient(String name,
                                            String amount,
                                            String unit,
                                            Integer dv,
                                            boolean subRow,
                                            boolean highlight,
                                            int sortOrder) {
        ProductNutrient n = new ProductNutrient();
        n.setName(name);
        n.setAmount(new BigDecimal(amount));
        n.setUnit(unit);
        n.setDailyValuePercent(dv);
        n.setSubRow(subRow);
        n.setHighlight(highlight);
        n.setSortOrder(sortOrder);
        return n;
    }
}
