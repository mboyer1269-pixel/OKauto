'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';
import { formatDateTime } from '@/lib/utils';
import { Copy, Trash2 } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  user: { name: string };
}

export default function ApiKeysPage() {
  return (
    <ProtectedRoute>
      <ApiKeysContent />
    </ProtectedRoute>
  );
}

function ApiKeysContent() {
  const { apiFetch } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const load = () => {
    apiFetch('/api/v1/admin/api-keys').then((r) => r.json()).then(setKeys);
  };

  useEffect(() => { load(); }, [apiFetch]);

  const handleCreate = async () => {
    const res = await apiFetch('/api/v1/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: newKeyName || 'Extension Key' }),
    });
    const data = await res.json();
    setCreatedKey(data.key);
    setNewKeyName('');
    load();
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key?')) return;
    await apiFetch(`/api/v1/admin/api-keys/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">API Keys</h1>

      {createdKey && (
        <div className="card mb-6 border-green-200 bg-green-50">
          <p className="font-semibold text-green-800 mb-2">API Key Created — Copy it now!</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white p-2 rounded text-xs break-all">{createdKey}</code>
            <button onClick={() => navigator.clipboard.writeText(createdKey)} className="btn-secondary">
              <Copy size={14} />
            </button>
          </div>
          <button onClick={() => setCreatedKey(null)} className="text-sm text-green-700 mt-2">Dismiss</button>
        </div>
      )}

      <div className="card mb-6 flex gap-3">
        <input className="input" placeholder="Key name (e.g. Sales Floor Extension)" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
        <button onClick={handleCreate} className="btn-primary whitespace-nowrap">Create Key</button>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="pb-3">Name</th>
              <th className="pb-3">Prefix</th>
              <th className="pb-3">Created By</th>
              <th className="pb-3">Last Used</th>
              <th className="pb-3">Status</th>
              <th className="pb-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-b last:border-0">
                <td className="py-3 font-medium">{k.name}</td>
                <td className="py-3 font-mono text-xs">{k.keyPrefix}...</td>
                <td className="py-3">{k.user.name}</td>
                <td className="py-3">{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : 'Never'}</td>
                <td className="py-3"><span className={k.isActive ? 'badge-success' : 'badge-neutral'}>{k.isActive ? 'Active' : 'Revoked'}</span></td>
                <td className="py-3">
                  {k.isActive && (
                    <button onClick={() => handleRevoke(k.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
