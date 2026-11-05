package com.swp391.scms.wallet;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class WalletService {

    private final WalletRepository walletRepository;
    private final WalletTransactionRepository walletTransactionRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    @Autowired
    public WalletService(
            WalletRepository walletRepository,
            WalletTransactionRepository walletTransactionRepository,
            UserRepository userRepository,
            @Autowired(required = false) NotificationService notificationService) {
        this.walletRepository = walletRepository;
        this.walletTransactionRepository = walletTransactionRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
    }

    @Transactional
    public Wallet getOrCreateWallet(Long userId) {
        return walletRepository.findByUser_Id(userId)
                .orElseGet(() -> createWalletForUser(userId));
    }

    @Transactional
    public Wallet getOrCreateWalletForUpdate(Long userId) {
        return walletRepository.findByUserIdForUpdate(userId)
                .orElseGet(() -> createWalletForUser(userId));
    }

    private Wallet createWalletForUser(Long userId) {
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.user", userId));
        Wallet wallet = new Wallet();
        wallet.setUser(user);
        wallet.setBalance(BigDecimal.ZERO);
        wallet.setUpdatedAt(LocalDateTime.now());
        return walletRepository.saveAndFlush(wallet);
    }

    @Transactional
    public WalletDto getMyWallet(Long userId) {
        Wallet wallet = getOrCreateWallet(userId);
        return toDto(wallet);
    }

    public WalletDto toDto(Wallet wallet) {
        List<WalletTransactionDto> txDtos = walletTransactionRepository
                .findTop50ByWallet_IdOrderByCreatedAtDescIdDesc(wallet.getId())
                .stream()
                .map(tx -> new WalletTransactionDto(
                        tx.getId(),
                        tx.getType(),
                        tx.getAmount(),
                        tx.getBalanceAfter(),
                        tx.getReferenceType(),
                        tx.getReferenceId(),
                        tx.getDescription(),
                        tx.getCreatedAt()
                ))
                .toList();
        return new WalletDto(wallet.getBalance(), wallet.getUpdatedAt(), txDtos);
    }

    @Transactional
    public void creditTopup(Long userId, BigDecimal amount, String reference) {
        if (userId == null || amount == null || amount.compareTo(BigDecimal.ZERO) <= 0 || reference == null || reference.isBlank()) {
            return;
        }
        Wallet wallet = getOrCreateWalletForUpdate(userId);
        String topupRef = reference + ":TOPUP";
        if (walletTransactionRepository.existsByWallet_IdAndReferenceId(wallet.getId(), topupRef)) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        BigDecimal currentBalance = wallet.getBalance() != null ? wallet.getBalance() : BigDecimal.ZERO;
        BigDecimal newBalance = currentBalance.add(amount);

        WalletTransaction topup = new WalletTransaction();
        topup.setWallet(wallet);
        topup.setType("TOPUP_VNPAY");
        topup.setAmount(amount);
        topup.setBalanceAfter(newBalance);
        topup.setReferenceType("VNPAY_TOPUP");
        topup.setReferenceId(topupRef);
        topup.setDescription("Nạp tiền vào Ví qua VNPay (#" + reference + ")");
        topup.setCreatedAt(now);
        walletTransactionRepository.save(topup);

        wallet.setBalance(newBalance);
        wallet.setUpdatedAt(now);
        walletRepository.save(wallet);

        if (notificationService != null) {
            try {
                notificationService.send(
                        userId,
                        "Nạp tiền vào Ví SÖL thành công",
                        "Đã nạp thành công " + amount.toPlainString() + " đ vào Ví điện tử SÖL của bạn (#" + reference + "). Số dư mới: " + newBalance.toPlainString() + " đ.",
                        "payment",
                        "wallet",
                        wallet.getId(),
                        "/member/packages"
                );
            } catch (RuntimeException ignored) {
            }
        }
    }

    @Transactional
    public WalletDto debitForPayment(Long userId, BigDecimal amount, String referenceId, String serviceDescription, String actionPath) {
        if (userId == null || amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BadRequestException("INVALID_PAYMENT_AMOUNT", "Số tiền thanh toán không hợp lệ.");
        }
        Wallet wallet = getOrCreateWalletForUpdate(userId);
        BigDecimal currentBalance = wallet.getBalance() != null ? wallet.getBalance() : BigDecimal.ZERO;
        if (currentBalance.compareTo(amount) < 0) {
            throw new BadRequestException(
                    "INSUFFICIENT_WALLET_BALANCE",
                    "Số dư Ví không đủ để thanh toán (Hiện có: " + currentBalance.toPlainString()
                            + " đ, cần: " + amount.toPlainString() + " đ). Vui lòng nạp thêm tiền vào Ví."
            );
        }

        LocalDateTime now = LocalDateTime.now();
        BigDecimal newBalance = currentBalance.subtract(amount);

        WalletTransaction debit = new WalletTransaction();
        debit.setWallet(wallet);
        debit.setType("PAYMENT_DEBIT");
        debit.setAmount(amount);
        debit.setBalanceAfter(newBalance);
        debit.setReferenceType("WALLET_PAYMENT");
        debit.setReferenceId(referenceId);
        debit.setDescription((serviceDescription != null && !serviceDescription.isBlank())
                ? serviceDescription
                : ("Thanh toán dịch vụ bằng Ví SÖL (#" + referenceId + ")"));
        debit.setCreatedAt(now);
        walletTransactionRepository.save(debit);

        wallet.setBalance(newBalance);
        wallet.setUpdatedAt(now);
        walletRepository.saveAndFlush(wallet);

        if (notificationService != null) {
            try {
                notificationService.send(
                        userId,
                        "Thanh toán bằng Ví SÖL thành công",
                        "Đã trừ " + amount.toPlainString() + " đ từ Ví SÖL để thanh toán dịch vụ. Số dư còn lại: " + newBalance.toPlainString() + " đ.",
                        "payment",
                        "wallet",
                        wallet.getId(),
                        actionPath != null ? actionPath : "/member/invoices"
                );
            } catch (RuntimeException ignored) {
            }
        }
        return toDto(wallet);
    }

    @Transactional
    public void recordVnpayTopupAndDebit(Long userId, BigDecimal amount, String reference, String serviceDescription) {
        if (userId == null || amount == null || amount.compareTo(BigDecimal.ZERO) <= 0 || reference == null || reference.isBlank()) {
            return;
        }
        Wallet wallet = getOrCreateWalletForUpdate(userId);
        String topupRef = reference + ":TOPUP";
        String debitRef = reference + ":DEBIT";
        if (walletTransactionRepository.existsByWallet_IdAndReferenceId(wallet.getId(), topupRef)) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        BigDecimal currentBalance = wallet.getBalance() != null ? wallet.getBalance() : BigDecimal.ZERO;
        BigDecimal balanceAfterTopup = currentBalance.add(amount);

        WalletTransaction topup = new WalletTransaction();
        topup.setWallet(wallet);
        topup.setType("TOPUP_VNPAY");
        topup.setAmount(amount);
        topup.setBalanceAfter(balanceAfterTopup);
        topup.setReferenceType("VNPAY");
        topup.setReferenceId(topupRef);
        topup.setDescription("Nạp tiền tự động từ VNPay (#" + reference + ")");
        topup.setCreatedAt(now);
        walletTransactionRepository.save(topup);

        BigDecimal balanceAfterDebit = balanceAfterTopup.subtract(amount);
        WalletTransaction debit = new WalletTransaction();
        debit.setWallet(wallet);
        debit.setType("PAYMENT_DEBIT");
        debit.setAmount(amount);
        debit.setBalanceAfter(balanceAfterDebit);
        debit.setReferenceType("VNPAY");
        debit.setReferenceId(debitRef);
        debit.setDescription((serviceDescription != null && !serviceDescription.isBlank())
                ? serviceDescription
                : ("Thanh toán dịch vụ qua Ví (#" + reference + ")"));
        debit.setCreatedAt(now.plusNanos(1_000_000));
        walletTransactionRepository.save(debit);

        wallet.setBalance(balanceAfterDebit);
        wallet.setUpdatedAt(now);
        walletRepository.save(wallet);

        if (notificationService != null) {
            try {
                notificationService.send(
                        userId,
                        "Nạp Ví & Thanh toán VNPay thành công",
                        "Hệ thống đã tự động nạp " + amount.toPlainString() + " đ từ VNPay vào Ví và khấu trừ thanh toán dịch vụ (#" + reference + ").",
                        "payment",
                        "wallet",
                        wallet.getId(),
                        "/member/invoices"
                );
            } catch (RuntimeException ignored) {
            }
        }
    }

    @Transactional
    public void creditRefund(Long userId, BigDecimal amount, String referenceId, String reason) {
        if (userId == null || amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        Wallet wallet = getOrCreateWalletForUpdate(userId);
        if (referenceId != null && !referenceId.isBlank()
                && walletTransactionRepository.existsByWallet_IdAndReferenceId(wallet.getId(), referenceId)) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        BigDecimal currentBalance = wallet.getBalance() != null ? wallet.getBalance() : BigDecimal.ZERO;
        BigDecimal newBalance = currentBalance.add(amount);

        WalletTransaction refund = new WalletTransaction();
        refund.setWallet(wallet);
        refund.setType("REFUND_CREDIT");
        refund.setAmount(amount);
        refund.setBalanceAfter(newBalance);
        refund.setReferenceType("CANCELLATION_REFUND");
        refund.setReferenceId(referenceId);
        refund.setDescription((reason != null && !reason.isBlank())
                ? ("Hoàn tiền hủy gói tập: " + reason)
                : "Hoàn tiền hủy gói tập về Ví");
        refund.setCreatedAt(now);
        walletTransactionRepository.save(refund);

        wallet.setBalance(newBalance);
        wallet.setUpdatedAt(now);
        walletRepository.save(wallet);

        if (notificationService != null) {
            try {
                notificationService.send(
                        userId,
                        "Hoàn tiền hủy gói tập vào Ví",
                        "Yêu cầu hủy gói tập đã được Quản lý phê duyệt. Số tiền " + amount.toPlainString() + " đ đã được cộng vào Ví hội viên của bạn.",
                        "payment",
                        "wallet",
                        wallet.getId(),
                        "/member/packages"
                );
            } catch (RuntimeException ignored) {
            }
        }
    }
}
