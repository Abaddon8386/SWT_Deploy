package com.swp391.scms.finance.mapper;

import com.swp391.scms.finance.dto.PaymentCreateDto;
import com.swp391.scms.finance.dto.PaymentDto;
import com.swp391.scms.finance.entity.Payment;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;

import java.util.List;

/**
 * MapStruct mapper for Payment entity and DTOs.
 */
@Mapper(componentModel = "spring", nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface PaymentMapper {

    @Mapping(source = "member.userId", target = "memberId")
    @Mapping(source = "member.user.fullName", target = "memberName")
    @Mapping(source = "receivedBy.id", target = "receivedById")
    @Mapping(source = "receivedBy.fullName", target = "receivedByName")
    @Mapping(source = "invoice.invoiceNumber", target = "invoiceNumber")
    @Mapping(target = "hasReceipt", expression = "java(entity.getReceiptImage() != null && !entity.getReceiptImage().isBlank())")
    @Mapping(target = "receiptImage", ignore = true)
    PaymentDto toDto(Payment entity);

    List<PaymentDto> toDtoList(List<Payment> entities);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "member", ignore = true)
    @Mapping(target = "receivedBy", ignore = true)
    @Mapping(target = "invoice", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "refundedAmount", ignore = true)
    Payment toEntity(PaymentCreateDto dto);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "member", ignore = true)
    @Mapping(target = "receivedBy", ignore = true)
    @Mapping(target = "invoice", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "refundedAmount", ignore = true)
    @Mapping(target = "receiptImage", ignore = true)
    void updateEntityFromDto(PaymentDto dto, @MappingTarget Payment entity);
}
