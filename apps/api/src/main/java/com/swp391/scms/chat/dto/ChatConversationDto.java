package com.swp391.scms.chat.dto;
import java.time.Instant;
/** {@code lastMessage} là bản xem trước (tối đa 120 ký tự) của tin mới nhất; {@code unreadCount} đếm tin của người kia chưa đọc. */
public record ChatConversationDto(Long id, ChatContactDto peer, Instant createdAt, Instant lastActivityAt,
                                  String lastMessage, boolean lastMessageMine, long unreadCount) { }
