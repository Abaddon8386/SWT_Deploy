package com.swp391.scms.finance.service;

import com.swp391.scms.common.exception.*;
import com.swp391.scms.finance.dto.VnpayDtos.*;
import com.swp391.scms.finance.entity.*;
import com.swp391.scms.finance.repository.*;
import com.swp391.scms.membership.repository.MembershipSubscriptionRepository;
import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.courts.repository.CourtBookingRepository;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import com.swp391.scms.users.MemberRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

@Service
@Transactional
public class VnpayPaymentService {
    private final VnpayTransactionRepository transactions;
    private final PaymentRepository payments;
    private final MemberRepository members;
    private final MembershipSubscriptionRepository subscriptions;
    private final PaymentService settlement;
    private final InvoiceService invoices;
    private final VnpayGateway gateway;
    private final Clock clock;
    private final EntityManager entities;
    private final CoachBookingRepository coaches;
    private final CourtBookingRepository courts;
    private final NotificationService notifications;
    private final MessageService messages;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.wallet.WalletService walletService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.shop.service.ProductOrderPayments orderPayments;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.shop.repository.ProductOrderRepository orders;

    public VnpayPaymentService(VnpayTransactionRepository transactions, PaymentRepository payments, MemberRepository members,
            MembershipSubscriptionRepository subscriptions, PaymentService settlement, InvoiceService invoices,
            VnpayGateway gateway, Clock clock, EntityManager entities, CoachBookingRepository coaches, CourtBookingRepository courts,
            NotificationService notifications, MessageService messages) {
        this.transactions=transactions; this.payments=payments; this.members=members; this.subscriptions=subscriptions;
        this.settlement=settlement; this.invoices=invoices; this.gateway=gateway; this.clock=clock; this.entities=entities;
        this.coaches=coaches; this.courts=courts; this.notifications=notifications; this.messages=messages;
    }

    public void setOrderPayments(com.swp391.scms.shop.service.ProductOrderPayments orderPayments) {
        this.orderPayments = orderPayments;
    }

    public void setOrders(com.swp391.scms.shop.repository.ProductOrderRepository orders) {
        this.orders = orders;
    }

    public void setWalletService(com.swp391.scms.wallet.WalletService walletService) {
        this.walletService = walletService;
    }
    public boolean enabled() { return gateway.enabled(); }
    private LocalDateTime now() { return LocalDateTime.ofInstant(clock.instant(), ZoneId.of("Asia/Ho_Chi_Minh")); }
    private void requireMember(AuthenticatedPrincipal principal) {
        if (principal==null || !"MEMBER".equals(principal.role())) throw new ForbiddenException("FORBIDDEN","error.forbidden",null,null);
    }
    private void requireOwner(AuthenticatedPrincipal principal, Long memberId) {
        requireMember(principal);
        if (!principal.id().equals(memberId)) throw new ForbiddenException("PAYMENT_MEMBER_MISMATCH","finance.payment.member_mismatch",null,null);
    }
    private ConflictException unavailable() { return new ConflictException("VNPAY_TARGET_UNAVAILABLE","finance.vnpay.target_unavailable",null,null); }
    private void lockMember(Long id) {
        members.findByUserIdForUpdate(id).orElseThrow(()->new ResourceNotFoundException("resource.member",id));
    }

    public Checkout topupWallet(AuthenticatedPrincipal principal, BigDecimal amount, String ip) {
        requireMember(principal);
        gateway.requireEnabled();
        if (amount == null || amount.compareTo(BigDecimal.valueOf(10_000)) < 0 || amount.compareTo(BigDecimal.valueOf(100_000_000)) > 0) {
            throw new BadRequestException("VNPAY_INVALID_AMOUNT", "error.wallet.topup_range", null, "Số tiền nạp vào Ví phải từ 10.000 đ đến 100.000.000 đ.");
        }
        lockMember(principal.id());
        Payment payment = new Payment();
        payment.setMember(members.findById(principal.id()).orElseThrow(this::unavailable));
        payment.setAmount(amount);
        payment.setMethod("wallet_topup");
        payment.setStatus("pending");
        payment = payments.save(payment);

        String reference = UUID.randomUUID().toString().replace("-", "");
        var created = now();
        var transaction = new VnpayTransaction(reference, payment, payment.getAmount(), created, created.plusMinutes(gateway.timeoutMinutes()), ip);
        Checkout response = checkoutDto(transaction);
        transactions.save(transaction);
        return response;
    }

