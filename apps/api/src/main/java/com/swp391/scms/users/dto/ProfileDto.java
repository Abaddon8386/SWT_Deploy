package com.swp391.scms.users.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record ProfileDto(
    Long userId,
    @NotBlank(message = "{validation.users.full_name.not_blank}")
    @Size(max = 100, message = "{validation.users.full_name.size}")
    String fullName,
    @Email(message = "{validation.users.email.invalid}")
    String email,
    @Size(max = 20, message = "{validation.users.phone.size}")
    String phone,
    LocalDate dob,
    String gender,
    @Size(max = 2800000)
    String avatarUrl,
    @Size(max = 255)
    String address,
    String membershipCode,
    String healthNotes,
    @Size(max = 255)
    String fitnessGoal,
    String fitnessLevel,
    @Size(max = 100)
    String emergencyContactName,
    @Size(max = 20, message = "{validation.users.phone.size}")
    String emergencyContactPhone,
    @Size(max = 150, message = "{validation.users.coach.specialization.max}")
    String specialization,
    String bio,
    @Size(max = 255, message = "{validation.users.coach.certification.max}")
    String certification,
    @Size(max = 50, message = "{validation.users.receptionist.shift.max}")
    String shift,
    String documentType,
    String citizenId,
    String nationality,
    String frontImageUrl,
    String backImageUrl,
    Boolean identityVerified
) {
    public ProfileDto(
        Long userId,
        String fullName,
        String email,
        String phone,
        LocalDate dob,
        String gender,
        String avatarUrl,
        String address,
        String membershipCode,
        String healthNotes,
        String fitnessGoal,
        String fitnessLevel,
        String emergencyContactName,
        String emergencyContactPhone
    ) {
        this(
            userId,
            fullName,
            email,
            phone,
            dob,
            gender,
            avatarUrl,
            address,
            membershipCode,
            healthNotes,
            fitnessGoal,
            fitnessLevel,
            emergencyContactName,
            emergencyContactPhone,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null
        );
    }
}
