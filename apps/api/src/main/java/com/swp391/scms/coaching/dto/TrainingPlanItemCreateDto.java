package com.swp391.scms.coaching.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class TrainingPlanItemCreateDto {

    @JsonAlias("day_of_week")
    @Min(value = 1, message = "{validation.coaching.day_of_week.range}")
    @Max(value = 7, message = "{validation.coaching.day_of_week.range}")
    private Integer dayOfWeek;

    @JsonAlias("exercise_name")
    @NotBlank(message = "{validation.coaching.exercise_name.not_blank}")
    @Size(max = 150, message = "{validation.coaching.exercise_name.size}")
    private String exerciseName;

    private String description;

    @JsonAlias("rest_seconds")
    @Min(value = 0, message = "{validation.coaching.rest.min}")
    private Integer restSeconds;

    @Min(value = 1, message = "{validation.coaching.sets.min}")
    private Integer sets;

    @Min(value = 1, message = "{validation.coaching.reps.min}")
    private Integer reps;

    @JsonAlias("duration_minutes")
    @Min(value = 1, message = "{validation.coaching.duration.min}")
    private Integer durationMinutes;

    @JsonAlias("order_index")
    private Integer orderIndex;

    public TrainingPlanItemCreateDto() {}

    public TrainingPlanItemCreateDto(Integer dayOfWeek, String exerciseName, String description,
                                     Integer sets, Integer reps, Integer durationMinutes, Integer orderIndex) {
        this.dayOfWeek = dayOfWeek;
        this.exerciseName = exerciseName;
        this.description = description;
        this.sets = sets;
        this.reps = reps;
        this.durationMinutes = durationMinutes;
        this.orderIndex = orderIndex;
    }

    public Integer getDayOfWeek() { return dayOfWeek; }
    public void setDayOfWeek(Integer dayOfWeek) { this.dayOfWeek = dayOfWeek; }
    public String getExerciseName() { return exerciseName; }
    public void setExerciseName(String exerciseName) { this.exerciseName = exerciseName; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getRestSeconds() { return restSeconds; }
    public void setRestSeconds(Integer restSeconds) { this.restSeconds = restSeconds; }
    public Integer getSets() { return sets; }
    public void setSets(Integer sets) { this.sets = sets; }
    public Integer getReps() { return reps; }
    public void setReps(Integer reps) { this.reps = reps; }
    public Integer getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(Integer durationMinutes) { this.durationMinutes = durationMinutes; }
    public Integer getOrderIndex() { return orderIndex; }
    public void setOrderIndex(Integer orderIndex) { this.orderIndex = orderIndex; }
}