    public com.swp391.scms.wallet.WalletDto payWithWallet(AuthenticatedPrincipal principal, CheckoutRequest request) {
        requireMember(principal);
        if (walletService == null) {
            throw new ConflictException("WALLET_UNAVAILABLE", "error.wallet.unavailable", null, "Tính năng Ví điện tử hiện không khả dụng.");
        }
        Payment payment = resolveTargetPayment(principal, request);
        if (!"pending".equals(payment.getStatus())) throw unavailable();
        payment.setMethod("online_wallet");
        payment = payments.saveAndFlush(payment);

        String targetPath = payment.getProductOrderId() != null
                ? "/member/orders/" + payment.getProductOrderId()
                : payment.getCourtBookingId() != null
                        ? "/member/courts"
                        : payment.getCoachBookingId() != null
                                ? "/member/classes?tab=pt"
                                : payment.getSubscriptionId() != null
                                        ? "/member/packages"
                                        : "/member/invoices";
        String desc = payment.getProductOrderId() != null
                ? orderWalletDescription(payment)
                : payment.getSubscriptionId() != null
                        ? "Thanh toán gói tập hội viên (#" + payment.getId() + ")"
                        : payment.getCoachBookingId() != null
                                ? "Thanh toán lịch PT 1:1 (#" + payment.getId() + ")"
                                : payment.getCourtBookingId() != null
                                        ? "Thanh toán đặt sân (#" + payment.getId() + ")"
                                        : "Thanh toán dịch vụ (#" + payment.getId() + ")";

        com.swp391.scms.wallet.WalletDto updatedWallet = walletService.debitForPayment(
                principal.id(),
                payment.getAmount(),
                "WALLET_PAY_" + payment.getId(),
                desc,
                targetPath
        );
        settlement.updatePaymentStatus(payment.getId(), "success");
        markBookingPaid(payment);
        invoices.autoIssueInvoiceForPayment(payment.getId());
        return updatedWallet;
    }

    // Compatibility helper and the membership checkout entry point.
    public Checkout checkout(AuthenticatedPrincipal principal, Long subscriptionId, String ip) {
        return checkout(principal, new CheckoutRequest(subscriptionId,null,null,null),ip);
    }
    public Checkout checkout(AuthenticatedPrincipal principal, CheckoutRequest request, String ip) {
        requireMember(principal); gateway.requireEnabled();
        Payment payment = resolveTargetPayment(principal, request);
        if (!"pending".equals(payment.getStatus())) throw unavailable();
        payment=payments.save(payment);
        var existing=transactions.findFirstByPaymentIdAndStatusOrderByCreatedAtDesc(payment.getId(),"pending");
        if(existing.isPresent()) {
            VnpayTransaction current=existing.get();
            if(current.getExpiresAt().isAfter(now())) return checkoutDto(current);
            // The gateway refuses payment after expiry; wait out the IPN grace period, then start a fresh attempt.
            if(!current.getExpiresAt().plus(VnpayPaymentGuard.SETTLEMENT_GRACE).isBefore(now()))
                throw new ConflictException("VNPAY_AWAITING_CONFIRMATION","finance.vnpay.awaiting_confirmation",null,null);
            current.setStatus("failed");
            transactions.save(current);
        }
        String reference=UUID.randomUUID().toString().replace("-","");
        var created=now();
        var transaction=new VnpayTransaction(reference,payment,payment.getAmount(),created,created.plusMinutes(gateway.timeoutMinutes()),ip);
        Checkout response=checkoutDto(transaction); // validate before persisting a payment attempt
        payment.setMethod("online_wallet");
        transactions.save(transaction);
        return response;
    }

