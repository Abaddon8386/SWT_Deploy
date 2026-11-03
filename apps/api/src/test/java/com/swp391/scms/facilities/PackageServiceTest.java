package com.swp391.scms.facilities;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.facilities.dto.CatalogRequests.PackageRequest;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.facilities.repository.MembershipPackageRepository;
import com.swp391.scms.facilities.service.PackageService;
import java.math.BigDecimal;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PackageServiceTest {

    @Mock MembershipPackageRepository packages;
    @InjectMocks PackageService service;

    @Test
    void createDefaultsToActiveWhenStatusOmitted() {
        when(packages.save(any(MembershipPackage.class))).thenAnswer(i -> i.getArgument(0));

        var dto = service.create(new PackageRequest("Basic", null, BigDecimal.TEN, 30, 8, null));

        assertEquals("active", dto.status());
        assertEquals(30, dto.durationDays());
    }

    @Test
    void updateStatusDeactivates() {
        MembershipPackage pkg = new MembershipPackage();
        pkg.setPrice(BigDecimal.TEN);
        when(packages.findById(1L)).thenReturn(Optional.of(pkg));

        assertEquals("inactive", service.updateStatus(1L, "inactive").status());
    }

    @Test
    void updateMissingThrowsNotFound() {
        when(packages.findById(9L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> service.update(9L, new PackageRequest("A", null, BigDecimal.ONE, 1, null, null)));
    }

    @Test
    void deleteRemovesPackageThatWasNeverSold() {
        MembershipPackage pkg = new MembershipPackage();
        var subscriptions = org.mockito.Mockito.mock(com.swp391.scms.membership.repository.MembershipSubscriptionRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "subscriptions", subscriptions);
        when(packages.findById(1L)).thenReturn(Optional.of(pkg));
        service.delete(1L);
        org.mockito.Mockito.verify(packages).delete(pkg);
    }

    @Test
    void deleteBlockedWhenPackageWasSold() {
        var subscriptions = org.mockito.Mockito.mock(com.swp391.scms.membership.repository.MembershipSubscriptionRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "subscriptions", subscriptions);
        when(packages.findById(1L)).thenReturn(Optional.of(new MembershipPackage()));
        when(subscriptions.existsByMembershipPackageId(1L)).thenReturn(true);
        assertThrows(com.swp391.scms.common.exception.ConflictException.class, () -> service.delete(1L));
        org.mockito.Mockito.verify(packages, org.mockito.Mockito.never()).delete(any(MembershipPackage.class));
    }
}
