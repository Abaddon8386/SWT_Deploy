package com.swp391.scms.coaching;
import com.swp391.scms.coaching.service.TrainingPlanProgressService;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;
@RestController
@RequestMapping("/api/v1/coaching/training-plans")
public class TrainingPlanProgressController {
 private final TrainingPlanProgressService service; private final MessageService messages;
 public TrainingPlanProgressController(TrainingPlanProgressService service){this(service,null);}
 @org.springframework.beans.factory.annotation.Autowired
 public TrainingPlanProgressController(TrainingPlanProgressService service,MessageService messages){this.service=service;this.messages=messages;}
 @GetMapping("/{id}/completions")
 @PreAuthorize("hasAnyRole('COACH','CENTER_MANAGER')")
 public ApiResponse<TrainingPlanProgressService.PlanProgress> get(@PathVariable Long id,
  @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate exerciseDate,
  @AuthenticationPrincipal AuthenticatedPrincipal principal){
  return ApiResponse.ok(messages!=null?messages.getMessage("coaching.progress.loaded"):"coaching.progress.loaded",
   service.get(id,exerciseDate,principal.id(),principal.role()));
 }
}