    private Payment resolveTargetPayment(AuthenticatedPrincipal principal, CheckoutRequest request) {
        Long[] targets={request.subscriptionId(),request.coachBookingId(),request.courtBookingId(),request.paymentId(),request.productOrderId()};
        if (Arrays.stream(targets).filter(Objects::nonNull).count()!=1 || Arrays.stream(targets).filter(Objects::nonNull).anyMatch(id->id<1))
            throw new BadRequestException("VNPAY_TARGET_REQUIRED","finance.vnpay.target_required",null,null);
        Payment payment;
        if (request.paymentId()!=null) {
            payment=payments.findById(request.paymentId()).orElseThrow(()->new ResourceNotFoundException("resource.payment",request.paymentId()));
            requireOwner(principal,payment.getMember().getUserId()); lockMember(principal.id()); lockTargets(payment); entities.refresh(payment);
            if (payment.getSubscriptionId()!=null) {
                var sub=subscriptions.findById(payment.getSubscriptionId()).orElseThrow(this::unavailable);
                entities.refresh(sub); if (!"pending_payment".equals(sub.getStatus())) throw unavailable();
            }
            validateBooking(payment);
        } else if(request.subscriptionId()!=null) {
            var sub=subscriptions.findById(request.subscriptionId()).orElseThrow(()->new ResourceNotFoundException("resource.subscription",request.subscriptionId()));
            requireOwner(principal,sub.getMember().getUserId()); lockMember(principal.id()); entities.refresh(sub);
            if (!"pending_payment".equals(sub.getStatus())) throw unavailable();
            payment=findOrCreate(payments.findAllBySubscriptionId(sub.getId()),principal.id(),sub.payableAmount());
            payment.setSubscriptionId(sub.getId());
        } else if(request.coachBookingId()!=null) {
            var booking=coaches.findById(request.coachBookingId()).orElseThrow(this::unavailable);
            requireOwner(principal,booking.getMember().getUserId()); lockMember(principal.id());
            coaches.findByIdForUpdate(booking.getId()).orElseThrow(this::unavailable); entities.refresh(booking);
            if (!Set.of("confirmed","completed").contains(booking.getStatus()) || !"pending".equals(booking.getPaymentStatus())) throw unavailable();
            payment=findOrCreate(payments.findAllByCoachBookingId(booking.getId()),principal.id(),booking.getHourlyRate());
            payment.setCoachBookingId(booking.getId());
        } else if(request.productOrderId()!=null) {
            lockMember(principal.id());
            if (orderPayments == null) throw unavailable();
            var order = orderPayments.requirePayable(request.productOrderId());
            requireOwner(principal, order.getMember().getUserId());
            payment = findOrCreate(payments.findAllByProductOrderId(order.getId()), principal.id(), order.getTotal());
            payment.setProductOrderId(order.getId());
        } else {
            var booking=courts.findById(request.courtBookingId()).orElseThrow(this::unavailable);
            requireOwner(principal,booking.getMember().getId()); lockMember(principal.id());
            courts.findByIdForUpdate(booking.getId()).orElseThrow(this::unavailable); entities.refresh(booking);
            if (!"booked".equals(booking.getStatus()) || !"pending".equals(booking.getPaymentStatus())) throw unavailable();
            payment=findOrCreate(payments.findAllByCourtBookingId(booking.getId()),principal.id(),booking.getPrice());
            payment.setCourtBookingId(booking.getId());
        }
        return payment;
    }

