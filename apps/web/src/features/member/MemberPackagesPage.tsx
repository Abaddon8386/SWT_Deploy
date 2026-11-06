import { sourceMessage, useI18n } from '../../shared/i18n';
import { Link, useSearchParams } from 'react-router-dom';
import { clearPurchaseIntent, selectedPackageId } from '../../shared/lib/purchaseIntent';
import { formatPrice, getPackageDetails, isTrialPackage } from '../../shared/lib/membershipPresentation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../../shared/ui/Modal';
import { PageHeader } from '../../shared/ui/PageHeader';
import { upgradeQuote } from '../../shared/lib/upgradeQuote';
import './member-packages.css';
import { notify, resolveNotice } from '../../shared/lib/portalNotices';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { subscribeMembershipChanges } from './membershipRealtime';
import {
  cancelPendingMembershipSubscription,
  createMembershipSubscription,
  getCurrentMembership,
  getMembershipHistory,
  getMembershipPackages,
  getMyMembershipCancellations,
  getMyPayments,
  renewMembershipSubscription,
  requestMembershipHold,
  resumeMembershipSubscription,
  upgradeMembershipSubscription,
  type MemberSubscription,
  type MembershipPackage,
  type MembershipCancellationRequest,
  type Payment,
} from './membershipApi';
import { localizableError } from '../../shared/lib/errorMessage';
import { trialApi, type TrialStatus } from './trialApi';
import { formatCenterDate } from '../../shared/lib/centerTime';

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; data: T };

interface RequestResult {
  subscription: MemberSubscription;
  membershipPackage: MembershipPackage;
  action: 'register' | 'renew' | 'upgrade';
}

// Gói "đồng hành" dài hạn (từ 2 tháng trở lên, hiện là gói 3 tháng) tách khỏi gói 1 tháng bằng tab
const LONG_TERM_DAYS = 60;
const paymentInstructionsNotice = 'Bạn có thể thanh toán bằng VNPay Sandbox hoặc tới quầy lễ tân.';

// The backend VNPay guard decides whether a pending online attempt can still settle.
// Cash receipts under review, settled payments and unknown states must remain blocked here.
function blocksMemberCancellation(payment: Payment): boolean {
  return payment.status !== 'failed' && !(payment.status === 'pending' && payment.method === 'online_wallet');
}

function formatDate(value: string): string {
  return formatCenterDate(value.slice(0, 10));
}

function todayKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function isHigherPackage(currentPkg: MembershipPackage | null, targetPkg: MembershipPackage): boolean {
  if (!currentPkg || currentPkg.id === targetPkg.id) return false;
  if (targetPkg.price > currentPkg.price) return true;
  if (targetPkg.price === currentPkg.price && targetPkg.durationDays > currentPkg.durationDays) return true;
  return false;
}

