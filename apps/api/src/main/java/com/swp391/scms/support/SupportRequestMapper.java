package com.swp391.scms.support;

import com.swp391.scms.support.dto.SupportRequestDto;
import com.swp391.scms.support.dto.SupportRequestMessageDto;
import com.swp391.scms.support.entity.SupportRequest;
import com.swp391.scms.support.entity.SupportRequestMessage;
import org.springframework.stereotype.Component;

@Component
public class SupportRequestMapper {

    public SupportRequestDto toDto(SupportRequest entity) {
        if (entity == null) return null;

        return new SupportRequestDto(
            entity.getId(),
            entity.getMember() != null ? entity.getMember().getUserId() : null,
            (entity.getMember() != null && entity.getMember().getUser() != null) ? entity.getMember().getUser().getFullName() : null,
            entity.getAssignedTo() != null ? entity.getAssignedTo().getId() : null,
            entity.getAssignedTo() != null ? entity.getAssignedTo().getFullName() : null,
            entity.getSubject(),
            entity.getDescription(),
            entity.getStatus(),
            entity.getCreatedAt(),
            entity.getResolvedAt(),
            entity.getEscalatedAt(),
            entity.getEscalatedBy() != null ? entity.getEscalatedBy().getFullName() : null,
            entity.getEscalationReason()
        );
    }

    public SupportRequestMessageDto toMessageDto(SupportRequestMessage entity) {
        if (entity == null) return null;

        String senderRole = null;
        if (entity.getSender() != null && entity.getSender().getRole() != null) {
            senderRole = entity.getSender().getRole().getCode();
        }

        return new SupportRequestMessageDto(
            entity.getId(),
            entity.getSupportRequest() != null ? entity.getSupportRequest().getId() : null,
            entity.getSender() != null ? entity.getSender().getId() : null,
            entity.getSender() != null ? entity.getSender().getFullName() : null,
            senderRole,
            entity.getMessage(),
            entity.getCreatedAt()
        );
    }
}
