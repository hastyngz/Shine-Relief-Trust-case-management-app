import React, { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, RotateCcw, Trash2, Upload, Volume2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface AudioDataInputProps {
  label?: string;
  initialTranscription?: string;
  onTranscriptionChange?: (text: string) => void;
  onAudioChange?: (audio: Blob | null) => void;
  onExtractedData?: (data: Record<string, unknown>) => void;
  disabled?: boolean;
}

export const AudioDataInput: React.FC<AudioDataInputProps> = ({
  label = 'Audio entry',
  initialTranscription = '',
  onTranscriptionChange,
  onAudioChange,
  onExtractedData,
  disabled = false,
}) => {
  const { currentUser } = useAuth();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState(initialTranscription);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const setAudioBlob = (blob: Blob | null) => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const nextUrl = blob ? URL.createObjectURL(blob) : null;
    setAudio(blob);
    setAudioUrl(nextUrl);
    setUploadProgress(blob ? 100 : 0);
    onAudioChange?.(blob);
  };

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported in this browser. Upload an audio file instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setAudioBlob(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
        setStatus('Recording ready for review');
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatus('Recording...');
    } catch {
      setError('Microphone permission was not granted.');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setError('Choose an MP3, WAV, M4A, MP4, or browser-recorded audio file.');
      return;
    }
    setError(null);
    setAudioBlob(file);
    setStatus('Audio file ready for review');
  };

  const transcribe = async () => {
    if (!audio || !currentUser) {
      setError('Sign in and provide an audio recording before transcribing.');
      return;
    }
    setProcessing(true);
    setError(null);
    setStatus('Transcribing securely...');
    try {
      const token = await currentUser.getIdToken();
      const bytes = new Uint8Array(await audio.arrayBuffer());
      let binary = '';
      bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audioBase64: btoa(binary), mimeType: audio.type || 'audio/webm' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.errorMessage || result.error || 'Transcription failed.');
      setTranscription(result.transcription || '');
      onTranscriptionChange?.(result.transcription || '');
      onExtractedData?.(result.extractedData || {});
      setStatus(result.reviewRequired ? 'Transcription ready - please review' : 'Transcription ready');
    } catch (transcriptionError) {
      setError(transcriptionError instanceof Error ? transcriptionError.message : 'Transcription failed.');
      setStatus('Review required');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <section className="rounded-xl border border-stone-200 bg-stone-50 p-3 space-y-3" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-stone-800"><Volume2 className="h-4 w-4 text-teal-800" />{label}</div>
        <span className="text-[11px] text-stone-500">{status}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {recording ? (
          <button type="button" onClick={stopRecording} disabled={disabled} className="inline-flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white"><Pause className="h-4 w-4" />Stop recording</button>
        ) : (
          <button type="button" onClick={startRecording} disabled={disabled} className="inline-flex items-center gap-1 rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white"><Mic className="h-4 w-4" />Record</button>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-800"><Upload className="h-4 w-4" />Upload<input className="hidden" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/webm" disabled={disabled} onChange={(event) => handleFile(event.target.files?.[0])} /></label>
        {audio && <button type="button" onClick={() => setAudioBlob(null)} disabled={disabled || processing} title="Delete audio" className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700"><Trash2 className="h-4 w-4" />Delete</button>}
        {audio && <button type="button" onClick={startRecording} disabled={disabled || recording || processing} title="Record again" className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-800"><RotateCcw className="h-4 w-4" />Re-record</button>}
      </div>
      {audioUrl && <div className="flex items-center gap-2"><audio controls src={audioUrl} className="h-9 max-w-full" /><span className="text-[11px] text-stone-500">{uploadProgress}% ready</span></div>}
      <div><label className="block text-[11px] font-semibold text-stone-600">Editable transcription<textarea value={transcription} onChange={(event) => { setTranscription(event.target.value); onTranscriptionChange?.(event.target.value); }} rows={3} placeholder="Transcribed text will appear here for review." className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2 text-xs" /></label></div>
      <button type="button" onClick={transcribe} disabled={!audio || processing || disabled} className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-teal-950 disabled:opacity-50"><Play className="h-4 w-4" />{processing ? 'Processing...' : 'Transcribe with SHINE AI'}</button>
      {error && <p className="text-xs text-rose-700" role="alert">{error}</p>}
    </section>
  );
};
