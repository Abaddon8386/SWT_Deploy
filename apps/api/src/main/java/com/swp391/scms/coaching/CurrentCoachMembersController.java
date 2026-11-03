package com.swp391.scms.coaching;
import com.swp391.scms.coaching.service.CurrentCoachMembers;
import com.swp391.scms.common.ApiResponse;
import com.swp391.scms.common.i18n.MessageService;
import com.swp391.scms.security.AuthenticatedPrincipal;
import java.util.List;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
@RestController
@RequestMapping("/api/v1/coaching/members")
public class CurrentCoachMembersController {
 private final CurrentCoachMembers members; private final MessageService messages;
 public CurrentCoachMembersController(CurrentCoachMembers members,MessageService messages){this.members=members;this.messages=messages;}
 @GetMapping @PreAuthorize("hasAnyRole('COACH','CENTER_MANAGER')")
 public ApiResponse<List<CurrentCoachMembers.MemberOption>> list(@AuthenticationPrincipal AuthenticatedPrincipal principal){
  return ApiResponse.ok(messages.getMessage("coaching.members.current.loaded"),members.list(principal.id(),principal.role()));
 }
}
