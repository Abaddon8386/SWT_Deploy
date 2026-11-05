package com.swp391.scms.shop.service;

import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.shop.ShopProperties;
import com.swp391.scms.shop.dto.ProductPublicDtos.*;
import com.swp391.scms.shop.entity.Product;
import com.swp391.scms.shop.entity.ProductGoal;
import com.swp391.scms.shop.entity.ProductImage;
import com.swp391.scms.shop.mapper.ProductMapper;
import com.swp391.scms.shop.repository.ProductCategoryRepository;
import com.swp391.scms.shop.repository.ProductImageRepository;
import com.swp391.scms.shop.repository.ProductRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class ProductCatalogService {
    private static final ZoneId CENTER_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Set<String> ALLOWED_SORTS = Set.of("newest", "price_asc", "price_desc", "price_per_serving");
    private static final int MAX_PAGE_SIZE = 48;
    private static final int MAX_IN_MEMORY_SORT_PRODUCTS = 500;

    private final ProductRepository products;
    private final ProductCategoryRepository categories;
    private final ProductImageRepository images;
    private final ShopProperties props;
    private final Clock clock;

    public ProductCatalogService(
            ProductRepository products,
            ProductCategoryRepository categories,
            ProductImageRepository images,
            ShopProperties props
    ) {
        this(products, categories, images, props, Clock.system(CENTER_ZONE));
    }

    @Autowired
    public ProductCatalogService(
            ProductRepository products,
            ProductCategoryRepository categories,
            ProductImageRepository images,
            ShopProperties props,
            Clock clock
    ) {
        this.products = products;
        this.categories = categories;
        this.images = images;
        this.props = props;
        this.clock = clock == null ? Clock.system(CENTER_ZONE) : clock;
    }

    private LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant(), CENTER_ZONE);
    }

    public List<CategoryDto> categories() {
        return categories.findAllByActiveTrueOrderBySortOrderAscIdAsc().stream()
                .map(c -> new CategoryDto(c.getId(), c.getName(), c.getSlug()))
                .toList();
    }

    public ShopConfigDto config() {
        return new ShopConfigDto(
                props.getShippingFee(),
                props.getFreeShippingThreshold(),
                props.getPaymentWindowMinutes(),
                props.getCounterHoldHours(),
                props.getPickupAddress()
        );
    }

    public Page<ProductSummaryDto> list(
            String q,
            ProductGoal goal,
            String categorySlug,
            boolean inStock,
            boolean featuredFirst,
            String sort,
            int page,
            int size
    ) {
        String resolvedSort = (sort == null || sort.isBlank()) ? "newest" : sort.trim();
        if (!ALLOWED_SORTS.contains(resolvedSort)) {
            throw new BadRequestException("PRODUCT_INVALID", "error.shop.product_invalid", new Object[]{"sort"}, "Invalid sort");
        }
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), MAX_PAGE_SIZE);
        String normQ = (q == null || q.isBlank()) ? "" : q.trim().toLowerCase(java.util.Locale.ROOT);
        String normCat = (categorySlug == null || categorySlug.isBlank()) ? "" : categorySlug.trim();
        LocalDateTime current = now();

        if ("newest".equals(resolvedSort)) {
            Sort sortSpec = featuredFirst
                    ? Sort.by(Sort.Order.desc("featured"), Sort.Order.desc("createdAt"), Sort.Order.desc("id"))
                    : Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
            Page<Product> found = products.searchPublic(normQ, goal, normCat, inStock, PageRequest.of(safePage, safeSize, sortSpec));
            return found.map(p -> ProductMapper.toSummary(p, current));
        }

        // Price and price-per-serving are derived from active variants; sort filtered active products in memory (capped at 500).
        Page<Product> allMatching = products.searchPublic(
                normQ, goal, normCat, inStock, PageRequest.of(0, MAX_IN_MEMORY_SORT_PRODUCTS, Sort.unsorted()));
        List<ProductSummaryDto> summaries = new ArrayList<>(
                allMatching.getContent().stream().map(p -> ProductMapper.toSummary(p, current)).toList());

        Comparator<ProductSummaryDto> comparator = switch (resolvedSort) {
            case "price_asc" -> Comparator.comparing(ProductSummaryDto::minPrice, Comparator.nullsLast(BigDecimal::compareTo));
            case "price_desc" -> Comparator.comparing(ProductSummaryDto::minPrice, Comparator.nullsLast(Comparator.reverseOrder()));
            case "price_per_serving" -> Comparator.comparing(ProductSummaryDto::pricePerServing, Comparator.nullsLast(BigDecimal::compareTo));
            default -> Comparator.comparing(ProductSummaryDto::id, Comparator.nullsLast(Comparator.reverseOrder()));
        };
        if (featuredFirst) {
            comparator = Comparator.comparing(ProductSummaryDto::featured).reversed().thenComparing(comparator);
        }
        comparator = comparator.thenComparing(ProductSummaryDto::id, Comparator.nullsLast(Comparator.reverseOrder()));
        summaries.sort(comparator);

        int fromIndex = Math.min(safePage * safeSize, summaries.size());
        int toIndex = Math.min(fromIndex + safeSize, summaries.size());
        return new PageImpl<>(summaries.subList(fromIndex, toIndex), PageRequest.of(safePage, safeSize), summaries.size());
    }

    public ProductDetailDto detail(String slug) {
        if (slug == null || slug.isBlank()) {
            throw notFound();
        }
        Product product = products.findBySlugAndActiveTrue(slug.trim())
                .filter(p -> p.getCategory() == null || p.getCategory().isActive())
                .orElseThrow(ProductCatalogService::notFound);

        LocalDateTime current = now();
        List<ProductSummaryDto> related = List.of();
        if (product.getCategory() != null && product.getCategory().getId() != null && product.getId() != null) {
            List<Product> relatedEntities = products.findRelatedPublic(
                    product.getCategory().getId(), product.getId(), PageRequest.of(0, 4));
            if (relatedEntities != null) {
                related = relatedEntities.stream().map(p -> ProductMapper.toSummary(p, current)).toList();
            }
        }
        return ProductMapper.toDetail(product, related);
    }

    public ProductImage image(Long imageId) {
        if (imageId == null) {
            throw notFound();
        }
        ProductImage img = images.findByIdWithProduct(imageId)
                .orElseGet(() -> images.findById(imageId).orElseThrow(ProductCatalogService::notFound));
        if (img.getProduct() == null || !img.getProduct().isActive()) {
            throw notFound();
        }
        return img;
    }

    private static AppException notFound() {
        return new AppException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "error.shop.product_not_found", null, "Product not found");
    }
}
