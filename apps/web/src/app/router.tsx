import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RoleGuard } from '../shared/ui/RoleGuard';
import { PortalHome } from '../shared/ui/PortalHome';
import { PortalRouteError, RouteLoading, RouteLoadError } from '../shared/ui/RouteState';

export const router = createBrowserRouter([
  // Public Routes
  { path: '/', lazy: async () => ({ Component: (await import('../features/landing/LandingPage')).LandingPage }) },
  { path: '/swimming', lazy: async () => ({ Component: (await import('../features/landing/SportPage')).SportPage }) },
  { path: '/tennis', lazy: async () => ({ Component: (await import('../features/landing/SportPage')).SportPage }) },
  { path: '/boxing', lazy: async () => ({ Component: (await import('../features/landing/SportPage')).SportPage }) },
  { path: '/badminton', lazy: async () => ({ Component: (await import('../features/landing/SportPage')).SportPage }) },
  { path: '/yoga', lazy: async () => ({ Component: (await import('../features/landing/SportPage')).SportPage }) },
  { path: '/sports/:sportId', lazy: async () => ({ Component: (await import('../features/landing/SportPage')).SportPage }) },
  { path: '/trainers', lazy: async () => ({ Component: (await import('../features/landing/TrainerStoryPage')).TrainerStoryPage }) },
  { path: '/trainers/:trainerId', lazy: async () => ({ Component: (await import('../features/landing/TrainerStoryPage')).TrainerStoryPage }) },
  { path: '/products', lazy: async () => ({ Component: (await import('../features/shop/ProductsPage')).ProductsPage }) },
  { path: '/products/:slug', lazy: async () => ({ Component: (await import('../features/shop/ProductDetailPage')).ProductDetailPage }) },
  { path: '/checkout', lazy: async () => ({ Component: (await import('../features/shop/CheckoutPage')).CheckoutPage }) },
  { path: '/login', lazy: async () => ({ Component: (await import('../features/auth/LoginPage')).LoginPage }) },
  { path: '/register', lazy: async () => ({ Component: (await import('../features/auth/RegisterPage')).RegisterPage }) },

  // Protected Portal App Shell
  {
    id: 'portal',
    lazy: async () => ({ Component: (await import('../shared/ui/AppLayout')).AppLayout }),
    children: [
      { path: '/portal', element: <PortalHome /> },
      {
        element: <RoleGuard allowedRoles={['MEMBER', 'STAFF', 'COACH']} />,
        children: [{ path: '/messages', lazy: async () => ({ Component: (await import('../features/chat/ChatPage')).ChatPage }) }],
      },

      // Notifications (Shared between Member & Coach)
      {
        element: <RoleGuard allowedRoles={['MEMBER', 'COACH', 'MANAGER', 'CENTER_MANAGER', 'STAFF', 'RECEPTIONIST', 'ADMIN']} />,
        children: [
          {
            path: '/member/notifications',
            lazy: async () => ({ Component: (await import('../features/member/MemberNotificationsPage')).MemberNotificationsPage }),
          },
        ],
      },

      // Member-only Routes
      {
        element: <RoleGuard allowedRoles={['MEMBER']} />,
        children: [
          { path: '/member/courts', lazy: async () => ({ Component: (await import('../features/courts/CourtBookingsPage')).MemberCourtsPage }) },
          {
            path: '/member/dashboard',
            lazy: async () => ({ Component: (await import('../features/member/MemberDashboardPage')).MemberDashboardPage }),
          },
          {
            path: '/member/packages',
            lazy: async () => ({ Component: (await import('../features/member/MemberPackagesPage')).MemberPackagesPage }),
          },
          {
            path: '/member/packages/checkout',
            lazy: async () => ({ Component: (await import('../features/member/MemberCheckoutPage')).MemberCheckoutPage }),

          },
          { path: '/member/payments/vnpay/return', lazy: async () => ({ Component: (await import('../features/payments/VnpayReturnPage')).VnpayReturnPage }) },
          {
            path: '/member/card',
            lazy: async () => ({ Component: (await import('../features/member/MemberCardPage')).MemberCardPage }),
          },
          {
            path: '/member/check-in',
            lazy: async () => ({ Component: (await import('../features/member/MemberCheckInPage')).MemberCheckInPage }),
          },
          {
            path: '/member/invoices',
            lazy: async () => ({ Component: (await import('../features/member/MemberInvoicesPage')).MemberInvoicesPage }),
          },
          {
            path: '/member/orders',
            lazy: async () => ({ Component: (await import('../features/shop/MemberOrdersPage')).MemberOrdersPage }),
          },
          {
            path: '/member/products',
            lazy: async () => {
              const { MemberOrdersPage } = await import('../features/shop/MemberOrdersPage');
              return { Component: () => <MemberOrdersPage defaultTab="shop" /> };
            },
          },
          {
            path: '/member/orders/:orderId',
            lazy: async () => ({ Component: (await import('../features/shop/MemberOrderDetailPage')).MemberOrderDetailPage }),
          },
          {
            path: '/member/progress',
            lazy: async () => ({ Component: (await import('../features/member/MemberProgressPage')).MemberProgressPage }),
          },
          {
            path: '/member/support',
            lazy: async () => ({ Component: (await import('../features/member/MemberSupportPage')).MemberSupportPage }),
          },
        ],
      },

      // Member Classes Route
      {
        element: (
          <RoleGuard
            allowedRoles={['MEMBER']}
          />
        ),
        children: [
          {
            path: '/member/classes',
            lazy: async () => ({ Component: (await import('../features/member/MemberClassesPage')).MemberClassesPage }),
          },
          {
            path: '/member/streak',
            lazy: async () => ({ Component: (await import('../features/member/MemberStreakPage')).MemberStreakPage }),
          },
        ],
      },

      // Hồ sơ cá nhân
      {
        element: (
          <RoleGuard
            allowedRoles={[
              'MEMBER',
              'STAFF',
              'RECEPTIONIST',
              'COACH',
              'MANAGER',
              'CENTER_MANAGER',
              'ADMIN',
            ]}
          />
        ),
        children: [
          {
            path: '/member/profile',
            lazy: async () => ({ Component: (await import('../features/member/MemberProfilePage')).MemberProfilePage }),
          },
        ],
      },

      // Receptionist (STAFF) Dedicated Routes
      {
        element: <RoleGuard allowedRoles={['STAFF', 'RECEPTIONIST']} />,
        children: [
          {
            path: '/staff/reception',
            lazy: async () => ({ Component: (await import('../features/reception/StaffReceptionPage')).StaffReceptionPage }),
          },
          {
            path: '/staff/check-in',
            lazy: async () => ({ Component: (await import('../features/reception/StaffCheckInPage')).StaffCheckInPage }),
          },
          { path: '/staff/support', lazy: async () => ({ Component: (await import('../features/support/StaffSupportPage')).StaffSupportPage }) },
          { path: '/staff/courts', lazy: async () => ({ Component: (await import('../features/courts/CourtBookingsPage')).StaffCourtsPage }) },
        ],
      },

      // Coach Dedicated Routes
      {
        element: <RoleGuard allowedRoles={['COACH']} />,
        children: [
          {
            path: '/staff/attendance',
            lazy: async () => ({ Component: (await import('../features/coaching/CoachAttendancePage')).CoachAttendancePage }),
          },
          {
            path: '/coach/classes',
            lazy: async () => ({ Component: (await import('../features/coaching/CoachClassesPage')).CoachClassesPage }),
          },
          {
            path: '/coach/training-plans',
            lazy: async () => ({ Component: (await import('../features/coaching/CoachTrainingPlanPage')).CoachTrainingPlanPage }),
          },
          {
            path: '/staff/coach-classes',
            lazy: async () => ({ Component: (await import('../features/coaching/CoachClassesPage')).CoachClassesPage }),
          },
        ],
      },

      // Staff & Coach Shared Internal Requests Route
      {
        element: <RoleGuard allowedRoles={['STAFF', 'RECEPTIONIST', 'COACH']} />,
        children: [
          {
            path: '/staff/requests',
            lazy: async () => ({ Component: (await import('../features/operations/StaffInternalRequestsPage')).StaffInternalRequestsPage }),
          },
        ],
      },

      // Class Schedule & Product Orders (Receptionist & Manager)
      {
        element: <RoleGuard allowedRoles={['STAFF', 'RECEPTIONIST', 'MANAGER', 'CENTER_MANAGER']} />,
        children: [
          {
            path: '/staff/classes',
            lazy: async () => ({ Component: (await import('../features/classes/StaffClassesPage')).StaffClassesPage }),
          },
          {
            path: '/staff/orders',
            lazy: async () => ({ Component: (await import('../features/shop/StaffOrdersPage')).StaffOrdersPage }),
          },
        ],
      },

      // Admin Dedicated Route
      {
        element: <RoleGuard allowedRoles={['ADMIN']} />,
        children: [
          { path: '/admin/users', lazy: async () => ({ Component: (await import('../features/manager/UserManagerPage')).UserManagerPage }) },
        ],
      },
      // Center Manager Dedicated Routes
      {
        element: (
          <RoleGuard allowedRoles={['MANAGER', 'CENTER_MANAGER']} />
        ),
        children: [
          {
            path: '/manager/catalogs',
            lazy: async () => ({ Component: (await import('../features/manager/ManagerCatalogsPage')).ManagerCatalogsPage }),
          },
          {
            path: '/manager/products',
            lazy: async () => ({ Component: (await import('../features/shop/ManagerProductsPage')).ManagerProductsPage }),
          },
          {
            path: '/manager/products/new',
            lazy: async () => ({ Component: (await import('../features/shop/ManagerProductEditorPage')).ManagerProductEditorPage }),
          },
          {
            path: '/manager/products/:productId',
            lazy: async () => ({ Component: (await import('../features/shop/ManagerProductEditorPage')).ManagerProductEditorPage }),
          },
          {
            path: '/manager/equipment',
            lazy: async () => ({ Component: (await import('../features/manager/ManagerEquipmentPage')).ManagerEquipmentPage }),
          },
          {
            path: '/manager/coach-assignments',
            lazy: async () => ({ Component: (await import('../features/manager/ManagerCoachAssignmentsPage')).ManagerCoachAssignmentsPage }),
          },
          {
            path: '/manager/staff-accounts',
            lazy: async () => ({ Component: (await import('../features/manager/StaffAccountsPage')).StaffAccountsPage }),
          },
          {
            path: '/manager/users',
            element: <Navigate to="/manager/staff-accounts" replace />,
          },
          {
            path: '/manager/reports',
            lazy: async () => ({ Component: (await import('../features/manager/ManagerReportsPage')).ManagerReportsPage }),
          },
          {
            path: '/manager/cancellations',
            element: <Navigate to="/manager/reports" replace />,
          },
          {
            path: '/manager/audit-logs',
            lazy: async () => ({ Component: (await import('../features/manager/ManagerAuditLogsPage')).ManagerAuditLogsPage }),
          },
          {
            path: '/manager/coach-reviews',
            lazy: async () => ({ Component: (await import('../features/manager/ManagerCoachReviewsPage')).ManagerCoachReviewsPage }),
          },
          {
            path: '/manager/support',
            lazy: async () => ({ Component: (await import('../features/support/StaffSupportPage')).StaffSupportPage }),
          },
          {
            path: '/manager/requests',
            lazy: async () => ({ Component: (await import('../features/operations/ManagerInternalRequestsPage')).ManagerInternalRequestsPage }),
          },
        ],
      },
    // Lỗi của từng màn hình hiển thị trong vỏ portal, không làm mất sidebar/topbar.
    ].map(child => ({ ...child, ErrorBoundary: PortalRouteError })),
  },

  // Unknown route
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
].map(route => ({ ...route, HydrateFallback: RouteLoading, ErrorBoundary: RouteLoadError })));
