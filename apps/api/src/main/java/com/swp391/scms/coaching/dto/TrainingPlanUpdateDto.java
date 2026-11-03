package com.swp391.scms.coaching.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** Partial header update with optional full values for existing exercises; omitted items stay unchanged. */
public class TrainingPlanUpdateDto {

    @Size(max = 255, message = "{validation.coaching.goal.size}")
    private String goal;

    @JsonAlias("start_date")
    private LocalDate startDate;

    @JsonAlias("end_date")
    private LocalDate endDate;

    @jakarta.validation.Valid
    private java.util.List<@jakarta.validation.constraints.NotNull(message = "{validation.coaching.item_id.required}") TrainingPlanItemUpdateDto> items;
    public java.util.List<TrainingPlanItemUpdateDto> getItems() { return items; }
    public void setItems(java.util.List<TrainingPlanItemUpdateDto> items) { this.items = items; }

    public String getGoal() { return goal; }
    public void setGoal(String goal) { this.goal = goal; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
}