    private Payment findOrCreate(List<Payment> existing,Long memberId,BigDecimal amount) {
        if(existing!=null && !existing.isEmpty()) {
            if(existing.stream().anyMatch(p -> !"pending".equals(p.getStatus()))) throw unavailable();
            List<Payment> reusable = existing.stream()
                    .filter(p -> p.getReceiptImage() == null || p.getReceiptImage().isBlank())
                    .toList();
            if(reusable.size() > 1) throw unavailable();
            if(reusable.size() == 1) {
                Payment p=reusable.getFirst(); entities.refresh(p); if(!"pending".equals(p.getStatus())) throw unavailable();
                if(p.getReceiptImage() == null || p.getReceiptImage().isBlank()) return p;
            }
        }
        Payment p=new Payment();p.setMember(members.findById(memberId).orElseThrow(this::unavailable));
        p.setAmount(amount);p.setMethod("online_wallet");p.setStatus("pending");return p;
    }
    private Checkout checkoutDto(VnpayTransaction t) {
        return new Checkout(t.getReference(),gateway.paymentUrl(t.getReference(),t.getAmount(),t.getCreatedAt(),t.getExpiresAt(),t.getIpAddress()),t.getAmount(),t.getExpiresAt());
    }
    @Transactional(readOnly=true)
    public Status status(AuthenticatedPrincipal principal,String reference) {
        var t=transactions.findById(reference).orElseThrow(()->new ResourceNotFoundException("resource.payment",reference));
        Payment p=t.getPayment();requireOwner(principal,p.getMember().getUserId());
        String status="refunded".equals(p.getStatus())?"refunded":t.getStatus();
        String targetPath = p.getProductOrderId()!=null
                ? "/member/orders/" + p.getProductOrderId()
                : p.getCourtBookingId()!=null
                        ? "/member/courts"
                        : p.getCoachBookingId()!=null
                                ? "/member/classes?tab=pt"
                                : p.getSubscriptionId()!=null
                                        ? "/member/packages"
                                        : "wallet_topup".equalsIgnoreCase(p.getMethod())
                                                ? "/member/packages"
                                                : "/member/invoices";
        return new Status(reference,p.getId(),p.getSubscriptionId(),t.getAmount(),status,t.getExpiresAt(),targetPath);
    }
    public String ipn(Map<String,String> fields) {
        if(!gateway.validSignature(fields)) return "97";
        String reference=fields.get("vnp_TxnRef");
        if(reference==null || !reference.matches("[A-Za-z0-9]{1,32}")) return "01";
        var optional=transactions.findById(reference); if(optional.isEmpty()) return "01";
        var t=optional.get();Payment p=t.getPayment();
        lockMember(p.getMember().getUserId());lockTargets(p);entities.refresh(t);entities.refresh(p);
        String amount=fields.get("vnp_Amount");
        if(amount==null || !amount.matches("[0-9]{1,12}") || t.getAmount().multiply(BigDecimal.valueOf(100)).compareTo(new BigDecimal(amount))!=0) return "04";
        // An attempt closed locally after its gateway expiry may still report a delayed success: honour it while the
        // payment is unsettled so the customer's money is never taken without the order being paid.
        boolean lateAfterLocalExpiry="failed".equals(t.getStatus()) && t.getGatewayTransactionNo()==null
                && "pending".equals(p.getStatus()) && !t.getExpiresAt().isAfter(now());
        if((!"pending".equals(t.getStatus()) && !lateAfterLocalExpiry) || !"pending".equals(p.getStatus())) return "02";
        String response=fields.get("vnp_ResponseCode"),status=fields.get("vnp_TransactionStatus");
        if(response==null || status==null || !response.matches("[0-9]{2}") || !status.matches("[0-9]{2}")) return "97";
        if("00".equals(response) && "00".equals(status)) {
            String gatewayId=fields.get("vnp_TransactionNo");
            if(gatewayId==null || !gatewayId.matches("[0-9]{1,15}") || gatewayId.matches("0+")) return "97";
            validateBooking(p);
            t.setGatewayTransactionNo(gatewayId);t.setStatus("success");
            transactions.saveAndFlush(t); // guard sees a terminal transaction in the same atomic settlement
            settlement.updatePaymentStatus(p.getId(),"success");
            markBookingPaid(p);
            invoices.autoIssueInvoiceForPayment(p.getId());
            if (walletService != null) {
                boolean isDirectTopup = "wallet_topup".equalsIgnoreCase(p.getMethod());

                if (isDirectTopup) {
                    walletService.creditTopup(p.getMember().getUserId(), t.getAmount(), reference);
                } else {
                    String desc = p.getProductOrderId() != null
                            ? orderWalletDescription(p)
                            : p.getSubscriptionId() != null
                                    ? "Thanh toán gói tập hội viên (#" + reference + ")"
                                    : p.getCoachBookingId() != null
                                            ? "Thanh toán lịch PT 1:1 (#" + reference + ")"
                                            : p.getCourtBookingId() != null
                                                    ? "Thanh toán đặt sân (#" + reference + ")"
                                                    : "Thanh toán dịch vụ (#" + reference + ")";
                    walletService.recordVnpayTopupAndDebit(p.getMember().getUserId(), t.getAmount(), reference, desc);
                }
            }
            notifications.send(p.getMember().getUserId(), messages.getMessage("notifications.payment.vnpay_success.title"),
                    messages.getMessage("notifications.payment.vnpay_success.body", t.getAmount().toPlainString(), reference),
                    "payment", "payment", p.getId());
        } else {
            if (lateAfterLocalExpiry) return "02"; // already closed as failed
            // A provisional/unknown status is not proof of a failed debit; keep it blocked for reconciliation.
            if (!Set.of("02", "04", "07").contains(status)) return "99";
            t.setStatus("failed");
        }
        return "00";
    }
    private String orderWalletDescription(Payment p) {
        String code = "#" + p.getProductOrderId();
        if (orders != null && p.getProductOrderId() != null) {
            code = orders.findById(p.getProductOrderId())
                    .map(com.swp391.scms.shop.entity.ProductOrder::getCode)
                    .filter(c -> c != null && !c.isBlank())
                    .orElse(code);
        }
        if (messages != null) {
            String msg = messages.getMessage("wallet.description.product_order", code);
            if (msg != null && !msg.isBlank()) return msg;
        }
        return "Thanh toán đơn hàng " + code;
    }
    private void lockTargets(Payment p) {
        if(p.getCoachBookingId()!=null) coaches.findByIdForUpdate(p.getCoachBookingId()).orElseThrow(this::unavailable);
        if(p.getCourtBookingId()!=null) courts.findByIdForUpdate(p.getCourtBookingId()).orElseThrow(this::unavailable);
        if(p.getProductOrderId()!=null && orders!=null) orders.findByIdForUpdate(p.getProductOrderId()).orElseThrow(this::unavailable);
    }
    private void validateBooking(Payment p) {
        if(p.getCoachBookingId()!=null) {
            var b=coaches.findById(p.getCoachBookingId()).orElseThrow(this::unavailable);entities.refresh(b);
            if(!Set.of("confirmed","completed").contains(b.getStatus()) || !"pending".equals(b.getPaymentStatus())) throw unavailable();
        }
        if(p.getCourtBookingId()!=null) {
            var b=courts.findById(p.getCourtBookingId()).orElseThrow(this::unavailable);entities.refresh(b);
            if(!"booked".equals(b.getStatus()) || !"pending".equals(b.getPaymentStatus())) throw unavailable();
        }
        if(p.getProductOrderId()!=null && orderPayments!=null) {
            orderPayments.requirePayable(p.getProductOrderId());
        }
    }
    private void markBookingPaid(Payment p) {
        if(p.getCoachBookingId()!=null) { var b=coaches.findById(p.getCoachBookingId()).orElseThrow(this::unavailable);b.setPaymentStatus("paid");b.setPaymentMethod("online_wallet"); }
        if(p.getCourtBookingId()!=null) { var b=courts.findById(p.getCourtBookingId()).orElseThrow(this::unavailable);b.setPaymentStatus("paid");b.setPaymentMethod("online_wallet"); }
        if(p.getProductOrderId()!=null && orderPayments!=null) { orderPayments.markPaid(p.getProductOrderId(), "online_wallet"); }
    }
}
