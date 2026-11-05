package com.swp391.scms.shop.repository;

import com.swp391.scms.shop.entity.ProductCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductCategoryRepository extends JpaRepository<ProductCategory, Long> {
    List<ProductCategory> findAllByActiveTrueOrderBySortOrderAscIdAsc();
    List<ProductCategory> findAllByOrderBySortOrderAscIdAsc();
    Optional<ProductCategory> findBySlug(String slug);
    boolean existsBySlug(String slug);
    boolean existsByNameIgnoreCase(String name);
    boolean existsBySlugAndIdNot(String slug, Long id);
    boolean existsByNameIgnoreCaseAndIdNot(String name, Long id);
}
