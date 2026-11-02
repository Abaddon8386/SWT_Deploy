package com.swp391.scms.coaching;

import com.swp391.scms.coaching.dto.CoachLeaderboardItemDto;
import com.swp391.scms.coaching.dto.CoachMonthlyReviewDto;
import com.swp391.scms.coaching.dto.CoachMonthlyReviewUpdateDto;
import com.swp391.scms.coaching.entity.CoachMonthlyReview;
import com.swp391.scms.coaching.service.CoachLeaderboardService;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Coach Leaderboard & Monthly Reviews", description = "Bảng xếp hạng và đánh giá tháng Huấn luyện viên (SCRUM-134)")
@RestController
@RequestMapping("/api/v1/coaching")
public class CoachLeaderboardController {

    private final CoachLeaderboardService leaderboardService;
    private final MessageService messageService;

    public CoachLeaderboardController(CoachLeaderboardService leaderboardService) {
        this(leaderboardService, null);
    }

    @Autowired
    public CoachLeaderboardController(CoachLeaderboardService leaderboardService, MessageService messageService) {
        this.leaderboardService = leaderboardService;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "Xem Bảng xếp hạng Huấn luyện viên tháng", description = "Lấy danh sách Top Rank Huấn luyện viên trong tháng (SCRUM-134)")
    @GetMapping("/leaderboard")
    public ApiResponse<List<CoachLeaderboardItemDto>> getLeaderboard(
            @RequestParam(name = "year", required = false) Integer year,
            @RequestParam(name = "month", required = false) Integer month) {
        List<CoachLeaderboardItemDto> leaderboard = leaderboardService.getLeaderboard(year, month);
        return ApiResponse.ok(msg("coaching.leaderboard.success"), leaderboard);
    }

    @Operation(summary = "Quản lý xem danh sách tổng kết tháng", description = "Quản lý xem bản đánh giá tháng của tất cả HLV")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    @GetMapping("/monthly-reviews")
    public ApiResponse<List<CoachMonthlyReviewDto>> getAllMonthlyReviews(
            @RequestParam(name = "year", required = false) Integer year,
            @RequestParam(name = "month", required = false) Integer month) {
        List<CoachMonthlyReviewDto> list = leaderboardService.getAllMonthlyReviewsForPeriod(year, month);
        return ApiResponse.ok(msg("coaching.monthly_review.list.success"), list);
    }

    @Operation(summary = "Tổng hợp đánh giá tháng cho HLV", description = "Quản lý bấm tổng hợp đánh giá và tự động tính điểm trung bình, xếp hạng tháng")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    @PostMapping("/monthly-reviews/generate")
    public ApiResponse<List<CoachMonthlyReviewDto>> generateMonthlyReviews(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @RequestParam("year") int year,
            @RequestParam("month") int month) {
        List<CoachMonthlyReview> reviews = leaderboardService.generateMonthlyReviews(year, month, principal.id());
        List<CoachMonthlyReviewDto> dtos = leaderboardService.getAllMonthlyReviewsForPeriod(year, month);
        return ApiResponse.ok(msg("coaching.monthly_review.generate.success"), dtos);
    }

    @Operation(summary = "Cập nhật đánh giá, danh hiệu và thưởng tháng", description = "Quản lý gửi nhận xét tổng kết, trao danh hiệu và mức thưởng cho Coach")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    @PutMapping("/monthly-reviews/{id}")
    public ApiResponse<CoachMonthlyReviewDto> updateMonthlyReview(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @PathVariable("id") Long id,
            @Valid @RequestBody CoachMonthlyReviewUpdateDto request) {
        CoachMonthlyReviewDto updated = leaderboardService.updateMonthlyReview(id, request, principal.id());
        return ApiResponse.ok(msg("coaching.monthly_review.update.success"), updated);
    }

    @Operation(summary = "Huấn luyện viên xem bản đánh giá tháng của tôi", description = "HLV xem nhận xét tổng hợp, danh hiệu và mức thưởng từ Manager")
    @PreAuthorize("hasRole('COACH')")
    @GetMapping("/monthly-reviews/my")
    public ApiResponse<List<CoachMonthlyReviewDto>> getMyMonthlyReviews(
            @AuthenticationPrincipal AuthenticatedPrincipal principal) {
        List<CoachMonthlyReviewDto> myReviews = leaderboardService.getCoachMyReviews(principal.id());
        return ApiResponse.ok(msg("coaching.monthly_review.my.success"), myReviews);
    }
}

