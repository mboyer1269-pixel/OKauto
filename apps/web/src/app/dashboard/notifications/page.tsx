'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';
import { formatDateTime } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  return (
    <ProtectedRoute>
      <NotificationsContent />
    </ProtectedRoute>
  );
}

function NotificationsContent() {
  const { apiFetch } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = () => {
    apiFetch('/api/v1/notifications').then((r) => r.json()).then((d) => {
      setNotifications(d.notifications ?? []);
      setUnreadCount(d.unreadCount ?? 0);
    });
  };

  useEffect(() => { load(); }, [apiFetch]);

  const markRead = async (id: string) => {
    await apiFetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
    load();
  };

  const markAllRead = async () => {
    await apiFetch('/api/v1/notifications/read-all', { method: 'POST' });
    load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Notifications {unreadCount > 0 && <span className="badge-danger ml-2">{unreadCount}</span>}</h1>
        {unreadCount > 0 && <button onClick={markAllRead} className="btn-secondary text-sm">Mark All Read</button>}
      </div>

      {notifications.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">No notifications.</div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div key={n.id} className={`card ${!n.isRead ? 'border-brand-200 bg-brand-50/30' : ''}`} onClick={() => !n.isRead && markRead(n.id)}>
              <div className="flex justify-between">
                <h3 className="font-semibold">{n.title}</h3>
                <span className="text-xs text-slate-500">{formatDateTime(n.createdAt)}</span>
              </div>
              <p className="text-sm text-slate-600 mt-1">{n.message}</p>
              <span className="badge-neutral mt-2">{n.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
