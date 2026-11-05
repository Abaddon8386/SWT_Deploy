package com.swp391.scms.shop.controller;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.common.image.ImageDataUrlValidator;
import com.swp391.scms.shop.dto.ProductPublicDtos.*;
import com.swp391.scms.shop.dto.QuoteDtos.QuoteDto;
import com.swp391.scms.shop.dto.QuoteDtos.QuoteRequest;
import com.swp391.scms.shop.entity.ProductGoal;
import com.swp391.scms.shop.entity.ProductImage;
import com.swp391.scms.shop.service.ProductCatalogService;
import com.swp391.scms.shop.service.QuoteService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/v1/public")
public class PublicProductController {
    private final ProductCatalogService catalog;
    private final QuoteService quotes;
    private final MessageService messages;

    public PublicProductController(ProductCatalogService catalog, QuoteService quotes) {
        this(catalog, quotes, null);
    }

    @Autowired
    public PublicProductController(ProductCatalogService catalog, QuoteService quotes, MessageService messages) {
        this.catalog = catalog;
        this.quotes = quotes;
        this.messages = messages;
    }

    private String msg(String key) {
        return messages == null ? key : messages.getMessage(key);
    }

    @GetMapping("/product-categories")
    public ApiResponse<List<CategoryDto>> categories() {
        return ApiResponse.ok(msg("success.shop.categories"), catalog.categories());
    }

    @GetMapping("/products")
    public ApiResponse<Page<ProductSummaryDto>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) ProductGoal goal,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "false") boolean inStock,
            @RequestParam(defaultValue = "false") boolean featuredFirst,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size
    ) {
        return ApiResponse.ok(
                msg("success.shop.products"),
                catalog.list(q, goal, category, inStock, featuredFirst, sort, page, size)
        );
    }

    @GetMapping("/products/{slug}")
    public ApiResponse<ProductDetailDto> detail(@PathVariable String slug) {
        return ApiResponse.ok(msg("success.shop.product"), catalog.detail(slug));
    }

    @GetMapping("/products/images/{imageId}")
    public ResponseEntity<byte[]> image(@PathVariable Long imageId) {
        ProductImage img = catalog.image(imageId);
        var validated = ImageDataUrlValidator.validate(img.getDataUrl(), 2_000_000L);
        long epoch = img.getCreatedAt() == null ? 0L : img.getCreatedAt().toEpochSecond(ZoneOffset.UTC);
        String etag = "\"" + img.getId() + "-" + epoch + "\"";
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(validated.contentType()))
                .cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePublic())
                .eTag(etag)
                .body(validated.bytes());
    }

    @GetMapping("/shop/config")
    public ApiResponse<ShopConfigDto> config() {
        return ApiResponse.ok(msg("success.shop.config"), catalog.config());
    }

    @PostMapping("/shop/quote")
    public ApiResponse<QuoteDto> quote(@Valid @RequestBody QuoteRequest request) {
        return ApiResponse.ok(msg("success.shop.quote"), quotes.quote(request));
    }
}
