import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RoleGuard } from '../shared/ui/RoleGuard';
import { PortalHome } from '../shared/ui/PortalHome';
import { RouteLoading, RouteLoadError } from '../shared/ui/RouteState';

export const router = createBrowserRouter([
  // Public Routes
  { path: '/', lazy: async () => ({ Component: (await import('../features/landing/LandingPage')).LandingPage }) },
  { path: '/swimming', lazy: async () => ({ Component: (await import('../features/landing/SportPage')).SportPage }) },
  { path: '/tennis', lazy: async () => ({ Component: (await import('../features/landing/SportPage')).SportPage }) },
  { path: '/sports/:sportId', lazy: async () => ({ Component: (await import('../features/landing/SportPage')).SportPage }) },
  { path: '/trainers', lazy: async () => ({ Component: (await import('../features/landing/TrainerStoryPage')).TrainerStoryPage }) },
  { path: '/trainers/:trainerId', lazy: async () => ({ Component: (await import('../features/landing/TrainerStoryPage')).TrainerStoryPage }) },
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
        element: <RoleGuard allowedRoles={['MEMBER', 'COACH']} />,
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
          {
            path: '/member/dashboard',
            lazy: async () => ({ Component: (await import('../features/member/MemberDashboardPage')).MemberDashboardPage }),
          },
          {
            path: '/member/packages',
            lazy: async () => ({ Component: (await import('../features/member/MemberPackagesPage')).MemberPackagesPage }),
          },
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
            path: '/member/progress',
            lazy: async () => ({ Component: (await import('../features/member/MemberProgressPage')).MemberProgressPage }),
          },
          {
            path: '/member/notifications',
            lazy: async () => ({ Component: (await import('../features/member/MemberNotificationsPage')).MemberNotificationsPage }),
          },
          {
            path: '/member/support',
            lazy: async () => ({ Component: (await import('../features/member/MemberSupportPage')).MemberSupportPage }),
          },
        ],
      },

      // Shared Member Feature Routes
      {
        element: (
          <RoleGuard
            allowedRoles={['MEMBER', 'MANAGER', 'CENTER_MANAGER']}
          />
        ),
        children: [
          {
            path: '/member/classes',
            lazy: async () => ({ Component: (await import('../features/member/MemberClassesPage')).MemberClassesPage }),
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

      {
        element: <RoleGuard allowedRoles={['STAFF', 'RECEPTIONIST', 'MANAGER', 'CENTER_MANAGER']} />,
        children: [{ path: '/staff/support', lazy: async () => ({ Component: (await import('../features/support/StaffSupportPage')).StaffSupportPage }) }],
      },

      // Staff / Coach Routes
      {
        element: (
          <RoleGuard
            allowedRoles={[
              'STAFF',
              'COACH',
              'RECEPTIONIST',
              'MANAGER',
              'CENTER_MANAGER',
            ]}
          />
        ),
        children: [
          {
            path: '/staff/reception',
            lazy: async () => ({ Component: (await import('../features/reception/StaffReceptionPage')).StaffReceptionPage }),
          },
          {
            path: '/staff/check-in',
            lazy: async () => ({ Component: (await import('../features/reception/StaffCheckInPage')).StaffCheckInPage }),
          },
          {
            path: '/staff/classes',
            lazy: async () => ({ Component: (await import('../features/classes/StaffClassesPage')).StaffClassesPage }),
          },
          {
            path: '/staff/attendance',
            lazy: async () => ({ Component: (await import('../features/coaching/CoachAttendancePage')).CoachAttendancePage }),
          },
          {
            path: '/staff/requests',
            lazy: async () => ({ Component: (await import('../features/operations/StaffInternalRequestsPage')).StaffInternalRequestsPage }),
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
            path: '/coach/support',
            lazy: async () => ({ Component: (await import('../features/coaching/CoachSupportPage')).CoachSupportPage }),
          },
          {
            path: '/staff/coach-classes',
            lazy: async () => ({ Component: (await import('../features/coaching/CoachClassesPage')).CoachClassesPage }),
          },
        ],
      },

      // Manager Routes
      {
        element: <RoleGuard allowedRoles={['ADMIN']} />,
        children: [
          { path: '/admin/users', lazy: async () => ({ Component: (await import('../features/manager/UserManagerPage')).UserManagerPage }) },
        ],
      },
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
            path: '/manager/users',
            lazy: async () => ({ Component: (await import('../features/manager/StaffAccountsPage')).StaffAccountsPage }),
          },
          {
            path: '/manager/reports',
            lazy: async () => ({ Component: (await import('../features/manager/ManagerReportsPage')).ManagerReportsPage }),
          },
          {
            path: '/manager/cancellations',
            lazy: async () => ({ Component: (await import('../features/manager/ManagerCancellationPage')).ManagerCancellationPage }),
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
            path: '/manager/requests',
            lazy: async () => ({ Component: (await import('../features/operations/ManagerInternalRequestsPage')).ManagerInternalRequestsPage }),
          },
        ],
      },
    ],
  },

  // Unknown route
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
].map(route => ({ ...route, HydrateFallback: RouteLoading, ErrorBoundary: RouteLoadError })));
