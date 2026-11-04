package com.swp391.scms.reports.dto;

public record ClassUtilizationDto(
        Long classId,
        String className,
        Long disciplineId,
        String disciplineName,
        String roomName,
        Integer capacity,
        Long enrolledCount,
        Long presentCount,
        Double utilizationRate,
        Double attendanceRate
) {
    public ClassUtilizationDto(
            Long classId,
            String className,
            Long disciplineId,
            String disciplineName,
            Integer capacity,
            Long enrolledCount,
            Long presentCount,
            Double utilizationRate,
            Double attendanceRate
    ) {
        this(classId, className, disciplineId, disciplineName, null, capacity, enrolledCount, presentCount, utilizationRate, attendanceRate);
    }
}
