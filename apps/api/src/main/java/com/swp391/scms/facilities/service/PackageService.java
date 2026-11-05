package com.swp391.scms.facilities.service;

import com.swp391.scms.audit.Audited;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.facilities.dto.CatalogRequests.PackageRequest;
import com.swp391.scms.facilities.dto.CatalogResponses.PackageDto;
import com.swp391.scms.facilities.entity.MembershipPackage;
import com.swp391.scms.facilities.repository.MembershipPackageRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Business logic for the membership package catalog (SCRUM-60). */
@Service
public class PackageService {

    private final MembershipPackageRepository packages;

    public PackageService(MembershipPackageRepository packages) {
        this.packages = packages;
    }

    @Transactional(readOnly = true)
    public List<PackageDto> list() {
        return packages.findAllByOrderByPriceAsc().stream().map(PackageDto::of).toList();
    }

    @Transactional
    @Audited(action = "PACKAGE_CREATE", entity = "membership_packages")
    public PackageDto create(PackageRequest request) {
        MembershipPackage pkg = new MembershipPackage();
        apply(pkg, request);
        return PackageDto.of(packages.save(pkg));
    }

    @Transactional
    @Audited(action = "PACKAGE_UPDATE", entity = "membership_packages")
    public PackageDto update(Long id, PackageRequest request) {
        MembershipPackage pkg = find(id);
        apply(pkg, request);
        return PackageDto.of(pkg);
    }

    @Transactional
    @Audited(action = "PACKAGE_STATUS_CHANGE", entity = "membership_packages")
    public PackageDto updateStatus(Long id, String status) {
        MembershipPackage pkg = find(id);
        pkg.setStatus(status);
        return PackageDto.of(pkg);
    }

    private MembershipPackage find(Long id) {
        return packages.findById(id).orElseThrow(() -> new ResourceNotFoundException("resource.package", id));
    }

    private void apply(MembershipPackage pkg, PackageRequest request) {
        pkg.setName(request.name().trim());
        pkg.setDescription(request.description());
        pkg.setPrice(request.price());
        pkg.setDurationDays(request.durationDays());
        pkg.setClassCreditLimit(request.classCreditLimit());
        if (request.status() != null && !request.status().isBlank()) {
            pkg.setStatus(request.status());
        }
        pkg.setTier(PackageDto.inferTier(request.name(), request.tier()));
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.swp391.scms.membership.repository.MembershipSubscriptionRepository subscriptions;

    /** A package that was ever sold is kept for history (set status to inactive instead). */
    @Transactional
    @Audited(action = "PACKAGE_DELETE", entity = "membership_packages")
    public void delete(Long id) {
        MembershipPackage pkg = find(id);
        if (subscriptions != null && subscriptions.existsByMembershipPackageId(id)) {
            throw new com.swp391.scms.common.exception.ConflictException("PACKAGE_IN_USE", "catalog.package.in_use", null, null);
        }
        packages.delete(pkg);
    }
}
