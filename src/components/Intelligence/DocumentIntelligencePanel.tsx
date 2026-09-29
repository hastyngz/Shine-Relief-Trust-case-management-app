import React, { useState } from 'react';
import { FileSearch, Upload } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const DocumentIntelligencePanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('No document analyzed.');
  const [error, setError] = useState<string | null>(null);

  const analyze = async (file?: File) => {
    if (!file || !currentUser) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) { setError('Choose a PDF, JPEG, PNG, or WebP document.'); return; }
    if (file.size > 18 * 1024 * 1024) { setError('Choose a document smaller than 18 MB.'); return; }
    setError(null); setStatus('Analyzing securely...');
    try {
      const token = await currentUser.getIdToken();
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ''; bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
      const response = await fetch('/api/ai/analyze-document', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ documentBase64: btoa(binary), mimeType: file.type }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Document analysis failed.');
      setResult(JSON.stringify(payload.extractedData || {}, null, 2));
      setStatus('Draft extracted. Review and edit before creating any official record.');
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'Document analysis failed.');
      setStatus('Analysis failed.');
    }
  };

  return <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><FileSearch className="h-4 w-4 text-teal-800" /><h2 className="text-sm font-black text-stone-900">Document intelligence review</h2></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-800"><Upload className="h-4 w-4" />Upload document<input className="hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => analyze(event.target.files?.[0])} /></label><p className="mt-2 text-[11px] text-stone-500">{status}</p>{result && <label className="mt-3 block text-[11px] font-semibold text-stone-600">Editable extracted draft<textarea value={result} onChange={(event) => setResult(event.target.value)} rows={10} className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50/30 p-2 font-mono text-xs" /></label>}{error && <p className="mt-2 text-xs text-rose-700" role="alert">{error}</p>}</section>;
};
