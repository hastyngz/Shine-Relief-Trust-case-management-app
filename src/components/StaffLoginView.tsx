import React, { useState } from 'react';
import { useAuth, PRIMARY_ADMIN_EMAIL } from '../contexts/AuthContext';
import { Heart, Lock, Mail, User, ShieldCheck, KeyRound, AlertCircle, CheckCircle2, ArrowRight, ExternalLink } from 'lucide-react';

export const StaffLoginView: React.FC = () => {
  const { login, loginWithGoogle, setupInitialAdmin, sendResetPassword } = useAuth();
  const [tab, setTab] = useState<'signin' | 'first-admin' | 'forgot'>('signin');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('Hastings Zidana');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOperationNotAllowed, setIsOperationNotAllowed] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const resetState = () => {
    setError(null);
    setIsOperationNotAllowed(false);
    setSuccess(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetState();
    if (!email || !password) {
      setError('Please provide both your staff email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setIsOperationNotAllowed(true);
        setError('Email & Password sign-in is not enabled in this project. Please click "Sign in with Google" above.');
      } else if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        if (email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL) {
          setError(
            'Credentials not recognized. Hastings, please use "Sign in with Google" above to sign in as Administrator.'
          );
        } else {
          setError('Invalid email or password. Please verify your credentials or sign in with Google.');
        }
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later or use Google Sign-In.');
      } else {
        console.warn('Sign in attempt notice:', err.message || err);
        setError(err.message || 'Failed to sign in. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    resetState();
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in popup was closed before completing.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Sign-in popup was blocked by your browser. Please allow popups or open the app in a new tab.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setIsOperationNotAllowed(true);
        setError('Google sign-in is not enabled in Firebase Console.');
      } else {
        console.warn('Google sign-in notice:', err.message || err);
        setError(err.message || 'Google sign-in could not be completed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInitialAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    resetState();

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await setupInitialAdmin(password, fullName);
      setSuccess('Primary Administrator account for Hastings initialized successfully! Logging you in...');
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setIsOperationNotAllowed(true);
        setError('Password setup is disabled in this Firebase project. Please click "Activate Admin with Google" instead.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError(
          'An account for hastingszidanamot@gmail.com already exists. Please use "Sign in with Google" to access your dashboard.'
        );
      } else {
        console.warn('Admin setup notice:', err.message || err);
        setError(err.message || 'Failed to initialize Administrator account.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetState();
    if (!email) {
      setError('Please enter your staff email address.');
      return;
    }

    setLoading(true);
    try {
      await sendResetPassword(email);
      setSuccess(`A password reset link has been dispatched to ${email}. Check your inbox or spam folder.`);
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err.code === 'auth/user-not-found') {
        setError('No staff account found with this email address.');
      } else {
        setError(err.message || 'Failed to send password reset email.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center text-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-white p-2 shadow-sm border border-stone-200/90 flex items-center justify-center mb-3 overflow-hidden">
            <img
              src="/shine-logo.png"
              alt="SHINE Relief Trust Logo"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-teal-950">
              SHINE <span className="text-amber-600">Relief Trust</span>
            </h1>
            <p className="text-xs text-stone-500 font-medium mt-0.5">Malawi Care & Monitoring System</p>
          </div>
        </div>

        {/* Auth Mode Tabs */}
        <div className="bg-white p-1.5 rounded-xl shadow-xs border border-stone-200 flex gap-1 mb-4">
          <button
            type="button"
            onClick={() => {
              setTab('signin');
              resetState();
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              tab === 'signin'
                ? 'bg-teal-900 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            Staff Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('first-admin');
              resetState();
              setEmail(PRIMARY_ADMIN_EMAIL);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              tab === 'first-admin'
                ? 'bg-teal-900 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            First-Time Admin
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('forgot');
              resetState();
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              tab === 'forgot'
                ? 'bg-teal-900 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            Reset Password
          </button>
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-stone-200 sm:px-10">
          {/* Alerts */}
          {isOperationNotAllowed && (
            <div className="mb-5 p-4 bg-teal-50 border border-teal-300 rounded-xl text-xs text-stone-800 space-y-2.5 shadow-xs">
              <div className="font-bold flex items-center gap-1.5 text-teal-950 text-sm">
                <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
                Google Sign-In is Enabled & Ready!
              </div>
              <p className="text-stone-700 leading-relaxed text-[11px]">
                In this Firebase project, <strong>Google Sign-In is already enabled</strong> (shown with a green checkmark in your console). Simply click the <strong>Sign in with Google</strong> button above with your account (<strong>hastingszidanamot@gmail.com</strong>) to sign in immediately as Administrator.
              </p>
              <p className="text-[11px] text-stone-500">
                (Note: Traditional Email/Password requires project-owner permission to toggle on, whereas Google Sign-In is already active).
              </p>
            </div>
          )}

          {error && !isOperationNotAllowed && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* TAB 1: Staff Sign In */}
          {tab === 'signin' && (
            <div className="space-y-4">
              {/* Primary: Google Sign In (Active Provider) */}
              <div>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full py-3 px-4 bg-teal-900 hover:bg-teal-950 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.99]"
                >
                  <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center p-1">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  </div>
                  <span>{loading ? 'Signing in...' : 'Sign in with Google'}</span>
                </button>
                <p className="text-[11px] text-center text-stone-500 mt-1.5 font-medium">
                  Instant access for <span className="font-semibold text-teal-900">hastingszidanamot@gmail.com</span>
                </p>
              </div>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-stone-200" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                  <span className="bg-white px-2 text-stone-400 font-semibold">Or with password</span>
                </div>
              </div>

              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Staff Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. hastingszidanamot@gmail.com"
                      className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-700"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setTab('forgot');
                        resetState();
                      }}
                      className="text-xs text-teal-800 hover:text-teal-950 font-semibold"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-700"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 bg-stone-800 hover:bg-stone-900 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
                >
                  {loading ? 'Authenticating...' : 'Sign In with Email & Password'}
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                </button>
              </form>

              <div className="pt-3 border-t border-stone-100 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setTab('first-admin');
                    resetState();
                    setEmail(PRIMARY_ADMIN_EMAIL);
                  }}
                  className="text-xs text-stone-500 hover:text-teal-900 font-medium"
                >
                  Are you Hastings? <span className="font-bold underline text-amber-700">Initialize Hastings Admin Account</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: First-Time Admin Setup (Hastings) */}
          {tab === 'first-admin' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-950 text-sm">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  Administrator Account Activation
                </div>
                <p className="text-stone-700 text-[11px] leading-relaxed">
                  Welcome Hastings! In your Firebase project, Google authentication is active and verified. Click below to sign in and immediately activate your Primary Administrator account for{' '}
                  <span className="font-bold text-teal-950">{PRIMARY_ADMIN_EMAIL}</span>.
                </p>
              </div>

              {/* Primary: Google One-Click Activation */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-3 px-4 bg-teal-900 hover:bg-teal-950 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.99]"
              >
                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center p-1 shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                </div>
                <span>{loading ? 'Activating...' : 'Activate Hastings Admin with Google'}</span>
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setTab('signin');
                    resetState();
                  }}
                  className="text-xs text-stone-500 hover:text-teal-900 font-semibold"
                >
                  Return to Staff Sign In
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Forgot Password */}
          {tab === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-600">
                Enter your staff email address and Firebase will send an official password reset link.
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Staff Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your registered email"
                    className="w-full pl-9 pr-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-teal-900 hover:bg-teal-950 text-white font-bold text-sm rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Sending Link...' : 'Dispatch Password Reset Link'}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setTab('signin');
                    resetState();
                  }}
                  className="text-xs text-teal-900 hover:underline font-semibold"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center text-xs text-stone-500 space-y-1">
          <p className="font-semibold text-stone-600">
            Protected by Firebase Authentication & Role-Based Firestore Rules
          </p>
          <p className="text-[11px]">
            Unauthorized access attempts are logged and restricted.
          </p>
        </div>
      </div>
    </div>
  );
};
