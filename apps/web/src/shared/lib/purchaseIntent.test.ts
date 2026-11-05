import { beforeEach, expect, it } from 'vitest';
import { authDestination, clearPurchaseIntent, purchaseAuthPath, rememberPurchaseIntent, selectedPackageId } from './purchaseIntent';

beforeEach(() => sessionStorage.clear());

it('keeps the selected package through register and login for members only', () => {
  const search = '?returnTo=' + encodeURIComponent('/member/packages?packageId=2');
  expect(purchaseAuthPath('/login', search)).toBe('/login' + search);
  expect(authDestination('MEMBER', search)).toBe('/member/packages?packageId=2');
  expect(authDestination('MANAGER', search)).toBe('/manager/reports');
  expect(selectedPackageId('?packageId=2')).toBe(2);
});

it.each(['https://evil.test', '//evil.test', '/manager/users', '/member/packages?packageId=-1', '/member/packages?packageId=1.5'])('rejects untrusted purchase return paths: %s', returnTo => {
  const search = '?returnTo=' + encodeURIComponent(returnTo);
  expect(authDestination('MEMBER', search)).toBe('/member/dashboard');
  expect(purchaseAuthPath('/login', search)).toBe('/login');
});

it('recovers the purchase intent after an OAuth redirect and clears it on arrival', () => {
  rememberPurchaseIntent('?returnTo=' + encodeURIComponent('/member/packages?packageId=2'));
  expect(authDestination('MEMBER', '?google_oauth=authenticated')).toBe('/member/packages?packageId=2');
  clearPurchaseIntent();
  expect(authDestination('MEMBER', '')).toBe('/member/dashboard');
});

it.each(['/checkout', '/products', '/products/sol-whey-isolate'])('accepts shop return path %s', path => {
  expect(purchaseAuthPath('/login', `?returnTo=${encodeURIComponent(path)}`)).toBe(`/login?returnTo=${encodeURIComponent(path)}`);
  expect(authDestination('MEMBER', `?returnTo=${encodeURIComponent(path)}`)).toBe(path);
});

it.each(['//evil.com', '/products/../admin/users', 'https://x.y/checkout', '/checkout?next=//evil'])('rejects %s', path => {
  expect(purchaseAuthPath('/login', `?returnTo=${encodeURIComponent(path)}`)).toBe('/login');
});
