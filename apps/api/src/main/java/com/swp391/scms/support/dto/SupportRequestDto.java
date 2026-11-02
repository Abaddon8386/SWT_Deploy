package com.swp391.scms.support.dto;

import java.time.LocalDateTime;

public record SupportRequestDto(
    Long id,
    Long memberId,
    String memberName,
    Long assignedTo,
    String assignedToName,
    String subject,
    String description,
    String status,
    LocalDateTime createdAt,
    LocalDateTime resolvedAt,
    LocalDateTime escalatedAt,
    String escalatedByName,
    String escalationReason
) {
    public SupportRequestDto(Long id, Long memberId, String memberName, Long assignedTo, String assignedToName,
                             String subject, String description, String status, LocalDateTime createdAt,
                             LocalDateTime resolvedAt) {
        this(id, memberId, memberName, assignedTo, assignedToName, subject, description, status, createdAt,
                resolvedAt, null, null, null);
    }

    /** What a member may see: that the complaint was escalated, not the receptionist's internal reason. */
    public SupportRequestDto forMember() {
        return new SupportRequestDto(id, memberId, memberName, assignedTo, assignedToName, subject, description,
                status, createdAt, resolvedAt, escalatedAt, null, null);
    }
}

