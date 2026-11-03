package com.swp391.scms.facilities;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.dto.EquipmentDto;
import com.swp391.scms.facilities.dto.EquipmentRequest;
import com.swp391.scms.facilities.service.EquipmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Equipment", description = "Gym equipment & machinery management")
@RestController
@RequestMapping("/api/v1/equipment")
public class EquipmentController {

    private final EquipmentService service;
    private final MessageService messageService;

    public EquipmentController(EquipmentService service, MessageService messageService) {
        this.service = service;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "List all equipment or filter by room")
    @GetMapping
    public ApiResponse<List<EquipmentDto>> list(@RequestParam(required = false) Long roomId) {
        return ApiResponse.ok(msg("equipment.list"), service.list(roomId));
    }

    @Operation(summary = "Get equipment details")
    @GetMapping("/{id}")
    public ApiResponse<EquipmentDto> get(@PathVariable Long id) {
        return ApiResponse.ok(msg("equipment.get"), service.get(id));
    }

    @Operation(summary = "Create equipment")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    @PostMapping
    public ResponseEntity<ApiResponse<EquipmentDto>> create(@Valid @RequestBody EquipmentRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("equipment.created"), service.create(request)));
    }

    @Operation(summary = "Update equipment")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    @PutMapping("/{id}")
    public ApiResponse<EquipmentDto> update(@PathVariable Long id, @Valid @RequestBody EquipmentRequest request) {
        return ApiResponse.ok(msg("equipment.updated"), service.update(id, request));
    }

    @Operation(summary = "Quick update equipment status")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER', 'STAFF', 'RECEPTIONIST')")
    @PatchMapping("/{id}/status")
    public ApiResponse<EquipmentDto> updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String status = body != null ? body.get("status") : null;
        return ApiResponse.ok(msg("equipment.status_updated"), service.updateStatus(id, status));
    }

    @Operation(summary = "Delete equipment")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(msg("equipment.deleted"), null);
    }
}

