package com.swp391.scms.coaching.service;

import com.swp391.scms.coaching.dto.CoachLeaderboardItemDto;
import com.swp391.scms.coaching.dto.CoachMonthlyReviewDto;
import com.swp391.scms.coaching.dto.CoachMonthlyReviewUpdateDto;
import com.swp391.scms.coaching.entity.CoachBooking;
import com.swp391.scms.coaching.entity.CoachMonthlyReview;
import com.swp391.scms.coaching.repository.CoachBookingRepository;
import com.swp391.scms.coaching.repository.CoachMonthlyReviewRepository;
import com.swp391.scms.coaching.repository.CoachReviewRepository;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.notifications.NotificationService;
import com.swp391.scms.scheduling.entity.ClassSession;
import com.swp391.scms.scheduling.repository.ClassSessionRepository;
import com.swp391.scms.users.CoachRepository;
import com.swp391.scms.users.UserRepository;
import com.swp391.scms.users.entity.Coach;
import com.swp391.scms.users.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import com.swp391.scms.common.i18n.MessageService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class CoachLeaderboardService {

    private final CoachMonthlyReviewRepository monthlyReviewRepository;
    private final CoachReviewRepository reviewRepository;
    private final CoachRepository coachRepository;
    private final CoachBookingRepository coachBookingRepository;
    private final ClassSessionRepository classSessionRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final MessageService messageService;

    public CoachLeaderboardService(CoachMonthlyReviewRepository monthlyReviewRepository,
                                  CoachReviewRepository reviewRepository,
                                  CoachRepository coachRepository,
                                  CoachBookingRepository coachBookingRepository,
                                  ClassSessionRepository classSessionRepository,
                                  UserRepository userRepository) {
        this(monthlyReviewRepository, reviewRepository, coachRepository, coachBookingRepository, classSessionRepository, userRepository, null);
    }

    public CoachLeaderboardService(CoachMonthlyReviewRepository monthlyReviewRepository,
                                  CoachReviewRepository reviewRepository,
                                  CoachRepository coachRepository,
                                  CoachBookingRepository coachBookingRepository,
                                  ClassSessionRepository classSessionRepository,
                                  UserRepository userRepository,
                                  NotificationService notificationService) {
        this(monthlyReviewRepository, reviewRepository, coachRepository, coachBookingRepository, classSessionRepository, userRepository, notificationService, null);
    }

    @Autowired
    public CoachLeaderboardService(CoachMonthlyReviewRepository monthlyReviewRepository,
                                  CoachReviewRepository reviewRepository,
                                  CoachRepository coachRepository,
                                  CoachBookingRepository coachBookingRepository,
                                  ClassSessionRepository classSessionRepository,
                                  UserRepository userRepository,
                                  @Autowired(required = false) NotificationService notificationService, MessageService messageService) {
        this.monthlyReviewRepository = monthlyReviewRepository;
        this.reviewRepository = reviewRepository;
        this.coachRepository = coachRepository;
        this.coachBookingRepository = coachBookingRepository;
        this.classSessionRepository = classSessionRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.messageService = messageService;
    }

    @Transactional(readOnly = true)
    public List<CoachLeaderboardItemDto> getLeaderboard(Integer year, Integer month) {
        LocalDate now = LocalDate.now();
        int targetYear = (year != null && year > 2000) ? year : now.getYear();
        int targetMonth = (month != null && month >= 1 && month <= 12) ? month : now.getMonthValue();

        List<CoachMonthlyReview> reviews = monthlyReviewRepository.findLeaderboardByPeriod(targetYear, targetMonth);

        return reviews.stream()
                .map(this::mapToLeaderboardDto)
                .toList();
    }

    @Transactional
    public List<CoachMonthlyReview> generateMonthlyReviews(int year, int month, Long managerUserId) {
        User manager = managerUserId != null ? userRepository.findById(managerUserId).orElse(null) : null;
        List<Coach> coaches = coachRepository.findPublicCoaches();

        LocalDate firstDay = LocalDate.of(year, month, 1);
        LocalDate lastDay = firstDay.withDayOfMonth(firstDay.lengthOfMonth());
        LocalDateTime startPeriod = LocalDateTime.of(firstDay, LocalTime.MIN);
        LocalDateTime endPeriod = LocalDateTime.of(lastDay, LocalTime.MAX);

        List<CoachMonthlyReview> results = new ArrayList<>();

        for (Coach coach : coaches) {
            Double avgRating = reviewRepository.getAverageRatingForPeriod(coach.getUserId(), startPeriod, endPeriod);
            long totalReviews = reviewRepository.countReviewsForPeriod(coach.getUserId(), startPeriod, endPeriod);

            // Count sessions taught in month (1:1 + Group Class Sessions)
            List<CoachBooking> ptBookings = coachBookingRepository.findByCoachId(coach.getUserId()).stream()
                    .filter(b -> !b.getBookingDate().isBefore(firstDay) && !b.getBookingDate().isAfter(lastDay) && !"cancelled".equalsIgnoreCase(b.getStatus()))
                    .toList();

            List<ClassSession> groupSessions = classSessionRepository.findByCoachId(coach.getUserId()).stream()
                    .filter(s -> !s.getSessionDate().isBefore(firstDay) && !s.getSessionDate().isAfter(lastDay) && !"cancelled".equalsIgnoreCase(s.getStatus()))
                    .toList();

            int totalSessions = ptBookings.size() + groupSessions.size();

            CoachMonthlyReview review = monthlyReviewRepository.findByCoachIdAndPeriod(coach.getUserId(), year, month)
                    .orElseGet(() -> {
                        CoachMonthlyReview r = new CoachMonthlyReview();
                        r.setCoach(coach);
                        r.setYear(year);
                        r.setMonth(month);
                        return r;
                    });

            review.setManager(manager);
            BigDecimal avg = (avgRating != null && totalReviews > 0)
                    ? BigDecimal.valueOf(avgRating).setScale(2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
            review.setAverageRating(avg);
            review.setTotalReviews((int) totalReviews);
            review.setTotalSessions(totalSessions);
            review.setStatus("published");

            results.add(review);
        }

        // Sort coaches with reviews (totalReviews > 0) before coaches with 0 reviews,
        // then descending by averageRating, then totalSessions, then totalReviews
        results.sort(Comparator.comparing((CoachMonthlyReview r) -> r.getTotalReviews() != null && r.getTotalReviews() > 0).reversed()
                .thenComparing(Comparator.comparing(CoachMonthlyReview::getAverageRating).reversed())
                .thenComparing(Comparator.comparing(CoachMonthlyReview::getTotalSessions).reversed())
                .thenComparing(Comparator.comparing(CoachMonthlyReview::getTotalReviews).reversed()));

        // Assign rankings and default badges
        for (int i = 0; i < results.size(); i++) {
            CoachMonthlyReview r = results.get(i);
            int rank = i + 1;
            r.setRankPosition(rank);

            if (r.getBadge() == null || r.getBadge().isBlank() || isDefaultBadge(r.getBadge())) {
                if (rank == 1) {
                    r.setBadge("Top 1: Coach of the Month 🏆");
                    r.setBonusAmount(new BigDecimal("2000000.00"));
                } else if (rank == 2) {
                    r.setBadge("Top 2: HLV Xuất Sắc 🥈");
                    r.setBonusAmount(new BigDecimal("1000000.00"));
                } else if (rank == 3) {
                    r.setBadge("Top 3: Ngôi Sao Tận Tâm 🥉");
                    r.setBonusAmount(new BigDecimal("500000.00"));
                } else {
                    r.setBadge("HLV Năng Động ⭐");
                    r.setBonusAmount(BigDecimal.ZERO);
                }
            }

            if (r.getManagerFeedback() == null || r.getManagerFeedback().isBlank() || isDefaultFeedback(r.getManagerFeedback())) {
                if (r.getTotalReviews() != null && r.getTotalReviews() > 0) {
                    r.setManagerFeedback(String.format("Duy trì phong độ huấn luyện tốt trong tháng %d/%d với %d buổi dạy và mức hài lòng %.1f sao.",
                            month, year, r.getTotalSessions(), r.getAverageRating()));
                } else {
                    r.setManagerFeedback(String.format("Duy trì lịch huấn luyện trong tháng %d/%d với %d buổi dạy (chưa có lượt đánh giá từ hội viên).",
                            month, year, r.getTotalSessions()));
                }
            }

            monthlyReviewRepository.save(r);
        }

        return results;
    }

    private static boolean isDefaultBadge(String badge) {
        return "Top 1: Coach of the Month 🏆".equals(badge)
                || "Top 2: HLV Xuất Sắc 🥈".equals(badge)
                || "Top 3: Ngôi Sao Tận Tâm 🥉".equals(badge)
                || "HLV Năng Động ⭐".equals(badge);
    }

    private static boolean isDefaultFeedback(String feedback) {
        return feedback != null && (feedback.startsWith("Duy trì phong độ huấn luyện tốt trong tháng ")
                || feedback.startsWith("Duy trì lịch huấn luyện trong tháng "));
    }

    @Transactional
    public CoachMonthlyReviewDto updateMonthlyReview(Long id, CoachMonthlyReviewUpdateDto updateDto, Long managerUserId) {
        CoachMonthlyReview review = monthlyReviewRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.coach_monthly_review", id));

        if (managerUserId != null) {
            userRepository.findById(managerUserId).ifPresent(review::setManager);
        }

        if (updateDto.rankPosition() != null) review.setRankPosition(updateDto.rankPosition());
        if (updateDto.badge() != null) review.setBadge(updateDto.badge().trim());
        if (updateDto.bonusAmount() != null) review.setBonusAmount(updateDto.bonusAmount());
        if (updateDto.managerFeedback() != null) review.setManagerFeedback(updateDto.managerFeedback().trim());
        if (updateDto.status() != null) review.setStatus(updateDto.status().trim());

        CoachMonthlyReview saved = monthlyReviewRepository.save(review);

        // Notify Coach if published
        if ("published".equalsIgnoreCase(saved.getStatus()) && notificationService != null) {
            String title = msg("notifications.coaching.monthly.title", saved.getMonth(), saved.getYear());
            String message = msg("notifications.coaching.monthly.body",
                    saved.getMonth(), saved.getYear(), saved.getRankPosition(), saved.getBadge(), saved.getBonusAmount());
            notificationService.send(saved.getCoach().getUserId(), title, message, "system", null, saved.getId());
        }

        return mapToDto(saved);
    }

    @Transactional(readOnly = true)
    public List<CoachMonthlyReviewDto> getAllMonthlyReviewsForPeriod(Integer year, Integer month) {
        LocalDate now = LocalDate.now();
        int targetYear = (year != null && year > 2000) ? year : now.getYear();
        int targetMonth = (month != null && month >= 1 && month <= 12) ? month : now.getMonthValue();

        return monthlyReviewRepository.findAllByPeriod(targetYear, targetMonth).stream()
                .map(this::mapToDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CoachMonthlyReviewDto> getCoachMyReviews(Long coachUserId) {
        return monthlyReviewRepository.findByCoachIdPublished(coachUserId).stream()
                .map(this::mapToDto)
                .toList();
    }

    private CoachLeaderboardItemDto mapToLeaderboardDto(CoachMonthlyReview r) {
        String coachName = r.getCoach().getUser() != null ? r.getCoach().getUser().getFullName() : "Huấn luyện viên";
        String avatar = r.getCoach().getUser() != null ? r.getCoach().getUser().getAvatarUrl() : null;

        return new CoachLeaderboardItemDto(
                r.getRankPosition(),
                r.getCoach().getUserId(),
                coachName,
                r.getCoach().getSpecialization(),
                avatar,
                r.getAverageRating(),
                r.getTotalReviews(),
                r.getTotalSessions(),
                r.getBadge(),
                r.getBonusAmount(),
                r.getManagerFeedback()
        );
    }

    private CoachMonthlyReviewDto mapToDto(CoachMonthlyReview r) {
        String coachName = r.getCoach().getUser() != null ? r.getCoach().getUser().getFullName() : "Huấn luyện viên";
        String avatar = r.getCoach().getUser() != null ? r.getCoach().getUser().getAvatarUrl() : null;

        return new CoachMonthlyReviewDto(
                r.getId(),
                r.getCoach().getUserId(),
                coachName,
                r.getCoach().getSpecialization(),
                avatar,
                r.getYear(),
                r.getMonth(),
                r.getAverageRating(),
                r.getTotalReviews(),
                r.getTotalSessions(),
                r.getRankPosition(),
                r.getBadge(),
                r.getBonusAmount(),
                r.getManagerFeedback(),
                r.getStatus(),
                r.getCreatedAt(),
                r.getUpdatedAt()
        );
    }
    private String msg(String key, Object... args) {
        return messageService != null ? messageService.getMessage(key, args) : key;
    }
}