export function MemberPackagesPage() {
  const { lang, t } = useI18n();
  const [searchParams] = useSearchParams();
  const selectedId = selectedPackageId(searchParams.toString());
  useEffect(() => clearPurchaseIntent(), []);
  const selectedCard = useRef<HTMLElement | null>(null);
  const membershipFocus = useRef<HTMLElement | null>(null);
  const focusedSelection = useRef<number | null>(null);
  const [packagesState, setPackagesState] = useState<LoadState<MembershipPackage[]>>({ status: 'loading' });
  const [currentState, setCurrentState] = useState<LoadState<MemberSubscription | null>>({ status: 'loading' });
  const [historyState, setHistoryState] = useState<LoadState<MemberSubscription[]>>({ status: 'loading' });
  const [paymentsState, setPaymentsState] = useState<LoadState<Payment[]>>({ status: 'loading' });
  const [cancellationsState, setCancellationsState] = useState<LoadState<MembershipCancellationRequest[]>>({ status: 'loading' });

  const [submittingPackageId, setSubmittingPackageId] =
    useState<number | null>(null);
  const requestBusy = useRef(false);
  const createdSubscriptions = useRef<MemberSubscription[]>([]);
  const syncVersion = useRef(0);
  const readVersions = useRef({ packages: 0, current: 0, history: 0, payments: 0, cancellations: 0 });
  const refreshNow = useRef<() => void>(() => {});
  const refreshQueued = useRef(false);
  const [blockedMessage, setBlockedMessage] = useState<string | Error | null>(null);
  const watchedPending = useRef(new Set<number>());
  const announcedPayments = useRef(new Set<number>());
  const [syncError, setSyncError] = useState(false);
  const [returnSyncing, setReturnSyncing] = useState(false);
  const [durationTab, setDurationTab] = useState<'short' | 'long'>('short');
  const [paymentResult, setPaymentResult] = useState<MemberSubscription | null>(null);

  const [actionError, setActionError] = useState<string | Error | null>(null);

  const [requestResult, setRequestResult] =
    useState<RequestResult | null>(null);

  // Bảo lưu gói tập modal state
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [holdError, setHoldError] = useState<string | Error | null>(null);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [isTrialModalOpen, setIsTrialModalOpen] = useState(false);
  const [trialDocType, setTrialDocType] = useState<'CCCD' | 'PASSPORT'>('CCCD');
  const [trialDocumentNumber, setTrialDocumentNumber] = useState('');
  const [trialNationality, setTrialNationality] = useState('');
  const [trialFullName, setTrialFullName] = useState('');
  const [trialFrontImage, setTrialFrontImage] = useState('');
  const [trialBackImage, setTrialBackImage] = useState('');
  const [trialError, setTrialError] = useState<string | Error | { vi: string; en: string }>('');
  const [isClaimingTrial, setIsClaimingTrial] = useState(false);

  const loadTrialStatus = useCallback(async () => {
    try {
      const res = await trialApi.getStatus();
      setTrialStatus(res);
    } catch {
      // Ignore background check failure
    }
  }, []);

  useEffect(() => {
    void loadTrialStatus();
  }, [loadTrialStatus]);

  const handleTrialImageUpload = (file: File, target: 'front' | 'back') => {
    if (file.size > 5 * 1024 * 1024) {
      setTrialError('Dung lượng ảnh tối đa là 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      if (target === 'front') setTrialFrontImage(b64);
      else setTrialBackImage(b64);
      setTrialError('');
    };
    reader.readAsDataURL(file);
  };

  const handleClaimTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    const docClean = trialDocumentNumber.trim();
    if (trialDocType === 'CCCD') {
      if (!/^(\d{9}|\d{12})$/.test(docClean)) {
        setTrialError('Số CCCD không hợp lệ (phải gồm 9 hoặc 12 chữ số).');
        return;
      }
    } else {
      if (docClean.length < 6 || docClean.length > 20) {
        setTrialError('Số Hộ chiếu không hợp lệ (từ 6 đến 20 ký tự).');
        return;
      }
      if (!trialNationality.trim()) {
        setTrialError('Vui lòng nhập quốc tịch cho người nước ngoài.');
        return;
      }
    }
    if (!trialFullName.trim()) {
      setTrialError({ vi: `Vui lòng nhập họ và tên theo ${trialDocType === 'PASSPORT' ? 'Hộ chiếu' : 'CCCD'}.`, en: `Please enter your full name as shown on your ${trialDocType === 'PASSPORT' ? 'passport' : 'citizen ID'}.` });
      return;
    }
    if (!trialFrontImage) {
      setTrialError('Vui lòng tải lên ảnh chụp mặt trước của giấy tờ.');
      return;
    }
    if (trialDocType === 'CCCD' && !trialBackImage) {
      setTrialError('Vui lòng tải lên ảnh chụp mặt sau của CCCD.');
      return;
    }
    setIsClaimingTrial(true);
    setTrialError('');
    try {
      await trialApi.claim({
        documentNumber: docClean,
        fullName: trialFullName.trim(),
        documentType: trialDocType,
        nationality: trialDocType === 'PASSPORT' ? trialNationality.trim() : undefined,
        frontImageUrl: trialFrontImage,
        backImageUrl: trialBackImage || undefined,
      });
      notify(t("Đã gửi đơn đăng ký Gói Trải Nghiệm 3 Ngày! Vui lòng mang giấy tờ gốc đến quầy Lễ tân để kích hoạt."), 'success', { translation: sourceMessage("Đã gửi đơn đăng ký Gói Trải Nghiệm 3 Ngày! Vui lòng mang giấy tờ gốc đến quầy Lễ tân để kích hoạt."),  record: true });
      setIsTrialModalOpen(false);
      setTrialDocumentNumber('');
      setTrialNationality('');
      setTrialFullName('');
      setTrialFrontImage('');
      setTrialBackImage('');
      await Promise.all([loadCurrent(), loadHistory(), loadTrialStatus()]);
    } catch (err) {
      setTrialError(localizableError(err, 'Không thể gửi đơn đăng ký gói trải nghiệm. Vui lòng kiểm tra lại thông tin.'));
    } finally {
      setIsClaimingTrial(false);
    }
  };

  const [isSubmittingHold, setIsSubmittingHold] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isCancellingPending, setIsCancellingPending] = useState(false);
  const [pendingToCancel, setPendingToCancel] = useState<MemberSubscription | null>(null);

  const loadPackages = useCallback(async () => {
    syncVersion.current += 1;
    const version = ++readVersions.current.packages;
    setPackagesState({ status: 'loading' });
    try {
      const data = await getMembershipPackages();
      if (version === readVersions.current.packages) setPackagesState({ status: 'success', data });
    } catch { if (version === readVersions.current.packages) setPackagesState({ status: 'error' }); }
  }, []);

  const loadCurrent = useCallback(async () => {
    syncVersion.current += 1;
    const version = ++readVersions.current.current;
    setCurrentState({ status: 'loading' });
    try {
      const data = await getCurrentMembership();
      if (version === readVersions.current.current) setCurrentState({ status: 'success', data });
    } catch { if (version === readVersions.current.current) setCurrentState({ status: 'error' }); }
  }, []);

  const loadHistory = useCallback(async () => {
    syncVersion.current += 1;
    const version = ++readVersions.current.history;
    setHistoryState({ status: 'loading' });
    try {
      const history = await getMembershipHistory();
      if (version !== readVersions.current.history) return;
      setHistoryState({ status: 'success', data: [
        ...history,
        ...createdSubscriptions.current.filter((item) => !history.some((saved) => saved.id === item.id)),
      ] });
    }
    catch { if (version === readVersions.current.history) setHistoryState({ status: 'error' }); }
  }, []);

  const loadPayments = useCallback(async () => {
    syncVersion.current += 1;
    const version = ++readVersions.current.payments;
    setPaymentsState({ status: 'loading' });
    try {
      const payments = await getMyPayments();
      if (version !== readVersions.current.payments) return null;
      setPaymentsState({ status: 'success', data: payments });
      return payments;
    } catch {
      if (version === readVersions.current.payments) setPaymentsState({ status: 'error' });
      return null;
    }
  }, []);

  const loadCancellations = useCallback(async () => {
    syncVersion.current += 1;
    const version = ++readVersions.current.cancellations;
    setCancellationsState({ status: 'loading' });
    try {
      const data = await getMyMembershipCancellations();
      if (version === readVersions.current.cancellations) setCancellationsState({ status: 'success', data });
    } catch { if (version === readVersions.current.cancellations) setCancellationsState({ status: 'error' }); }
  }, []);

  useEffect(() => {
    void loadPackages();
    void loadCurrent();
    void loadHistory();
    void loadPayments();
    void loadCancellations();
  }, [loadPackages, loadCurrent, loadHistory, loadPayments, loadCancellations]);

  const packages = packagesState.status === 'success' ? packagesState.data : [];
  const current =
    currentState.status === 'success' &&
    currentState.data?.status?.toLowerCase() === 'active'
      ? currentState.data
      : null;
  const isTrial = Boolean(
    current && (
      current.packageName?.toLowerCase().includes('trải nghiệm') ||
      current.packageName?.toLowerCase().includes('trial') ||
      (current.startDate && current.endDate &&
        Math.abs(new Date(current.endDate).getTime() - new Date(current.startDate).getTime()) <= 3.5 * 24 * 60 * 60 * 1000)
    )
  );
  const displayedPackageName = isTrial ? t("Gói Trải Nghiệm 3 Ngày") : current?.packageName;
  const currentPackage = current
    ? packages.find((item) => item.id === current.packageId) ?? null
    : null;
  const frozenSubscription =
    !current && historyState.status === 'success'
      ? historyState.data.find((item) => item.status?.toLowerCase() === 'frozen') ?? null
      : null;
  const pendingItems = historyState.status === 'success'
    ? historyState.data.filter((item) => item.status === 'pending_payment') : [];
  const pending = pendingItems.length === 1 ? pendingItems[0] : null;
  const hasPendingHold = current?.holdStatus?.toUpperCase() === 'PENDING'
    || (historyState.status === 'success' && historyState.data.some(item => item.status === 'active' && item.holdStatus?.toUpperCase() === 'PENDING'));
  const relatedPayments = pending && paymentsState.status === 'success'
    ? paymentsState.data.filter((payment) => payment.subscriptionId === pending.id) : [];
  const pendingPackage = pending ? packages.find((item) => item.id === pending.packageId) : null;

  function renewalCount(subscriptionId: number): number {
    // Match MembershipSubscriptionService.renew(): only pending_payment/active block renewal.
    return historyState.status === 'success'
      ? historyState.data.filter((item) => item.previousSubscriptionId === subscriptionId
        && (item.status === 'active' || item.status === 'pending_payment')).length
      : 0;
  }

  function paidHistoryConflict(): boolean {
    if (historyState.status !== 'success') return true;
    const paid = historyState.data.filter((item) => item.status === 'active' || item.status === 'expired');
    for (let i = 0; i < paid.length; i += 1) {
      const a = paid[i];
      if (!a.startDate || !a.endDate || a.startDate > a.endDate) return true;
      for (let j = i + 1; j < paid.length; j += 1) {
        const b = paid[j];
        if (!b.startDate || !b.endDate || b.startDate > b.endDate) return true;
        const upgradeTransition = (a.previousSubscriptionId === b.id && a.packageId !== b.packageId && a.startDate === b.endDate)
          || (b.previousSubscriptionId === a.id && a.packageId !== b.packageId && b.startDate === a.endDate);
        if (a.startDate <= b.endDate && b.startDate <= a.endDate && !upgradeTransition) return true;
        if (a.previousSubscriptionId != null && a.previousSubscriptionId === b.previousSubscriptionId) return true;
      }
    }
    return false;
  }

  function renewalPath(subscriptionId: number): { tail: MemberSubscription | null; conflict: boolean } {
    if (historyState.status !== 'success' || paidHistoryConflict()
      || historyState.data.some((item) => item.status === 'frozen')) return { tail: null, conflict: true };
    let tail = historyState.data.find((item) => item.id === subscriptionId) ?? null;
    const visited = new Set<number>();
    while (tail) {
      if (visited.has(tail.id)) return { tail: null, conflict: true };
      visited.add(tail.id);
      const next = historyState.data.filter((item) => item.previousSubscriptionId === tail?.id
        && (item.status === 'active' || item.status === 'expired'));
      if (next.length > 1) return { tail: null, conflict: true };
      if (next.length === 0) return { tail, conflict: false };
      if (next[0].startDate <= tail.endDate || next[0].packageId !== tail.packageId) {
        return { tail: null, conflict: true };
      }
      tail = next[0];
    }
    return { tail: null, conflict: true };
  }

  const futurePeriods = historyState.status === 'success'
    ? historyState.data.filter((item) => item.status === 'active' && item.startDate > todayKey())
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
    : [];

  const hasPendingTransfer = paymentsState.status === 'success' && relatedPayments.some((payment) => payment.status === 'pending' && payment.method !== 'online_wallet');
  const pendingTransferId = pending?.id;
  useEffect(() => {
    if (pendingTransferId == null || !hasPendingTransfer) return;
    notify(t("Đã gửi thông báo chuyển khoản. Vui lòng chờ nhân viên xác nhận."), 'info', { translation: sourceMessage("Đã gửi thông báo chuyển khoản. Vui lòng chờ nhân viên xác nhận."),  key: `transfer-pending-${pendingTransferId}`, record: true });
  }, [pendingTransferId, hasPendingTransfer, t]);

  const isStatusSyncing =
    currentState.status === 'loading' ||
    historyState.status === 'loading' ||
    paymentsState.status === 'loading';

  useEffect(() => {
    if (historyState.status === 'success') {
      historyState.data.filter(item => item.status === 'pending_payment')
        .forEach(item => watchedPending.current.add(item.id));
    }
  }, [historyState]);

  // Supabase Broadcast invalidates data; the authenticated API remains authoritative.
  // A foreground read or mutation invalidates an older background snapshot.
  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    async function refresh() {
      if (disposed) return;
      if (inFlight || document.visibilityState === 'hidden' || requestBusy.current
        || isStatusSyncing || packagesState.status === 'loading' || cancellationsState.status === 'loading') {
        refreshQueued.current = true;
        return;
      }
      refreshQueued.current = false;
      inFlight = true;
      const version = syncVersion.current;
      try {
        const [catalog, membership, history, payments, cancellations] = await Promise.all([
          getMembershipPackages(), getCurrentMembership(), getMembershipHistory(), getMyPayments(), getMyMembershipCancellations(),
        ]);
        if (disposed || version !== syncVersion.current || requestBusy.current) {
          refreshQueued.current = true;
          return;
        }
        setPackagesState({ status: 'success', data: catalog });
        setCurrentState({ status: 'success', data: membership });
        setHistoryState({ status: 'success', data: history });
        setPaymentsState({ status: 'success', data: payments });
        setCancellationsState({ status: 'success', data: cancellations });
        createdSubscriptions.current = [];
        setSyncError(false);
        setReturnSyncing(false);
        setRequestResult(previous => previous && history.some(item => item.id === previous.subscription.id && item.status === 'pending_payment') ? previous : null);
        setPaymentResult(previous => previous ? history.find(item => item.id === previous.id) ?? null : null);
        setPendingToCancel(previous => previous && history.some(item => item.id === previous.id && item.status === 'pending_payment') ? previous : null);
        const confirmed = history.find(item => watchedPending.current.has(item.id)
          && !announcedPayments.current.has(item.id)
          && payments.some(payment => payment.subscriptionId === item.id && payment.status === 'success')
          && (item.status === 'pending_payment' || item.status === 'active'));
        if (confirmed) {
          announcedPayments.current.add(confirmed.id);
          setRequestResult(null);
          setPaymentResult(confirmed);
        }
      } catch {
        if (!disposed && version === syncVersion.current && !requestBusy.current) {
          setSyncError(true);
          setReturnSyncing(false);
        }
      } finally {
        inFlight = false;
        if (!disposed && refreshQueued.current && !requestBusy.current && !isStatusSyncing) {
          refreshQueued.current = false;
          void refresh();
        }
      }
    }

    const onRefresh = () => void refresh();
    const onRestore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      syncVersion.current += 1;
      setReturnSyncing(true);
      void refresh();
    };
    refreshNow.current = onRefresh;
    if (refreshQueued.current) onRefresh();
    window.addEventListener('focus', onRefresh);
    window.addEventListener('online', onRefresh);
    window.addEventListener('pageshow', onRestore);
    document.addEventListener('visibilitychange', onRefresh);
    return () => {
      disposed = true;
      if (inFlight) refreshQueued.current = true;
      refreshNow.current = () => {};

      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('online', onRefresh);
      window.removeEventListener('pageshow', onRestore);
      document.removeEventListener('visibilitychange', onRefresh);
    };
  }, [isStatusSyncing, packagesState.status, cancellationsState.status, submittingPackageId]);

  useEffect(() => {
    if (syncError) {
      notify(t("Không thể đồng bộ trạng thái mới nhất. Chưa thể xác minh điều kiện mua gói; hệ thống sẽ thử lại khi kết nối được khôi phục."), 'error', { translation: sourceMessage("Không thể đồng bộ trạng thái mới nhất. Chưa thể xác minh điều kiện mua gói; hệ thống sẽ thử lại khi kết nối được khôi phục."),
        key: 'packages-sync', silent: true, record: true, action: { label: t('Thử đồng bộ lại'), translation: sourceMessage('Thử đồng bộ lại'), run: () => refreshNow.current() },
      });
    } else resolveNotice('packages-sync');
    return () => resolveNotice('packages-sync');
  }, [syncError, t]);

  useEffect(() => subscribeMembershipChanges(
    () => refreshNow.current(),
    () => setSyncError(true),
  ), []);

  useEffect(() => {
    if (isStatusSyncing || packagesState.status !== 'success' || !selectedCard.current || focusedSelection.current === selectedId) return;
    selectedCard.current.scrollIntoView({ block: 'center' });
    selectedCard.current.focus({ preventScroll: true });
    focusedSelection.current = selectedId;
  }, [isStatusSyncing, packagesState.status, selectedId]);

  async function handleMembershipAction(
    membershipPackage: MembershipPackage,
    renewFrom: MemberSubscription | null,
    upgradeFrom: MemberSubscription | null = null,
  ) {
    if (
      packagesState.status !== 'success' || currentState.status !== 'success' ||
      historyState.status !== 'success' || paymentsState.status !== 'success' ||
      syncError || returnSyncing || hasPendingHold || frozenSubscription || pendingItems.length > 0 || submittingPackageId !== null || requestBusy.current
    ) {
      return;
    }

    if (current && current.id !== renewFrom?.id && current.id !== upgradeFrom?.id) {
      return;
    }

    if (renewFrom && renewalPath(renewFrom.id).conflict) {
      return;
    }

    if (upgradeFrom && renewalCount(upgradeFrom.id) > 0) {
      return;
    }

    requestBusy.current = true;
    syncVersion.current += 1;
    setSubmittingPackageId(membershipPackage.id);
    setActionError(null);

    try {
      const subscription = upgradeFrom
        ? await upgradeMembershipSubscription(upgradeFrom.id, membershipPackage.id)
        : renewFrom
          ? await renewMembershipSubscription(renewFrom.id)
          : await createMembershipSubscription(membershipPackage.id);

      createdSubscriptions.current.push(subscription);
      setHistoryState((previous) =>
        previous.status === 'success'
          ? { status: 'success', data: [subscription, ...previous.data] }
          : previous,
      );
      void loadPayments();

      setRequestResult({
        subscription,
        membershipPackage,
        action: upgradeFrom ? 'upgrade' : renewFrom ? 'renew' : 'register',
      });
    } catch (error) {
      setBlockedMessage(
        localizableError(error, 'Không thể xử lý yêu cầu. Vui lòng thử lại.'),
      );
    } finally {
      await loadHistory();
      setSubmittingPackageId(null);
      requestBusy.current = false;
      if (refreshQueued.current) refreshNow.current();
    }
  }

  async function handleResume() {
    if (!frozenSubscription || requestBusy.current) return;
    requestBusy.current = true;
    syncVersion.current += 1;
    setIsResuming(true);
    setActionError(null);
    try {
      const resumed = await resumeMembershipSubscription(frozenSubscription.id);
      setCurrentState({ status: 'success', data: resumed });
      setHistoryState((previous) => previous.status === 'success'
        ? { status: 'success', data: previous.data.map((item) => item.id === resumed.id ? resumed : item) }
        : previous);
      notify(t("Đã mở lại gói tập. Thời hạn còn lại được giữ nguyên, không phát sinh phí."), 'success', { translation: sourceMessage("Đã mở lại gói tập. Thời hạn còn lại được giữ nguyên, không phát sinh phí."),  record: true });
    } catch (error) {
      setActionError(localizableError(error, 'Không thể mở lại gói tập. Vui lòng thử lại.'));
    } finally {
      setIsResuming(false);
      requestBusy.current = false;
      if (refreshQueued.current) refreshNow.current();
    }
  }

  async function handleSubmitHold(e: React.FormEvent) {
    e.preventDefault();
    if (!current || isSubmittingHold || requestBusy.current) return;
    const trimmed = holdReason.trim();
    if (!trimmed) {
      setHoldError('Vui lòng nhập lý do bảo lưu gói tập.');
      return;
    }

    setIsSubmittingHold(true);
    requestBusy.current = true;
    syncVersion.current += 1;
    setHoldError(null);
    setActionError(null);
    try {
      const updated = await requestMembershipHold(current.id, trimmed);
      setCurrentState({ status: 'success', data: updated });
      setIsHoldModalOpen(false);
      setHoldReason('');
      notify(t("Đã gửi yêu cầu bảo lưu gói tập. Lễ tân sẽ xử lý yêu cầu của bạn trong thời gian sớm nhất."), 'success', { translation: sourceMessage("Đã gửi yêu cầu bảo lưu gói tập. Lễ tân sẽ xử lý yêu cầu của bạn trong thời gian sớm nhất."),  record: true });
      await loadHistory();
    } catch (error) {
      await Promise.all([loadCurrent(), loadHistory(), loadCancellations()]);
      setHoldError(localizableError(error, 'Không thể gửi yêu cầu bảo lưu. Vui lòng thử lại.'));
    } finally {
      setIsSubmittingHold(false);
      requestBusy.current = false;
      if (refreshQueued.current) refreshNow.current();
    }
  }

  async function handleCancelPending(subscriptionId: number) {
    if (returnSyncing || syncError || isStatusSyncing || isCancellingPending || requestBusy.current) return;
    requestBusy.current = true;
    syncVersion.current += 1;
    setIsCancellingPending(true);
    setActionError(null);
    try {
      const cancelled = await cancelPendingMembershipSubscription(subscriptionId);
      createdSubscriptions.current = createdSubscriptions.current.map((item) =>
        item.id === cancelled.id ? cancelled : item,
      );
      setHistoryState((previous) =>
        previous.status === 'success'
          ? {
              status: 'success',
              data: previous.data.map((item) =>
                item.id === cancelled.id ? cancelled : item,
              ),
            }
          : previous,
      );
      setRequestResult(null);
      setPendingToCancel(null);
      notify(t(`Đã hủy yêu cầu gói tập #${cancelled.id}.`, `Membership request #${cancelled.id} cancelled.`), 'success', { translation: sourceMessage(`Đã hủy yêu cầu gói tập #${cancelled.id}.`, `Membership request #${cancelled.id} cancelled.`),  record: true });
    } catch (error) {
      setActionError(localizableError(error, 'Không thể hủy yêu cầu gói tập. Vui lòng thử lại.'));
    } finally {
      await Promise.all([loadCurrent(), loadHistory(), loadPayments()]);
      setIsCancellingPending(false);
      requestBusy.current = false;
      if (refreshQueued.current) refreshNow.current();
    }
  }


  const purchasablePackages = packages.filter((item) => item.status === 'active' && !isTrialPackage(item));
  const hasRegisteredAnyPackage = Boolean(
    current ||
    (historyState.status === 'success' && historyState.data.length > 0) ||
    trialStatus?.alreadyClaimed
  );

  return (
    <div className="portal-container member-packages" data-i18n-managed>
      {blockedMessage && <Modal returnFocusRef={membershipFocus} title={t("Chưa thể thực hiện")} onClose={() => setBlockedMessage(null)}>
        <div className="package-result package-result--error">
          <p role="alert">{t(blockedMessage)}</p>
          <button type="button" className="btn-primary" onClick={() => setBlockedMessage(null)}>{t("Đóng")}</button>
        </div>
      </Modal>}
      <PageHeader
        eyebrow={t("Hội viên")}
        title={t("Gói tập")}
      />
      {returnSyncing && <p role="status">{t('Đang đồng bộ thông tin gói tập…', 'Synchronizing membership information…')}</p>}

      {/* Unified Skeleton for Status Area (replaces piecemeal text lines) */}
      {isStatusSyncing && !current && !pending && (
        <div className="package-status-skeleton" role="status" aria-busy="true">
          <span className="sr-only">{t("Đang đồng bộ thông tin gói tập…")}</span>
          <div className="portal-card">
            <div className="portal-skeleton-line" style={{ width: '22%', height: 12, marginBottom: 14 }} />
            <div className="portal-skeleton-line" style={{ width: '48%', height: 22, marginBottom: 10 }} />
            <div className="portal-skeleton-line" style={{ width: '68%', height: 14, marginBottom: 24 }} />
            <div className="portal-skeleton" style={{ width: '100%', height: 44 }} />
          </div>
          <div className="portal-card">
            <div className="portal-skeleton-line" style={{ width: '40%', height: 18, marginBottom: 14 }} />
            <div className="portal-skeleton-line" style={{ width: '65%', height: 14 }} />
          </div>
        </div>
      )}

      {currentState.status === 'error' && (
        <div className="portal-alert" role="alert">
          <span>{t("Không thể kiểm tra gói hiện tại.")}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadCurrent()}>{t("Thử lại")}</button>
        </div>
      )}
      {historyState.status === 'error' && (
        <div className="portal-alert" role="alert">
          <span>{t("Không thể kiểm tra lịch sử gói.")}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadHistory()}>{t("Thử lại")}</button>
        </div>
      )}
      {paymentsState.status === 'error' && (
        <div className="portal-alert" role="alert">
          <span>{t("Không thể kiểm tra thanh toán.")}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadPayments()}>{t("Thử lại")}</button>
        </div>
      )}
      {cancellationsState.status === 'error' && (
        <div className="portal-alert" role="alert">
          <span>{t("Không thể kiểm tra trạng thái yêu cầu hủy gói.")}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadCancellations()}>{t("Thử lại")}</button>
        </div>
      )}

      {/* Trạng thái: Đơn trải nghiệm đang chờ Lễ tân duyệt */}
      {!current && trialStatus?.status === 'PENDING_APPROVAL' && (
        <section
          className="portal-card"
          style={{
            marginBottom: 20,
            background: 'color-mix(in srgb, var(--portal-salmon) 8%, var(--portal-surface))',
            borderColor: 'var(--portal-salmon)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--portal-salmon)',
                background: 'var(--portal-tint)',
                padding: '4px 10px',
                borderRadius: 99,
              }}
            >
              {t(" CHỜ LỄ TÂN PHÊ DUYỆT TẠI QUẦY ")}</span>
            <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
              {t(" Đã nộp: ")}{(trialStatus.requestedAt ?? trialStatus.redeemedAt) ? formatCenterDate((trialStatus.requestedAt ?? trialStatus.redeemedAt)!) : t("Gần đây")}
            </span>
          </div>
          <h3 style={{ margin: '10px 0 6px', fontSize: 18, fontWeight: 700 }}>
            {t(" Đơn đăng ký Gói Trải Nghiệm 3 Ngày đang được xử lý ")}</h3>
          <p className="row-card__meta" style={{ margin: 0, lineHeight: 1.5 }}>
            {t(" Hệ thống đã ghi nhận thông tin (")}{trialStatus.documentType === 'PASSPORT' ? t("Hộ chiếu") : 'CCCD'} • {trialStatus.documentNumberMasked ?? trialStatus.cccd ?? '—'}{t("). Vui lòng mang theo ")}<strong>{t("giấy tờ bản gốc (")}{trialStatus.documentType === 'PASSPORT' ? t("Hộ chiếu") : 'CCCD'})</strong> {t(" đến quầy Lễ tân để nhân viên đối chiếu và kích hoạt 3 ngày tập cùng 01 buổi tập HLV 1:1 miễn phí. ")}</p>
        </section>
      )}

      {/* Trạng thái: Đơn trải nghiệm bị từ chối */}
      {!current && trialStatus?.status === 'REJECTED' && (
        <section
          className="portal-card"
          style={{
            marginBottom: 20,
            borderColor: 'var(--portal-danger)',
            background: 'color-mix(in srgb, var(--portal-danger) 8%, var(--portal-surface))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: 'var(--portal-danger)' }}>
                {t(" Đơn đăng ký Gói Trải Nghiệm 3 Ngày bị từ chối ")}</h3>
              <p className="row-card__meta" style={{ margin: 0 }}>
                {t(" Lý do từ Lễ tân: ")}<strong>{trialStatus.rejectionReason || t("Thông tin giấy tờ không khớp bản gốc.")}</strong>{t(". Bạn có thể kiểm tra và nộp lại đơn mới. ")}</p>
            </div>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => {
                setTrialError('');
                setIsTrialModalOpen(true);
              }}
            >
              {t(" Nộp lại đơn ")}</button>
          </div>
        </section>
      )}

      {/* Banner mời nhận gói trải nghiệm (chỉ hiển thị cho hội viên mới chưa từng đăng ký bất kỳ gói tập nào) */}
      {!hasRegisteredAnyPackage && trialStatus?.eligible && trialStatus?.status !== 'PENDING_APPROVAL' && trialStatus?.status !== 'REJECTED' && (
        <section
          className="portal-card"
          style={{
            marginBottom: 20,
            background: 'linear-gradient(135deg, rgba(226, 91, 69, 0.12) 0%, rgba(217, 119, 6, 0.15) 100%)',
            border: '1px solid rgba(226, 91, 69, 0.3)',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="meta-label" style={{ color: 'var(--color-primary, #e25b45)' }}>
                {t(" Đặc quyền Hội viên mới ")}</div>
              <h2 className="portal-card-title" style={{ marginTop: 6, fontSize: '1.25rem' }}>
                {t(" Gói Trải Nghiệm 3 Ngày miễn phí (Kèm 01 buổi tập HLV 1:1) ")}</h2>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setTrialError('');
                setIsTrialModalOpen(true);
              }}
            >
              {t(" Nhận 3 ngày tập miễn phí ")}</button>
          </div>
        </section>
      )}

      {current && (
        <section
          className="portal-card portal-card--feature package-current"
          style={{ marginBottom: 16 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="meta-label">
                {t(" Gói hiện tại ")}</div>
              <h2
                className="portal-card-title"
                style={{ marginTop: 8 }}
              >
                {displayedPackageName}
              </h2>
              <p className="row-card__meta" style={{ marginTop: 4 }}>
                {t(" Hiệu lực từ ")}{formatDate(current.startDate)} {t("đến ")}{formatDate(current.paidThroughDate ?? current.endDate)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link to="/member/card" className="btn-primary btn-sm">
                {t(" Xem thẻ QR Check-in ")}</Link>
              <Link to="/member/classes" className="btn-secondary btn-sm">
                {t(" Đặt lịch lớp học ")}</Link>
              {!isTrial && (
                <details className="package-manage">
                  <summary className="btn-secondary btn-sm">{t("Quản lý gói")}</summary>
                  <div className="package-manage__menu">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={current.holdStatus === 'PENDING'}
                      onClick={() => {
                        setHoldError(null);
                        setHoldReason(current.holdReason && current.holdStatus !== 'REJECTED' ? current.holdReason : '');
                        setIsHoldModalOpen(true);
                      }}
                    >
                      {current.holdStatus === 'PENDING' ? t("Đang chờ duyệt bảo lưu") : t("Bảo lưu gói tập")}
                    </button>
                  </div>
                </details>
              )}
            </div>
          </div>
        </section>
      )}


      {frozenSubscription && (
        <section
          className="portal-card"
          style={{ marginBottom: 24, border: '1px solid color-mix(in srgb, var(--portal-info) 55%, transparent)', background: 'color-mix(in srgb, var(--portal-info) 10%, var(--portal-surface))' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div className="meta-label">
              {t(" Gói tập đang bảo lưu ")}</div>
            <span className="badge badge-info">{t("ĐANG BẢO LƯU")}</span>
          </div>
          <h2 className="portal-card-title" style={{ marginTop: 10 }}>
            {frozenSubscription.packageName}
          </h2>
          <p className="row-card__meta" style={{ marginTop: 4 }}>
            {t(" Thời hạn gói: ")}{formatDate(frozenSubscription.startDate)} {t("đến ")}{formatDate(frozenSubscription.endDate)}
          </p>
          {frozenSubscription.holdReason && (
            <p className="row-card__meta" style={{ marginTop: 4, fontWeight: 600 }}>
              {t(" Lý do bảo lưu: \"")}{frozenSubscription.holdReason}"
            </p>
          )}
          <p className="row-card__meta" style={{ marginTop: 6 }}>
            {t(" Gói tập của bạn đã được Lễ tân xác nhận bảo lưu. Các lịch lớp học đặt trước trong tương lai đã được hủy tự động. ")}</p>
          <p className="row-card__meta">{t("Mở lại để tiếp tục sử dụng số ngày còn lại, không cần thanh toán lại. Bạn có thể đặt lại lịch học sau khi mở gói.")}</p>
          <button type="button" className="btn-primary" disabled={isResuming || isStatusSyncing || pendingItems.length > 0}
            onClick={() => void handleResume()}>
            {isResuming ? t("Đang mở lại…") : t("Mở lại gói tập miễn phí")}
          </button>
        </section>
      )}

      {pendingItems.length > 1 && (
        <div className="portal-alert" role="alert">
          <span>{t("Có nhiều yêu cầu đang chờ. Vui lòng liên hệ nhân viên để kiểm tra.")}</span>
        </div>
      )}

      {pending && (
        <section
          ref={membershipFocus}
          tabIndex={-1}
          className="portal-card package-pending"
          style={{ marginBottom: 16, border: '1px solid var(--color-border-medium)', background: 'var(--color-bg-warm)' }}
        >
          <div className="package-pending__head">
            <div>
              <h2 className="portal-card-title">{pending.packageName}</h2>
              <p className="row-card__meta" style={{ margin: '4px 0 0' }}>
                {t(" Yêu cầu #")}{pending.id}{pendingPackage ? t(` · ${formatPrice(pending.upgradeCharge ?? pending.quotedPrice ?? pendingPackage.price)} · ${pendingPackage.durationDays} ngày`, ` · ${formatPrice(pending.upgradeCharge ?? pending.quotedPrice ?? pendingPackage.price)} · ${pendingPackage.durationDays} days`) : ''}
              </p>
            </div>
            <span className="badge badge-warning">{t("Đang chờ thanh toán")}</span>
          </div>
          {paymentsState.status === 'success' && relatedPayments.length === 0 && pendingPackage && (
            <p className="row-card__meta" role="status">{t(paymentInstructionsNotice)}</p>
          )}
          {paymentsState.status === 'success' && relatedPayments.some((payment) => payment.status === 'success') && (
            <p role="alert">{t("Thanh toán đã ghi nhận nhưng gói chưa active. Vui lòng yêu cầu nhân viên kiểm tra.")}</p>
          )}
          {paymentsState.status === 'success' && relatedPayments.some((payment) => payment.status === 'pending' && payment.method === 'online_wallet') && (
            <p role="status">{t('VNPay đang chờ xác nhận. Quay lại website không đồng nghĩa thanh toán thất bại. Hệ thống sẽ kiểm tra giao dịch trước khi cho phép hủy yêu cầu.', 'VNPay is awaiting confirmation. Returning to the website does not mean payment failed. The system checks the transaction before allowing cancellation.')}</p>
          )}
          {paymentsState.status === 'success' && relatedPayments.some((payment) => payment.status === 'failed') && (
            <p role="alert">{t('Có giao dịch thất bại. Bạn có thể chọn lại phương thức thanh toán hoặc hủy yêu cầu nếu chưa có khoản thanh toán thành công.', 'A transaction failed. You may choose a payment method again or cancel the request if no payment has succeeded.')}</p>
          )}
          {paymentsState.status === 'success' && relatedPayments.some((payment) => payment.status === 'refunded') && (
            <p role="alert">{t("Giao dịch đã hoàn tiền. Vui lòng liên hệ nhân viên để xác nhận cách thanh toán tiếp theo.")}</p>
          )}
          {paymentsState.status === 'success' && relatedPayments.length === 0 && !pendingPackage && (
            <p role="alert">{t("Không tìm thấy giá gói để gửi yêu cầu. Vui lòng thử lại sau.")}</p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <RefreshButton label={t("Tải lại trạng thái")} onClick={() => {
              if (syncError || returnSyncing) refreshNow.current();
              else { void loadCurrent(); void loadHistory(); void loadPayments(); }
            }} />
            {pendingPackage && !returnSyncing && !syncError && (
              <Link
                to={`/member/packages/checkout?packageId=${pendingPackage.id}&subscriptionId=${pending.id}`}
                className="btn-primary btn-sm"
              >
                {t(" Chọn phương thức thanh toán ")}</Link>
            )}
            <button
              type="button"
              className="btn-secondary btn-sm"
              style={{ color: 'var(--portal-danger, #fca5a5)', borderColor: 'var(--portal-danger)' }}
              disabled={returnSyncing || syncError || isStatusSyncing || isCancellingPending || paymentsState.status !== 'success' || relatedPayments.some(blocksMemberCancellation)}
              onClick={() => { setActionError(null); setPendingToCancel(pending); }}
            >
              {isCancellingPending ? t("Đang hủy…") : t("Hủy yêu cầu đăng ký")}
            </button>
          </div>
        </section>
      )}

      {actionError && !pendingToCancel && (
        <div
          className="portal-card"
          role="alert"
          style={{ marginBottom: 24 }}
        >
          <h2 className="portal-card-title">
            {t(" Không thể xử lý yêu cầu ")}</h2>

          <p className="row-card__meta">
            {t(actionError)}
          </p>
        </div>
      )}

      {packagesState.status === 'loading' && (
        <div className="grid-3" role="status" aria-busy="true">
          <span className="sr-only">{t("Đang tải danh sách gói tập…")}</span>
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="portal-card" style={{ marginBottom: 0 }}>
              <div className="portal-skeleton-line" style={{ width: '42%', height: 12, marginBottom: 16 }} />
              <div className="portal-skeleton-line" style={{ width: '72%', height: 26, marginBottom: 12 }} />
              <div className="portal-skeleton-line" style={{ width: '95%', height: 14, marginBottom: 8 }} />
              <div className="portal-skeleton-line" style={{ width: '84%', height: 14, marginBottom: 20 }} />
              <div className="portal-skeleton-line" style={{ width: '90%', height: 13, marginBottom: 10 }} />
              <div className="portal-skeleton-line" style={{ width: '86%', height: 13, marginBottom: 10 }} />
              <div className="portal-skeleton-line" style={{ width: '78%', height: 13, marginBottom: 24 }} />
              <div className="portal-skeleton-line" style={{ width: '55%', height: 32, marginBottom: 20 }} />
              <div className="portal-skeleton" style={{ width: '100%', height: 42, borderRadius: 12 }} />
            </div>
          ))}
        </div>
      )}

      {packagesState.status === 'error' && (
        <div className="portal-card portal-empty" role="alert">
          <h2 className="portal-card-title">
            {t(" Không thể tải gói tập ")}</h2>

          <p>{t("Vui lòng thử lại sau ít phút.")}</p>

          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 20 }}
            onClick={() => void loadPackages()}
          >
            {t(" Thử lại ")}</button>
        </div>
      )}

      {packagesState.status === 'success' && (purchasablePackages.length === 0 ? (
        <div className="portal-card portal-empty">
          <h2 className="portal-card-title">
            {t(" Chưa có gói tập khả dụng ")}</h2>

          <p>{t("Vui lòng quay lại sau.")}</p>
        </div>
      ) : (
        <>
          {purchasablePackages.some((p) => p.durationDays >= LONG_TERM_DAYS) && purchasablePackages.some((p) => p.durationDays < LONG_TERM_DAYS) && (
            <div className="package-term-tabs" role="group" aria-label={t("Thời hạn gói tập")}>
              <button type="button" className={durationTab === 'short' ? 'is-active' : ''} aria-pressed={durationTab === 'short'} onClick={() => setDurationTab('short')}>{t("Gói 1 tháng")}</button>
              <button type="button" className={durationTab === 'long' ? 'is-active' : ''} aria-pressed={durationTab === 'long'} onClick={() => setDurationTab('long')}>{t("Đồng hành dài hạn")}</button>
            </div>
          )}
          <section className="grid-3" ref={pending ? undefined : membershipFocus} tabIndex={-1} role="region" aria-label={t("Danh mục gói tập")}>
            {purchasablePackages.filter((pkg) => {
              if (!purchasablePackages.some((p) => p.durationDays >= LONG_TERM_DAYS) || !purchasablePackages.some((p) => p.durationDays < LONG_TERM_DAYS)) return true;
              return durationTab === 'long' ? pkg.durationDays >= LONG_TERM_DAYS : pkg.durationDays < LONG_TERM_DAYS;
            }).map((membershipPackage) => {
            const details = getPackageDetails(membershipPackage, lang);
            // Chỉ điều có giá trị so sánh: lượt đặt lớp + quyền lợi do catalog mô tả (thời hạn đã nằm cạnh giá)
            const highlights = [
              membershipPackage.classCreditLimit != null
                ? t(`${membershipPackage.classCreditLimit} lượt đặt lớp mỗi kỳ`, `${membershipPackage.classCreditLimit} class bookings per period`)
                : t("Không giới hạn lượt đặt lớp"),
              ...details.perks,
            ];
            // Chỉ gập khi còn từ 2 ý trở lên; thừa đúng 1 ý thì hiện luôn
            const visibleCount = highlights.length <= 3 ? highlights.length : 2;
            const isCurrent =
              current?.packageId ===
              membershipPackage.id;

            const expiredForPackage = historyState.status === 'success'
              ? historyState.data.filter((item) =>
                  item.packageId === membershipPackage.id &&
                  (item.status === 'active' || item.status === 'expired') &&
                  item.endDate < todayKey(),
                ).sort((a, b) => b.endDate.localeCompare(a.endDate))
              : [];
            const ambiguousRenewal = !current && expiredForPackage.length > 1 &&
              expiredForPackage[0].endDate === expiredForPackage[1].endDate;
            const renewFrom = current && isCurrent ? current :
              !current && !ambiguousRenewal ? expiredForPackage[0] ?? null : null;
            const upgradeFrom =
              current && !isCurrent && isHigherPackage(currentPackage, membershipPackage)
                ? current
                : null;
            const renewalConflict = renewFrom && historyState.status === 'success' ? renewalPath(renewFrom.id).conflict : false;
            const nextRenewals = upgradeFrom ? renewalCount(upgradeFrom.id) : 0;
            const hasPaidFutureUpgrade = upgradeFrom !== null && futurePeriods.length > 0;
            const quote = upgradeFrom ? upgradeQuote(upgradeFrom, membershipPackage.price, todayKey()) : null;
            const upgradeCovered = quote !== null && !quote.allowed;

            const isPending =
              pending?.packageId ===
              membershipPackage.id;

            const isSubmitting =
              submittingPackageId ===
              membershipPackage.id;

            const hasLowerOrNonUpgradableCurrentPackage =
              current !== null && !isCurrent && !upgradeFrom;

            const disabled =
              syncError || returnSyncing || hasPendingHold || frozenSubscription !== null ||
              submittingPackageId !== null ||
              packagesState.status !== 'success' || currentState.status !== 'success' ||
              historyState.status !== 'success' || paymentsState.status !== 'success' ||
              pendingItems.length > 0 ||
              nextRenewals > 0 ||
              hasPaidFutureUpgrade ||
              renewalConflict ||
              ambiguousRenewal ||
              hasLowerOrNonUpgradableCurrentPackage ||
              upgradeCovered;

            const blockedReason = syncError ? "Chờ đồng bộ trạng thái mới nhất."
              : hasPendingHold ? "Yêu cầu bảo lưu đang chờ xử lý. Gói hiện tại vẫn có hiệu lực."
              : isStatusSyncing ? "Đang kiểm tra gói và thanh toán."
              : currentState.status === 'error' || historyState.status === 'error' || paymentsState.status === 'error'
                ? "Không thể xác minh trạng thái. Vui lòng thử tải lại."
              : pendingItems.length > 0 ? current ? "Yêu cầu đang chờ xử lý. Gói hiện tại vẫn giữ nguyên hiệu lực." : "Yêu cầu đang chờ thanh toán."
              : hasPaidFutureUpgrade ? "Kỳ tiếp theo đã thanh toán. Vui lòng liên hệ nhân viên trước khi nâng cấp."
              : nextRenewals > 0 ? "Đã có kỳ tiếp theo; vui lòng liên hệ nhân viên trước khi nâng cấp."
              : frozenSubscription ? "Mở lại gói bảo lưu trước khi tiếp tục."
              : hasLowerOrNonUpgradableCurrentPackage ? "Chỉ có thể gia hạn gói hiện tại hoặc nâng lên gói cao hơn."
              : upgradeCovered ? "Giá trị còn lại của gói hiện tại đã bằng hoặc vượt giá gói này. Hãy chọn gói cao hơn hoặc gia hạn khi gói sắp hết."
              : ambiguousRenewal ? "Có nhiều kỳ cùng ngày kết thúc. Vui lòng liên hệ nhân viên." : null;

            let buttonText = historyState.status === 'success' && historyState.data.length === 0
              ? t("Đăng ký lần đầu") : t("Đăng ký gói mới");

            if (isSubmitting) {
              buttonText = t("Đang xử lý…");
            } else if (hasPendingHold) {
              buttonText = t("Đang chờ bảo lưu");
            } else if (frozenSubscription) {
              buttonText = t("Đang có gói bảo lưu");
            } else if (renewalConflict || nextRenewals > 1) {
              buttonText = t("Cần kiểm tra gia hạn");
            } else if (hasPaidFutureUpgrade) {
              buttonText = t("Có kỳ đã thanh toán");
            } else if (nextRenewals === 1) {
              buttonText = renewFrom ? t("Đã gia hạn") : t("Có yêu cầu đang chờ");
            } else if (pendingItems.length > 0) {
              buttonText = isPending
                ? t("Đang chờ xác nhận")
                : t("Có yêu cầu đang chờ");
            } else if (ambiguousRenewal) {
              buttonText = t("Cần kiểm tra lịch sử");
            } else if (current) {
              buttonText = isCurrent
                ? t("Gia hạn")
                : upgradeFrom
                  ? t("Nâng cấp gói")
                  : t("Đang có gói hoạt động");
            } else if (renewFrom) {
              buttonText = t("Gia hạn");
            }

            return (
              <article
                tabIndex={selectedId === membershipPackage.id ? -1 : undefined}
                ref={selectedId === membershipPackage.id ? selectedCard : undefined}
                className={`portal-card ${isCurrent || selectedId === membershipPackage.id ? 'portal-card--feature' : ''}`}
                key={membershipPackage.id}
                style={{
                  marginBottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div className="meta-label">
                      {selectedId === membershipPackage.id ? t("Gói bạn đã chọn · ") : ''}{details.tierBadge}
                    </div>
                    {isCurrent && <span className="badge badge-success">{t("Gói hiện tại")}</span>}
                  </div>

                  <h2
                    className="portal-card-title"
                    style={{ margin: '14px 0 8px' }}
                  >
                    {membershipPackage.name}
                  </h2>

                  <p className="row-card__meta" style={{ margin: 0, lineHeight: 1.6 }}>
                    {details.summary}
                  </p>

                  <ul className="package-benefit-list" aria-label={t(`Quyền lợi gói ${membershipPackage.name}`, `${membershipPackage.name} benefits`)}>
                    {highlights.slice(0, visibleCount).map((benefit, index) => (
                      <li key={index} className="package-benefit-item">
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                  {highlights.length > visibleCount && (
                    <details className="package-benefit-more">
                      <summary>{t("Xem thêm ")}{highlights.length - visibleCount} {t("quyền lợi")}</summary>
                      <ul className="package-benefit-list">
                        {highlights.slice(visibleCount).map((benefit, index) => (
                          <li key={index} className="package-benefit-item">
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                </div>

                <div>
                  <div
                    className="metric-value"
                    style={{
                      fontSize: '1.9rem',
                      marginTop: 8,
                    }}
                  >
                    {formatPrice(membershipPackage.price)}
                    <span className="package-price-term"> / {membershipPackage.durationDays} {t("ngày")}</span>
                  </div>
                  {quote && (
                    <p className="row-card__meta" data-testid="upgrade-quote" style={{ margin: '8px 0 0' }}>
                      {quote.allowed ? (
                        <>
                          <strong>{t("Nâng cấp: thanh toán ")}{formatPrice(quote.amount)}</strong>
                          {t(` — đã trừ ${formatPrice(quote.credit)} giá trị còn lại của gói hiện tại (${quote.remainingDays}/${quote.totalDays} ngày chưa dùng).`, ` — includes ${formatPrice(quote.credit)} credit from your current membership (${quote.remainingDays}/${quote.totalDays} unused days).`)}
                          {' '}{t("Gói mới tính từ hôm nay; gói hiện tại kết thúc khi thanh toán được xác nhận. ")}</>
                      ) : (
                        <>{t("Giá trị còn lại của gói hiện tại (")}{formatPrice(quote.credit)}{t(") đã bằng hoặc vượt giá gói này nên không nâng cấp được.")}</>
                      )}
                    </p>
                  )}

                  <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: 18, width: '100%' }}
                    disabled={submittingPackageId !== null || isStatusSyncing}
                    onClick={() => {
                      if (disabled) {
                        setBlockedMessage(blockedReason ?? (renewalConflict || nextRenewals > 1
                          ? 'Lịch sử gói có kỳ trùng, chồng ngày hoặc chuỗi gia hạn bất thường. Vui lòng liên hệ nhân viên để kiểm tra.'
                          : 'Chưa thể thực hiện thao tác với gói tập này. Vui lòng tải lại trạng thái hoặc liên hệ lễ tân.'));
                        return;
                      }
                      void handleMembershipAction(
                        membershipPackage,
                        renewFrom,
                        upgradeFrom,
                      );
                    }}
                  >
                    {buttonText}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
        </>
      ))}

      {paymentResult && !blockedMessage && !pendingToCancel && !isHoldModalOpen && (
        <Modal returnFocusRef={membershipFocus} title={t("Thanh toán thành công")} onClose={() => setPaymentResult(null)}>
          <div className="package-result">
            <h3>{paymentResult.packageName}</h3>
            <p>{t("Gói tập của bạn đã được xác nhận.")}</p>
            <p className="row-card__meta">{paymentResult.status === 'active'
              ? paymentResult.startDate > todayKey() ? t("Kỳ tiếp theo đã thanh toán, chờ ngày bắt đầu.") : t("Gói tập đã được kích hoạt.")
              : t("Đã thanh toán, đang chờ kích hoạt.")}</p>
            <button type="button" className="btn-primary" onClick={() => setPaymentResult(null)}>{t("Đóng")}</button>
          </div>
        </Modal>
      )}

      {requestResult && !blockedMessage && !pendingToCancel && !paymentResult && (
        <Modal returnFocusRef={membershipFocus} title={t("Đã gửi yêu cầu thành công")} onClose={() => setRequestResult(null)}>
          <div className="package-result">
            <h3>{requestResult.membershipPackage.name}</h3>
            <p>{requestResult.action === 'upgrade' ? t("Nâng cấp gói tập") : requestResult.action === 'renew' ? t("Gia hạn gói tập") : t("Đăng ký gói tập")} · #{requestResult.subscription.id}</p>
            <p>{t("Yêu cầu của bạn đang chờ xử lý.")}</p>
            {requestResult.action === 'upgrade' && requestResult.subscription.upgradeCharge != null
              ? <p className="row-card__meta">{t("Số tiền cần thanh toán để nâng cấp: ")}<strong>{formatPrice(requestResult.subscription.upgradeCharge)}</strong> {t(" (giá gói mới ")}{formatPrice(requestResult.membershipPackage.price)}{requestResult.subscription.creditApplied ? t(`, đã trừ ${formatPrice(requestResult.subscription.creditApplied)} giá trị còn lại của gói hiện tại`, `, less ${formatPrice(requestResult.subscription.creditApplied)} remaining value from your current membership`) : ''}{t("). Số tiền này đã được chốt, kể cả khi giá gói thay đổi trước lúc bạn thanh toán. Gói hiện tại kết thúc khi thanh toán được xác nhận.")}</p>
              : requestResult.subscription.quotedPrice != null
                ? <p className="row-card__meta">{t("Số tiền cần thanh toán: ")}<strong>{formatPrice(requestResult.subscription.quotedPrice)}</strong>{t(". Giá đã được chốt, kể cả khi giá gói thay đổi trước lúc bạn thanh toán.")}</p>
                : <p className="row-card__meta">{t("Giá catalog tham khảo: ")}{formatPrice(requestResult.membershipPackage.price)}{t(". Số tiền thanh toán được hệ thống xác nhận khi mở VNPay hoặc tại quầy.")}</p>}
            <p className="row-card__meta">{t(paymentInstructionsNotice)}</p>
            <div className="package-result__actions">
              <Link
                to={`/member/packages/checkout?packageId=${requestResult.membershipPackage.id}&subscriptionId=${requestResult.subscription.id}`}
                className="btn-primary"
                onClick={() => setRequestResult(null)}
              >
                {t(" Chọn phương thức thanh toán ")}</Link>
              <button type="button" className="btn-secondary"
                onClick={() => { setActionError(null); setPendingToCancel(requestResult.subscription); }}
                disabled={returnSyncing || syncError || isStatusSyncing || isCancellingPending || paymentsState.status !== 'success' ||
                  paymentsState.data.some(payment => payment.subscriptionId === requestResult.subscription.id && blocksMemberCancellation(payment))}>
                {t("Hủy yêu cầu đăng ký")}
              </button>
              <button type="button" className="btn-primary" onClick={() => setRequestResult(null)}>{t("Đóng")}</button>
            </div>
          </div>
        </Modal>
      )}

      {pendingToCancel && (
        <Modal returnFocusRef={membershipFocus} title={t("Hủy yêu cầu đăng ký?")} onClose={() => setPendingToCancel(null)} busy={isCancellingPending}>
            <div className="meta-label">{t("Xác nhận yêu cầu")}</div>
<p className="row-card__meta" style={{ marginTop: 12 }}>
              {t(" Yêu cầu ")}{pendingToCancel.packageName} {t("sẽ bị hủy. Bạn có thể đăng ký gói khác sau khi hệ thống xác nhận. ")}</p>
            {actionError && <p role="alert" className="portal-alert">{t(actionError)}</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button type="button" className="btn-secondary" autoFocus disabled={isCancellingPending}
                onClick={() => { setActionError(null); setPendingToCancel(null); }}>{t("Giữ yêu cầu")}</button>
              <button type="button" className="btn-primary" disabled={returnSyncing || syncError || isStatusSyncing || isCancellingPending}
                onClick={() => void handleCancelPending(pendingToCancel.id)}>
                {isCancellingPending ? t("Đang hủy…") : t("Xác nhận hủy")}
              </button>
            </div>
        </Modal>
      )}


      {isTrialModalOpen && (
        <Modal
          title={t("Đăng ký Gói Trải Nghiệm 3 Ngày")}
          onClose={() => setIsTrialModalOpen(false)}
          busy={isClaimingTrial}
        >
          <div className="meta-label">{t("Xác minh Căn cước công dân (CCCD) / Hộ chiếu")}</div>
          <p className="row-card__meta" style={{ marginTop: 8, lineHeight: 1.5 }}>
            {t(" Mỗi hội viên chỉ được nhận Gói Trải Nghiệm 3 Ngày một lần duy nhất. Gói bao gồm 01 buổi tập 1:1 cùng HLV cá nhân và không hỗ trợ bảo lưu. Họ tên tài khoản sẽ được tự động đồng bộ theo giấy tờ sau khi Lễ tân đối chiếu bản gốc tại quầy. ")}</p>

          <form onSubmit={(e) => void handleClaimTrial(e)} style={{ marginTop: 16 }}>
            {/* Chọn loại giấy tờ */}
            <div className="portal-form-group">
              <label className="portal-label">{t("Loại giấy tờ tùy thân *")}</label>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <button
                  type="button"
                  className={`btn-secondary btn-sm ${trialDocType === 'CCCD' ? 'btn-primary' : ''}`}
                  onClick={() => { setTrialDocType('CCCD'); setTrialError(''); }}
                  style={{ flex: 1 }}
                >
                  {t(" Căn cước công dân (Việt Nam) ")}</button>
                <button
                  type="button"
                  className={`btn-secondary btn-sm ${trialDocType === 'PASSPORT' ? 'btn-primary' : ''}`}
                  onClick={() => { setTrialDocType('PASSPORT'); setTrialError(''); }}
                  style={{ flex: 1 }}
                >
                  {t(" Hộ chiếu (Người nước ngoài) ")}</button>
              </div>
            </div>

            {/* Nếu là Passport: yêu cầu nhập quốc tịch */}
            {trialDocType === 'PASSPORT' && (
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="trial-nationality">{t("Quốc tịch *")}</label>
                <input
                  id="trial-nationality"
                  className="portal-input"
                  type="text"
                  required
                  placeholder={t("Vd: Korea, Japan, France, USA...", "e.g. Korea, Japan, France, USA…")}
                  value={trialNationality}
                  onChange={(e) => setTrialNationality(e.target.value)}
                  disabled={isClaimingTrial}
                />
              </div>
            )}

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="trial-full-name">
                {t(" Họ và tên trên ")}{trialDocType === 'PASSPORT' ? t("Hộ chiếu") : 'CCCD'} *
              </label>
              <input
                id="trial-full-name"
                className="portal-input"
                type="text"
                required
                maxLength={150}
                placeholder={t("Vd: NGUYEN VAN A", "e.g. NGUYEN VAN A")}
                value={trialFullName}
                onChange={(e) => setTrialFullName(e.target.value)}
                disabled={isClaimingTrial}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--portal-muted)', display: 'block', marginTop: 4 }}>
                {t(" Họ tên tài khoản sẽ được đồng bộ theo tên này sau khi Lễ tân duyệt. ")}</span>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="trial-cccd">
                {t(" Số ")}{trialDocType === 'PASSPORT' ? t("Hộ chiếu") : t("CCCD (12 chữ số)")} *
              </label>
              <input
                id="trial-cccd"
                className="portal-input"
                type="text"
                required
                maxLength={trialDocType === 'CCCD' ? 12 : 20}
                placeholder={trialDocType === 'CCCD' ? t('Vd: 001200001234', 'e.g. 001200001234') : t('Vd: M12345678', 'e.g. M12345678')}
                value={trialDocumentNumber}
                onChange={(e) => setTrialDocumentNumber(
                  trialDocType === 'CCCD' ? e.target.value.replace(/\D/g, '') : e.target.value.trim().toUpperCase()
                )}
                disabled={isClaimingTrial}
              />
            </div>

            {/* Upload ảnh mặt trước & mặt sau */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label className="portal-label" style={{ fontSize: '0.82rem' }}>
                  {t(" Ảnh mặt trước ")}{trialDocType} *
                </label>
                {trialFrontImage ? (
                  <div style={{ position: 'relative', marginTop: 6, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--portal-border)', height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                    <img src={trialFrontImage} alt={t("Mặt trước")} style={{ maxHeight: 110, maxWidth: '100%', objectFit: 'contain' }} />
                    <button
                      type="button"
                      onClick={() => setTrialFrontImage('')}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}
                      title={t("Xóa ảnh")}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 110,
                      marginTop: 6,
                      borderRadius: 8,
                      border: '1px dashed var(--portal-border)',
                      cursor: 'pointer',
                      background: 'var(--portal-surface)',
                      fontSize: '0.8rem',
                      color: 'var(--portal-muted)',
                      textAlign: 'center',
                      padding: 8,
                    }}
                  >
                    <span>{t("📷 Chọn ảnh mặt trước")}</span>
                    <span style={{ fontSize: '0.72rem', marginTop: 4 }}>JPG, PNG (Max 5MB)</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      disabled={isClaimingTrial}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleTrialImageUpload(file, 'front');
                      }}
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="portal-label" style={{ fontSize: '0.82rem' }}>
                  {t(" Ảnh mặt sau ")}{trialDocType === 'PASSPORT' ? t("(Tùy chọn)") : '*'}
                </label>
                {trialBackImage ? (
                  <div style={{ position: 'relative', marginTop: 6, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--portal-border)', height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                    <img src={trialBackImage} alt={t("Mặt sau")} style={{ maxHeight: 110, maxWidth: '100%', objectFit: 'contain' }} />
                    <button
                      type="button"
                      onClick={() => setTrialBackImage('')}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}
                      title={t("Xóa ảnh")}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 110,
                      marginTop: 6,
                      borderRadius: 8,
                      border: '1px dashed var(--portal-border)',
                      cursor: 'pointer',
                      background: 'var(--portal-surface)',
                      fontSize: '0.8rem',
                      color: 'var(--portal-muted)',
                      textAlign: 'center',
                      padding: 8,
                    }}
                  >
                    <span>{t("📷 Chọn ảnh mặt sau")}</span>
                    <span style={{ fontSize: '0.72rem', marginTop: 4 }}>JPG, PNG (Max 5MB)</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      disabled={isClaimingTrial}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleTrialImageUpload(file, 'back');
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            {trialError && (
              <p role="alert" style={{ color: 'var(--portal-danger, #fca5a5)', marginTop: 12, fontSize: '0.88rem' }}>
                {t(trialError)}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isClaimingTrial}
                onClick={() => setIsTrialModalOpen(false)}
              >
                {t(" Hủy ")}</button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isClaimingTrial || !trialDocumentNumber.trim() || !trialFullName.trim()}
              >
                {isClaimingTrial ? t("Đang gửi đơn…") : t("Xác minh & Kích hoạt")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isHoldModalOpen && current && (
        <Modal returnFocusRef={membershipFocus} title={t(`Bảo lưu ${current.packageName}`, `Pause ${current.packageName}`)} onClose={() => setIsHoldModalOpen(false)} busy={isSubmittingHold}>
            <div className="meta-label">
              {t(" Yêu cầu bảo lưu gói tập ")}</div>

<p className="row-card__meta" style={{ marginTop: 8 }}>
              {t(" Khi Lễ tân xác nhận bảo lưu, gói tập hiện tại của bạn sẽ tạm dừng hoạt động và toàn bộ các lịch học bạn đã đặt trong tương lai sẽ được hủy tự động. ")}</p>

            <form onSubmit={(e) => void handleSubmitHold(e)} style={{ marginTop: 18 }}>
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="hold-reason-input">
                  {t(" Lý do bảo lưu gói tập * ")}</label>
                <textarea
                  id="hold-reason-input"
                  className="portal-input"
                  rows={4}
                  maxLength={500}
                  placeholder={t("Nhập lý do bảo lưu (ví dụ: Đi công tác dài ngày, chấn thương cần nghỉ ngơi...)")}
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  disabled={isSubmittingHold}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              {holdError && (
                <p role="alert" style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.86rem', marginTop: 8 }}>
                  {t(holdError)}
                </p>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isSubmittingHold}
                  onClick={() => setIsHoldModalOpen(false)}
                >
                  {t(" Hủy ")}</button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmittingHold}
                >
                  {isSubmittingHold ? t("Đang gửi yêu cầu…") : t("Gửi yêu cầu bảo lưu")}
                </button>
              </div>
            </form>
        </Modal>
      )}


    </div>
  );
}
