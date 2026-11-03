package com.swp391.scms.coaching.dto;

import jakarta.validation.constraints.NotNull;

/** Updates an existing exercise in place, preserving completion-history references. */
public class TrainingPlanItemUpdateDto extends TrainingPlanItemCreateDto {
    @NotNull(message = "{validation.coaching.item_id.required}")
    private Long id;
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
}
