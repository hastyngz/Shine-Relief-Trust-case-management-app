import React, { useState, useEffect } from 'react';
import { Camera, Paperclip, Eye, Plus } from 'lucide-react';
import {
  AttachmentTargetType,
  AttachmentCategory,
  PhotoAttachment,
} from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import {
  canUploadAttachment,
  subscribeAttachmentsForTarget,
} from '../../services/attachmentService';
import { PhotoUploadModal } from './PhotoUploadModal';

interface RecordAttachmentBarProps {
  targetType: AttachmentTargetType;
  targetId: string;
  targetTitle?: string;
  defaultCategory?: AttachmentCategory;
  onViewAll?: () => void;
}

export const RecordAttachmentBar: React.FC<RecordAttachmentBarProps> = ({
  targetType,
  targetId,
  targetTitle,
  defaultCategory,
  onViewAll,
}) => {
  const { role, isViewOnly } = useAuth();
  const [attachments, setAttachments] = useState<PhotoAttachment[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [activePreview, setActivePreview] = useState<PhotoAttachment | null>(null);

  const canUpload = canUploadAttachment(role, isViewOnly);

  useEffect(() => {
    if (!targetId) return;
    const unsub = subscribeAttachmentsForTarget(targetType, targetId, (list) => {
      setAttachments(list);
    });
    return () => unsub();
  }, [targetType, targetId]);

  return (
    <div className="pt-2 mt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-xs">
      {/* Attached Thumbnails / Count */}
      <div className="flex items-center gap-2">
        {attachments.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-stone-600 flex items-center gap-1">
              <Paperclip className="w-3 h-3 text-teal-800" />
              <span>{attachments.length} {attachments.length === 1 ? 'photo' : 'photos'}</span>
            </span>
            <div className="flex items-center -space-x-1.5 overflow-hidden">
              {attachments.slice(0, 3).map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => setActivePreview(att)}
                  className="w-6 h-6 rounded-md overflow-hidden border border-white shadow-2xs hover:scale-110 transition-transform"
                  title={att.caption || att.fileName}
                >
                  <img
                    src={att.downloadUrl}
                    alt={att.caption || att.fileName}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
            {attachments.length > 3 && (
              <span className="text-[10px] text-stone-400 font-semibold">
                +{attachments.length - 3}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-stone-400 italic">No attached photos</span>
        )}
      </div>

      {/* Quick Attach Button */}
      {canUpload && (
        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-900 hover:text-teal-950 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-md border border-teal-200 transition-colors"
        >
          <Camera className="w-3 h-3 text-teal-700" />
          <span>+ Attach Photo</span>
        </button>
      )}

      {/* Upload Modal */}
      <PhotoUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        targetType={targetType}
        targetId={targetId}
        targetTitle={targetTitle}
        defaultCategory={defaultCategory}
        onUploaded={(att) => {
          setAttachments((prev) => [att, ...prev]);
        }}
      />

      {/* Quick Preview Modal */}
      {activePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/80 backdrop-blur-xs animate-fadeIn"
          onClick={() => setActivePreview(null)}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden max-w-md w-full shadow-2xl border border-stone-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-4/3 bg-stone-900">
              <img
                src={activePreview.downloadUrl}
                alt={activePreview.caption || activePreview.fileName}
                className="w-full h-full object-contain"
              />
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-black bg-stone-900/80 text-white backdrop-blur-xs">
                {activePreview.category}
              </span>
            </div>
            <div className="p-3 text-xs space-y-1">
              <div className="font-bold text-stone-900">
                {activePreview.caption || activePreview.fileName}
              </div>
              <div className="text-[11px] text-stone-500">
                Date: {activePreview.date} • Uploaded by {activePreview.uploadedBy?.name || 'Staff'}
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActivePreview(null)}
                  className="px-3 py-1 bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-700 font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
