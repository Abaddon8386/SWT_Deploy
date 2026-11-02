package com.swp391.scms.support;

import com.swp391.scms.support.entity.SupportRequestMessage;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SupportRequestMessageRepository extends JpaRepository<SupportRequestMessage, Long> {

    java.util.Optional<SupportRequestMessage> findBySupportRequestIdAndSenderIdAndClientMessageId(Long requestId, Long senderId, java.util.UUID clientMessageId);

    @EntityGraph(attributePaths = {"sender", "sender.role"})
    List<SupportRequestMessage> findBySupportRequestIdOrderByCreatedAtAsc(Long supportRequestId);
}

