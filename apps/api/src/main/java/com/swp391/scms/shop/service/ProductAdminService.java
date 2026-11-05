package com.swp391.scms.shop.service;

import com.swp391.scms.audit.Audited;
import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.image.ImageDataUrlValidator;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.shop.dto.ProductAdminDtos.*;
import com.swp391.scms.shop.dto.ProductPublicDtos.ImageDto;
import com.swp391.scms.shop.dto.ProductPublicDtos.NutrientDto;
import com.swp391.scms.shop.entity.*;
import com.swp391.scms.shop.mapper.ProductMapper;
import com.swp391.scms.shop.repository.*;
import jakarta.persistence.EntityManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.regex.Pattern;

@Service
@Transactional(readOnly = true)
public class ProductAdminService {
    private static final ZoneId CENTER_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Pattern SKU_PATTERN = Pattern.compile("^[A-Z0-9-]{3,40}$");
    private static final Set<String> ADJUSTMENT_REASONS = Set.of("restock", "adjustment");
    public static final int MAX_IMAGES = 6;
    public static final long MAX_IMAGE_BYTES = 1_500_000L;

    public record OrderMetricRow(String status, BigDecimal total, LocalDateTime paidAt) {}

    public interface OrderUsageChecker {
        default boolean hasOrdersForProduct(Long productId) { return false; }
        default boolean hasOrdersForVariant(Long variantId) { return false; }
        default List<OrderMetricRow> findRecentAndActiveOrders(LocalDateTime since) { return List.of(); }
    }

    private final ProductRepository products;
    private final ProductCategoryRepository categories;
    private final ProductVariantRepository variants;
    private final ProductImageRepository images;
    private final StockMovementRepository movements;
    private final Clock clock;
    private OrderUsageChecker orderUsageChecker;

    @Autowired(required = false)
    private EntityManager entityManager;

    @Autowired(required = false)
    private ProductOrderItemRepository orderItems;

    @Autowired(required = false)
    private ProductOrderRepository orderRepository;

    public ProductAdminService(
            ProductRepository products,
            ProductCategoryRepository categories,
            ProductVariantRepository variants,
            ProductImageRepository images,
            StockMovementRepository movements
    ) {
        this(products, categories, variants, images, movements, Clock.system(CENTER_ZONE), null);
    }

    public ProductAdminService(
            ProductRepository products,
            ProductCategoryRepository categories,
            ProductVariantRepository variants,
            ProductImageRepository images,
            StockMovementRepository movements,
            Clock clock,
            OrderUsageChecker orderUsageChecker
    ) {
        this.products = products;
        this.categories = categories;
        this.variants = variants;
        this.images = images;
        this.movements = movements;
        this.clock = clock == null ? Clock.system(CENTER_ZONE) : clock;
        this.orderUsageChecker = orderUsageChecker;
    }

    @Autowired
    public ProductAdminService(
            ProductRepository products,
            ProductCategoryRepository categories,
            ProductVariantRepository variants,
            ProductImageRepository images,
            StockMovementRepository movements,
            @Autowired(required = false) Clock clock,
            @Autowired(required = false) OrderUsageChecker orderUsageChecker,
            @Autowired(required = false) EntityManager entityManager
    ) {
        this(products, categories, variants, images, movements, clock, orderUsageChecker);
        this.entityManager = entityManager;
    }

    public void setOrderUsageChecker(OrderUsageChecker orderUsageChecker) {
        this.orderUsageChecker = orderUsageChecker;
    }

