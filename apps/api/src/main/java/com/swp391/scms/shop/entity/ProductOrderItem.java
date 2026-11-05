package com.swp391.scms.shop.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.Check;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Entity
@Table(
    name = "product_order_items",
    indexes = @Index(name = "ix_product_order_items_order", columnList = "order_id")
)
@Check(name = "ck_product_order_items_qty", constraints = "quantity between 1 and 20")
public class ProductOrderItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private ProductOrder order;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "variant_id", nullable = false)
    private ProductVariant variant;

    @Column(name = "product_name", nullable = false, length = 160)
    private String productName;

    @Column(name = "variant_label", nullable = false, length = 80)
    private String variantLabel;

    @Column(nullable = false, length = 40)
    private String sku;

    @Column(name = "unit_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "line_total", nullable = false, precision = 12, scale = 2)
    private BigDecimal lineTotal;

    public static ProductOrderItem snapshot(ProductVariant variant, int quantity) {
        ProductOrderItem item = new ProductOrderItem();
        item.setVariant(variant);
        item.setProductName(variant.getProduct() == null ? "" : variant.getProduct().getName());
        item.setVariantLabel(variant.getLabel());
        item.setSku(variant.getSku());
        BigDecimal unit = variant.getPrice().setScale(0, RoundingMode.HALF_UP);
        item.setUnitPrice(unit);
        item.setQuantity(quantity);
        item.setLineTotal(unit.multiply(BigDecimal.valueOf(quantity)));
        return item;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public ProductOrder getOrder() { return order; }
    public void setOrder(ProductOrder order) { this.order = order; }

    public ProductVariant getVariant() { return variant; }
    public void setVariant(ProductVariant variant) { this.variant = variant; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public String getVariantLabel() { return variantLabel; }
    public void setVariantLabel(String variantLabel) { this.variantLabel = variantLabel; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public BigDecimal getUnitPrice() { return unitPrice; }
    public void setUnitPrice(BigDecimal unitPrice) { this.unitPrice = unitPrice; }

    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }

    public BigDecimal getLineTotal() { return lineTotal; }
    public void setLineTotal(BigDecimal lineTotal) { this.lineTotal = lineTotal; }
}
