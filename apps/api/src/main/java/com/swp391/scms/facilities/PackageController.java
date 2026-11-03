package com.swp391.scms.facilities;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.dto.CatalogRequests.PackageRequest;
import com.swp391.scms.facilities.dto.CatalogRequests.PackageStatusRequest;
import com.swp391.scms.facilities.dto.CatalogResponses.PackageDto;
import com.swp391.scms.facilities.service.PackageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

@Tag(name = "Membership Packages", description = "Package catalog. Read: any authenticated user; write: CENTER_MANAGER")
@RestController
@RequestMapping("/api/v1/packages")
public class PackageController {

    private final PackageService service;
    private final MessageService messageService;

    public PackageController(PackageService service) {
        this(service, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public PackageController(PackageService service, MessageService messageService) {
        this.service = service;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "List membership packages")
    @GetMapping
    public ApiResponse<List<PackageDto>> list() {
        return ApiResponse.ok(msg("catalog.list"), service.list());
    }

    @Operation(summary = "Create membership package")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @PostMapping
    public ResponseEntity<ApiResponse<PackageDto>> create(@Valid @RequestBody PackageRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(msg("catalog.created"), service.create(request)));
    }

    @Operation(summary = "Update membership package")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @PutMapping("/{id}")
    public ApiResponse<PackageDto> update(@PathVariable Long id, @Valid @RequestBody PackageRequest request) {
        return ApiResponse.ok(msg("catalog.updated"), service.update(id, request));
    }

    @Operation(summary = "Activate or deactivate a membership package")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @PatchMapping("/{id}/status")
    public ApiResponse<PackageDto> updateStatus(@PathVariable Long id, @Valid @RequestBody PackageStatusRequest request) {
        return ApiResponse.ok(msg("catalog.updated"), service.updateStatus(id, request.status()));
    }

    @Operation(summary = "Delete a package that was never sold")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(msg("catalog.deleted"), null);
    }
}
