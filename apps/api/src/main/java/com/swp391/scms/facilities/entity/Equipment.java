package com.swp391.scms.facilities.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Entity mapping table equipment (Quản lý máy móc, trang thiết bị phòng gym).
 */
@Entity
@org.hibernate.annotations.Check(name = "ck_equipment_status", constraints = "status IN ('active','maintenance','broken','retired')")
@Table(name = "equipment", indexes = {
        @Index(name = "ix_equipment_room", columnList = "room_id"),
        @Index(name = "ix_equipment_status", columnList = "status")
})
public class Equipment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(length = 60, unique = true)
    private String code;

    @Column(length = 80)
    private String category; // Cardio, Strength, Free Weights, Diagnostic, Recovery

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "room_id")
    private Room room;

    @Column(nullable = false)
    private int quantity = 1;

    @Column(nullable = false, length = 30)
    private String status = "active"; // active, maintenance, broken, retired

    @Column(name = "purchase_date")
    private LocalDate purchaseDate;

    @Column(name = "maintenance_date")
    private LocalDate maintenanceDate;

    @Column(length = 500)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Equipment() {}

    public Equipment(String name, String code, String category, Room room, int quantity, String status) {
        this.name = name;
        this.code = code;
        this.category = category;
        this.room = room;
        this.quantity = quantity;
        this.status = status != null ? status : "active";
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public Room getRoom() { return room; }
    public void setRoom(Room room) { this.room = room; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDate getPurchaseDate() { return purchaseDate; }
    public void setPurchaseDate(LocalDate purchaseDate) { this.purchaseDate = purchaseDate; }
    public LocalDate getMaintenanceDate() { return maintenanceDate; }
    public void setMaintenanceDate(LocalDate maintenanceDate) { this.maintenanceDate = maintenanceDate; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}

