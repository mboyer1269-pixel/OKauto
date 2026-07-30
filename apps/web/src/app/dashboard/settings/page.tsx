'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/components/auth-provider';

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}

function SettingsContent() {
  const { apiFetch, role } = useAuth();
  const [org, setOrg] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/organizations/current').then((r) => r.json()).then((d) => {
      setOrg({ name: d.name ?? '', website: d.website ?? '', phone: d.phone ?? '', address: d.address ?? '', city: d.city ?? '', state: d.state ?? '', zip: d.zip ?? '' });
    });
  }, [apiFetch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/v1/organizations/current', { method: 'PATCH', body: JSON.stringify(org) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const canEdit = role === 'OWNER' || role === 'ADMIN';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <form onSubmit={handleSave} className="card max-w-lg space-y-4">
        {['name', 'website', 'phone', 'address', 'city', 'state', 'zip'].map((field) => (
          <div key={field}>
            <label className="block text-sm font-medium mb-1 capitalize">{field}</label>
            <input className="input" value={org[field] ?? ''} onChange={(e) => setOrg({ ...org, [field]: e.target.value })} disabled={!canEdit} />
          </div>
        ))}
        {canEdit && (
          <button type="submit" className="btn-primary">{saved ? 'Saved!' : 'Save Changes'}</button>
        )}
      </form>

      <div className="card mt-6 max-w-lg">
        <h2 className="font-semibold mb-2">Chrome Extension</h2>
        <p className="text-sm text-slate-600 mb-3">
          Install the OKauto Chrome extension to assist with Facebook Marketplace listings.
          Generate an API key below to connect the extension.
        </p>
        <ol className="text-sm text-slate-600 list-decimal list-inside space-y-1">
          <li>Build or load the extension from <code className="bg-slate-100 px-1 rounded">apps/extension</code></li>
          <li>Create an API key in the API Keys page</li>
          <li>Enter the key and API URL in extension settings</li>
          <li>Select a vehicle and click &quot;Assist Listing&quot;</li>
        </ol>
      </div>
    </div>
  );
}
