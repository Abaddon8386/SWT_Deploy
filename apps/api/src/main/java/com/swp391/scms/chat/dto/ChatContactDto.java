package com.swp391.scms.chat.dto;

public record ChatContactDto(Long id, String name, String role, boolean available, String avatarUrl) {
    public ChatContactDto(Long id, String name, String role, boolean available) {
        this(id, name, role, available, null);
    }
}
