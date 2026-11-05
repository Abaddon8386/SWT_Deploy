package com.swp391.scms.shop.repository;

import com.swp391.scms.shop.entity.Product;
import com.swp391.scms.shop.entity.ProductGoal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {
    Optional<Product> findBySlugAndActiveTrue(String slug);
    Optional<Product> findBySlug(String slug);
    boolean existsBySlug(String slug);
    boolean existsBySlugAndIdNot(String slug, Long id);
    long countByCategory_Id(Long categoryId);

    @Query("""
        select p from Product p join p.category c
        where p.active = true and c.active = true
          and (:q = '' or lower(p.name) like concat('%', :q, '%') or lower(p.shortDescription) like concat('%', :q, '%'))
          and (:goal is null or :goal member of p.goals)
          and (:category = '' or c.slug = :category)
          and (:inStock = false or exists (select 1 from ProductVariant v where v.product = p and v.active = true and v.stock > 0))
        """)
    Page<Product> searchPublic(
            @Param("q") String q,
            @Param("goal") ProductGoal goal,
            @Param("category") String category,
            @Param("inStock") boolean inStock,
            Pageable pageable);

    @Query("""
        select p from Product p join fetch p.category c
        where p.active = true and c.active = true and c.id = :categoryId and p.id <> :excludeId
        order by p.featured desc, p.createdAt desc, p.id desc
        """)
    List<Product> findRelatedPublic(
            @Param("categoryId") Long categoryId,
            @Param("excludeId") Long excludeId,
            Pageable pageable);

    @Query("""
        select p from Product p join p.category c
        where (:q = '' or lower(p.name) like concat('%', :q, '%') or lower(p.slug) like concat('%', :q, '%'))
          and (:active is null or p.active = :active)
          and (:lowStock = false or exists (select 1 from ProductVariant v where v.product = p and v.active = true and v.stock < 10))
        """)
    Page<Product> searchAdmin(
            @Param("q") String q,
            @Param("active") Boolean active,
            @Param("lowStock") boolean lowStock,
            Pageable pageable);
}
