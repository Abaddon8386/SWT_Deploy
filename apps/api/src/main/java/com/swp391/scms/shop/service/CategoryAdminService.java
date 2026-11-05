package com.swp391.scms.shop.service;

import com.swp391.scms.audit.Audited;
import com.swp391.scms.common.exception.AppException;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.shop.dto.ProductAdminDtos.CategoryAdminDto;
import com.swp391.scms.shop.dto.ProductAdminDtos.CategoryUpsertRequest;
import com.swp391.scms.shop.entity.ProductCategory;
import com.swp391.scms.shop.repository.ProductCategoryRepository;
import com.swp391.scms.shop.repository.ProductRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class CategoryAdminService {
    private final ProductCategoryRepository categories;
    private final ProductRepository products;

    public CategoryAdminService(ProductCategoryRepository categories, ProductRepository products) {
        this.categories = categories;
        this.products = products;
    }

    public List<CategoryAdminDto> list() {
        return categories.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(c -> toDto(c, products.countByCategory_Id(c.getId())))
                .toList();
    }

    @Transactional
    @Audited(action = "CREATE_PRODUCT_CATEGORY", entity = "product_categories")
    public CategoryAdminDto create(CategoryUpsertRequest request) {
        validate(request);
        String name = request.name().trim();
        String slug = SlugService.slugify(name);
        if (slug.isBlank()) {
            throw new BadRequestException("PRODUCT_INVALID", "error.shop.product_invalid", new Object[]{"name"}, "Invalid category name");
        }
        if (categories.existsBySlug(slug) || categories.existsByNameIgnoreCase(name)) {
            throw new ConflictException("PRODUCT_SLUG_TAKEN", "error.shop.product_slug_taken", null, "Category name already exists");
        }
        ProductCategory category = new ProductCategory();
        category.setName(name);
        category.setSlug(slug);
        category.setSortOrder(request.sortOrder());
        category.setActive(request.active());
        ProductCategory saved = categories.save(category);
        return toDto(saved, 0L);
    }

    @Transactional
    @Audited(action = "UPDATE_PRODUCT_CATEGORY", entity = "product_categories")
    public CategoryAdminDto update(Long id, CategoryUpsertRequest request) {
        validate(request);
        ProductCategory category = categories.findById(id)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "error.shop.product_not_found", null, "Category not found"));
        String name = request.name().trim();
        String slug = SlugService.slugify(name);
        if (slug.isBlank()) {
            throw new BadRequestException("PRODUCT_INVALID", "error.shop.product_invalid", new Object[]{"name"}, "Invalid category name");
        }
        if (categories.existsBySlugAndIdNot(slug, id) || categories.existsByNameIgnoreCaseAndIdNot(name, id)) {
            throw new ConflictException("PRODUCT_SLUG_TAKEN", "error.shop.product_slug_taken", null, "Category name already exists");
        }
        category.setName(name);
        category.setSlug(slug);
        category.setSortOrder(request.sortOrder());
        category.setActive(request.active());
        ProductCategory saved = categories.save(category);
        return toDto(saved, products.countByCategory_Id(saved.getId()));
    }

    @Transactional
    @Audited(action = "DELETE_PRODUCT_CATEGORY", entity = "product_categories")
    public void delete(Long id) {
        ProductCategory category = categories.findById(id)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "error.shop.product_not_found", null, "Category not found"));
        if (products.countByCategory_Id(id) > 0) {
            throw new ConflictException("CATEGORY_IN_USE", "error.shop.category_in_use", null, "Category still has products");
        }
        categories.delete(category);
    }

    private static void validate(CategoryUpsertRequest request) {
        if (request == null || request.name() == null || request.name().trim().length() < 2 || request.name().trim().length() > 80) {
            throw new BadRequestException("PRODUCT_INVALID", "error.shop.product_invalid", new Object[]{"name"}, "Invalid category name");
        }
    }

    private static CategoryAdminDto toDto(ProductCategory c, long count) {
        return new CategoryAdminDto(c.getId(), c.getName(), c.getSlug(), c.getSortOrder(), c.isActive(), count);
    }
}
