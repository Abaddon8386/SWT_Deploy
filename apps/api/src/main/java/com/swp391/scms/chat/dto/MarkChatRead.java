package com.swp391.scms.chat.dto;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
public record MarkChatRead(@NotNull @Positive Long lastMessageId) { }
