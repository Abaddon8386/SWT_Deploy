package com.swp391.scms.shop.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import org.hibernate.annotations.Check;

@Entity
@Table(
    name = "product_variants",
    uniqueConstraints = @UniqueConstraint(name = "uq_product_variants_sku", columnNames = "sku"),
    indexes = @Index(name = "ix_product_variants_product", columnList = "product_id")
)
@Check(name = "ck_product_variants_stock_nonneg", constraints = "stock >= 0 and price > 0")
public class ProductVariant {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false, length = 40)
    private String sku;

    @Column(nullable = false, length = 80)
    private String label;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    @Column(name = "servings_per_container")
    private Integer servingsPerContainer;

    @Column(nullable = false)
    private int stock;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    public BigDecimal pricePerServing() {
        return servingsPerContainer == null || servingsPerContainer < 1 || price == null
                ? null
                : price.divide(BigDecimal.valueOf(servingsPerContainer), 0, RoundingMode.HALF_UP);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Product getProduct() { return product; }
    public void setProduct(Product product) { this.product = product; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }

    public Integer getServingsPerContainer() { return servingsPerContainer; }
    public void setServingsPerContainer(Integer servingsPerContainer) { this.servingsPerContainer = servingsPerContainer; }

    public int getStock() { return stock; }
    public void setStock(int stock) { this.stock = stock; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
