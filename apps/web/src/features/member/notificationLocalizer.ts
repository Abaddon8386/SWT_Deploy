export function localizeTitle(title?: string | null): string {
  if (!title) return '';
  const trimmed = title.trim();
  const map: Record<string, string> = {
    'Upcoming class reminder': 'Nhắc nhở lịch học sắp diễn ra',
    'Membership package expiring soon': 'Gói tập sắp hết hạn',
    'Class Session Cancelled': 'Thông báo hủy buổi học',
    'Class session cancelled': 'Thông báo hủy buổi học',
    'Support request updated': 'Cập nhật yêu cầu hỗ trợ',
    'New message in support request': 'Tin nhắn mới trong yêu cầu hỗ trợ',
    'New member complaint': 'Khiếu nại mới từ hội viên',
    'Complaint needs a manager': 'Khiếu nại cần quản lý xử lý',
    'Your complaint is with a manager': 'Khiếu nại đang được quản lý xem xét',
    'Class enrollment successful': 'Đăng ký lớp học thành công',
    'Class enrollment cancelled': 'Hủy đăng ký lớp học',
    'Class session booked': 'Đặt chỗ buổi học thành công',
    'Bulk booking successful': 'Đặt lịch hàng loạt thành công',
    'Class session booking cancelled': 'Đã hủy chỗ buổi học',
    'Several class sessions cancelled': 'Đã hủy nhiều buổi học',
    'New PT booking': 'Lịch dạy PT 1:1 mới',
    'PT session booked': 'Đặt lịch HLV 1:1 thành công',
    'PT session cancelled': 'Hủy lịch dạy PT 1:1',
    'New member review': 'Đánh giá mới từ học viên',
    'New progress evaluation': 'Đánh giá tiến độ mới',
    'VNPay payment successful': 'Thanh toán VNPay thành công',
    'New internal request awaiting review': 'Đơn từ nội bộ mới cần duyệt',
    'Your request was approved': 'Đơn từ của bạn đã được duyệt',
    'Your request was rejected': 'Đơn từ của bạn bị từ chối',
    'Membership hold request approved': 'Yêu cầu bảo lưu gói tập đã được xác nhận',
    'Membership hold request rejected': 'Yêu cầu bảo lưu gói tập không được duyệt',
    'Membership resumed after hold': 'Gói tập đã tự mở lại sau bảo lưu',
    'Booking released by membership': 'Lịch đã được hủy do gói tập',
  };
  return map[trimmed] ?? title;
}

