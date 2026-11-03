package com.swp391.scms.reports.repository;

import com.swp391.scms.finance.entity.Payment;
import com.swp391.scms.reports.dto.RecentTransactionDto;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.LocalDateTime;
import java.util.List;

public interface TransactionReportRepository extends Repository<Payment, Long> {
    @Query("""
            select new com.swp391.scms.reports.dto.RecentTransactionDto(
                p.id, i.invoiceNumber, u.fullName, coalesce(pkg.name, c.name), p.amount, p.refundedAmount, p.method, p.paidAt)
            from Payment p
            join p.member m join m.user u
            left join p.invoice i
            left join p.subscription s left join s.membershipPackage pkg
            left join p.classEnrollment e left join e.gymClass c
            where p.status = 'success' and u.deletedAt is null
                and p.paidAt >= :start and p.paidAt < :endExclusive
            order by p.paidAt desc, p.id desc
            """)
    List<RecentTransactionDto> findRecentTransactions(LocalDateTime start, LocalDateTime endExclusive,
                                                     Pageable pageable);
}
