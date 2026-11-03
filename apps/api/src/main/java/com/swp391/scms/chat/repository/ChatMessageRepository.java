package com.swp391.scms.chat.repository;

import com.swp391.scms.chat.entity.ChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    Optional<ChatMessage> findByConversationIdAndSenderIdAndClientMessageId(Long conversationId, Long senderId, UUID clientMessageId);

    @Query("select m from ChatMessage m where m.conversation.id = :id and (:before is null or m.id < :before) order by m.id desc")
    List<ChatMessage> older(@Param("id") Long id, @Param("before") Long before, Pageable page);

    @Query("select m from ChatMessage m where m.conversation.id = :id and m.id > :after order by m.id asc")
    List<ChatMessage> newer(@Param("id") Long id, @Param("after") Long after, Pageable page);

    @Query("select max(m.id) from ChatMessage m where m.conversation.id = :id")
    Optional<Long> latestId(@Param("id") Long id);

    /** Tin mới nhất của từng hội thoại trong trang đang xem. */
    @Query("select m from ChatMessage m join fetch m.sender where m.id in (select max(x.id) from ChatMessage x where x.conversation.id in :ids group by x.conversation.id)")
    List<ChatMessage> latestIn(@Param("ids") Collection<Long> ids);

    String UNREAD = " from ChatMessage m join m.conversation c where m.sender.id <> :userId"
            + " and m.id > coalesce(case when c.member.id = :userId then c.memberLastReadMessageId else c.staffLastReadMessageId end, 0)";

    /** Mỗi dòng: [conversationId, số tin chưa đọc]. */
    @Query("select c.id, count(m)" + UNREAD + " and c.id in :ids group by c.id")
    List<Object[]> unreadIn(@Param("userId") Long userId, @Param("ids") Collection<Long> ids);

    @Query("select count(m)" + UNREAD + " and (c.member.id = :userId or c.staff.id = :userId)")
    long unreadTotal(@Param("userId") Long userId);
}
