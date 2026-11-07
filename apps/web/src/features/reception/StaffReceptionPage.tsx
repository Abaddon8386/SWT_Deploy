import { staffLocale, useStaffI18n, type StaffMessage, staffMessage, staffError as errorMessage, staffNotify as notify } from '../operations/staffI18n';
import { CoachHealthMetrics } from '../coaching/CoachHealthMetrics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Select } from '../../shared/ui/Select';
import { Modal } from '../../shared/ui/Modal';
import { PaymentInvoice } from './PaymentInvoice';
import { GateQrPanel } from './GateQrPanel';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import './staff-reception.css';
import { formatCenterDate } from '../../shared/lib/centerTime';
import {
  maskCitizenId,
  receptionApi,
  type HoldRequestItem,
  type UnpaidCoachBooking,
  type MemberLookupResult,
  type MembershipPackage,
  type PaymentMethod,
  type PaymentResponseDto,
  type PendingSubscriptionItem,
  type RenewalCandidate,
  type ReceptionTrialItem,
} from './receptionApi';
import { Link } from 'react-router-dom';

const vnd = (n: number) => `${n.toLocaleString(staffLocale())} đ`;

export function StaffReceptionPage() {
  const { t } = useStaffI18n();
  const currentUser = getCurrentUser();

  // BR-01: Chỉ RECEPTIONIST / STAFF và CENTER_MANAGER / MANAGER được truy cập
  const hasAccess = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'MANAGER' || currentUser.role === 'STAFF';
  }, [currentUser]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<StaffMessage | null>(null);
  const [paymentError, setPaymentError] = useState<StaffMessage | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<MemberLookupResult[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberLookupResult | null>(null);

  // Danh sách yêu cầu gói tập đang chờ thanh toán (do Hội viên đăng ký / gia hạn / nâng cấp)
  const [pendingList, setPendingList] = useState<PendingSubscriptionItem[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [selectedPending, setSelectedPending] = useState<PendingSubscriptionItem | null>(null);
  const [cancellingPendingId, setCancellingPendingId] = useState<number | null>(null);
  const [packages, setPackages] = useState<MembershipPackage[]>([]);
  const [renewalCandidates, setRenewalCandidates] = useState<RenewalCandidate[]>([]);
  const [selectedOffer, setSelectedOffer] = useState('');
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [offersError, setOffersError] = useState<StaffMessage>('');
  const [offersRetry, setOffersRetry] = useState(0);

  // Danh sách yêu cầu bảo lưu gói tập đang chờ xử lý
  const [holdList, setHoldList] = useState<HoldRequestItem[]>([]);
  const [loadingHolds, setLoadingHolds] = useState(true);
  const [processingHoldId, setProcessingHoldId] = useState<number | null>(null);

  // Buổi PT 1:1 trả phí chờ thu tiền
  const [unpaidPt, setUnpaidPt] = useState<UnpaidCoachBooking[]>([]);
  const [loadingPt, setLoadingPt] = useState(true);
  const [ptError, setPtError] = useState<StaffMessage>('');
  const [processingPtId, setProcessingPtId] = useState<number | null>(null);

  // Form thanh toán
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('cash');
  const [paymentNotes, setPaymentNotes] = useState('Thanh toán gói tập tại quầy Lễ tân');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const paymentInFlight = useRef(false);
  const checkoutRef = useRef<HTMLDivElement>(null);

  // Modal Yêu cầu hủy gói tập & hoàn tiền (Lễ tân trình Quản lý)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefundAmount, setCancelRefundAmount] = useState('');
  const [cancelModalError, setCancelModalError] = useState<StaffMessage | null>(null);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  // Popup Hóa đơn điện tử sau khi thanh toán thành công (BR-04)
  const [completedPayment, setCompletedPayment] = useState<PaymentResponseDto | null>(null);
  const [completedPackageName, setCompletedPackageName] = useState<string>('');
  const [completedMemberName, setCompletedMemberName] = useState<string>('');
  const [completedMembershipCode, setCompletedMembershipCode] = useState<string | null>(null);
  const selectedMemberId = selectedMember?.userId;
  const selectedPendingId = selectedPending?.id;
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  // Danh sách đơn đăng ký Gói Trải Nghiệm 3 Ngày chờ Lễ tân duyệt
  const [trialList, setTrialList] = useState<ReceptionTrialItem[]>([]);
  const [loadingTrials, setLoadingTrials] = useState(true);
  const [processingTrialId, setProcessingTrialId] = useState<number | null>(null);
  const [inspectingTrial, setInspectingTrial] = useState<ReceptionTrialItem | null>(null);
  const [rejectingTrial, setRejectingTrial] = useState<ReceptionTrialItem | null>(null);
  const [trialRejectReason, setTrialRejectReason] = useState('');
  const [isSubmittingTrialReject, setIsSubmittingTrialReject] = useState(false);
  const [trialRejectError, setTrialRejectError] = useState<StaffMessage | null>(null);

  useEffect(() => {
    setReceiptImage(null);
    if (!hasAccess || selectedMemberId == null || selectedPendingId == null) return;
    let active = true;
    receptionApi.getPendingReceipt(selectedMemberId, selectedPendingId)
      .then((image) => { if (active) setReceiptImage(image); })
      .catch(() => { if (active) setReceiptImage(null); });
    return () => { active = false; };
  }, [hasAccess, selectedMemberId, selectedPendingId]);

  const loadPendingSubscriptions = useCallback(async () => {
    if (!hasAccess) return;
    setLoadingPending(true);
    try {
      const items = await receptionApi.getPendingSubscriptions();
      setPendingList(items);
      setSelectedPending((prev) => items.find((item) => item.id === prev?.id) ?? null);
    } catch {
      setPendingList([]);
    } finally {
      setLoadingPending(false);
    }
  }, [hasAccess]);

  const loadPendingHolds = useCallback(async () => {
    if (!hasAccess) return;
    setLoadingHolds(true);
    try {
      const items = await receptionApi.getPendingHoldRequests();
      setHoldList(items);
    } catch {
      setHoldList([]);
    } finally {
      setLoadingHolds(false);
    }
  }, [hasAccess]);

  const loadUnpaidPt = useCallback(async () => {
    if (!hasAccess) return;
    setLoadingPt(true);
    setPtError('');
    try {
      setUnpaidPt(await receptionApi.getUnpaidCoachBookings());
    } catch (err: unknown) {
      setUnpaidPt([]);
      setPtError(errorMessage(err, 'Không tải được danh sách buổi PT chưa thanh toán.'));
    } finally {
      setLoadingPt(false);
    }
  }, [hasAccess]);

  const loadPendingTrials = useCallback(async () => {
    if (!hasAccess) return;
    setLoadingTrials(true);
    try {
      const items = await receptionApi.getPendingTrials();
      setTrialList(items);
    } catch {
      setTrialList([]);
    } finally {
      setLoadingTrials(false);
    }
  }, [hasAccess]);

  useEffect(() => {
    void loadPendingSubscriptions();
    void loadPendingHolds();
    void loadUnpaidPt();
    void loadPendingTrials();
  }, [loadPendingSubscriptions, loadPendingHolds, loadUnpaidPt, loadPendingTrials]);

  useEffect(() => {
    let active = true;
    setSelectedOffer('');
    setRenewalCandidates([]);
    setPackages([]);
    setOffersError('');
    if (!hasAccess || selectedMemberId == null || selectedPendingId != null) {
      setLoadingOffers(false);
      return () => { active = false; };
    }
    setLoadingOffers(true);
    Promise.all([receptionApi.getActivePackages(), receptionApi.getRenewalCandidates(selectedMemberId)])
      .then(([available, candidates]) => {
        if (active) { setPackages(available); setRenewalCandidates(candidates); }
      })
      .catch(() => { if (active) setOffersError('Không tải được gói tập hoặc lịch sử gia hạn. Vui lòng thử lại.'); })
      .finally(() => { if (active) setLoadingOffers(false); });
    return () => { active = false; };
  }, [hasAccess, selectedMemberId, selectedPendingId, offersRetry]);

  const activeCandidate = useMemo(
    () => renewalCandidates.find((c) => c.status?.toLowerCase() === 'active') ?? null,
    [renewalCandidates]
  );

  const handleOpenCancelModal = () => {
    if (!selectedMember) return;
    setCancelReason('');
    // Đề xuất theo phần chưa dùng của số tiền hội viên thực trả (backend tính), không theo giá niêm yết của gói.
    // Để trống thì backend tự điền cùng con số này.
    const suggested = activeCandidate?.remainingValue;
    setCancelRefundAmount(typeof suggested === 'number' ? String(suggested) : '');
    setCancelModalError(null);
    setIsCancelModalOpen(true);
  };

  const handleSubmitCancellationRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || isSubmittingCancel) return;
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      setCancelModalError('Vui lòng nhập lý do hủy gói tập để trình Quản lý duyệt.');
      return;
    }
    const parsedRefund = cancelRefundAmount.trim() !== '' ? Number(cancelRefundAmount) : undefined;
    if (parsedRefund !== undefined && (isNaN(parsedRefund) || parsedRefund < 0)) {
      setCancelModalError('Số tiền hoàn dự kiến không hợp lệ.');
      return;
    }
    setIsSubmittingCancel(true);
    setCancelModalError(null);
    try {
      await receptionApi.requestSubscriptionCancellation({
        memberId: selectedMember.userId,
        subscriptionId: activeCandidate?.id,
        reason: trimmedReason,
        refundAmount: parsedRefund,
      });
      notify(
        staffMessage(`Đã trình yêu cầu hủy gói tập & hoàn tiền của hội viên ${selectedMember.fullName} lên Quản lý trung tâm phê duyệt.`, `Submitted membership cancellation & refund request for member ${selectedMember.fullName} to the center manager for approval.`),
        'success', { record: true }
      );
      setIsCancelModalOpen(false);
      setCancelReason('');
    } catch (err: unknown) {
      setCancelModalError(errorMessage(err, 'Không thể gửi yêu cầu hủy gói tập. Vui lòng thử lại.'));
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleSelectPendingItem = (item: PendingSubscriptionItem) => {
    setSelectedPending(item);
    setSelectedMember({
      userId: item.memberId,
      membershipCode: item.membershipCode || '',
      fullName: item.memberName,
      email: item.memberEmail,
      phone: item.memberPhone,
      citizenId: null,
      status: 'PENDING_PAYMENT',
      currentPackage: item.packageName,
      endDate: `${item.startDate} → ${item.endDate}`,
    });
    // Form thanh toán nằm phía trên danh sách chờ: đưa lễ tân tới bước xác nhận
    checkoutRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const handleCancelPendingItem = async (item: PendingSubscriptionItem) => {
    if (cancellingPendingId !== null || isSubmittingPayment) return;
    setCancellingPendingId(item.id);
    try {
      await receptionApi.cancelPendingSubscription(item.id);
      notify(staffMessage(`Đã hủy yêu cầu gói tập #${item.id} (${item.packageName}) của hội viên ${item.memberName}.`, `Cancelled membership request #${item.id} (${item.packageName}) for member ${item.memberName}.`), 'success', { record: true });
      await loadPendingSubscriptions();
    } catch (err: unknown) {
      const msg = errorMessage(err, 'Hủy yêu cầu gói tập thất bại.'); await loadPendingSubscriptions();
      notify(msg, 'error');
    } finally {
      setCancellingPendingId(null);
    }
  };

  const handleApproveHold = async (item: HoldRequestItem) => {
    if (processingHoldId !== null) return;
    setProcessingHoldId(item.id);
    try {
      const res = await receptionApi.approveHoldRequest(item.id);
      notify(
        staffMessage(`Đã xác nhận bảo lưu gói "${item.packageName}" cho ${item.memberName}. Đã tự động hủy ${res.cancelledEnrollmentsCount} lịch sắp tới.`, `Confirmed freeze of membership "${item.packageName}" cho ${item.memberName}. Automatically cancelled ${res.cancelledEnrollmentsCount} upcoming bookings.`),
        'success', { record: true },
      );
      await loadPendingHolds();
    } catch (err: unknown) {
      const msg = errorMessage(err, 'Xác nhận bảo lưu thất bại.'); await loadPendingHolds();
      notify(msg, 'error');
    } finally {
      setProcessingHoldId(null);
    }
  };

  const handleConfirmPt = async (item: UnpaidCoachBooking, method: string) => {
    if (processingPtId !== null) return;
    setProcessingPtId(item.id);
    try {
      await receptionApi.confirmCoachBookingPayment(item.id, method);
      notify(staffMessage(`Đã thu ${vnd(item.hourlyRate)} buổi PT của ${item.memberName} (${formatCenterDate(item.bookingDate)}).`, `Collected ${vnd(item.hourlyRate)} PT sessions for ${item.memberName} (${formatCenterDate(item.bookingDate)}).`), 'success', { record: true });
      await loadUnpaidPt();
    } catch (err: unknown) {
      const msg = errorMessage(err, 'Xác nhận thu tiền buổi PT thất bại.');
      await loadUnpaidPt();
      notify(msg, 'error');
    } finally {
      setProcessingPtId(null);
    }
  };

  const handleRejectHold = async (item: HoldRequestItem) => {
    if (processingHoldId !== null) return;
    setProcessingHoldId(item.id);
    try {
      await receptionApi.rejectHoldRequest(item.id);
      notify(staffMessage(`Đã từ chối yêu cầu bảo lưu của hội viên ${item.memberName}.`, `Rejected freeze request for member ${item.memberName}.`), 'success', { record: true });
      await loadPendingHolds();
    } catch (err: unknown) {
      const msg = errorMessage(err, 'Từ chối yêu cầu bảo lưu thất bại.'); await loadPendingHolds();
      notify(msg, 'error');
    } finally {
      setProcessingHoldId(null);
    }
  };

  const handleApproveTrial = async (item: ReceptionTrialItem) => {
    if (processingTrialId !== null) return;
    setProcessingTrialId(item.id);
    try {
      await receptionApi.approveTrial(item.id);
      notify(
        staffMessage(`Đã kích hoạt Gói Trải Nghiệm 3 Ngày cho ${item.memberName}. Họ tên đã đồng bộ theo ${item.documentType}: "${item.documentFullName}".`, `Activated the 3-Day Trial for ${item.memberName}. Account name synchronized with ${item.documentType}: "${item.documentFullName}".`),
        'success',
        { record: true }
      );
      if (inspectingTrial?.id === item.id) setInspectingTrial(null);
      await loadPendingTrials();
    } catch (err: unknown) {
      notify(errorMessage(err, 'Phê duyệt gói trải nghiệm thất bại.'), 'error');
      await loadPendingTrials();
    } finally {
      setProcessingTrialId(null);
    }
  };

  const handleOpenRejectTrial = (item: ReceptionTrialItem) => {
    setRejectingTrial(item);
    setTrialRejectReason('');
    setTrialRejectError(null);
  };

  const handleSubmitRejectTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingTrial || isSubmittingTrialReject) return;
    const reason = trialRejectReason.trim();
    if (!reason) {
      setTrialRejectError('Vui lòng nhập lý do từ chối để hội viên chỉnh sửa nộp lại.');
      return;
    }
    setIsSubmittingTrialReject(true);
    setTrialRejectError(null);
    try {
      await receptionApi.rejectTrial(rejectingTrial.id, reason);
      notify(staffMessage(`Đã từ chối đơn đăng ký gói trải nghiệm của ${rejectingTrial.memberName}.`, `Rejected trial application for ${rejectingTrial.memberName}.`), 'info', { record: true });
      setRejectingTrial(null);
      if (inspectingTrial?.id === rejectingTrial.id) setInspectingTrial(null);
      await loadPendingTrials();
    } catch (err: unknown) {
      setTrialRejectError(errorMessage(err, 'Từ chối đơn thất bại. Vui lòng thử lại.'));
    } finally {
      setIsSubmittingTrialReject(false);
    }
  };

  // BR-01: Forbidden Guard khi vai trò không hợp lệ
  if (!hasAccess) {
    return (
      <div data-i18n-managed className="portal-container" data-testid="reception-forbidden-guard">
        <div className="portal-card">
          <div className="portal-state" style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.25rem', fontWeight: 700, color: 'var(--portal-danger, #fca5a5)', marginBottom: '12px' }} role="img" aria-label="Forbidden">
              403
            </div>
            <h2 className="portal-state__title" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>
              {t("403 - Quyền truy cập bị từ chối")}</h2>
            <p style={{ color: 'var(--color-text-muted)', maxWidth: '480px', margin: '0 auto 20px auto' }}>
              {t("Chỉ Lễ tân (Receptionist) và Quản lý trung tâm (Center Manager) mới có quyền truy cập quầy lễ tân & thu ngân.")}</p>
            <Link to="/portal" className="btn-secondary">
              {t("Về trang chủ Portal")}</Link>
          </div>
        </div>
      </div>
    );
  }

  const [offerKind, offerId] = selectedOffer.split(':');
  const selectedCandidate = offerKind === 'renew' ? renewalCandidates.find((item) => item.id === Number(offerId)) : undefined;
  const selectedPackage = packages.find((item) => item.id === (selectedCandidate?.packageId ?? Number(offerId)));
  const currentPrice = selectedPending ? selectedPending.packagePrice : selectedPackage?.price ?? 0;

  // Xử lý tra cứu hội viên
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    const invalid = !q ? 'Vui lòng nhập SĐT, Mã hội viên hoặc CCCD để tra cứu.'
      : q.length < 2 ? 'Từ khóa tìm kiếm phải ít nhất 2 ký tự.' : null;
    setSearchError(invalid);
    if (invalid) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const results = await receptionApi.lookupMembers(q);
      setSearchResults(results);
      if (results.length > 0) {
        const member = results[0];
        setSelectedMember(member);
        const matchedPending = pendingList.find((p) => p.memberId === member.userId) ?? null;
        setSelectedPending(matchedPending);
      } else {
        setSelectedMember(null);
        setSelectedPending(null);
      }
    } catch (err: unknown) {
      setSearchError(errorMessage(err, 'Tra cứu thất bại.'));
      setSearchResults([]);
      setSelectedMember(null);
      setSelectedPending(null);
    } finally {
      setIsSearching(false);
    }
  };

  // BR-03 & BR-04: Xác nhận thanh toán cho yêu cầu gói tập đang chờ của hội viên
  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSearching) return;

    const invalid = !selectedMember || (!selectedPending && !selectedPackage) ? 'Vui lòng chọn hội viên và gói tập cần thanh toán.'
      : !paymentMethod ? 'Vui lòng chọn hình thức thanh toán (Tiền mặt).' : null;
    setPaymentError(invalid);
    if (invalid || !selectedMember || !paymentMethod) return;

    // BR-03: Khóa nút khi đang xử lý để tránh thu trùng
    if (paymentInFlight.current) return;

    paymentInFlight.current = true;
    setIsSubmittingPayment(true);
    try {
      let pending = selectedPending;
      if (!pending && selectedCandidate && selectedPackage) {
        const created = await receptionApi.createRenewal(selectedMember.userId, selectedCandidate.id);
        pending = {
          id: created.id, memberId: created.memberId, membershipCode: selectedMember.membershipCode,
          memberName: selectedMember.fullName, memberEmail: selectedMember.email, memberPhone: selectedMember.phone,
          packageId: created.packageId, packageName: created.packageName, durationDays: selectedPackage.durationDays,
          packagePrice: selectedPackage.price, startDate: created.startDate, endDate: created.endDate,
          status: created.status, createdAt: created.createdAt,
        };
        setSelectedPending(pending);
      }
      const targetPackage = selectedPackage;
      const result = await receptionApi.processPayment({
        memberId: selectedMember.userId,
        subscriptionId: pending?.id,
        packageId: pending?.packageId ?? targetPackage!.id,
        amount: pending?.packagePrice ?? targetPackage!.price,
        method: paymentMethod,
        notes: paymentNotes.trim() || undefined,
      });

      // BR-04: Chỉ hiển thị hóa đơn khi Payment API trả thành công
      setCompletedPackageName(pending?.packageName ?? targetPackage!.name);
      setCompletedMemberName(selectedMember.fullName);
      setCompletedMembershipCode(selectedMember.membershipCode);
      setCompletedPayment(result);
      notify(result.invoiceNumber ? staffMessage(`Đã xác nhận thu tiền. Hóa đơn: ${result.invoiceNumber}`, `Payment collected. Invoice: ${result.invoiceNumber}`) : 'Đã ghi nhận thanh toán; chưa có số hóa đơn.', 'success', { record: true });
      setSelectedMember(null);
      setSelectedPending(null);
      await loadPendingSubscriptions();
    } catch (err: unknown) {
      setPaymentError(errorMessage(err, 'Giao dịch thanh toán thất bại.')); await loadPendingSubscriptions();
    } finally {
      paymentInFlight.current = false;
      setIsSubmittingPayment(false);
    }
  };

  return (
    <div data-i18n-managed className="portal-container">
      <PageHeader
        eyebrow={t("Lễ tân &amp; Thu ngân")}
        title={t("Quầy lễ tân")}
      />

      <div className="reception-top">
        <div className="portal-card reception-top__qr">
          <GateQrPanel gateId="A1" />
        </div>

        <div className="reception-top__main">
          {/* Thanh tra cứu hội viên (BR-01, BR-05) */}
          <div className="portal-card reception-top__search">
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder={t("Nhập Số điện thoại, Mã hội viên (MB-...) hoặc CCCD để tra cứu...")}
                  className="portal-input"
                  aria-label={t("Tra cứu hội viên theo số điện thoại, mã hội viên hoặc CCCD")}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); if (searchError) setSearchError(null); }}
                  disabled={isSearching}
                  aria-invalid={searchError ? true : undefined}
                  aria-describedby={searchError ? 'reception-search-error' : undefined}
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary" disabled={isSearching}>
                {isSearching ? (
                  <>
                    <span data-i18n-managed className="spinner" />
                    <span data-i18n-managed>{t("Đang tìm...")}</span>
                  </>
                ) : (
                  t('Tra cứu hội viên')
                )}
              </button>
            </form>
            {searchError && <p id="reception-search-error" className="form-error" role="alert">{t(searchError)}</p>}

            {/* Danh sách kết quả nếu có nhiều hơn 1 người */}
            {searchResults.length > 1 && (
              <div data-i18n-managed style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border-subtle)' }}>
                <div style={{ fontSize: '0.86rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                  {t("Tìm thấy ")}{searchResults.length} {t(" hội viên. Chọn hội viên để kiểm tra yêu cầu:")}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {searchResults.map((m) => (
                    <button data-i18n-managed
                      key={m.userId}
                      type="button"
                      className={`btn-secondary btn-sm ${selectedMember?.userId === m.userId ? 'btn-primary' : ''}`}
                      onClick={() => {
                        setSelectedMember(m);
                        setSelectedPending(pendingList.find((p) => p.memberId === m.userId) ?? null);
                      }}
                    >
                      {m.fullName} ({m.membershipCode || m.phone})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mục Yêu Cầu Đăng Ký / Gia Hạn / Nâng Cấp Gói Tập Đang Chờ Thanh Toán (pending_payment) */}
          <div className="portal-card reception-top__queue">
            <div className="portal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="portal-card-title">{t("Gói tập chờ thanh toán (")}{pendingList.length})</h2>
              </div>
              <RefreshButton label={t("Làm mới danh sách")} onClick={() => void loadPendingSubscriptions()} disabled={loadingPending} />
            </div>

            {loadingPending ? (
              <div data-i18n-managed style={{ display: 'grid', gap: '10px', marginTop: '12px' }} role="status" aria-busy="true">
                <span className="sr-only">{t("Đang tải danh sách yêu cầu chờ thanh toán...")}</span>
                {[1, 2].map((idx) => (
                  <div data-i18n-managed
                    key={idx}
                    aria-hidden="true"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 18px',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border-medium)',
                      backgroundColor: 'var(--color-bg-card)',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="portal-skeleton-line" style={{ width: '42%', height: 18, marginBottom: 8 }} />
                      <div className="portal-skeleton-line" style={{ width: '64%', height: 14 }} />
                    </div>
                    <div style={{ width: 160 }}>
                      <div className="portal-skeleton-line" style={{ width: '100%', height: 34 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : pendingList.length === 0 ? (
              <div data-i18n-managed style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                {t("Hiện không có yêu cầu đăng ký gói tập nào đang ở trạng thái chờ thanh toán.")}</div>
            ) : (
              <div data-i18n-managed style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                {pendingList.map((item) => {
                  const isSelected = selectedPending?.id === item.id;
                  return (
                    <div data-i18n-managed
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectPendingItem(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectPendingItem(item);
                        }
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                        padding: '14px 18px',
                        borderRadius: '10px',
                        border: isSelected ? '2px solid var(--color-accent-gold)' : '1px solid var(--color-border-medium)',
                        backgroundColor: isSelected ? 'var(--color-bg-warm)' : 'var(--color-bg-card)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              color: 'var(--color-accent-gold)',
                              fontSize: '0.92rem',
                            }}
                          >
                            {t("Yêu cầu #")}{item.id}
                          </span>
                          <strong>{item.memberName}</strong>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                            ({item.membershipCode || `MB-${item.memberId}`} • {item.memberPhone || item.memberEmail})
                          </span>
                        </div>
                        <div style={{ fontSize: '0.88rem', color: 'var(--color-text-main)', marginTop: '4px' }}>
                          {t("Gói hội viên đã chọn: ")}<strong>{item.packageName}</strong> ({item.durationDays} {t(" ngày • ")}{item.startDate} → {item.endDate})
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text-main)' }}>
                            {vnd(item.packagePrice)}
                          </div>
                          <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                            {t("CHỜ THANH TOÁN")}</span>
                        </div>
                        <button
                          type="button"
                          className={isSelected ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectPendingItem(item);
                          }}
                        >
                          {isSelected ? t('Đang chọn xử lý') : t('Chọn xác nhận')}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          style={{ color: 'var(--portal-danger, #fca5a5)', borderColor: 'var(--portal-danger, #fca5a5)' }}
                          disabled={cancellingPendingId !== null || isSubmittingPayment}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCancelPendingItem(item);
                          }}
                        >
                          {cancellingPendingId === item.id ? t('Đang hủy...') : t('Hủy yêu cầu')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2 reception-checkout" ref={checkoutRef}>
        {/* Thông tin hội viên tìm thấy (BR-01 Empty state & BR-05 Masked CCCD) */}
        <div className="portal-card">
          <div className="portal-card-header">
            <h2 className="portal-card-title">{t("Thông tin hội viên")}</h2>
            {selectedMember && (
              <span data-i18n-managed className={`badge ${selectedMember.status?.toUpperCase() === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}`}>
                {selectedPending ? t('CHỜ THANH TOÁN') : selectedMember.status?.toUpperCase()}
              </span>
            )}
          </div>

          {isSearching ? <LoadingSkeleton label={t("Đang tra cứu thông tin hội viên…")} count={4} /> : selectedMember ? (
            <div data-i18n-managed>
              <div className="kv-list">
                <div className="kv-row">
                  <span>{t("Họ và tên")}</span>
                  <strong>{selectedMember.fullName}</strong>
                </div>

                <div className="kv-row">
                  <span>{t("Mã hội viên")}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {selectedMember.membershipCode || `MB-2026-${String(selectedMember.userId).padStart(3, '0')}`}
                  </span>
                </div>

                <div className="kv-row">
                  <span>{t("Số điện thoại")}</span>
                  <strong>{selectedMember.phone || t('Chưa cập nhật')}</strong>
                </div>

                <div className="kv-row">
                  <span>Email</span>
                  <span>{selectedMember.email}</span>
                </div>

                {/* BR-05: CCCD được che một phần (masked) */}
                <div className="kv-row">
                  <span>{t("Số CCCD (Bảo mật)")}</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-text-main)' }}>
                    {selectedMember.citizenId ? maskCitizenId(selectedMember.citizenId) : t('Chưa cập nhật')}
                  </span>
                </div>

                <div className="kv-row">
                  <span>{t("Gói tập yêu cầu")}</span>
                  <strong>
                    {selectedPending
                      ? t(`${selectedPending.packageName} (Yêu cầu #${selectedPending.id})`, `${selectedPending.packageName} (Request #${selectedPending.id})`)
                      : activeCandidate
                        ? t(`${activeCandidate.packageName} (Đang hoạt động)`, `${activeCandidate.packageName} (Active)`)
                        : selectedMember.currentPackage || t('Chưa có yêu cầu gói tập chờ thanh toán')}
                  </strong>
                </div>

                <div className="kv-row">
                  <span>{t("Thời hạn gói")}</span>
                  <span style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>
                    {selectedPending
                      ? t(`${selectedPending.startDate} → ${selectedPending.endDate} (${selectedPending.durationDays} ngày)`, `${selectedPending.startDate} → ${selectedPending.endDate} (${selectedPending.durationDays} days)`)
                      : activeCandidate
                        ? `${activeCandidate.startDate} → ${activeCandidate.endDate}`
                        : selectedMember.endDate || t('Chưa kích hoạt')}
                  </span>
                </div>

                {selectedPending && receiptImage && (
                  <div data-i18n-managed className="kv-row" style={{ display: 'block' }}>
                    <span>{t("Ảnh hóa đơn hội viên đã gửi")}</span>
                    <a href={receiptImage} target="_blank" rel="noreferrer">
                      <img
                        src={receiptImage}
                        alt={t("Ảnh hóa đơn thanh toán tiền mặt")}
                        style={{ display: 'block', marginTop: 8, maxWidth: '100%', maxHeight: 280, borderRadius: 8 }}
                      />
                    </a>
                  </div>
                )}
              </div>

              {!selectedPending && (activeCandidate || selectedMember.status?.toUpperCase() === 'ACTIVE') && (
                <div data-i18n-managed style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <span style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)' }}>
                    {t("Hội viên yêu cầu hủy gói tại quầy? Trình Quản lý phê duyệt hoàn tiền về Ví:")}</span>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ color: 'var(--portal-danger, #fca5a5)', borderColor: 'var(--portal-danger, #fca5a5)' }}
                    onClick={handleOpenCancelModal}
                  >
                    {t("Yêu cầu hủy gói & hoàn tiền")}</button>
                </div>
              )}
            </div>
          ) : (
            /* BR-01: Trạng thái trống rõ ràng */
            <div data-i18n-managed className="portal-empty" style={{ padding: '40px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--portal-salmon)', marginBottom: '10px' }}>{t("TRA CỨU")}</div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', color: 'var(--color-text-main)' }}>
                {hasSearched ? t('Không tìm thấy hội viên') : t('Chưa chọn hội viên')}
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', margin: 0 }}>
                {hasSearched
                  ? t(`Không có kết quả nào khớp với từ khóa "${searchQuery}". Vui lòng kiểm tra lại SĐT, Mã hội viên hoặc CCCD.`, `No results match "${searchQuery}". Please check the phone number, membership code or national ID.`)
                  : t('Hãy ấn vào một Yêu cầu đang chờ ở danh sách trên hoặc tra cứu SĐT hội viên.')}
              </p>
            </div>
          )}
        </div>

        {/* Panel thu ngân & Xác nhận gói tập do Hội viên đã chọn */}
        <div className="portal-card">
          <div className="portal-card-header">
            <h2 className="portal-card-title">{t("Xác nhận thanh toán")}</h2>
          </div>

          <form onSubmit={handlePayment}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="pos-package">
                {selectedPending ? t('Gói tập trong yêu cầu chờ thanh toán') : t('Chọn gói tập mua mới hoặc gia hạn')}
              </label>
              {selectedPending ? (
                <input data-i18n-managed id="pos-package" type="text" className="portal-input"
                  value={`${selectedPending.packageName} (${selectedPending.durationDays} ngày — Yêu cầu #${selectedPending.id})`}
                  disabled readOnly />
              ) : loadingOffers ? <LoadingSkeleton label={t("Đang tải gói tập và lựa chọn gia hạn…")} count={1} /> : (
                <Select id="pos-package" className="portal-select" value={selectedOffer}
                  onChange={(event) => setSelectedOffer(event.target.value)}
                  disabled={!selectedMember || loadingPending || loadingOffers || !!offersError || isSubmittingPayment}>
                  <option value="">{t("Chọn gói tập")}</option>
                  {renewalCandidates
                    .filter((candidate) => packages.some((pkg) => pkg.id === candidate.packageId))
                    .map((candidate) => (
                      <option data-i18n-managed key={`renew:${candidate.id}`} value={`renew:${candidate.id}`}>
                        {t("Gia hạn: ")}{candidate.packageName} {t(" — kỳ đến ")}{candidate.endDate}
                      </option>
                    ))}
                  {packages.map((pkg) => (
                    <option data-i18n-managed key={`buy:${pkg.id}`} value={`buy:${pkg.id}`}>
                      {t("Mua mới: ")}{pkg.name} — {vnd(pkg.price)}
                    </option>
                  ))}
                </Select>
              )}
              {offersError && <p role="alert">{t(offersError)} <button type="button" className="btn-secondary" onClick={() => setOffersRetry((n) => n + 1)}>{t("Thử lại")}</button></p>}
              {!selectedPending && !loadingOffers && selectedMember && !offersError && packages.length === 0 && (
                <p data-i18n-managed>{t("Hiện không có gói tập đang hoạt động.")}</p>
              )}
            </div>

            <div className="grid-2">
              {/* BR-02: Số tiền hiển thị theo giá gói và KHÔNG cho sửa tay */}
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="pos-amount">
                  {t("Số tiền thu (Không sửa tay)")}</label>
                <input
                  id="pos-amount"
                  type="text"
                  className="portal-input"
                  value={vnd(currentPrice)}
                  disabled
                  readOnly
                  style={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    color: 'var(--color-accent-gold)',
                    backgroundColor: 'var(--color-bg-warm)',
                    cursor: 'not-allowed',
                  }}
                />
              </div>

              {/* BR-03: Bắt buộc chọn hình thức thanh toán */}
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="pos-method">
                  {t("Hình thức thanh toán *")}</label>
                <Select
                  id="pos-method"
                  className="portal-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  disabled={isSubmittingPayment}
                >
                  <option value="cash">{t("Tiền mặt tại quầy")}</option>
                </Select>
              </div>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="pos-notes">
                {t("Ghi chú giao dịch")}</label>
              <input
                id="pos-notes"
                type="text"
                className="portal-input"
                placeholder={t("Ghi chú thêm về giao dịch...")}
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                disabled={isSubmittingPayment}
              />
            </div>

            {paymentError && <p className="form-error" role="alert">{t(paymentError)}</p>}
            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}
              disabled={isSearching || isSubmittingPayment || !selectedMember || loadingPending || loadingOffers || (!selectedPending && !selectedPackage)}
            >
              {isSubmittingPayment ? (
                <>
                  <span data-i18n-managed className="spinner" />
                  <span data-i18n-managed>{t("Đang xử lý thu tiền...")}</span>
                </>
              ) : (
                t('Xác nhận thu tiền & xuất hóa đơn')
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Mục Đơn đăng ký Gói Trải Nghiệm 3 Ngày (CCCD / Hộ chiếu) */}
      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <div className="portal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="portal-card-title">{t("Đơn trải nghiệm 3 ngày chờ duyệt (")}{trialList.length})</h2>
          </div>
          <RefreshButton label={t("Làm mới đơn thử")} onClick={() => void loadPendingTrials()} disabled={loadingTrials} />
        </div>

        {loadingTrials ? (
          <div data-i18n-managed style={{ display: 'grid', gap: '10px', marginTop: '12px' }} role="status" aria-busy="true">
            <span className="sr-only">{t("Đang tải danh sách đơn đăng ký trải nghiệm...")}</span>
            <div
              aria-hidden="true"
              style={{
                padding: '14px 18px',
                borderRadius: '10px',
                border: '1px solid var(--color-border-medium)',
                backgroundColor: 'var(--color-bg-card)',
              }}
            >
              <div className="portal-skeleton-line" style={{ width: '45%', height: 18, marginBottom: 8 }} />
              <div className="portal-skeleton-line" style={{ width: '70%', height: 14 }} />
            </div>
          </div>
        ) : trialList.length === 0 ? (
          <div data-i18n-managed style={{ padding: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            {t("Hiện không có đơn đăng ký Gói Trải Nghiệm 3 Ngày nào đang chờ duyệt.")}</div>
        ) : (
          <div data-i18n-managed style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
            {trialList.map((item) => {
              const isBusy = processingTrialId === item.id;
              return (
                <div data-i18n-managed
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '14px',
                    padding: '16px 18px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-medium)',
                    backgroundColor: 'var(--color-bg-warm)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: 'var(--portal-salmon)',
                          fontSize: '0.92rem',
                        }}
                      >
                        {t("Đơn thử #")}{item.id}
                      </span>
                      <strong>{item.memberName}</strong>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        ({item.membershipCode || t('Hội viên mới')})
                      </span>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '99px',
                          background: item.documentType === 'PASSPORT' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(234, 88, 12, 0.15)',
                          color: item.documentType === 'PASSPORT' ? '#2563eb' : 'var(--portal-salmon)',
                        }}
                      >
                        {item.documentType === 'PASSPORT' ? t(`Hộ chiếu (${item.nationality || 'Nước ngoài'})`, `Passport (${item.nationality || 'Nước ngoài'})`) : 'CCCD'}
                      </span>
                    </div>

                    <div style={{ marginTop: '8px', fontSize: '0.88rem', color: 'var(--color-text-muted)', display: 'grid', gap: '4px' }}>
                      <div>
                        <strong>{t("Tên trên giấy tờ:")}</strong>{' '}
                        <span style={{ color: 'var(--color-text-main)', fontWeight: 600 }}>{item.documentFullName}</span>
                        {item.memberName !== item.documentFullName && (
                          <span data-i18n-managed style={{ fontSize: '0.78rem', color: 'var(--portal-salmon)', marginLeft: '6px' }}>
                            {t("(Đồng bộ họ tên: \"")}{item.memberName}&quot; → &quot;{item.documentFullName}&quot;)
                          </span>
                        )}
                      </div>
                      <div>
                        <strong>{t("Số giấy tờ:")}</strong> {item.documentNumberMasked}
                        {item.nationality && t(` • Quốc tịch: ${item.nationality}`, ` • Nationality: ${item.nationality}`)}
                      </div>
                      <div>
                        <strong>{t("Email/SĐT:")}</strong> {item.memberEmail} {item.memberPhone ? `• ${item.memberPhone}` : ''}
                      </div>
                      <div>
                        <strong>{t("Thời gian nộp:")}</strong> {formatCenterDate(item.requestedAt)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => setInspectingTrial(item)}
                    >
                      {t("👁️ Xem giấy tờ & Ảnh")}</button>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      disabled={isBusy}
                      onClick={() => void handleApproveTrial(item)}
                    >
                      {isBusy ? t('Đang duyệt…') : t('✓ Duyệt & Kích hoạt')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      style={{ color: 'var(--portal-danger, #fca5a5)', borderColor: 'var(--portal-danger, #fca5a5)' }}
                      disabled={isBusy}
                      onClick={() => handleOpenRejectTrial(item)}
                    >
                      {t("✕ Từ chối")}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mục Yêu cầu bảo lưu */}
      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <div className="portal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="portal-card-title">{t("Yêu cầu bảo lưu (")}{holdList.length})</h2>
          </div>
          <RefreshButton label={t("Làm mới bảo lưu")} onClick={() => void loadPendingHolds()} disabled={loadingHolds} />
        </div>

        {loadingHolds ? (
          <div data-i18n-managed style={{ display: 'grid', gap: '10px', marginTop: '12px' }} role="status" aria-busy="true">
            <span className="sr-only">{t("Đang tải danh sách yêu cầu bảo lưu...")}</span>
            <div
              aria-hidden="true"
              style={{
                padding: '14px 18px',
                borderRadius: '10px',
                border: '1px solid var(--color-border-medium)',
                backgroundColor: 'var(--color-bg-card)',
              }}
            >
              <div className="portal-skeleton-line" style={{ width: '45%', height: 18, marginBottom: 8 }} />
              <div className="portal-skeleton-line" style={{ width: '70%', height: 14 }} />
            </div>
          </div>
        ) : holdList.length === 0 ? (
          <div data-i18n-managed style={{ padding: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            {t("Hiện không có yêu cầu bảo lưu gói tập nào đang chờ xử lý.")}</div>
        ) : (
          <div data-i18n-managed style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
            {holdList.map((item) => {
              const isBusy = processingHoldId === item.id;
              return (
                <div data-i18n-managed
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '14px',
                    padding: '16px 18px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-medium)',
                    backgroundColor: 'var(--color-bg-warm)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: 'var(--color-accent-gold)',
                          fontSize: '0.92rem',
                        }}
                      >
                        {t("Bảo lưu #")}{item.id}
                      </span>
                      <strong>{item.memberName}</strong>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        ({item.membershipCode || `MB-${item.memberId}`} • {item.memberPhone || item.memberEmail})
                      </span>
                      <span className="badge badge-warning">{t("CHỜ DUYỆT BẢO LƯU")}</span>
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--color-text-main)', marginTop: '6px' }}>
                      {t("Gói tập đang hoạt động: ")}<strong>{item.packageName}</strong> ({item.startDate} → {item.endDate})
                    </div>
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border-subtle)',
                        fontSize: '0.88rem',
                        color: 'var(--color-text-main)',
                      }}
                    >
                      <strong>{t("Lý do hội viên nhập:")}</strong> {item.holdReason}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={processingHoldId !== null}
                      onClick={() => void handleRejectHold(item)}
                    >
                      {isBusy ? t('Đang xử lý...') : t('Từ chối')}
                    </button>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      disabled={processingHoldId !== null}
                      onClick={() => void handleApproveHold(item)}
                    >
                      {isBusy ? t('Đang xử lý...') : t('Xác nhận bảo lưu & hủy lịch sắp tới')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Buổi PT 1:1 trả phí chờ thu tiền */}
      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <div className="portal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="portal-card-title">{t("Buổi PT chưa thanh toán (")}{unpaidPt.length})</h2>
          </div>
          <RefreshButton label={t("Làm mới buổi PT")} onClick={() => void loadUnpaidPt()} disabled={loadingPt} />
        </div>

        {loadingPt ? (
          <LoadingSkeleton label={t("Đang tải buổi PT chưa thanh toán…")} count={2} />
        ) : ptError ? (
          <div data-i18n-managed role="alert" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
            <span style={{ color: 'var(--portal-danger)', fontSize: '0.9rem' }}>{t(ptError)}</span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => void loadUnpaidPt()}>{t("Thử lại")}</button>
          </div>
        ) : unpaidPt.length === 0 ? (
          <div data-i18n-managed style={{ padding: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            {t("Không có buổi PT nào chờ thu tiền.")}</div>
        ) : (
          <div data-i18n-managed style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
            {unpaidPt.map((item) => {
              const isBusy = processingPtId === item.id;
              return (
                <div data-i18n-managed
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '14px',
                    padding: '16px 18px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-medium)',
                    backgroundColor: 'var(--color-bg-warm)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-accent-gold)', fontSize: '0.92rem' }}>
                        PT #{item.id}
                      </span>
                      <strong>{item.memberName}</strong>
                      {item.status === 'completed' && <span className="badge badge-warning">{t("ĐÃ TẬP")}</span>}
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--color-text-main)', marginTop: '6px' }}>
                      {t("HLV")}{item.coachName} • {item.bookingDate} {item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)} •{' '}
                      <strong>{vnd(item.hourlyRate)}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      disabled={processingPtId !== null}
                      onClick={() => void handleConfirmPt(item, 'cash')}
                    >
                      {isBusy ? t('Đang xử lý...') : t('Đã thu tiền mặt')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={processingPtId !== null}
                      onClick={() => void handleConfirmPt(item, 'bank_transfer')}
                    >
                      {isBusy ? t('Đang xử lý...') : t('Đã nhận chuyển khoản')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedMember && currentUser?.role === 'STAFF' && <CoachHealthMetrics memberId={selectedMember.userId} memberName={selectedMember.fullName} intakeOnly />}

      {isCancelModalOpen && selectedMember && (
        <Modal
          title={t("Yêu cầu hủy gói tập & Hoàn tiền về Ví")}
          onClose={() => setIsCancelModalOpen(false)}
          busy={isSubmittingCancel}
        >
          <form onSubmit={(e) => void handleSubmitCancellationRequest(e)} style={{ display: 'grid', gap: '14px' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
              {t("Hội viên: ")}<strong>{selectedMember.fullName}</strong> ({selectedMember.membershipCode || `MB-${selectedMember.userId}`})
              {activeCandidate && (
                <>
                  <br data-i18n-managed />
                  {t("Gói đang hoạt động: ")}<strong data-i18n-managed>{activeCandidate.packageName}</strong> ({activeCandidate.startDate} → {activeCandidate.endDate})
                </>
              )}
            </div>

            <div className="portal-form-group" style={{ margin: 0 }}>
              <label className="portal-label" htmlFor="reception-cancel-reason">
                {t("Lý do hủy gói tập (bắt buộc trình Quản lý) *")}</label>
              <textarea
                id="reception-cancel-reason"
                className="portal-input"
                rows={4}
                maxLength={500}
                required
                placeholder={t("Nhập rõ lý do hội viên yêu cầu hủy gói tập (ví dụ: Chuyển nơi ở, chấn thương có xác nhận y tế...)")}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={isSubmittingCancel}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            <div className="portal-form-group" style={{ margin: 0 }}>
              <label className="portal-label" htmlFor="reception-cancel-refund">
                {t("Số tiền đề xuất hoàn về Ví hội viên (VNĐ)")}</label>
              <input
                id="reception-cancel-refund"
                type="number"
                min={0}
                step={1000}
                className="portal-input"
                placeholder={t("Nhập số tiền hoàn dự kiến...")}
                value={cancelRefundAmount}
                onChange={(e) => setCancelRefundAmount(e.target.value)}
                disabled={isSubmittingCancel}
              />
            </div>

            {cancelModalError && (
              <p data-i18n-managed className="form-error" role="alert" style={{ margin: 0 }}>
                {t(cancelModalError)}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isSubmittingCancel}
                onClick={() => setIsCancelModalOpen(false)}
              >
                {t("Đóng")}</button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmittingCancel}
              >
                {isSubmittingCancel ? t('Đang gửi...') : t('Gửi yêu cầu lên Quản lý')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal xem chi tiết & ảnh giấy tờ CCCD / Hộ chiếu */}
      {inspectingTrial && (
        <Modal
          title={t(`Chi tiết đơn trải nghiệm #${inspectingTrial.id} - ${inspectingTrial.memberName}`, `Trial application details #${inspectingTrial.id} - ${inspectingTrial.memberName}`)}
          onClose={() => setInspectingTrial(null)}
          busy={processingTrialId === inspectingTrial.id}
        >
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.9rem' }}>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.8rem' }}>{t("Hội viên")}</span>
                <strong>{inspectingTrial.memberName}</strong> ({inspectingTrial.membershipCode || t('Chưa cấp thẻ')})
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.8rem' }}>{t("Loại giấy tờ")}</span>
                <strong>{inspectingTrial.documentType === 'PASSPORT' ? t(`Hộ chiếu (${inspectingTrial.nationality || 'Nước ngoài'})`, `Passport (${inspectingTrial.nationality || 'Nước ngoài'})`) : t('Căn cước công dân (CCCD)')}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.8rem' }}>{t("Số giấy tờ")}</span>
                <strong style={{ fontFamily: 'monospace' }}>{inspectingTrial.documentNumberMasked}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: '0.8rem' }}>{t("Họ và tên trên giấy tờ")}</span>
                <strong style={{ color: 'var(--portal-salmon)' }}>{inspectingTrial.documentFullName}</strong>
              </div>
            </div>

            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--portal-salmon) 10%, transparent)',
                border: '1px solid var(--portal-border)',
                fontSize: '0.85rem',
                color: 'var(--color-text-main)',
              }}
            >
              ℹ️ <strong>{t("Lưu ý nghiệp vụ:")}</strong> {t(" Khi Lễ tân bấm ")}<strong>{t("Duyệt & Kích hoạt")}</strong>{t(", hệ thống sẽ tự động đồng bộ họ tên tài khoản thành ")}<strong>&quot;{inspectingTrial.documentFullName}&quot;</strong> {t(" và kích hoạt gói 3 ngày tập cùng 01 buổi tập HLV 1:1 miễn phí.")}</div>

            {/* Ảnh mặt trước & mặt sau */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '4px' }}>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-muted)' }}>
                  {t("Ảnh mặt trước (")}{inspectingTrial.documentType})
                </div>
                {inspectingTrial.frontImageUrl ? (
                  <div data-i18n-managed style={{ border: '1px solid var(--color-border-medium)', borderRadius: '8px', overflow: 'hidden', maxHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                    <img data-i18n-managed
                      src={inspectingTrial.frontImageUrl}
                      alt={t("Mặt trước giấy tờ")}
                      style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }}
                    />
                  </div>
                ) : (
                  <div data-i18n-managed style={{ padding: '30px 10px', textAlign: 'center', background: 'var(--color-bg-card)', borderRadius: '8px', border: '1px dashed var(--color-border-medium)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    {t("Chưa có ảnh mặt trước")}</div>
                )}
              </div>

              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-muted)' }}>
                  {t("Ảnh mặt sau (")}{inspectingTrial.documentType === 'PASSPORT' ? t('Trang thị thực (tùy chọn)') : t('Mặt sau CCCD')})
                </div>
                {inspectingTrial.backImageUrl ? (
                  <div data-i18n-managed style={{ border: '1px solid var(--color-border-medium)', borderRadius: '8px', overflow: 'hidden', maxHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                    <img data-i18n-managed
                      src={inspectingTrial.backImageUrl}
                      alt={t("Mặt sau giấy tờ")}
                      style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }}
                    />
                  </div>
                ) : (
                  <div data-i18n-managed style={{ padding: '30px 10px', textAlign: 'center', background: 'var(--color-bg-card)', borderRadius: '8px', border: '1px dashed var(--color-border-medium)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    {t("Chưa có ảnh mặt sau")}</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', borderTop: '1px solid var(--color-border-medium)', paddingTop: '14px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={processingTrialId === inspectingTrial.id}
                onClick={() => setInspectingTrial(null)}
              >
                {t("Đóng")}</button>
              <button
                type="button"
                className="btn-secondary"
                style={{ color: 'var(--portal-danger, #fca5a5)', borderColor: 'var(--portal-danger, #fca5a5)' }}
                disabled={processingTrialId === inspectingTrial.id}
                onClick={() => handleOpenRejectTrial(inspectingTrial)}
              >
                {t("✕ Từ chối đơn")}</button>
              <button
                type="button"
                className="btn-primary"
                disabled={processingTrialId === inspectingTrial.id}
                onClick={() => void handleApproveTrial(inspectingTrial)}
              >
                {processingTrialId === inspectingTrial.id ? t('Đang duyệt…') : t('✓ Phê duyệt & Kích hoạt')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal từ chối đơn đăng ký gói trải nghiệm */}
      {rejectingTrial && (
        <Modal
          title={t(`Từ chối đơn thử #${rejectingTrial.id} - ${rejectingTrial.memberName}`, `Reject trial application #${rejectingTrial.id} - ${rejectingTrial.memberName}`)}
          onClose={() => setRejectingTrial(null)}
          busy={isSubmittingTrialReject}
        >
          <form onSubmit={(e) => void handleSubmitRejectTrial(e)} style={{ display: 'grid', gap: '14px' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
              {t("Vui lòng nhập lý do từ chối để hội viên nhận thông báo và chỉnh sửa nộp lại giấy tờ phù hợp.")}</p>

            <div className="portal-form-group" style={{ margin: 0 }}>
              <label className="portal-label" htmlFor="trial-reject-reason">
                {t("Lý do từ chối *")}</label>
              <textarea
                id="trial-reject-reason"
                className="portal-input"
                rows={3}
                maxLength={500}
                required
                placeholder={t("Vd: Ảnh chụp mờ không đọc được thông tin, số CCCD không khớp bản gốc, v.v.")}
                value={trialRejectReason}
                onChange={(e) => setTrialRejectReason(e.target.value)}
                disabled={isSubmittingTrialReject}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            {trialRejectError && (
              <p data-i18n-managed className="form-error" role="alert" style={{ margin: 0 }}>
                {t(trialRejectError)}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isSubmittingTrialReject}
                onClick={() => setRejectingTrial(null)}
              >
                {t("Hủy")}</button>
              <button
                type="submit"
                className="btn-primary"
                style={{ background: 'var(--portal-danger, #ef4444)' }}
                disabled={isSubmittingTrialReject}
              >
                {isSubmittingTrialReject ? t('Đang từ chối…') : t('Xác nhận từ chối')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* BR-04: Popup Hóa đơn điện tử chỉ hiện khi Payment thành công */}
      {completedPayment && (
        <PaymentInvoice
          payment={completedPayment}
          memberName={completedMemberName}
          membershipCode={completedMembershipCode}
          packageName={completedPackageName}
          cashierName={currentUser?.name}
          onClose={() => setCompletedPayment(null)}
        />
      )}
    </div>
  );
}
