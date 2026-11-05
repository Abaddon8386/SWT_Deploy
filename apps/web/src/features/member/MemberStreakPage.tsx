import { useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { MemberStreak } from './MemberStreak';

export function MemberStreakPage() {
  const [revision, setRevision] = useState(0);
  return <div className="portal-container member-streak-page">
    <PageHeader eyebrow="Hội viên" title="Streak tập luyện" subtitle="Theo dõi chuỗi ngày check-in của bạn."
      actions={<RefreshButton label="Làm mới streak" onClick={() => setRevision(value => value + 1)} />} />
    <div className="portal-card"><MemberStreak key={revision} /></div>
  </div>;
}
