package com.swp391.scms.coaching.dto;

public class TrainingPlanItemDto {

    private Long id;
    private Long trainingPlanId;
    private Integer dayOfWeek;
    private String exerciseName;
    private String description;
    private Integer restSeconds;

    private Integer sets;
    private Integer reps;
    private Integer durationMinutes;
    private int orderIndex;

    public TrainingPlanItemDto() {}

    public TrainingPlanItemDto(Long id, Long trainingPlanId, Integer dayOfWeek, String exerciseName,
                               String description, Integer sets, Integer reps, Integer durationMinutes, int orderIndex) {
        this.id = id;
        this.trainingPlanId = trainingPlanId;
        this.dayOfWeek = dayOfWeek;
        this.exerciseName = exerciseName;
        this.description = description;
        this.sets = sets;
        this.reps = reps;
        this.durationMinutes = durationMinutes;
        this.orderIndex = orderIndex;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getTrainingPlanId() { return trainingPlanId; }
    public void setTrainingPlanId(Long trainingPlanId) { this.trainingPlanId = trainingPlanId; }
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
    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}

