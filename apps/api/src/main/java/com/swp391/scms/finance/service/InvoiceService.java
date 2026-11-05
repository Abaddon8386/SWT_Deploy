package com.swp391.scms.finance.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.finance.dto.InvoiceCreateDto;
import com.swp391.scms.finance.dto.InvoiceDto;
import com.swp391.scms.finance.dto.InvoiceItemCreateDto;
import com.swp391.scms.finance.entity.Invoice;
import com.swp391.scms.finance.entity.InvoiceItem;
import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.finance.mapper.InvoiceMapper;
import com.swp391.scms.finance.repository.InvoiceRepository;
import com.swp391.scms.finance.repository.PaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * Service managing invoices, invoice items, and PostgreSQL stored generated columns.
 */
@Service
@Transactional
public class InvoiceService {

    private final InvoiceRepository invoiceRepository;
    private final PaymentRepository paymentRepository;
    private final InvoiceMapper invoiceMapper;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.common.i18n.MessageService messageService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.shop.repository.ProductOrderRepository productOrders;

    public InvoiceService(InvoiceRepository invoiceRepository,
                          PaymentRepository paymentRepository,
                          InvoiceMapper invoiceMapper, Clock clock) {
        this.invoiceRepository = invoiceRepository;
        this.paymentRepository = paymentRepository;
        this.invoiceMapper = invoiceMapper;
        this.clock = clock;
    }

    /**
     * Issues a new electronic invoice.
     * The configured database computes total_amount and item amount through generated columns.
     */
    public InvoiceDto createInvoice(InvoiceCreateDto dto) {
        Payment payment = paymentRepository.findById(dto.getPaymentId())
                .orElseThrow(() -> new ResourceNotFoundException("resource.payment", dto.getPaymentId()));

        if ("failed".equalsIgnoreCase(payment.getStatus()) || "refunded".equalsIgnoreCase(payment.getStatus())) {
            throw new BadRequestException("INVALID_PAYMENT_STATE", "finance.invoice.invalid_payment_state",
                    new Object[]{payment.getStatus()}, null);
        }

        if (invoiceRepository.findByPaymentId(dto.getPaymentId()).isPresent()) {
            throw new ConflictException("INVOICE_ALREADY_EXISTS", "finance.invoice.already_exists", null, null);
        }

        String invoiceNumber = dto.getInvoiceNumber();
        if (invoiceNumber == null || invoiceNumber.isBlank()) {
            invoiceNumber = generateInvoiceNumber();
        } else if (invoiceRepository.existsByInvoiceNumber(invoiceNumber)) {
            throw new ConflictException("DUPLICATE_INVOICE_NUMBER", "finance.invoice.duplicate_number",
                    new Object[]{invoiceNumber}, null);
        }

        Invoice invoice = invoiceMapper.toEntity(dto);
        invoice.setPayment(payment);
        payment.setInvoice(invoice);
        invoice.setInvoiceNumber(invoiceNumber);
        if (invoice.getIssuedAt() == null) {
            invoice.setIssuedAt(LocalDateTime.now(clock));
        }

        if (dto.getItems() != null) {
            dto.getItems().forEach(item -> invoice.addItem(invoiceMapper.toItemEntity(item)));
        }

        Invoice saved = invoiceRepository.save(invoice);
        return invoiceMapper.toDto(saved);
    }

    @Transactional(readOnly = true)
    public InvoiceDto getInvoiceById(Long id) {
        Invoice invoice = invoiceRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.invoice", id));
        return invoiceMapper.toDto(invoice);
    }

    @Transactional(readOnly = true)
    public InvoiceDto getInvoiceByNumber(String invoiceNumber) {
        Invoice invoice = invoiceRepository.findByInvoiceNumber(invoiceNumber)
                .orElseThrow(() -> new ResourceNotFoundException("resource.invoice", invoiceNumber));
        return invoiceMapper.toDto(invoice);
    }

