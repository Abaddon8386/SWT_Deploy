import { memberText } from './memberI18n';
import { useLanguage } from '../../shared/i18n/language';
import { useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { MemberStreak } from './MemberStreak';

export function MemberStreakPage() {
  useLanguage();
  const [revision, setRevision] = useState(0);
  return <div data-i18n-managed className="portal-container member-streak-page">
    <PageHeader eyebrow={memberText("Hội viên")} title={memberText("Streak tập luyện")}
      actions={<RefreshButton label={memberText("Làm mới streak")} onClick={() => setRevision(value => value + 1)} />} />
    <div className="portal-card"><MemberStreak key={revision} /></div>
  </div>;
}
