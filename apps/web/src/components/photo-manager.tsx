'use client';

import { useRef, useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ImagePlus, Link, Trash2, Upload } from 'lucide-react';

interface Photo {
  id: string;
  url: string;
  isPrimary: boolean;
  storageKey?: string | null;
}

interface PhotoManagerProps {
  vehicleId: string;
  photos: Photo[];
  onUpdate: () => void;
}

export function PhotoManager({ vehicleId, photos, onUpdate }: PhotoManagerProps) {
  const { apiFetch } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [storageConfigured, setStorageConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch('/api/v1/photos/presign')
      .then((r) => r.json())
      .then((d) => setStorageConfigured(d.configured))
      .catch(() => setStorageConfigured(false));
  }, [apiFetch]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      try {
        const presignRes = await apiFetch('/api/v1/photos/presign', {
          method: 'POST',
          body: JSON.stringify({
            vehicleId,
            filename: file.name,
            contentType: file.type || 'image/jpeg',
          }),
        });

        if (!presignRes.ok) {
          alert('S3 upload not configured. Use URL input instead.');
          break;
        }

        const { uploadUrl, publicUrl, storageKey } = await presignRes.json();

        await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'image/jpeg' },
        });

        await apiFetch(`/api/v1/vehicles/${vehicleId}/photos`, {
          method: 'POST',
          body: JSON.stringify({ url: publicUrl, storageKey }),
        });
      } catch (err) {
        console.error('Upload failed:', err);
        alert('Upload failed');
      }
    }

    setUploading(false);
    onUpdate();
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;
    const res = await apiFetch(`/api/v1/vehicles/${vehicleId}/photos`, {
      method: 'POST',
      body: JSON.stringify({ url: urlInput.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert((err as { error?: string }).error ?? 'Failed to add photo');
      return;
    }
    setUrlInput('');
    onUpdate();
  };

  const handleDelete = async (photoId: string) => {
    if (!confirm('Delete this photo?')) return;
    await apiFetch(`/api/v1/vehicles/${vehicleId}/photos/${photoId}`, { method: 'DELETE' });
    onUpdate();
  };

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">Photos</h2>

      {photos.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {photos.map((p) => (
            <div key={p.id} className="relative group">
              <img src={p.url} alt="" className="w-full h-24 object-cover rounded-lg" />
              {p.isPrimary && (
                <span className="absolute left-1 top-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">
                  Principale
                </span>
              )}
              <button
                onClick={() => handleDelete(p.id)}
                className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">Aucune photo pour le moment.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)} />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="btn-secondary text-xs">
          <Upload size={14} className="mr-1" />
          {uploading ? 'Uploading...' : 'Upload to S3'}
        </button>
        <div className="flex gap-1 flex-1 min-w-[200px]">
          <input className="input text-xs flex-1" placeholder="Or paste image URL" value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)} />
          <button onClick={handleAddUrl} className="btn-secondary text-xs">
            <Link size={14} />
          </button>
        </div>
      </div>
      {storageConfigured === false && (
        <p className="mt-2 text-xs text-warning">
          <ImagePlus size={12} className="inline mr-1" />
          S3 not configured — use URL input or set AWS_S3_* env vars.
        </p>
      )}
    </div>
  );
}