    @Transactional(readOnly = true)
    public InvoiceDto getInvoiceByPaymentId(Long paymentId) {
        Invoice invoice = invoiceRepository.findByPaymentId(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.invoice_for_payment", paymentId));
        return invoiceMapper.toDto(invoice);
    }

    @Transactional(readOnly = true)
    public InvoiceDto getMemberInvoiceByPaymentId(Long paymentId, Long userId) {
        Invoice invoice = invoiceRepository.findByPaymentIdAndPaymentMemberUserIdAndPaymentStatus(paymentId, userId, "success")
                .orElseThrow(() -> new ResourceNotFoundException("resource.invoice_for_payment", paymentId));
        InvoiceDto dto = invoiceMapper.toDto(invoice);
        // The member view must never substitute an in-memory calculation for the stored column.
        dto.setTotalAmount(invoice.getPersistedTotalAmount());
        dto.setPdfUrl(null); // Do not expose internal or third-party storage locations.
        return dto;
    }

    /**
     * Automatically generates and issues an electronic invoice for a successful payment.
     */
    // Callers treat auto-issue as best effort: a rejected issue must not mark the payment's transaction rollback-only.
    @Transactional(noRollbackFor = com.swp391.scms.common.exception.AppException.class)
    public InvoiceDto autoIssueInvoiceForPayment(Long paymentId) {
        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.payment", paymentId));

        if (!"success".equalsIgnoreCase(payment.getStatus())) {
            throw new BadRequestException("INVALID_PAYMENT_STATE", "finance.invoice.invalid_payment_state",
                    new Object[]{payment.getStatus()}, null);
        }

        return invoiceRepository.findByPaymentId(paymentId)
                .map(invoiceMapper::toDto)
                .orElseGet(() -> {
                    Invoice invoice = new Invoice();
                    invoice.setPayment(payment);
                    payment.setInvoice(invoice);
                    invoice.setInvoiceNumber(generateInvoiceNumber());
                    invoice.setIssuedAt(LocalDateTime.now(clock));
                    invoice.setSubtotalAmount(payment.getAmount());
                    invoice.setTaxAmount(java.math.BigDecimal.ZERO);

                    com.swp391.scms.shop.entity.ProductOrder productOrder =
                            (payment.getProductOrderId() != null && productOrders != null)
                                    ? productOrders.findById(payment.getProductOrderId()).orElse(null)
                                    : null;
                    if (productOrder != null && productOrder.getItems() != null && !productOrder.getItems().isEmpty()) {
                        for (com.swp391.scms.shop.entity.ProductOrderItem line : productOrder.getItems()) {
                            InvoiceItem item = new InvoiceItem();
                            item.setDescription(line.getProductName() + " · " + line.getVariantLabel());
                            item.setQuantity(line.getQuantity());
                            item.setUnitPrice(line.getUnitPrice());
                            invoice.addItem(item);
                        }
                        if (productOrder.getShippingFee() != null && productOrder.getShippingFee().signum() > 0) {
                            InvoiceItem shipItem = new InvoiceItem();
                            shipItem.setDescription(resolveShippingItemDescription());
                            shipItem.setQuantity(1);
                            shipItem.setUnitPrice(productOrder.getShippingFee());
                            invoice.addItem(shipItem);
                        }
                    } else {
                        InvoiceItem item = new InvoiceItem();
                        item.setDescription(resolveDefaultItemDescription(payment.getId()));
                        item.setQuantity(1);
                        item.setUnitPrice(payment.getAmount());
                        invoice.addItem(item);
                    }

                    Invoice saved = invoiceRepository.save(invoice);
                    return invoiceMapper.toDto(saved);
                });
    }

    private String resolveShippingItemDescription() {
        String fallback = "Phí giao hàng";
        if (messageService == null) {
            return fallback;
        }
        String resolved = messageService.getMessage("finance.invoice.item.shipping");
        return (resolved == null || resolved.isBlank() || "finance.invoice.item.shipping".equals(resolved))
                ? fallback
                : resolved;
    }

    private String resolveDefaultItemDescription(Long paymentId) {
        String fallback = "Dịch vụ thể thao / Gói tập - Thanh toán #" + paymentId;
        if (messageService == null) {
            return fallback;
        }
        String resolved = messageService.getMessage("finance.invoice.default_item_description", new Object[]{paymentId});
        return (resolved == null || resolved.isBlank() || "finance.invoice.default_item_description".equals(resolved))
                ? fallback
                : resolved;
    }

    private String generateInvoiceNumber() {
        String dateStr = LocalDateTime.now(clock).format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        return "INV-" + dateStr + "-" + suffix;
    }
}
