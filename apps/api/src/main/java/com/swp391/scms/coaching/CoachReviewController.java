package com.swp391.scms.coaching;

import com.swp391.scms.coaching.dto.CoachReviewCreateDto;
import com.swp391.scms.coaching.dto.CoachReviewDto;
import com.swp391.scms.coaching.service.CoachReviewService;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Coach Reviews", description = "Hội viên đánh giá Huấn luyện viên (SCRUM-134)")
@RestController
@RequestMapping("/api/v1/coaching/reviews")
public class CoachReviewController {

    private final CoachReviewService reviewService;
    private final MessageService messageService;

    public CoachReviewController(CoachReviewService reviewService) {
        this(reviewService, null);
    }

    @Autowired
    public CoachReviewController(CoachReviewService reviewService, MessageService messageService) {
        this.reviewService = reviewService;
        this.messageService = messageService;
    }

    private String msg(String key) {
        return messageService != null ? messageService.getMessage(key) : key;
    }

    @Operation(summary = "Hội viên đánh giá Huấn luyện viên", description = "Gửi số sao (1-5) và nhận xét cho HLV sau khóa/buổi tập (SCRUM-134)")
    @PreAuthorize("hasRole('MEMBER')")
    @PostMapping
    public ResponseEntity<ApiResponse<CoachReviewDto>> createReview(
            @AuthenticationPrincipal AuthenticatedPrincipal principal,
            @Valid @RequestBody CoachReviewCreateDto request) {
        CoachReviewDto created = reviewService.createReview(principal.id(), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(msg("coaching.review.create.success"), created));
    }

    @Operation(summary = "Xem danh sách đánh giá của Huấn luyện viên", description = "Xem các đánh giá đã duyệt của 1 HLV cụ thể")
    @GetMapping("/coach/{coachId}")
    public ApiResponse<List<CoachReviewDto>> getCoachReviews(@PathVariable("coachId") Long coachId) {
        List<CoachReviewDto> reviews = reviewService.getApprovedReviewsForCoach(coachId);
        return ApiResponse.ok(msg("coaching.review.list.success"), reviews);
    }

    @Operation(summary = "Xem các đánh giá đã gửi của tôi", description = "Hội viên xem lại các đánh giá đã gửi cho HLV")
    @PreAuthorize("hasRole('MEMBER')")
    @GetMapping("/my")
    public ApiResponse<List<CoachReviewDto>> getMyReviews(@AuthenticationPrincipal AuthenticatedPrincipal principal) {
        List<CoachReviewDto> reviews = reviewService.getMyReviews(principal.id());
        return ApiResponse.ok(msg("coaching.review.my.success"), reviews);
    }
}

