package com.swp391.scms.shop.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(
    name = "product_nutrients",
    indexes = @Index(name = "ix_product_nutrients_product", columnList = "product_id")
)
public class ProductNutrient {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 12)
    private String unit;

    @Column(name = "daily_value_percent")
    private Integer dailyValuePercent;

    @Column(name = "sub_row", nullable = false)
    private boolean subRow;

    @Column(nullable = false)
    private boolean highlight;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Product getProduct() { return product; }
    public void setProduct(Product product) { this.product = product; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }

    public Integer getDailyValuePercent() { return dailyValuePercent; }
    public void setDailyValuePercent(Integer dailyValuePercent) { this.dailyValuePercent = dailyValuePercent; }

    public boolean isSubRow() { return subRow; }
    public void setSubRow(boolean subRow) { this.subRow = subRow; }

    public boolean isHighlight() { return highlight; }
    public void setHighlight(boolean highlight) { this.highlight = highlight; }

    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
