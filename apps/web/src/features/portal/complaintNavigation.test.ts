import { describe, expect, it } from 'vitest';
import { PORTAL_NAV } from './portalNavigation';

describe('complaint navigation', () => {
  const linksFor = (role: Parameters<typeof PORTAL_NAV[number]['roles']['includes']>[0]) =>
    PORTAL_NAV.filter(item => item.roles.includes(role)).map(item => item.to);

  it('gives coaches no complaint inbox', () => {
    expect(linksFor('COACH')).not.toContain('/coach/support');
    expect(linksFor('COACH')).not.toContain('/staff/support');
  });

  it('routes complaints to receptionists and managers only', () => {
    expect(linksFor('STAFF')).toContain('/staff/support');
    expect(linksFor('MANAGER')).toContain('/manager/support');
    expect(linksFor('MANAGER')).not.toContain('/coach/support');
    expect(linksFor('MEMBER')).not.toContain('/staff/support');
    expect(linksFor('MEMBER')).not.toContain('/manager/support');
  });
});