export function localizeMessage(message?: string | null): string {
  if (!message) return '';

  const classReminderMatch = message.match(/^Your class "([^"]+)" is starting at ([0-9:]+) on ([0-9/-]+)\. Get ready!$/i);
  if (classReminderMatch) {
    return `Lớp học "${classReminderMatch[1]}" của bạn sẽ bắt đầu lúc ${classReminderMatch[2]} ngày ${classReminderMatch[3]}. Hãy chuẩn bị sẵn sàng!`;
  }

  const pkgExpiryMatch1 = message.match(/^Your membership package "([^"]+)" will expire on ([0-9/-]+)(?: \(in (\d+) days\))?\. Please renew to continue using our services\.$/i);
  if (pkgExpiryMatch1) {
    return `Gói tập "${pkgExpiryMatch1[1]}" của bạn sẽ hết hạn vào ngày ${pkgExpiryMatch1[2]}. Vui lòng gia hạn để tiếp tục sử dụng dịch vụ.`;
  }

  const pkgExpiryMatch2 = message.match(/^Your membership package (.+?) will expire in (\d+) day\(s\) \(([^)]+)\)\. Please renew to avoid workout interruption\.$/i);
  if (pkgExpiryMatch2) {
    return `Gói tập ${pkgExpiryMatch2[1]} của bạn sẽ hết hạn sau ${pkgExpiryMatch2[2]} ngày (${pkgExpiryMatch2[3]}). Vui lòng gia hạn để không gián đoạn tập luyện.`;
  }

  const supportStatusMatch = message.match(/^Your support request "([^"]+)" has been updated to status ([^.]+)\.$/i);
  if (supportStatusMatch) {
    return `Yêu cầu hỗ trợ "${supportStatusMatch[1]}" của bạn đã chuyển sang trạng thái ${supportStatusMatch[2]}.`;
  }

  const supportMsgMatch = message.match(/^You have a new message from (.+?) in support request "([^"]+)"\.$/i);
  if (supportMsgMatch) {
    return `Bạn có tin nhắn mới từ ${supportMsgMatch[1]} trong yêu cầu "${supportMsgMatch[2]}".`;
  }

  const enrolledMatch = message.match(/^You have enrolled in class (.+?) on ([0-9/-]+)$/i);
  if (enrolledMatch) {
    return `Bạn đã đăng ký tham gia lớp ${enrolledMatch[1]} vào ngày ${enrolledMatch[2]}`;
  }

  const sessionBookedMatch = message.match(/^You booked class (.+?) on ([0-9/-]+) \(([^)]+)\)\.$/i);
  if (sessionBookedMatch) {
    return `Bạn đã đặt chỗ lớp ${sessionBookedMatch[1]} ngày ${sessionBookedMatch[2]} (${sessionBookedMatch[3]}).`;
  }

  const bulkBookedMatch = message.match(/^You booked (\d+) class sessions\.$/i);
  if (bulkBookedMatch) {
    return `Bạn đã đặt chỗ ${bulkBookedMatch[1]} buổi học.`;
  }

  const sessionCancelledMatch = message.match(/^Your seat in class (.+?) on ([0-9/-]+) was cancelled\.$/i);
  if (sessionCancelledMatch) {
    return `Chỗ của bạn ở lớp ${sessionCancelledMatch[1]} ngày ${sessionCancelledMatch[2]} đã được hủy.`;
  }

  const bulkCancelledMatch = message.match(/^(\d+) of your class sessions were cancelled\.$/i);
  if (bulkCancelledMatch) {
    return `${bulkCancelledMatch[1]} buổi học của bạn đã được hủy.`;
  }

  const ptCoachMatch = message.match(/^Member (.+?) booked a PT session on ([0-9/-]+) \(([^ ]+) - ([^)]+)\)\.$/i);
  if (ptCoachMatch) {
    return `Hội viên ${ptCoachMatch[1]} đã đặt lịch tập 1:1 ngày ${ptCoachMatch[2]} (${ptCoachMatch[3]} - ${ptCoachMatch[4]}).`;
  }

  const ptMemberMatch = message.match(/^You booked a PT session with (.+?) on ([0-9/-]+) \(([^ ]+) - ([^)]+)\)\.$/i);
  if (ptMemberMatch) {
    return `Bạn đã đặt lịch tập 1:1 với HLV ${ptMemberMatch[1]} ngày ${ptMemberMatch[2]} (${ptMemberMatch[3]} - ${ptMemberMatch[4]}).`;
  }

  const ptCancelledMatch = message.match(/^Member (.+?) cancelled the PT session on ([0-9/-]+) \(([^ ]+) - ([^)]+)\)\.$/i);
  if (ptCancelledMatch) {
    return `Hội viên ${ptCancelledMatch[1]} đã hủy lịch tập 1:1 ngày ${ptCancelledMatch[2]} (${ptCancelledMatch[3]} - ${ptCancelledMatch[4]}).`;
  }

  const reviewMatch = message.match(/^(.+) submitted a (\d+)-star review for you\.$/i);
  if (reviewMatch) {
    return `${reviewMatch[1]} đã gửi đánh giá ${reviewMatch[2]} sao kèm nhận xét cho bạn.`;
  }

  const vnpayMatch = message.match(/^Received ([0-9,.]+) VND for transaction (.+)\.$/i);
  if (vnpayMatch) {
    return `Đã nhận ${vnpayMatch[1]} VND cho giao dịch ${vnpayMatch[2]}.`;
  }

  if (message.toLowerCase() === 'your class enrollment has been cancelled successfully') {
    return 'Lượt đăng ký lớp học của bạn đã được hủy thành công';
  }

  if (message.toLowerCase() === 'your coach has sent a progress evaluation. open it to view your score and feedback.') {
    return 'Huấn luyện viên đã gửi đánh giá tiến độ. Mở để xem điểm và nhận xét của bạn.';
  }

  return message;
}

