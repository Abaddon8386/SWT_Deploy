package com.swp391.scms.coaching.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** Partial update of a training plan header; null fields keep their current value. */
public class TrainingPlanUpdateDto {

    @Size(max = 255, message = "{validation.coaching.goal.size}")
    private String goal;

    @JsonAlias("start_date")
    private LocalDate startDate;

    @JsonAlias("end_date")
    private LocalDate endDate;

    public String getGoal() { return goal; }
    public void setGoal(String goal) { this.goal = goal; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
}
