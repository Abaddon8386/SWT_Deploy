package com.swp391.scms.support.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateSupportMessageDto(
    @NotBlank(message = "{validation.support.message.not_blank}")
    @Size(max = 2000, message = "{validation.support.message.size}")
    String message,
    java.util.UUID clientMessageId
) {
    public CreateSupportMessageDto(String message) { this(message, null); }
}

