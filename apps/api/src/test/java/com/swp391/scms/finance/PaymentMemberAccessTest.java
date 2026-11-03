package com.swp391.scms.finance;

import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.finance.dto.PaymentDto;
import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.mapper.PaymentMapper;
import com.swp391.scms.finance.repository.PaymentRepository;
import com.swp391.scms.finance.service.PaymentService;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.scheduling.repository.ClassEnrollmentRepository;
import com.swp391.scms.security.*;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.facilities.entity.MembershipPackage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Exercises the real filter chain, method security and payment service together. */
@WebMvcTest(PaymentController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, JsonAuthenticationEntryPoint.class,
        JsonAccessDeniedHandler.class, PaymentService.class})
class PaymentMemberAccessTest {
    @Autowired MockMvc mvc;
    @MockBean com.swp391.scms.finance.service.VnpayPaymentGuard vnpayGuard;
    @MockBean PaymentRepository payments;
    @MockBean MemberRepository members;
    @MockBean UserRepository users;
    @MockBean MembershipSubscriptionRepository subscriptions;
    @MockBean ClassEnrollmentRepository enrollments;
    @MockBean PaymentMapper mapper;
    @MockBean JwtService jwt;
    @MockBean MessageService messages;
    @MockBean Clock clock;

    private static UsernamePasswordAuthenticationToken actor(String role) {
        return new UsernamePasswordAuthenticationToken(new AuthenticatedPrincipal(2L, "review-member", role),
                null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    @BeforeEach
    void setup() {
        when(clock.instant()).thenReturn(Instant.parse("2026-10-15T10:00:00Z"));
        when(clock.getZone()).thenReturn(ZoneOffset.UTC);
    }

    @Test
    void memberReadsOnlyOwnHistory() throws Exception {
        when(members.existsById(2L)).thenReturn(true);
        when(payments.findByMemberUserId(2L)).thenReturn(List.of());
        when(mapper.toDtoList(List.of())).thenReturn(List.of());
        mvc.perform(get("/api/v1/payments/my").with(authentication(actor("MEMBER"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data").isArray());
        verify(payments).findByMemberUserId(2L);
        verifyNoMoreInteractions(payments);
    }

    @Test
    void memberCreatesOwnPendingPaymentWithoutActivatingSubscription() throws Exception {
        Member member = new Member();
        member.setUserId(2L);
        MembershipPackage membershipPackage = new MembershipPackage();
        membershipPackage.setPrice(new BigDecimal("500000"));
        MembershipSubscription subscription = new MembershipSubscription();
        subscription.setMember(member);
        subscription.setMembershipPackage(membershipPackage);
        subscription.setId(10L);
        subscription.setStatus("pending_payment");
        when(members.findById(2L)).thenReturn(Optional.of(member));
        when(members.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(subscriptions.findById(10L)).thenReturn(Optional.of(subscription));
        Payment saved = new Payment();
        when(mapper.toEntity(any())).thenReturn(saved);
        when(payments.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(mapper.toDto(any())).thenReturn(new PaymentDto());
        mvc.perform(post("/api/v1/payments").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"memberId":2,"subscriptionId":10,"amount":500000,"method":"online_wallet"}
                                """))
                .andExpect(status().isCreated());
        org.junit.jupiter.api.Assertions.assertEquals("pending", saved.getStatus());
        org.junit.jupiter.api.Assertions.assertNull(saved.getPaidAt());
        org.junit.jupiter.api.Assertions.assertEquals("pending_payment", subscription.getStatus());
        verify(subscriptions, never()).save(any());
    }

    private MembershipSubscription pendingSubscription() {
        Member member = new Member();
        member.setUserId(2L);
        MembershipPackage membershipPackage = new MembershipPackage();
        membershipPackage.setPrice(new BigDecimal("500000"));
        MembershipSubscription subscription = new MembershipSubscription();
        subscription.setMember(member);
        subscription.setMembershipPackage(membershipPackage);
        subscription.setId(10L);
        subscription.setStatus("pending_payment");
        when(members.findById(2L)).thenReturn(Optional.of(member));
        when(members.findByUserIdForUpdate(2L)).thenReturn(Optional.of(member));
        when(subscriptions.findById(10L)).thenReturn(Optional.of(subscription));
        return subscription;
    }

    @Test
    void memberCashPaymentRequiresReceiptPhoto() throws Exception {
        pendingSubscription();
        mvc.perform(post("/api/v1/payments").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"memberId":2,"subscriptionId":10,"amount":500000,"method":"cash"}
                                """))
                .andExpect(status().isBadRequest());
        verify(payments, never()).save(any());
    }

    @Test
    void memberCashPaymentRejectsNonImageReceipt() throws Exception {
        pendingSubscription();
        mvc.perform(post("/api/v1/payments").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"memberId":2,"subscriptionId":10,"amount":500000,"method":"cash",
                                 "receiptImage":"data:text/html;base64,PHNjcmlwdD4="}
                                """))
                .andExpect(status().isBadRequest());
        verify(payments, never()).save(any());
    }

    @Test
    void memberCashPaymentWithReceiptStaysPending() throws Exception {
        pendingSubscription();
        Payment saved = new Payment();
        when(mapper.toEntity(any())).thenReturn(saved);
        when(payments.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(mapper.toDto(any())).thenReturn(new PaymentDto());
        mvc.perform(post("/api/v1/payments").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"memberId":2,"subscriptionId":10,"amount":500000,"method":"cash",
                                 "receiptImage":"data:image/jpeg;base64,/9j/4AAQ"}
                                """))
                .andExpect(status().isCreated());
        org.junit.jupiter.api.Assertions.assertEquals("pending", saved.getStatus());
    }

    @Test
    void memberCannotCreatePaymentForAnotherMember() throws Exception {
        mvc.perform(post("/api/v1/payments").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"memberId":3,"subscriptionId":10,"amount":500000,"method":"online_wallet"}
                                """))
                .andExpect(status().isForbidden());
        verifyNoInteractions(payments);
    }

    @Test
    void memberCannotForgeSuccessfulPaymentOrCashier() throws Exception {
        for (String extra : List.of(
                ",\"status\":\"success\"", ",\"receivedById\":1", ",\"paidAt\":\"2026-10-15T10:00:00\"")) {
            mvc.perform(post("/api/v1/payments").with(authentication(actor("MEMBER")))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"memberId\":2,\"subscriptionId\":10,\"amount\":500000,\"method\":\"online_wallet\"" + extra + "}"))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(payments);
    }

    @Test
    void memberCannotAttachAnotherMembersSubscription() throws Exception {
        Member owner = new Member();
        owner.setUserId(3L);
        MembershipSubscription subscription = new MembershipSubscription();
        subscription.setMember(owner);
        when(subscriptions.findById(10L)).thenReturn(Optional.of(subscription));
        mvc.perform(post("/api/v1/payments").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"memberId":2,"subscriptionId":10,"amount":500000,"method":"online_wallet"}
                                """))
                .andExpect(status().isForbidden());
        verifyNoInteractions(payments);
    }

    @Test
    void memberCannotConfirmRefundChangeStatusOrReadArbitraryPayment() throws Exception {
        mvc.perform(post("/api/v1/payments/process").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"memberId":2,"subscriptionId":10,"amount":500000,"method":"online_wallet"}
                                """))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/payments/99").with(authentication(actor("MEMBER"))))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/payments/99/status").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"success\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/payments/99/refund").with(authentication(actor("MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"test\",\"amount\":500000}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(payments);
    }
}
