'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { createUser, listUsers, updateUserRole, deleteUser, getLoginLogs } from '@/app/actions/users';
import { UserPlus, Trash2, RefreshCw, Shield, Users, Eye, Monitor, Smartphone, Tablet, LogIn } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';

type UserRole = 'admin' | 'manager' | 'viewer' | 'approver';

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

interface LoginLog {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  logged_in_at: string;
  device_type: string;
}

const roleLabels: Record<UserRole, string> = {
  admin: 'مدير النظام',
  manager: 'مدير مشروع',
  viewer: 'مستخدم عادي',
  approver: 'مراجع اعتماد',
};

const roleColors: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-blue-100 text-blue-700',
  viewer: 'bg-slate-100 text-slate-600',
  approver: 'bg-amber-100 text-amber-700',
};

const roleIcons: Record<UserRole, React.ReactNode> = {
  admin: <Shield size={13} />,
  manager: <Users size={13} />,
  viewer: <Eye size={13} />,
  approver: <Shield size={13} />,
};

export default function UsersPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', fullName: '', role: 'viewer' as UserRole });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/');
    }
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!authLoading && isAdmin) { fetchUsers(); fetchLogs(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin]);

  async function fetchUsers() {
    setLoading(true);
    const { users: data, error } = await listUsers();
    if (error) showToast('error', 'فشل تحميل المستخدمين');
    else setUsers(data);
    setLoading(false);
  }

  async function fetchLogs() {
    setLogsLoading(true);
    const { logs: data } = await getLoginLogs();
    setLogs(data);
    setLogsLoading(false);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 6) {
      showToast('error', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setSubmitting(true);
    const { error } = await createUser(form.email, form.password, form.fullName, form.role);
    setSubmitting(false);
    if (error) {
      showToast('error', error);
    } else {
      showToast('success', 'تم إنشاء المستخدم بنجاح ✓');
      setForm({ email: '', password: '', fullName: '', role: 'viewer' });
      setShowForm(false);
      fetchUsers();
    }
  }

  async function handleRoleChange(userId: string, newR: UserRole) {
    const { error } = await updateUserRole(userId, newR);
    if (error) {
      showToast('error', 'فشل تغيير الصلاحية');
    } else {
      showToast('success', 'تم تغيير الصلاحية ✓');
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newR } : u)));
    }
  }

  async function handleDelete(userId: string, email: string) {
    if (!confirm(`هل أنت متأكد من حذف المستخدم ${email}؟`)) return;
    const { error } = await deleteUser(userId);
    if (error) {
      showToast('error', 'فشل حذف المستخدم');
    } else {
      showToast('success', 'تم حذف المستخدم');
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    }
  }

  if (authLoading || !isAdmin) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">إدارة المستخدمين</h1>
          <p className="text-slate-500 text-sm mt-0.5">إضافة وتعديل صلاحيات المستخدمين</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchUsers}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="تحديث"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <UserPlus size={16} />
            إضافة مستخدم
          </button>
        </div>
      </div>

      {/* New user form */}
      {showForm && (
        <div className="bg-white border border-blue-100 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-4">مستخدم جديد</h2>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">الاسم الكامل</label>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm(p => ({ ...p, fullName: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="مثال: أحمد محمد"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">البريد الإلكتروني</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                dir="ltr"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">كلمة المرور</label>
              <input
                required
                type="password"
                minLength={6}
                value={form.password}
                onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                dir="ltr"
                placeholder="6 أحرف على الأقل"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">الصلاحية</label>
              <select
                value={form.role}
                onChange={(e) => setForm(p => ({ ...p, role: e.target.value as UserRole }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="viewer">مستخدم عادي — عرض لوحة التحكم والخريطة</option>
                <option value="manager">مدير مشروع — إدخال البيانات والتقارير</option>
                <option value="approver">مراجع اعتماد — مراجعة واعتماد النقلات فقط</option>
                <option value="admin">مدير النظام — صلاحية كاملة</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting ? 'جارٍ الإنشاء...' : 'إنشاء المستخدم'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">جارٍ التحميل...</div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-slate-400">لا يوجد مستخدمون</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-right px-4 py-3 font-medium text-slate-600">الاسم</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">البريد الإلكتروني</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الصلاحية</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">تاريخ الإنشاء</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr
                  key={u.id}
                  className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${
                    i % 2 === 0 ? '' : 'bg-slate-50/30'
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {u.full_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs" dir="ltr">
                    {u.email}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer ${roleColors[u.role]}`}
                    >
                      <option value="viewer">مستخدم عادي</option>
                      <option value="manager">مدير مشروع</option>
                      <option value="approver">مراجع اعتماد</option>
                      <option value="admin">مدير النظام</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(u.created_at).toLocaleDateString('ar-SA')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(u.id, u.email)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="حذف"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Role legend */}
      <div className="mt-6 bg-slate-50 rounded-xl p-4 border border-slate-100">
        <h3 className="text-sm font-medium text-slate-600 mb-3">مستويات الصلاحيات</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['admin', 'manager', 'approver', 'viewer'] as UserRole[]).map((r) => (
            <div key={r} className={`rounded-lg p-3 ${roleColors[r]} flex gap-2`}>
              {roleIcons[r]}
              <div>
                <p className="font-medium text-xs">{roleLabels[r]}</p>
                <p className="text-xs opacity-75 mt-0.5">
                  {r === 'admin' && 'وصول كامل + إدارة المستخدمين'}
                  {r === 'manager' && 'إدخال البيانات والتقارير والخريطة'}
                  {r === 'approver' && 'مراجعة واعتماد النقلات فقط'}
                  {r === 'viewer' && 'عرض لوحة التحكم والخريطة'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* سجل الدخول */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <LogIn size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">سجل الدخول</h3>
            <span className="text-xs text-slate-400">(آخر 100 عملية)</span>
          </div>
          <button onClick={fetchLogs} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors" title="تحديث">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {logsLoading ? (
            <div className="py-10 text-center text-slate-400 text-sm">جارّي التحميل...</div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">لا توجد سجلات دخول بعد</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">المستخدم</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">الصلاحية</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">وقت الدخول</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500 text-xs">الجهاز</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const dt = new Date(log.logged_in_at)
                  const dateStr = dt.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
                  const timeStr = dt.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
                  const DeviceIcon = log.device_type === 'mobile' ? Smartphone : log.device_type === 'tablet' ? Tablet : Monitor
                  const deviceLabel = log.device_type === 'mobile' ? 'جوال' : log.device_type === 'tablet' ? 'لوح' : 'حاسوب'
                  return (
                    <tr key={log.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-700 text-sm">{log.full_name ?? '—'}</p>
                        <p className="text-xs text-slate-400" dir="ltr">{log.email}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${roleColors[log.role]}`}>
                          {roleIcons[log.role]} {roleLabels[log.role]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-slate-700 text-sm">{dateStr}</p>
                        <p className="text-xs text-slate-400">{timeStr}</p>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <DeviceIcon size={13} className="text-slate-400" />
                          {deviceLabel}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