    private LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant(), CENTER_ZONE);
    }

    public Page<ProductAdminSummaryDto> list(String q, Boolean active, Boolean lowStock, int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), 50);
        String normQ = (q == null || q.isBlank()) ? "" : q.trim().toLowerCase(Locale.ROOT);
        boolean lowStockOnly = Boolean.TRUE.equals(lowStock);
        Page<Product> found = products.searchAdmin(
                normQ,
                active,
                lowStockOnly,
                PageRequest.of(safePage, safeSize, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")))
        );
        return found.map(this::toAdminSummaryDto);
    }

    public ProductAdminDto get(Long id) {
        Product product = products.findById(id).orElseThrow(ProductAdminService::notFound);
        return toAdminDto(product);
    }

    @Transactional
    @Audited(action = "CREATE_PRODUCT", entity = "products")
    public ProductAdminDto create(ProductUpsertRequest request) {
        return create(null, request);
    }

    @Transactional
    @Audited(action = "CREATE_PRODUCT", entity = "products")
    public ProductAdminDto create(AuthenticatedPrincipal principal, ProductUpsertRequest request) {
        validateUpsertRequest(request);
        ProductCategory category = categories.findById(request.categoryId())
                .orElseThrow(() -> invalid("categoryId"));

        String name = request.name().trim();
        String slug = SlugService.slugify(name);
        if (slug.isBlank()) {
            throw invalid("name");
        }
        if (products.existsBySlug(slug)) {
            throw new ConflictException("PRODUCT_SLUG_TAKEN", "error.shop.product_slug_taken", null, "Product name already exists");
        }

        for (VariantUpsertRequest vReq : request.variants()) {
            if (variants.existsBySkuIgnoreCase(vReq.sku().trim())) {
                throw new ConflictException("SKU_TAKEN", "error.shop.sku_taken", null, "SKU already exists");
            }
        }

        Product product = new Product();
        applyCommonFields(product, category, name, slug, request);

        for (VariantUpsertRequest vReq : request.variants()) {
            ProductVariant v = new ProductVariant();
            v.setProduct(product);
            v.setSku(vReq.sku().trim());
            v.setLabel(vReq.label().trim());
            v.setPrice(vReq.price());
            v.setServingsPerContainer(vReq.servingsPerContainer());
            v.setStock(vReq.initialStock() == null ? 0 : vReq.initialStock());
            v.setActive(vReq.active());
            v.setSortOrder(vReq.sortOrder());
            product.getVariants().add(v);
        }

        replaceNutrients(product, request.nutrients());
        Product saved = products.save(product);

        Long actorId = principal == null ? null : principal.id();
        for (ProductVariant v : saved.getVariants()) {
            if (v.getStock() > 0) {
                StockMovement m = new StockMovement();
                m.setVariant(v);
                m.setDelta(v.getStock());
                m.setReason("restock");
                m.setNote("Initial stock");
                m.setActorId(actorId);
                movements.save(m);
            }
        }
        return toAdminDto(saved);
    }

    @Transactional
    @Audited(action = "UPDATE_PRODUCT", entity = "products")
    public ProductAdminDto update(Long id, ProductUpsertRequest request) {
        return update(null, id, request);
    }

    @Transactional
    @Audited(action = "UPDATE_PRODUCT", entity = "products")
    public ProductAdminDto update(AuthenticatedPrincipal principal, Long id, ProductUpsertRequest request) {
        validateUpsertRequest(request);
        Product product = products.findById(id).orElseThrow(ProductAdminService::notFound);
        ProductCategory category = categories.findById(request.categoryId())
                .orElseThrow(() -> invalid("categoryId"));

        String name = request.name().trim();
        String slug = SlugService.slugify(name);
        if (slug.isBlank()) {
            throw invalid("name");
        }
        if (products.existsBySlugAndIdNot(slug, id)) {
            throw new ConflictException("PRODUCT_SLUG_TAKEN", "error.shop.product_slug_taken", null, "Product name already exists");
        }

        Map<Long, ProductVariant> existingById = new HashMap<>();
        for (ProductVariant existing : product.getVariants()) {
            if (existing.getId() != null) {
                existingById.put(existing.getId(), existing);
            }
        }

        Set<Long> keptIds = new HashSet<>();
        List<ProductVariant> newlyAdded = new ArrayList<>();

        for (VariantUpsertRequest vReq : request.variants()) {
            String sku = vReq.sku().trim();
            if (vReq.id() != null) {
                ProductVariant existing = existingById.get(vReq.id());
                if (existing == null) {
                    throw invalid("variants.id");
                }
                if (variants.existsBySkuIgnoreCaseAndIdNot(sku, vReq.id())) {
                    throw new ConflictException("SKU_TAKEN", "error.shop.sku_taken", null, "SKU already exists");
                }
                keptIds.add(vReq.id());
                existing.setSku(sku);
                existing.setLabel(vReq.label().trim());
                existing.setPrice(vReq.price());
                existing.setServingsPerContainer(vReq.servingsPerContainer());
                existing.setActive(vReq.active());
                existing.setSortOrder(vReq.sortOrder());
            } else {
                if (variants.existsBySkuIgnoreCase(sku)) {
                    throw new ConflictException("SKU_TAKEN", "error.shop.sku_taken", null, "SKU already exists");
                }
                ProductVariant created = new ProductVariant();
                created.setProduct(product);
                created.setSku(sku);
                created.setLabel(vReq.label().trim());
                created.setPrice(vReq.price());
                created.setServingsPerContainer(vReq.servingsPerContainer());
                created.setStock(vReq.initialStock() == null ? 0 : vReq.initialStock());
                created.setActive(vReq.active());
                created.setSortOrder(vReq.sortOrder());
                newlyAdded.add(created);
            }
        }

        List<ProductVariant> updatedList = new ArrayList<>();
        for (ProductVariant existing : product.getVariants()) {
            if (existing.getId() != null && keptIds.contains(existing.getId())) {
                updatedList.add(existing);
            } else if (existing.getId() != null && hasOrdersForVariant(existing.getId())) {
                existing.setActive(false);
                updatedList.add(existing);
            }
        }
        updatedList.addAll(newlyAdded);
        product.getVariants().clear();
        product.getVariants().addAll(updatedList);

        applyCommonFields(product, category, name, slug, request);
        replaceNutrients(product, request.nutrients());
        Product saved = products.save(product);

        Long actorId = principal == null ? null : principal.id();
        for (ProductVariant v : newlyAdded) {
            if (v.getStock() > 0) {
                StockMovement m = new StockMovement();
                m.setVariant(v);
                m.setDelta(v.getStock());
                m.setReason("restock");
                m.setNote("Initial stock");
                m.setActorId(actorId);
                movements.save(m);
            }
        }
        return toAdminDto(saved);
    }

    @Transactional
    @Audited(action = "UPDATE_PRODUCT_STATUS", entity = "products")
    public ProductAdminDto setActive(Long id, boolean active) {
        Product product = products.findById(id).orElseThrow(ProductAdminService::notFound);
        product.setActive(active);
        return toAdminDto(products.save(product));
    }

    @Transactional
    @Audited(action = "DELETE_PRODUCT", entity = "products")
    public void delete(Long id) {
        Product product = products.findById(id).orElseThrow(ProductAdminService::notFound);
        boolean hasOrders = hasOrdersForProduct(id)
                || product.getVariants().stream()
                        .anyMatch(v -> v.getId() != null && hasOrdersForVariant(v.getId()));
        if (hasOrders) {
            throw new ConflictException("PRODUCT_HAS_ORDERS", "error.shop.product_has_orders", null, "Product has orders");
        }
        products.delete(product);
    }

    @Transactional
    @Audited(action = "ADD_PRODUCT_IMAGE", entity = "products")
    public ProductAdminDto addImage(Long productId, ImageUploadRequest request) {
        if (request == null || request.altText() == null || request.altText().trim().isEmpty() || request.altText().trim().length() > 160) {
            throw invalid("altText");
        }
        return addImage(productId, request.dataUrl(), request.altText().trim());
    }

    @Transactional
    @Audited(action = "ADD_PRODUCT_IMAGE", entity = "products")
    public ProductAdminDto addImage(Long productId, String dataUrl, String altText) {
        Product product = products.findById(productId).orElseThrow(ProductAdminService::notFound);
        if (altText == null || altText.trim().isEmpty() || altText.trim().length() > 160) {
            throw invalid("altText");
        }
        var validated = ImageDataUrlValidator.validate(dataUrl, MAX_IMAGE_BYTES);
        if (product.getImages().size() >= MAX_IMAGES) {
            throw new ConflictException("PRODUCT_IMAGE_LIMIT", "error.shop.product_image_limit", null, "Up to 6 images per product");
        }
        ProductImage img = new ProductImage();
        img.setProduct(product);
        img.setDataUrl(dataUrl.trim());
        img.setContentType(validated.contentType());
        img.setAltText(altText.trim());
        img.setSortOrder(product.getImages().size());
        product.getImages().add(img);
        return toAdminDto(products.save(product));
    }

    @Transactional
    @Audited(action = "REMOVE_PRODUCT_IMAGE", entity = "products")
    public ProductAdminDto removeImage(Long productId, Long imageId) {
        Product product = products.findById(productId).orElseThrow(ProductAdminService::notFound);
        ProductImage target = product.getImages().stream()
                .filter(i -> Objects.equals(i.getId(), imageId))
                .findFirst()
                .orElseThrow(ProductAdminService::notFound);
        product.getImages().remove(target);
        for (int i = 0; i < product.getImages().size(); i++) {
            product.getImages().get(i).setSortOrder(i);
        }
        return toAdminDto(products.save(product));
    }

    @Transactional
    @Audited(action = "REORDER_PRODUCT_IMAGES", entity = "products")
    public ProductAdminDto reorderImages(Long productId, List<Long> imageIds) {
        Product product = products.findById(productId).orElseThrow(ProductAdminService::notFound);
        if (imageIds == null || imageIds.size() != product.getImages().size()) {
            throw invalid("imageIds");
        }
        Map<Long, ProductImage> byId = new HashMap<>();
        for (ProductImage img : product.getImages()) {
            byId.put(img.getId(), img);
        }
        if (Set.copyOf(imageIds).size() != imageIds.size() || !byId.keySet().equals(Set.copyOf(imageIds))) {
            throw invalid("imageIds");
        }
        List<ProductImage> reordered = new ArrayList<>();
        for (int i = 0; i < imageIds.size(); i++) {
            ProductImage img = byId.get(imageIds.get(i));
            img.setSortOrder(i);
            reordered.add(img);
        }
        product.getImages().clear();
        product.getImages().addAll(reordered);
        return toAdminDto(products.save(product));
    }

    @Transactional
    @Audited(action = "ADJUST_PRODUCT_STOCK", entity = "product_variants")
    public VariantAdminDto adjustStock(Long variantId, StockAdjustmentRequest request) {
        return adjustStock(null, variantId, request);
    }

    @Transactional
    @Audited(action = "ADJUST_PRODUCT_STOCK", entity = "product_variants")
    public VariantAdminDto adjustStock(AuthenticatedPrincipal principal, Long variantId, StockAdjustmentRequest request) {
        if (request == null
                || request.delta() == 0
                || request.delta() < -9999
                || request.delta() > 9999
                || request.reason() == null
                || !ADJUSTMENT_REASONS.contains(request.reason().trim())
                || (request.note() != null && request.note().length() > 200)) {
            throw new BadRequestException("STOCK_ADJUSTMENT_INVALID", "error.shop.stock_adjustment_invalid", null, "Invalid stock adjustment");
        }
        ProductVariant variant = variants.findByIdForUpdate(variantId).orElseThrow(ProductAdminService::notFound);
        int nextStock = variant.getStock() + request.delta();
        if (nextStock < 0) {
            throw new BadRequestException("STOCK_ADJUSTMENT_INVALID", "error.shop.stock_adjustment_invalid", null, "Stock cannot be negative");
        }
        variant.setStock(nextStock);
        ProductVariant saved = variants.save(variant);

        StockMovement movement = new StockMovement();
        movement.setVariant(saved);
        movement.setDelta(request.delta());
        movement.setReason(request.reason().trim());
        movement.setNote(request.note() == null || request.note().isBlank() ? null : request.note().trim());
        movement.setActorId(principal == null ? null : principal.id());
        movements.save(movement);

        return toVariantAdminDto(saved);
    }

    public ManagerOrderSummaryDto summary() {
        LocalDateTime since = now().minusDays(30);
        List<OrderMetricRow> rows = fetchOrderMetricRows(since);
        long pendingFulfillment = rows.stream()
                .filter(r -> "paid".equals(r.status()) || "processing".equals(r.status()))
                .count();
        BigDecimal revenue30d = rows.stream()
                .filter(r -> !"cancelled".equals(r.status()))
                .filter(r -> r.paidAt() != null && !r.paidAt().isBefore(since))
                .map(r -> r.total() == null ? BigDecimal.ZERO : r.total())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long lowStock = variants.countLowStockActiveVariants();
        return new ManagerOrderSummaryDto(pendingFulfillment, revenue30d, lowStock);
    }

    private boolean hasOrdersForProduct(Long productId) {
        if (orderUsageChecker != null) {
            return orderUsageChecker.hasOrdersForProduct(productId);
        }
        if (orderItems != null) {
            return orderItems.existsByVariant_Product_Id(productId);
        }
        if (entityManager != null) {
            try {
                return !entityManager.createQuery("select 1 from ProductOrderItem i where i.variant.product.id = :pid")
                        .setParameter("pid", productId)
                        .setMaxResults(1)
                        .getResultList()
                        .isEmpty();
            } catch (RuntimeException ignored) {
                return false;
            }
        }
        return false;
    }

    private boolean hasOrdersForVariant(Long variantId) {
        if (orderUsageChecker != null) {
            return orderUsageChecker.hasOrdersForVariant(variantId);
        }
        if (orderItems != null) {
            return orderItems.existsByVariant_Id(variantId);
        }
        if (entityManager != null) {
            try {
                return !entityManager.createQuery("select 1 from ProductOrderItem i where i.variant.id = :vid")
                        .setParameter("vid", variantId)
                        .setMaxResults(1)
                        .getResultList()
                        .isEmpty();
            } catch (RuntimeException ignored) {
                return false;
            }
        }
        return false;
    }

    private List<OrderMetricRow> fetchOrderMetricRows(LocalDateTime since) {
        if (orderUsageChecker != null) {
            return orderUsageChecker.findRecentAndActiveOrders(since);
        }
        if (orderRepository != null) {
            return orderRepository.findRecentAndActive(since).stream()
                    .map(o -> new OrderMetricRow(o.getStatus(), o.getTotal(), o.getPaidAt()))
                    .toList();
        }
        if (entityManager != null) {
            try {
                List<Object[]> raw = entityManager.createQuery(
                                "select o.status, o.total, o.paidAt from ProductOrder o where o.status in ('paid', 'processing') or o.paidAt >= :since",
                                Object[].class)
                        .setParameter("since", since)
                        .getResultList();
                return raw.stream()
                        .map(r -> new OrderMetricRow((String) r[0], (BigDecimal) r[1], (LocalDateTime) r[2]))
                        .toList();
            } catch (RuntimeException ignored) {
                return List.of();
            }
        }
        return List.of();
    }

    private static void applyCommonFields(
            Product product,
            ProductCategory category,
            String name,
            String slug,
            ProductUpsertRequest request
    ) {
        product.setCategory(category);
        product.setName(name);
        product.setSlug(slug);
        product.setBrand(trimOrNull(request.brand()));
        product.setForm(request.form().trim());
        product.setShortDescription(request.shortDescription().trim());
        product.setDescription(trimOrNull(request.description()));
        product.setServingSize(request.servingSize().trim());
        product.setUsageInstructions(trimOrNull(request.usageInstructions()));
        product.setWarnings(trimOrNull(request.warnings()));
        product.setRegistrationNumber(trimOrNull(request.registrationNumber()));
        product.setActive(request.active());
        product.setFeatured(request.featured());
        product.setGoals(new LinkedHashSet<>(request.goals()));
    }

    private static void replaceNutrients(Product product, List<NutrientUpsertRequest> requests) {
        product.getNutrients().clear();
        if (requests == null) {
            return;
        }
        for (NutrientUpsertRequest nReq : requests) {
            ProductNutrient n = new ProductNutrient();
            n.setProduct(product);
            n.setName(nReq.name().trim());
            n.setAmount(nReq.amount());
            n.setUnit(nReq.unit().trim());
            n.setDailyValuePercent(nReq.dailyValuePercent());
            n.setSubRow(nReq.subRow());
            n.setHighlight(nReq.highlight());
            n.setSortOrder(nReq.sortOrder());
            product.getNutrients().add(n);
        }
    }

    private static void validateUpsertRequest(ProductUpsertRequest req) {
        if (req == null) {
            throw invalid("request");
        }
        if (req.name() == null || req.name().trim().length() < 2 || req.name().trim().length() > 160) {
            throw invalid("name");
        }
        if (req.categoryId() == null) {
            throw invalid("categoryId");
        }
        if (req.form() == null) {
            throw invalid("form");
        }
        try {
            ProductForm.valueOf(req.form().trim());
        } catch (IllegalArgumentException e) {
            throw invalid("form");
        }
        if (req.shortDescription() == null || req.shortDescription().trim().length() < 10 || req.shortDescription().trim().length() > 300) {
            throw invalid("shortDescription");
        }
        if (req.servingSize() == null || req.servingSize().trim().isEmpty() || req.servingSize().trim().length() > 60) {
            throw invalid("servingSize");
        }
        if (req.goals() == null || req.goals().isEmpty() || req.goals().stream().anyMatch(Objects::isNull)) {
            throw invalid("goals");
        }
        if (req.variants() == null || req.variants().isEmpty() || req.variants().size() > 12) {
            throw invalid("variants");
        }
        Set<String> seenSkus = new HashSet<>();
        for (VariantUpsertRequest v : req.variants()) {
            if (v == null || v.sku() == null || !SKU_PATTERN.matcher(v.sku().trim()).matches()) {
                throw invalid("variants.sku");
            }
            String normSku = v.sku().trim().toUpperCase(Locale.ROOT);
            if (!seenSkus.add(normSku)) {
                throw new ConflictException("SKU_TAKEN", "error.shop.sku_taken", null, "Duplicate SKU in request");
            }
            if (v.label() == null || v.label().trim().isEmpty() || v.label().trim().length() > 80) {
                throw invalid("variants.label");
            }
            if (v.price() == null
                    || v.price().compareTo(new BigDecimal("1000")) < 0
                    || v.price().compareTo(new BigDecimal("100000000")) > 0) {
                throw invalid("variants.price");
            }
            if (v.servingsPerContainer() != null && (v.servingsPerContainer() < 1 || v.servingsPerContainer() > 1000)) {
                throw invalid("variants.servingsPerContainer");
            }
            if (v.initialStock() != null && (v.initialStock() < 0 || v.initialStock() > 9999)) {
                throw invalid("variants.initialStock");
            }
        }
        if (req.nutrients() != null) {
            if (req.nutrients().size() > 30) {
                throw invalid("nutrients");
            }
            long highlights = req.nutrients().stream().filter(Objects::nonNull).filter(NutrientUpsertRequest::highlight).count();
            if (highlights > 1) {
                throw invalid("nutrients.highlight");
            }
        }
    }

    private ProductAdminSummaryDto toAdminSummaryDto(Product p) {
        List<ProductVariant> allVariants = p.getVariants() == null ? List.of() : p.getVariants();
        List<ProductVariant> activeVariants = allVariants.stream().filter(ProductVariant::isActive).toList();
        int totalStock = activeVariants.stream().mapToInt(v -> Math.max(0, v.getStock())).sum();
        boolean lowStock = activeVariants.stream().anyMatch(v -> v.getStock() <= ProductMapper.LOW_STOCK_THRESHOLD);
        BigDecimal minPrice = activeVariants.stream()
                .map(ProductVariant::getPrice)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(BigDecimal.ZERO);
        LocalDateTime now = now();
        boolean isNew = p.getCreatedAt() != null
                && !p.getCreatedAt().isBefore(now.minusDays(ProductMapper.NEW_PRODUCT_DAYS));
        return new ProductAdminSummaryDto(
                p.getId(),
                p.getName(),
                p.getSlug(),
                p.getCategory() == null ? null : p.getCategory().getName(),
                allVariants.size(),
                totalStock,
                lowStock,
                p.isActive(),
                p.isFeatured(),
                ProductMapper.firstImageUrl(p),
                minPrice,
                isNew
        );
    }

    private static ProductAdminDto toAdminDto(Product p) {
        List<ImageDto> imgs = p.getImages() == null
                ? List.of()
                : p.getImages().stream()
                        .map(i -> new ImageDto(i.getId(), ProductMapper.imageUrl(i), i.getAltText()))
                        .toList();
        List<VariantAdminDto> vars = p.getVariants() == null
                ? List.of()
                : p.getVariants().stream()
                        .map(ProductAdminService::toVariantAdminDto)
                        .toList();
        List<NutrientDto> nuts = p.getNutrients() == null
                ? List.of()
                : p.getNutrients().stream()
                        .map(n -> new NutrientDto(
                                n.getName(),
                                n.getAmount(),
                                n.getUnit(),
                                n.getDailyValuePercent(),
                                n.isSubRow(),
                                n.isHighlight()))
                        .toList();

        return new ProductAdminDto(
                p.getId(),
                p.getSlug(),
                p.getName(),
                p.getBrand(),
                p.getCategory() == null ? null : p.getCategory().getId(),
                p.getCategory() == null ? null : p.getCategory().getName(),
                p.getCategory() == null ? null : p.getCategory().getSlug(),
                p.getForm(),
                p.getGoals() == null ? List.of() : List.copyOf(p.getGoals()),
                p.getShortDescription(),
                p.getDescription(),
                p.getServingSize(),
                p.getUsageInstructions(),
                p.getWarnings(),
                p.getRegistrationNumber(),
                p.isActive(),
                p.isFeatured(),
                imgs,
                vars,
                nuts
        );
    }

    private static VariantAdminDto toVariantAdminDto(ProductVariant v) {
        return new VariantAdminDto(
                v.getId(),
                v.getSku(),
                v.getLabel(),
                v.getPrice(),
                v.getServingsPerContainer(),
                v.pricePerServing(),
                v.getStock(),
                v.isActive(),
                v.getSortOrder()
        );
    }

    private static String trimOrNull(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return s.trim();
    }

    private static BadRequestException invalid(String field) {
        return new BadRequestException("PRODUCT_INVALID", "error.shop.product_invalid", new Object[]{field}, "Invalid product field: " + field);
    }

    private static AppException notFound() {
        return new AppException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "error.shop.product_not_found", null, "Product not found");
    }
}
