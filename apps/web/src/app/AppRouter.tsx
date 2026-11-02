import { useSyncExternalStore } from 'react';
import { matchRoutes, RouterProvider } from 'react-router-dom';
import { router } from './router';
import { RouteLoading } from '../shared/ui/RouteState';

export function AppRouter() {
  const navigating = useSyncExternalStore(router.subscribe, () => {
    const { initialized, navigation, matches } = router.state;
    return initialized && navigation.state !== 'idle' && (
      !matches.some(match => match.route.id === 'portal') ||
      !matchRoutes(router.routes, navigation.location)?.some(match => match.route.id === 'portal')
    );
  }, () => false);
  return <>
    {navigating && <div className="route-navigation-loading"><RouteLoading /></div>}
    <div className="route-content" inert={navigating || undefined} aria-hidden={navigating || undefined}><RouterProvider router={router} /></div>
  </>;
}
