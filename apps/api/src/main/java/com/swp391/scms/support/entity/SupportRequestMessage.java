package com.swp391.scms.support.entity;

import com.swp391.scms.users.entity.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.Length;

/** Entity mapping table support_request_messages (schema is generated code-first by Hibernate). */
@Entity
@Table(name = "support_request_messages", uniqueConstraints = @UniqueConstraint(name = "uq_support_message_client", columnNames = {"support_request_id", "sender_user_id", "client_message_id"}))
public class SupportRequestMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @OnDelete(action = OnDeleteAction.CASCADE)
    @JoinColumn(name = "support_request_id", nullable = false)
    private SupportRequest supportRequest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_user_id", nullable = false)
    private User sender;

    @Column(name = "message", nullable = false, length = Length.LONG32)
    private String message;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "client_message_id")
    private java.util.UUID clientMessageId;
    public java.util.UUID getClientMessageId() { return clientMessageId; }
    public void setClientMessageId(java.util.UUID clientMessageId) { this.clientMessageId = clientMessageId; }

    public SupportRequestMessage() {}

    public SupportRequestMessage(SupportRequest supportRequest, User sender, String message) {
        this.supportRequest = supportRequest;
        this.sender = sender;
        this.message = message;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public SupportRequest getSupportRequest() { return supportRequest; }
    public void setSupportRequest(SupportRequest supportRequest) { this.supportRequest = supportRequest; }
    public User getSender() { return sender; }
    public void setSender(User sender) { this.sender = sender; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
