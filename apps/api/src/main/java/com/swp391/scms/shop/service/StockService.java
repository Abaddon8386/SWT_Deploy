package com.swp391.scms.shop.service;

import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.shop.entity.ProductOrder;
import com.swp391.scms.shop.entity.ProductOrderItem;
import com.swp391.scms.shop.entity.ProductVariant;
import com.swp391.scms.shop.entity.StockMovement;
import com.swp391.scms.shop.repository.ProductVariantRepository;
import com.swp391.scms.shop.repository.StockMovementRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.User;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class StockService {
    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final ProductVariantRepository variants;
    private final StockMovementRepository movements;
    private final UserRepository users;
    private final Clock clock;

    public StockService(ProductVariantRepository variants, StockMovementRepository movements) {
        this(variants, movements, null, Clock.system(VN_ZONE));
    }

    public StockService(ProductVariantRepository variants, StockMovementRepository movements, Clock clock) {
        this(variants, movements, null, clock);
    }

    @Autowired
    public StockService(ProductVariantRepository variants,
                        StockMovementRepository movements,
                        @Autowired(required = false) UserRepository users,
                        Clock clock) {
        this.variants = variants;
        this.movements = movements;
        this.users = users;
        this.clock = clock != null ? clock : Clock.system(VN_ZONE);
    }

    public void reserve(ProductOrder order, Map<Long, Integer> qtyByVariant, Long actorId) {
        Map<Long, ProductVariant> byId = new HashMap<>();
        if (order != null && order.getItems() != null) {
            for (ProductOrderItem item : order.getItems()) {
                if (item.getVariant() != null && item.getVariant().getId() != null) {
                    byId.put(item.getVariant().getId(), item.getVariant());
                }
            }
        }
        if (byId.size() < qtyByVariant.size()) {
            for (ProductVariant v : variants.findAllByIdInForUpdate(qtyByVariant.keySet())) {
                byId.put(v.getId(), v);
            }
        }
        User actor = resolveActor(actorId);
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), VN_ZONE);
        for (Map.Entry<Long, Integer> entry : qtyByVariant.entrySet()) {
            ProductVariant variant = byId.get(entry.getKey());
            int q = entry.getValue();
            if (variant == null || !variant.isActive() || variant.getStock() < q) {
                throw new ConflictException("PRODUCT_OUT_OF_STOCK", "error.shop.product_out_of_stock", null, "Out of stock");
            }
            variant.setStock(variant.getStock() - q);
            StockMovement movement = new StockMovement();
            movement.setVariant(variant);
            movement.setDelta(-q);
            movement.setReason("order_reserve");
            movement.setOrderId(order != null ? order.getId() : null);
            movement.setActor(actor);
            movement.setCreatedAt(now);
            movements.save(movement);
        }
    }

    public void release(ProductOrder order, Long actorId) {
        if (order == null || order.getItems() == null || order.getItems().isEmpty()) {
            return;
        }
        List<Long> ids = order.getItems().stream()
                .filter(i -> i.getVariant() != null && i.getVariant().getId() != null)
                .map(i -> i.getVariant().getId())
                .distinct()
                .sorted()
                .toList();
        Map<Long, ProductVariant> byId = new HashMap<>();
        if (!ids.isEmpty()) {
            List<ProductVariant> locked = variants.findAllByIdInForUpdate(ids);
            if (locked != null) {
                for (ProductVariant v : locked) {
                    byId.put(v.getId(), v);
                }
            }
        }
        User actor = resolveActor(actorId);
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), VN_ZONE);
        for (ProductOrderItem item : order.getItems()) {
            ProductVariant variant = item.getVariant() != null
                    ? byId.getOrDefault(item.getVariant().getId(), item.getVariant())
                    : null;
            if (variant != null) {
                variant.setStock(variant.getStock() + item.getQuantity());
                StockMovement movement = new StockMovement();
                movement.setVariant(variant);
                movement.setDelta(item.getQuantity());
                movement.setReason("order_release");
                movement.setOrderId(order.getId());
                movement.setActor(actor);
                movement.setCreatedAt(now);
                movements.save(movement);
            }
        }
    }

    private User resolveActor(Long actorId) {
        if (actorId == null || users == null) {
            return null;
        }
        return users.findById(actorId).orElse(null);
    }
}
