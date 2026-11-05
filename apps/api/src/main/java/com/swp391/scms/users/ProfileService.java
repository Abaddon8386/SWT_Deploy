package com.swp391.scms.users;

import com.swp391.scms.audit.Audited;
import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ForbiddenException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.users.dto.CoachProfileUpdateDto;
import com.swp391.scms.users.dto.ProfileDto;
import com.swp391.scms.users.dto.ReceptionistProfileUpdateDto;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.Member;
import com.swp391.scms.users.entity.Receptionist;
import com.swp391.scms.users.entity.User;
import java.util.Base64;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileService {

    private static final int MAX_AVATAR_BYTES = 2 * 1024 * 1024;
    private static final List<String> ALLOWED_DATA_URL_PREFIXES = List.of(
            "data:image/jpeg;base64,",
            "data:image/png;base64,",
            "data:image/webp;base64,"
    );

    private final UserRepository userRepository;
    private final MemberRepository memberRepository;
    private final CoachRepository coachRepository;
    private final ReceptionistRepository receptionistRepository;

    public ProfileService(UserRepository userRepository, MemberRepository memberRepository,
                          CoachRepository coachRepository, ReceptionistRepository receptionistRepository) {
        this.userRepository = userRepository;
        this.memberRepository = memberRepository;
        this.coachRepository = coachRepository;
        this.receptionistRepository = receptionistRepository;
    }

    @Transactional(readOnly = true)
    public ProfileDto getProfile(Long userId) {
        User user = findActiveUser(userId);
        Member member = memberRepository.findById(userId).orElse(null);
        Coach coach = coachRepository.findById(userId).orElse(null);
        Receptionist receptionist = receptionistRepository.findById(userId).orElse(null);
        return toDto(user, member, coach, receptionist);
    }

    @Transactional
    @Audited(action = "PROFILE_UPDATE", entity = "users")
    public ProfileDto updateProfile(Long userId, ProfileDto request) {
        User user = findActiveUser(userId);
        validateAvatarUrl(request.avatarUrl());

        user.setFullName(request.fullName());
        if (request.phone() != null) {
            String phone = request.phone().isBlank() ? null : request.phone().trim();
            if (phone != null) {
                userRepository.findByPhone(phone)
                        .filter(existing -> !existing.getId().equals(userId))
                        .ifPresent(existing -> { throw new ConflictException("PHONE_EXISTS", "users.phone_exists", null, null); });
            }
            user.setPhone(phone);
        }
        user.setDob(request.dob());
        String gender = request.gender() == null || request.gender().isBlank()
                ? null
                : request.gender().trim().toLowerCase(java.util.Locale.ROOT);
        if (gender != null && !List.of("male", "female", "other").contains(gender)) {
            throw new BadRequestException("INVALID_GENDER", "validation.users.gender.invalid", null, null);
        }
        user.setGender(gender);
        user.setAvatarUrl(request.avatarUrl() == null || request.avatarUrl().isBlank() ? User.DEFAULT_AVATAR_URL : request.avatarUrl().trim());
        user.setAddress(request.address());

        Member member = memberRepository.findById(userId).orElse(null);
        if (member != null) {
            member.setHealthNotes(request.healthNotes());
            member.setFitnessGoal(request.fitnessGoal());
            if (request.fitnessLevel() != null && !request.fitnessLevel().isBlank()) {
                String level = request.fitnessLevel().trim().toLowerCase(java.util.Locale.ROOT);
                if (!List.of("beginner", "intermediate", "advanced").contains(level)) {
                    throw new BadRequestException("INVALID_FITNESS_LEVEL", "validation.users.fitness_level.invalid", null, null);
                }
                member.setFitnessLevel(level);
            }
            member.setEmergencyContactName(request.emergencyContactName());
            member.setEmergencyContactPhone(request.emergencyContactPhone());
        }

        String roleCode = user.getRole() != null ? user.getRole().getCode() : null;
        Coach coach = coachRepository.findById(userId).orElse(null);
        if ("COACH".equals(roleCode) && (request.specialization() != null || request.bio() != null || request.certification() != null)) {
            if (coach == null) {
                coach = new Coach();
                coach.setUser(user);
            }
            if (request.specialization() != null) coach.setSpecialization(request.specialization());
            if (request.bio() != null) coach.setBio(request.bio());
            if (request.certification() != null) coach.setCertification(request.certification());
            coach = coachRepository.save(coach);
        }

        Receptionist receptionist = receptionistRepository.findById(userId).orElse(null);
        if ("RECEPTIONIST".equals(roleCode) && request.shift() != null) {
            if (receptionist == null) {
                receptionist = new Receptionist();
                receptionist.setUser(user);
            }
            receptionist.setShift(request.shift());
            receptionist = receptionistRepository.save(receptionist);
        }

        return toDto(user, member, coach, receptionist);
    }

    @Transactional
    @Audited(action = "PROFILE_AVATAR_UPDATE", entity = "users")
    public ProfileDto updateAvatar(Long userId, String avatarUrl) {
        User user = findActiveUser(userId);
        validateAvatarUrl(avatarUrl);
        user.setAvatarUrl(avatarUrl == null || avatarUrl.isBlank() ? User.DEFAULT_AVATAR_URL : avatarUrl.trim());
        Member member = memberRepository.findById(userId).orElse(null);
        Coach coach = coachRepository.findById(userId).orElse(null);
        Receptionist receptionist = receptionistRepository.findById(userId).orElse(null);
        return toDto(user, member, coach, receptionist);
    }

    public void validateAvatarUrl(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) {
            return;
        }
        String trimmed = avatarUrl.trim();
        if (trimmed.startsWith("data:")) {
            String matchedPrefix = ALLOWED_DATA_URL_PREFIXES.stream()
                    .filter(trimmed::startsWith)
                    .findFirst()
                    .orElseThrow(() -> new BadRequestException(
                            "INVALID_AVATAR_FORMAT",
                            "error.profile.avatar.invalid_format",
                            null,
                            "Ảnh đại diện chỉ hỗ trợ định dạng image/jpeg, image/png hoặc image/webp."
                    ));
            String base64Payload = trimmed.substring(matchedPrefix.length()).replaceAll("\\s+", "");
            if (base64Payload.isEmpty()) {
                throw new BadRequestException("INVALID_AVATAR_DATA", "error.profile.avatar.invalid_data", null, "Dữ liệu ảnh đại diện không hợp lệ.");
            }
            byte[] decoded;
            try {
                decoded = Base64.getDecoder().decode(base64Payload);
            } catch (IllegalArgumentException ex) {
                throw new BadRequestException("INVALID_AVATAR_DATA", "error.profile.avatar.invalid_base64", null, "Dữ liệu base64 của ảnh đại diện không hợp lệ.");
            }
            if (decoded.length == 0 || decoded.length > MAX_AVATAR_BYTES) {
                throw new BadRequestException(
                        "AVATAR_TOO_LARGE",
                        "error.profile.avatar.too_large",
                        null,
                        "Dung lượng ảnh đại diện không được vượt quá 2MB."
                );
            }
        } else if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("/")) {
            throw new BadRequestException(
                    "INVALID_AVATAR_URL",
                    "error.profile.avatar.invalid_url",
                    null,
                    "Đường dẫn ảnh đại diện không hợp lệ."
            );
        }
    }

    @Transactional
    @Audited(action = "COACH_PROFILE_UPDATE", entity = "coaches")
    public void updateCoachProfile(Long currentUserId, String currentUserRole, CoachProfileUpdateDto request) {
        if (!"COACH".equals(currentUserRole)) {
            throw new ForbiddenException("FORBIDDEN", "users.forbidden.not_coach", null, null);
        }

        User user = findActiveUser(currentUserId);
        Coach coach = coachRepository.findById(currentUserId).orElseGet(() -> {
            Coach newCoach = new Coach();
            newCoach.setUser(user);
            return newCoach;
        });

        coach.setSpecialization(request.specialization());
        coach.setBio(request.bio());
        coach.setCertification(request.certification());
        coachRepository.save(coach);
    }

    @Transactional
    @Audited(action = "RECEPTIONIST_PROFILE_UPDATE", entity = "receptionists")
    public void updateReceptionistProfile(Long currentUserId, String currentUserRole, ReceptionistProfileUpdateDto request) {
        if (!"RECEPTIONIST".equals(currentUserRole)) {
            throw new ForbiddenException("FORBIDDEN", "users.forbidden.invalid_role", null, null);
        }

        User user = findActiveUser(currentUserId);
        Receptionist receptionist = receptionistRepository.findById(currentUserId).orElseGet(() -> {
            Receptionist newReceptionist = new Receptionist();
            newReceptionist.setUser(user);
            return newReceptionist;
        });

        receptionist.setShift(request.shift());
        receptionistRepository.save(receptionist);
    }

    private User findActiveUser(Long userId) {
        return userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.user", userId));
    }

    private static final java.util.regex.Pattern CCCD_PATTERN = java.util.regex.Pattern.compile("^(\\d{9}|\\d{12})$");
    private static final java.util.regex.Pattern PASSPORT_PATTERN = java.util.regex.Pattern.compile("^[A-Z0-9]{6,15}$", java.util.regex.Pattern.CASE_INSENSITIVE);

    @Transactional
    @Audited(action = "MEMBER_KYC_SUBMIT", entity = "members")
    public ProfileDto submitMemberKyc(Long userId, com.swp391.scms.users.dto.MemberKycRequest request) {
        User user = findActiveUser(userId);
        Member member = memberRepository.findById(userId).orElseGet(() -> {
            Member m = new Member();
            m.setUser(user);
            m.setMembershipCode("MEM-" + userId);
            m.setJoinDate(java.time.LocalDate.now());
            return m;
        });

        String docType = request.resolvedDocumentType();
        String citizenId = request.citizenId() != null ? request.citizenId().trim() : "";
        String fullName = request.fullName() != null ? request.fullName().trim() : "";

        if (fullName.isBlank()) {
            throw new BadRequestException("INVALID_FULL_NAME", "validation.users.full_name.not_blank", null, "Họ và tên không được để trống.");
        }

        if ("PASSPORT".equalsIgnoreCase(docType)) {
            String nationality = request.nationality() != null ? request.nationality().trim() : "";
            if (nationality.isBlank() || isVietnamese(nationality)) {
                throw new BadRequestException("TRIAL_PASSPORT_FOREIGN_ONLY", "trial.passport.foreign_only", null,
                        "Hộ chiếu chỉ áp dụng cho người nước ngoài. Công dân Việt Nam vui lòng sử dụng CCCD.");
            }
            if (!PASSPORT_PATTERN.matcher(citizenId).matches()) {
                throw new BadRequestException("TRIAL_PASSPORT_INVALID", "trial.passport.format", null,
                        "Số hộ chiếu không hợp lệ (từ 6 đến 15 ký tự chữ và số).");
            }
            member.setNationality(nationality);
        } else {
            docType = "CCCD";
            if (!CCCD_PATTERN.matcher(citizenId).matches()) {
                throw new BadRequestException("TRIAL_CCCD_INVALID", "validation.trial.cccd.format", null,
                        "Số Căn cước công dân (CCCD) phải bao gồm 9 hoặc 12 chữ số.");
            }
            if (request.backImageUrl() == null || request.backImageUrl().isBlank()) {
                throw new BadRequestException("KYC_BACK_IMAGE_REQUIRED", "validation.users.kyc.back_image.required", null,
                        "Vui lòng tải lên ảnh mặt sau của CCCD.");
            }
            member.setNationality("Việt Nam");
        }

        if (request.frontImageUrl() == null || request.frontImageUrl().isBlank()) {
            throw new BadRequestException("KYC_FRONT_IMAGE_REQUIRED", "validation.users.kyc.front_image.not_blank", null,
                    "Vui lòng tải lên ảnh mặt trước của giấy tờ.");
        }

        if (request.frontImageUrl().trim().startsWith("data:")) {
            validateAvatarUrl(request.frontImageUrl());
        }
        if (request.backImageUrl() != null && request.backImageUrl().trim().startsWith("data:")) {
            validateAvatarUrl(request.backImageUrl());
        }

        member.setDocumentType(docType);
        member.setCitizenId(citizenId);
        member.setFrontImageUrl(request.frontImageUrl().trim());
        if (request.backImageUrl() != null && !request.backImageUrl().isBlank()) {
            member.setBackImageUrl(request.backImageUrl().trim());
        }
        member.setIdentityVerified(true);
        member.setIdentityVerifiedAt(java.time.LocalDateTime.now());
        memberRepository.save(member);

        // Đồng bộ họ tên tài khoản User theo CCCD / Hộ chiếu
        user.setFullName(fullName);
        userRepository.save(user);

        Coach coach = coachRepository.findById(userId).orElse(null);
        Receptionist receptionist = receptionistRepository.findById(userId).orElse(null);
        return toDto(user, member, coach, receptionist);
    }

    private boolean isVietnamese(String nationality) {
        String lower = nationality.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("việt nam") || lower.contains("viet nam") || lower.contains("vietnam") || "vn".equals(lower);
    }

    private ProfileDto toDto(User user, Member member, Coach coach, Receptionist receptionist) {
        return new ProfileDto(
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                user.getPhone(),
                user.getDob(),
                user.getGender(),
                user.getAvatarUrl() != null && !user.getAvatarUrl().isBlank() ? user.getAvatarUrl() : User.DEFAULT_AVATAR_URL,
                user.getAddress(),
                member != null ? member.getMembershipCode() : null,
                member != null ? member.getHealthNotes() : null,
                member != null ? member.getFitnessGoal() : null,
                member != null ? member.getFitnessLevel() : null,
                member != null ? member.getEmergencyContactName() : null,
                member != null ? member.getEmergencyContactPhone() : null,
                coach != null ? coach.getSpecialization() : null,
                coach != null ? coach.getBio() : null,
                coach != null ? coach.getCertification() : null,
                receptionist != null ? receptionist.getShift() : null,
                member != null ? member.getDocumentType() : null,
                member != null ? member.getCitizenId() : null,
                member != null ? member.getNationality() : null,
                member != null ? member.getFrontImageUrl() : null,
                member != null ? member.getBackImageUrl() : null,
                member != null ? member.getIdentityVerified() : null
        );
    }
}
