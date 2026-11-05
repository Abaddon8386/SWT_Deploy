package com.swp391.scms.shop.entity;

import com.swp391.scms.users.entity.Member;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(
    name = "member_addresses",
    indexes = @Index(name = "ix_member_addresses_member", columnList = "member_id")
)
public class MemberAddress {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "recipient_name", nullable = false, length = 80)
    private String recipientName;

    @Column(nullable = false, length = 15)
    private String phone;

    @Column(name = "province_code", nullable = false, length = 10)
    private String provinceCode;

    @Column(name = "province_name", nullable = false, length = 80)
    private String provinceName;

    @Column(name = "ward_code", nullable = false, length = 10)
    private String wardCode;

    @Column(name = "ward_name", nullable = false, length = 80)
    private String wardName;

    @Column(name = "street_line", nullable = false, length = 200)
    private String streetLine;

    @Column(length = 200)
    private String note;

    @Column(name = "is_default", nullable = false)
    private boolean isDefault;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Member getMember() { return member; }
    public void setMember(Member member) { this.member = member; }

    public String getRecipientName() { return recipientName; }
    public void setRecipientName(String recipientName) { this.recipientName = recipientName; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getProvinceCode() { return provinceCode; }
    public void setProvinceCode(String provinceCode) { this.provinceCode = provinceCode; }

    public String getProvinceName() { return provinceName; }
    public void setProvinceName(String provinceName) { this.provinceName = provinceName; }

    public String getWardCode() { return wardCode; }
    public void setWardCode(String wardCode) { this.wardCode = wardCode; }

    public String getWardName() { return wardName; }
    public void setWardName(String wardName) { this.wardName = wardName; }

    public String getStreetLine() { return streetLine; }
    public void setStreetLine(String streetLine) { this.streetLine = streetLine; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public boolean isDefault() { return isDefault; }
    public boolean getIsDefault() { return isDefault; }
    public void setDefault(boolean aDefault) { this.isDefault = aDefault; }
    public void setIsDefault(boolean aDefault) { this.isDefault = aDefault; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
