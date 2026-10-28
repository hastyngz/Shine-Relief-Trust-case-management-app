import React, { FormEvent, useMemo, useState } from 'react';
import { isSignInWithEmailLink, signInWithEmailLink, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { claimStaffInvitation } from '../services/r2StorageClient';
import { useAuth } from '../contexts/AuthContext';
import { getStaffInvitationToken } from '../utils/staffInvitationUrl';

const getInvitationToken = () => getStaffInvitationToken(window.location.hash, window.location.search);

export const StaffInvitationClaim: React.FC = () => {
  const { refreshStaffProfile } = useAuth();
  const token = useMemo(() => getInvitationToken(), []);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!token) {
      setError('The invitation token is missing from this link. Ask a SHINE Administrator to send a new invitation.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter the email address that received the invitation.');
      return;
    }

    setBusy(true);
    try {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        if (auth.currentUser && auth.currentUser.email?.toLowerCase() !== cleanEmail) {
          await signOut(auth);
        }
        await signInWithEmailLink(auth, cleanEmail, window.location.href);
      } else {
        const user = auth.currentUser;
        if (!user || user.email?.toLowerCase() !== cleanEmail) {
          throw new Error('Open the sign-in link from the invitation email on this device, then try again.');
        }
        await user.reload();
        if (!auth.currentUser?.emailVerified) {
          throw new Error('Firebase has not confirmed this email sign-in. Open the original invitation email link again.');
        }
      }

      const user = auth.currentUser;
      if (!user || user.email?.toLowerCase() !== cleanEmail || !user.emailVerified) {
        throw new Error('The signed-in account must match the verified invitation email.');
      }
      await claimStaffInvitation(token);
      await refreshStaffProfile();
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The invitation could not be accepted. Please try again or contact a SHINE Administrator.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-orange-50 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border border-orange-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-800 font-black">S</div>
          <div>
            <h1 className="text-xl font-black text-stone-900">SHINE staff invitation</h1>
            <p className="text-sm text-stone-600">Secure email verification and account setup</p>
          </div>
        </div>
        {complete ? (
          <div role="status" className="space-y-4">
            <p className="font-semibold text-emerald-800">Invitation accepted. Your SHINE staff profile has been created.</p>
            <p className="text-sm text-stone-600">You can now open SHINE using the verified account.</p>
            <button type="button" onClick={() => window.location.assign(`${window.location.origin}/#/dashboard`)} className="w-full rounded-xl bg-orange-700 px-4 py-3 text-sm font-bold text-white">
              Open SHINE
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-stone-600">Enter the email address that received this invitation. Firebase will verify the email link before SHINE creates your staff profile.</p>
            <label className="block text-sm font-semibold text-stone-800">
              Invitation email
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-3 text-base" />
            </label>
            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-orange-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              {busy ? 'Verifying invitation…' : 'Verify and accept invitation'}
            </button>
          </form>
        )}
        <p className="mt-5 text-xs text-stone-500">Invitation links are single-use and expire. If this link has expired or been replaced, ask an Administrator to resend it.</p>
      </section>
    </main>
  );
};
