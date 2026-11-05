package com.swp391.scms.finance;

import com.swp391.scms.finance.service.*;
import com.swp391.scms.finance.entity.*;
import com.swp391.scms.finance.repository.*;
import com.swp391.scms.membership.entity.MembershipSubscription;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.common.exception.ForbiddenException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class VnpayPaymentServiceTest {
    final VnpayTransactionRepository transactions = mock(VnpayTransactionRepository.class);
    final PaymentRepository payments = mock(PaymentRepository.class);
    final MemberRepository members = mock(MemberRepository.class);
    final MembershipSubscriptionRepository subscriptions = mock(MembershipSubscriptionRepository.class);
    final PaymentService settlement = mock(PaymentService.class);
    final InvoiceService invoices = mock(InvoiceService.class);
    final VnpayGateway gateway = new VnpayGateway(new VnpayProperties(true, "TEST1234", "test-secret",
            "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html", "https://example.test/member/payments/vnpay/return", 15));
    final com.swp391.scms.notifications.NotificationService notifications = mock(com.swp391.scms.notifications.NotificationService.class);
    final Clock clock = Clock.fixed(Instant.parse("2026-11-03T05:00:00Z"), ZoneOffset.UTC);
    final VnpayPaymentService service = new VnpayPaymentService(transactions, payments, members, subscriptions, settlement, invoices, gateway, clock, mock(jakarta.persistence.EntityManager.class), mock(com.swp391.scms.coaching.repository.CoachBookingRepository.class), mock(com.swp391.scms.courts.repository.CourtBookingRepository.class),notifications,mock(com.swp391.scms.common.i18n.MessageService.class));
    final AuthenticatedPrincipal owner = new AuthenticatedPrincipal(7L, "member", "MEMBER");
    Payment payment;
    VnpayTransaction transaction;

    @BeforeEach void setup() {
        Member member = new Member(); member.setUserId(7L);
        payment = new Payment(); payment.setId(9L); payment.setMember(member); payment.setSubscriptionId(11L);
        payment.setAmount(new BigDecimal("650000")); payment.setStatus("pending"); payment.setMethod("online_wallet");
        transaction = new VnpayTransaction("ABC123", payment, payment.getAmount(), LocalDateTime.of(2026,11,3,12,0), LocalDateTime.of(2026,11,3,12,15), "127.0.0.1");
        when(transactions.findById("ABC123")).thenReturn(Optional.of(transaction));
        when(members.findByUserIdForUpdate(7L)).thenReturn(Optional.of(member));
    }
    Map<String,String> callback(String response, String status, String amount) {
        var data = new HashMap<>(Map.of("vnp_TmnCode","TEST1234", "vnp_TxnRef","ABC123", "vnp_Amount",amount,
                "vnp_ResponseCode", response, "vnp_TransactionStatus", status, "vnp_TransactionNo","12345", "vnp_PayDate","20261103120100"));
        data.put("vnp_SecureHash",gateway.sign(data)); return data;
    }
    @Test void verifiedSuccessSettlesOnceAndIssuesInvoice() {
        var fields = callback("00","00","65000000");
        assertEquals("00",service.ipn(fields));
        verify(settlement).updatePaymentStatus(9L,"success"); verify(invoices).autoIssueInvoiceForPayment(9L);
        assertEquals("success",transaction.getStatus());
        assertEquals("02",service.ipn(fields));
        verify(settlement,times(1)).updatePaymentStatus(9L,"success");
        verify(notifications, times(1)).send(eq(7L), any(), any(), eq("payment"), eq("payment"), eq(9L));
    }
    @Test void invalidSignatureNeverLooksUpOrSettlesAnOrder() {
        var fields=callback("00","00","65000000"); fields.put("vnp_Amount","1");
        assertEquals("97",service.ipn(fields)); verifyNoInteractions(settlement,invoices,notifications); verify(transactions,never()).findById(any());
    }
    @Test void signedAmountMismatchIsRejected() {
        assertEquals("04",service.ipn(callback("00","00","1"))); verifyNoInteractions(settlement,invoices);
        assertEquals("pending",transaction.getStatus());
    }
    @Test void bothGatewayCodesMustIndicateSuccessAndFailureDoesNotCancelSubscription() {
        assertEquals("00",service.ipn(callback("00","02","65000000")));
        assertEquals("failed",transaction.getStatus()); assertEquals("pending",payment.getStatus());
        verifyNoInteractions(settlement,invoices);
    }
    @Test void otherMemberCannotReadOrPayForTransaction() {
        assertThrows(ForbiddenException.class,()->service.status(new AuthenticatedPrincipal(8L,"other","MEMBER"),"ABC123"));
        var sub=new MembershipSubscription(); sub.setId(11L);sub.setMember(payment.getMember());sub.setStatus("pending_payment");
        when(subscriptions.findById(11L)).thenReturn(Optional.of(sub));
        assertThrows(ForbiddenException.class,()->service.checkout(new AuthenticatedPrincipal(8L,"other","MEMBER"),11L,"127.0.0.1"));
        verify(payments,never()).save(any());
    }
    @Test void duplicateSuccessfulCallbackCannotDowngradeOrReissue() {
        transaction.setStatus("success");payment.setStatus("success");
        assertEquals("02",service.ipn(callback("24","02","65000000")));
        verifyNoInteractions(settlement,invoices); assertEquals("success",transaction.getStatus());
    }
    @Test void liveGatewayCannotBeEnabled() {
        var live=new VnpayGateway(new VnpayProperties(true,"TEST1234","secret","https://pay.vnpay.vn/vpcpay.html","https://example.test/return",15));
        assertFalse(live.enabled());
    }
    @Test void confirmedPtPaymentUpdatesBookingAndInvoice() {
        var repo=mock(com.swp391.scms.coaching.repository.CoachBookingRepository.class);
        var booking=new com.swp391.scms.coaching.entity.CoachBooking();
        booking.setId(81L);booking.setMember(payment.getMember());booking.setStatus("confirmed");booking.setPaymentStatus("pending");
        payment.setSubscriptionId(null);payment.setCoachBookingId(81L);
        when(repo.findByIdForUpdate(81L)).thenReturn(Optional.of(booking));when(repo.findById(81L)).thenReturn(Optional.of(booking));
        var svc=new VnpayPaymentService(transactions,payments,members,subscriptions,settlement,invoices,gateway,clock,mock(jakarta.persistence.EntityManager.class),repo,mock(com.swp391.scms.courts.repository.CourtBookingRepository.class),mock(com.swp391.scms.notifications.NotificationService.class),mock(com.swp391.scms.common.i18n.MessageService.class));
        assertEquals("00",svc.ipn(callback("00","00","65000000")));
        assertEquals("paid",booking.getPaymentStatus());verify(invoices).autoIssueInvoiceForPayment(9L);
    }
    @Test void cancelledCourtCannotBeMarkedPaidEvenWithAValidSignature() {
        var repo=mock(com.swp391.scms.courts.repository.CourtBookingRepository.class);
        var booking=new com.swp391.scms.courts.entity.CourtBooking();booking.setId(82L);booking.setStatus("cancelled");booking.setPaymentStatus("pending");
        payment.setSubscriptionId(null);payment.setCourtBookingId(82L);
        when(repo.findByIdForUpdate(82L)).thenReturn(Optional.of(booking));when(repo.findById(82L)).thenReturn(Optional.of(booking));
        var svc=new VnpayPaymentService(transactions,payments,members,subscriptions,settlement,invoices,gateway,clock,mock(jakarta.persistence.EntityManager.class),mock(com.swp391.scms.coaching.repository.CoachBookingRepository.class),repo,mock(com.swp391.scms.notifications.NotificationService.class),mock(com.swp391.scms.common.i18n.MessageService.class));
        assertThrows(com.swp391.scms.common.exception.ConflictException.class,()->svc.ipn(callback("00","00","65000000")));
        assertEquals("pending",transaction.getStatus());verifyNoInteractions(settlement,invoices);
    }
    @Test void confirmedCourtPaymentUpdatesBookingAndInvoice() {
        var repo=mock(com.swp391.scms.courts.repository.CourtBookingRepository.class);
        var booking=new com.swp391.scms.courts.entity.CourtBooking();booking.setId(82L);booking.setStatus("booked");booking.setPaymentStatus("pending");
        payment.setSubscriptionId(null);payment.setCourtBookingId(82L);
        when(repo.findByIdForUpdate(82L)).thenReturn(Optional.of(booking));when(repo.findById(82L)).thenReturn(Optional.of(booking));
        var svc=new VnpayPaymentService(transactions,payments,members,subscriptions,settlement,invoices,gateway,clock,mock(jakarta.persistence.EntityManager.class),mock(com.swp391.scms.coaching.repository.CoachBookingRepository.class),repo,mock(com.swp391.scms.notifications.NotificationService.class),mock(com.swp391.scms.common.i18n.MessageService.class));
        assertEquals("00",svc.ipn(callback("00","00","65000000")));assertEquals("paid",booking.getPaymentStatus());verify(settlement).updatePaymentStatus(9L,"success");
    }
    @Test void reusesPendingCheckoutWaitsOutIpnGraceThenStartsAFreshAttempt() {
        var sub=new MembershipSubscription();sub.setId(11L);sub.setMember(payment.getMember());sub.setStatus("pending_payment");
        when(subscriptions.findById(11L)).thenReturn(Optional.of(sub));
        when(payments.findAllBySubscriptionId(11L)).thenReturn(List.of(payment));when(payments.save(payment)).thenReturn(payment);
        when(transactions.findFirstByPaymentIdAndStatusOrderByCreatedAtDesc(9L,"pending")).thenReturn(Optional.of(transaction));
        assertEquals("ABC123",service.checkout(owner,11L,"127.0.0.1").reference());verify(transactions,never()).save(any());
        // Expired 10 minutes ago: a delayed IPN may still arrive, so the order stays blocked.
        var recent=new VnpayTransaction("RECENT",payment,payment.getAmount(),LocalDateTime.of(2026,11,3,11,35),LocalDateTime.of(2026,11,3,11,50),"127.0.0.1");
        when(transactions.findFirstByPaymentIdAndStatusOrderByCreatedAtDesc(9L,"pending")).thenReturn(Optional.of(recent));
        assertThrows(com.swp391.scms.common.exception.ConflictException.class,()->service.checkout(owner,11L,"127.0.0.1"));verify(transactions,never()).save(any());
        assertEquals("pending",recent.getStatus());
        // Abandoned a day ago: closed as failed and the member can pay again.
        var abandoned=new VnpayTransaction("OLD",payment,payment.getAmount(),LocalDateTime.of(2026,11,2,12,0),LocalDateTime.of(2026,11,2,12,15),"127.0.0.1");
        when(transactions.findFirstByPaymentIdAndStatusOrderByCreatedAtDesc(9L,"pending")).thenReturn(Optional.of(abandoned));
        var fresh=service.checkout(owner,11L,"127.0.0.1");
        assertEquals("failed",abandoned.getStatus());assertNotEquals("OLD",fresh.reference());
        verify(transactions).save(abandoned);verify(transactions).save(argThat(t->t!=abandoned && "pending".equals(t.getStatus())));
    }
    @Test void delayedSuccessForAnAttemptClosedAfterExpiryStillSettlesAnUnpaidOrder() {
        var closed=new VnpayTransaction("ABC123",payment,payment.getAmount(),LocalDateTime.of(2026,11,3,11,0),LocalDateTime.of(2026,11,3,11,15),"127.0.0.1");
        closed.setStatus("failed");when(transactions.findById("ABC123")).thenReturn(Optional.of(closed));
        assertEquals("00",service.ipn(callback("00","00","65000000")));
        verify(settlement).updatePaymentStatus(9L,"success");assertEquals("success",closed.getStatus());
    }
    @Test void delayedSuccessIsNotSettledOnceTheOrderWasClosed() {
        var closed=new VnpayTransaction("ABC123",payment,payment.getAmount(),LocalDateTime.of(2026,11,3,11,0),LocalDateTime.of(2026,11,3,11,15),"127.0.0.1");
        closed.setStatus("failed");payment.setStatus("failed");when(transactions.findById("ABC123")).thenReturn(Optional.of(closed));
        assertEquals("02",service.ipn(callback("00","00","65000000")));
        verifyNoInteractions(settlement,invoices);
    }
    @Test void delayedFailureForAClosedAttemptChangesNothing() {
        var closed=new VnpayTransaction("ABC123",payment,payment.getAmount(),LocalDateTime.of(2026,11,3,11,0),LocalDateTime.of(2026,11,3,11,15),"127.0.0.1");
        closed.setStatus("failed");when(transactions.findById("ABC123")).thenReturn(Optional.of(closed));
        assertEquals("02",service.ipn(callback("24","02","65000000")));
        verifyNoInteractions(settlement,invoices);assertEquals("failed",closed.getStatus());
    }
    @Test void unknownOrderIsNotFound() {
        when(transactions.findById("ABC123")).thenReturn(Optional.empty());
        assertEquals("01",service.ipn(callback("00","00","65000000")));
    }
}
