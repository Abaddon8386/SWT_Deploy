package com.swp391.scms.facilities;

import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.facilities.dto.CatalogRequests.DisciplineRequest;
import com.swp391.scms.facilities.dto.CatalogResponses.DisciplineDto;
import com.swp391.scms.facilities.service.DisciplineService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

@Tag(name = "Disciplines", description = "Discipline catalog. Read: any authenticated user; write: CENTER_MANAGER")
@RestController
@RequestMapping("/api/v1/disciplines")
public class DisciplineController {

    private final DisciplineService service;
    private final MessageService messageService;

    public DisciplineController(DisciplineService service) {
        this(service, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public DisciplineController(DisciplineService service, MessageService messageService) {
        this.service = service;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "List disciplines")
    @GetMapping
    public ApiResponse<List<DisciplineDto>> list() {
        return ApiResponse.ok(msg("catalog.list"), service.list());
    }

    @Operation(summary = "Create discipline")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @PostMapping
    public ResponseEntity<ApiResponse<DisciplineDto>> create(@Valid @RequestBody DisciplineRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(msg("catalog.created"), service.create(request)));
    }

    @Operation(summary = "Update discipline")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @PutMapping("/{id}")
    public ApiResponse<DisciplineDto> update(@PathVariable Long id, @Valid @RequestBody DisciplineRequest request) {
        return ApiResponse.ok(msg("catalog.updated"), service.update(id, request));
    }

    @Operation(summary = "Delete an unused discipline")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(msg("catalog.deleted"), null);
    }
}
