import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { purchaseAuthPath } from '../lib/purchaseIntent';
import { homePath } from '../api/client';
import { useCurrentUser } from '../api/useCurrentUser';

export function RoleGuard({ allowedRoles }: { allowedRoles: string[] }) {
  const user = useCurrentUser();
  const location = useLocation();
  if (!user) {
    return <Navigate to={purchaseAuthPath('/login', `?returnTo=${encodeURIComponent(location.pathname + location.search)}`)} replace />;
  }
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={homePath(user.role)} replace />;
  }
  return <Outlet />;
}
