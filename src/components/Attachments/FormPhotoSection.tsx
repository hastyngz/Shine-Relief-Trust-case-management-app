import React, { useRef } from 'react';
import { Camera, Image as ImageIcon, X, Paperclip } from 'lucide-react';
import { AttachmentCategory } from '../../types';
import { formatBytes } from '../../utils/imageOptimizer';

export interface PendingPhoto {
  file: File;
  previewUrl: string;
  caption?: string;
  category?: AttachmentCategory;
  date?: string;
  consent?: boolean;
}

interface FormPhotoSectionProps {
  pendingPhotos: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  defaultCategory?: AttachmentCategory;
  categoryOptions?: AttachmentCategory[];
  title?: string;
  description?: string;
}

export const FormPhotoSection: React.FC<FormPhotoSectionProps> = ({
  pendingPhotos,
  onChange,
  defaultCategory = 'Supporting Document',
  categoryOptions,
  title = 'Attach Photos / Documents (Optional)',
  description,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: PendingPhoto[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      category: defaultCategory,
      caption: '',
    }));
    onChange([...pendingPhotos, ...newItems]);
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(pendingPhotos[index].previewUrl);
    onChange(pendingPhotos.filter((_, i) => i !== index));
  };

  const updatePhoto = (index: number, updates: Partial<PendingPhoto>) => {
    const updated = [...pendingPhotos];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  return (
    <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-teal-800" />
            <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
              {title}
            </h4>
          </div>
          {description && (
            <p className="text-[11px] text-stone-500 pl-6">{description}</p>
          )}
        </div>
        <span className="text-[11px] text-stone-500 italic">Not required</span>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFilesAdded(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFilesAdded(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-teal-300 hover:bg-teal-50 rounded-lg text-xs font-bold text-teal-900 transition-colors shadow-2xs"
        >
          <Camera className="w-4 h-4 text-teal-700" />
          <span>Take Photo (Camera)</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg text-xs font-bold text-stone-700 transition-colors shadow-2xs"
        >
          <ImageIcon className="w-4 h-4 text-stone-600" />
          <span>Choose from Phone</span>
        </button>
      </div>

      {/* Selected Photos List */}
      {pendingPhotos.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-[11px] font-semibold text-stone-600">
            {pendingPhotos.length} {pendingPhotos.length === 1 ? 'photo' : 'photos'} ready to upload:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pendingPhotos.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 bg-white rounded-lg border border-stone-200 text-xs"
              >
                <div className="w-12 h-12 rounded-md overflow-hidden bg-stone-100 shrink-0 border border-stone-200">
                  <img
                    src={item.previewUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-stone-800 truncate text-[11px]">
                      {item.file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="text-red-500 hover:text-red-700 p-0.5 rounded"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={item.caption || ''}
                    onChange={(e) => updatePhoto(idx, { caption: e.target.value })}
                    placeholder="Optional caption..."
                    className="w-full px-2 py-0.5 text-[11px] border border-stone-200 rounded bg-stone-50 focus:bg-white focus:outline-none"
                  />
                  {categoryOptions && categoryOptions.length > 1 && (
                    <select
                      value={item.category || defaultCategory}
                      onChange={(event) => updatePhoto(idx, { category: event.target.value as AttachmentCategory })}
                      aria-label={`Category for ${item.file.name}`}
                      className="w-full px-2 py-1 text-[11px] border border-stone-200 rounded bg-white"
                    >
                      {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  )}
                  {item.file.type.startsWith('image/') && (
                    <label className="flex items-start gap-1.5 text-[10px] text-amber-900">
                      <input
                        type="checkbox"
                        checked={item.consent === true}
                        onChange={(event) => updatePhoto(idx, { consent: event.target.checked })}
                        className="mt-0.5 accent-teal-800"
                      />
                      <span>Consent confirmed for everyone shown. Unconfirmed photos are still saved and flagged for follow-up.</span>
                    </label>
                  )}
                  <div className="text-[10px] text-stone-400">
                    {formatBytes(item.file.size)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
