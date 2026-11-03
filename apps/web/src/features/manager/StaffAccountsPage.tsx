import { useEffect, useState, type FormEvent } from 'react';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Select } from '../../shared/ui/Select';
import { createStaffAccount, listStaffAccounts, setStaffAccountLocked, type StaffAccount, type StaffAccountInput } from './staffAccountsApi';
import { notify } from '../../shared/lib/portalNotices';
import { errorMessage } from '../../shared/lib/errorMessage';

const initialForm: StaffAccountInput = {
  fullName: '', email: '', phone: '', password: '', gender: 'other', roleCode: 'COACH',
};

export function StaffAccountsPage() {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    listStaffAccounts().then(data => {
      if (active) { setAccounts(data); setLoadError(''); }
    }).catch((err: unknown) => {
      if (active) setLoadError(errorMessage(err, 'Không thể tải tài khoản nhân sự.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const [busyId, setBusyId] = useState<number | null>(null);

  async function toggleLock(account: StaffAccount) {
    if (busyId !== null) return;
    const lock = account.status === 'active';
    setBusyId(account.id);
    try {
      const updated = await setStaffAccountLocked(account.id, lock);
      setAccounts(current => current.map(item => item.id === updated.id ? updated : item));
      notify(lock ? `Đã khóa tài khoản ${account.email}.` : `Đã mở khóa tài khoản ${account.email}.`, 'success');
    } catch (err) {
      notify(errorMessage(err, 'Không thể đổi trạng thái tài khoản.'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const created = await createStaffAccount({ ...form, fullName: form.fullName.trim(), email: form.email.trim(), phone: form.phone?.trim() || undefined });
      setAccounts(current => [...current, created]);
      setForm(initialForm);
      notify(`Đã tạo tài khoản ${created.email}. Nhân sự có thể đăng nhập bằng email hoặc Google với đúng email đã được cấp.`, 'success');
    } catch (err) {
      setError(errorMessage(err, 'Không thể tạo tài khoản. Vui lòng thử lại.'));
    } finally {
      setSaving(false);
    }
  }

  return <div className="portal-container">
    <PageHeader eyebrow="Quản lý" title="Tài khoản nhân sự" subtitle="Tạo tài khoản huấn luyện viên và lễ tân bằng email họ sẽ dùng để đăng nhập." />
    <section className="portal-card" aria-labelledby="staff-create-heading">
      <h2 id="staff-create-heading" className="portal-card-title">Thêm nhân sự</h2>
      <form onSubmit={event => void submit(event)}>
        <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="portal-form-group">
            <label className="portal-label" htmlFor="staff-name">Họ và tên *</label>
            <input id="staff-name" className="portal-input" required maxLength={150} autoComplete="name" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="portal-form-group">
            <label className="portal-label" htmlFor="staff-email">Email *</label>
            <input id="staff-email" className="portal-input" type="email" required maxLength={150} autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="portal-form-group">
            <label className="portal-label" htmlFor="staff-phone">Số điện thoại</label>
            <input id="staff-phone" className="portal-input" type="tel" maxLength={20} autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="portal-form-group">
            <label className="portal-label" htmlFor="staff-password">Mật khẩu *</label>
            <input id="staff-password" className="portal-input" type="password" required minLength={6} maxLength={50} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="portal-form-group">
            <label className="portal-label" htmlFor="staff-gender">Giới tính *</label>
            <Select id="staff-gender" className="portal-select" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as StaffAccountInput['gender'] })}>
              <option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
            </Select>
          </div>
          <div className="portal-form-group">
            <label className="portal-label" htmlFor="staff-role">Vai trò *</label>
            <Select id="staff-role" className="portal-select" value={form.roleCode} onChange={e => setForm({ ...form, roleCode: e.target.value as StaffAccountInput['roleCode'] })}>
              <option value="COACH">Huấn luyện viên</option><option value="RECEPTIONIST">Lễ tân</option>
            </Select>
          </div>
          <button className="btn-primary" type="submit" disabled={loading || Boolean(loadError)} aria-busy={saving}>{saving ? 'Đang tạo…' : 'Tạo tài khoản nhân sự'}</button>
        </fieldset>
        {error && <p role="alert" className="portal-alert">{error}</p>}
      </form>
    </section>
    <section className="portal-card" aria-labelledby="staff-list-heading">
      <h2 id="staff-list-heading" className="portal-card-title">Huấn luyện viên & Lễ tân</h2>
      {loading ? <LoadingSkeleton label="Đang tải tài khoản nhân sự" variant="table" /> : loadError ? <div role="alert" className="portal-alert">
        {loadError} <button className="btn-secondary" type="button" onClick={() => { setLoading(true); setReload(current => current + 1); }}>Thử lại</button>
      </div> : accounts.length === 0 ? <p>Chưa có tài khoản nhân sự.</p> : <div className="portal-table-wrapper">
        <table className="portal-table">
          <thead><tr><th scope="col">Họ và tên</th><th scope="col">Email</th><th scope="col">Vai trò</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
          <tbody>{accounts.map(account => <tr key={account.id}>
            <td>{account.fullName}</td><td>{account.email}</td>
            <td>{account.roleCode === 'COACH' ? 'Huấn luyện viên' : 'Lễ tân'}</td>
            <td>{account.status === 'active' ? 'Hoạt động' : account.status === 'locked' ? 'Đã khóa' : 'Chưa kích hoạt'}</td>
            <td>{account.status === 'active' || account.status === 'locked' ? <button className="btn-secondary btn-sm" type="button"
              disabled={busyId !== null} onClick={() => void toggleLock(account)}>
              {account.status === 'active' ? 'Khóa' : 'Mở khóa'}
            </button> : null}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
