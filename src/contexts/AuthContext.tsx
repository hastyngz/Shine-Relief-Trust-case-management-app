import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth as getSecondaryAuth } from 'firebase/auth';
import { auth, firestore } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { StaffUser, StaffRole, StaffStatus } from '../types';
import {
  getStaffUserDoc,
  getStaffUserByEmail,
  persistStaffUserToFirestore,
  deleteStaffUserFromFirestore,
  subscribeStaffUsers,
} from '../services/firestoreSync';

export const PRIMARY_ADMIN_EMAIL = 'hastingszidanamot@gmail.com';

interface AuthContextType {
  currentUser: User | null;
  staffProfile: StaffUser | null;
  allStaff: StaffUser[];
  role: StaffRole | null;
  isAdmin: boolean;
  canViewHealthRecords: boolean;
  canEditHealthRecords: boolean;
  canViewCaseReviews: boolean;
  canEditCaseReviews: boolean;
  canViewSafeguarding: boolean;
  canCreateSafeguarding: boolean;
  canEditSafeguarding: boolean;
  canCloseSafeguarding: boolean;
  canEdit: boolean;
  isViewOnly: boolean;
  isSuspended: boolean;
  isRegisteredStaff: boolean;
  loading: boolean;
  auditActor: string;
  login: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  setupInitialAdmin: (password: string, fullName?: string) => Promise<void>;
  sendResetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  createStaffAccount: (data: {
    email: string;
    fullName: string;
    role: StaffRole;
    departmentOrTitle?: string;
    phone?: string;
    initialPassword?: string;
  }) => Promise<StaffUser>;
  updateStaffAccount: (staffId: string, updates: Partial<StaffUser>) => Promise<void>;
  deleteStaffAccount: (staffId: string, email: string) => Promise<void>;
  refreshStaffProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffUser | null>(null);
  const [allStaff, setAllStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Load and refresh current user profile from Firestore
  const loadStaffProfile = async (user: User | null) => {
    if (!user) {
      setStaffProfile(null);
      return;
    }

    const email = user.email?.toLowerCase().trim() || '';
    const isHastings = email === PRIMARY_ADMIN_EMAIL;

    try {
      let profile = await getStaffUserDoc(user.uid);

      // If not found by UID, check if invited/pre-registered by email
      if (!profile && email) {
        profile = await getStaffUserByEmail(email);
        if (profile) {
          // Link UID and update in Firestore
          profile.uid = user.uid;
          profile.id = user.uid;
          await persistStaffUserToFirestore(profile);
        }
      }

      // Auto-bootstrap Hastings as Administrator if doc doesn't exist yet
      if (!profile && isHastings) {
        const now = new Date().toISOString();
        const initialHastingsDoc: StaffUser = {
          id: user.uid,
          uid: user.uid,
          email: PRIMARY_ADMIN_EMAIL,
          fullName: user.displayName || 'Hastings Zidana',
          role: 'Administrator',
          status: 'Active',
          departmentOrTitle: 'Trust Executive Administrator',
          createdAt: now,
          updatedAt: now,
          createdBy: 'System Initializer',
          lastLoginAt: now,
        };
        await persistStaffUserToFirestore(initialHastingsDoc);
        profile = initialHastingsDoc;
      }

      if (profile) {
        // Update last login
        if (profile.status === 'Active') {
          profile.lastLoginAt = new Date().toISOString();
          persistStaffUserToFirestore(profile).catch((e) =>
            console.warn('Non-fatal: could not update lastLoginAt', e)
          );
        }
        setStaffProfile(profile);
      } else {
        // User is authenticated with Firebase Auth but NOT yet registered in Firestore staffUsers by Admin.
        // If not Hastings, strictly mark as Suspended / Pending Approval until registered by an Administrator.
        setStaffProfile({
          id: user.uid,
          uid: user.uid,
          email,
          fullName: user.displayName || email.split('@')[0],
          role: isHastings ? 'Administrator' : 'View Only',
          status: isHastings ? 'Active' : 'Suspended',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'Unregistered User',
        });
      }
    } catch (err) {
      console.error('Error loading staff profile:', err);
    }
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      await loadStaffProfile(user);
      setLoading(false);
    });

    return () => {
      unsubAuth();
    };
  }, []);

  // Subscribe to staff roster ONLY when an authenticated user is signed in
  useEffect(() => {
    if (!currentUser) {
      setAllStaff([]);
      return;
    }

    const unsubStaff = subscribeStaffUsers((list) => {
      setAllStaff(list);
      // Also update current user's profile in real time if admin changes their role
      if (auth.currentUser) {
        const matching = list.find((s) => s.uid === auth.currentUser?.uid || s.id === auth.currentUser?.uid);
        if (matching) {
          setStaffProfile(matching);
        }
      }
    });

    return () => {
      unsubStaff();
    };
  }, [currentUser]);

  const refreshStaffProfile = async () => {
    if (auth.currentUser) {
      await loadStaffProfile(auth.currentUser);
    }
  };

  const isHastingsUser = currentUser?.email?.toLowerCase().trim() === PRIMARY_ADMIN_EMAIL;
  const isRegisteredStaff = isHastingsUser || (staffProfile !== null && staffProfile.createdBy !== 'Unregistered User');
  const role: StaffRole | null = staffProfile?.role || (isHastingsUser ? 'Administrator' : null);
  const isAdmin = role === 'Administrator' || isHastingsUser;
  const canViewHealthRecords = isAdmin || role === 'Manager' || staffProfile?.canViewHealthRecords === true;
  const canEditHealthRecords = isAdmin || role === 'Manager' || staffProfile?.canEditHealthRecords === true;
  const canViewCaseReviews = isAdmin || role === 'Manager' || staffProfile?.canViewCaseReviews === true;
  const canEditCaseReviews = isAdmin || role === 'Manager' || staffProfile?.canEditCaseReviews === true;
  const safeguardingPermissions = staffProfile?.safeguardingPermissions;
  const canViewSafeguarding = isAdmin || safeguardingPermissions?.canView === true;
  const canCreateSafeguarding = isAdmin || safeguardingPermissions?.canCreate === true;
  const canEditSafeguarding = isAdmin || safeguardingPermissions?.canEdit === true;
  const canCloseSafeguarding = isAdmin || safeguardingPermissions?.canClose === true;
  const isSuspended = !isHastingsUser && (!staffProfile || staffProfile.status === 'Suspended' || !isRegisteredStaff);
  const canEdit = isRegisteredStaff && !isSuspended && (isAdmin || role === 'Manager' || role === 'Staff');
  const isViewOnly = !canEdit;

  // Name used for createdBy/updatedBy auditing logs
  const auditActor = staffProfile
    ? `${staffProfile.fullName} (${staffProfile.role})`
    : isHastingsUser
    ? 'Hastings Zidana (Administrator)'
    : currentUser?.email || 'Staff Member';

  // Login handler
  const login = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
    await loadStaffProfile(cred.user);
  };

  // Google Sign-In handler
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    await loadStaffProfile(cred.user);
  };

  // Dedicated first-time admin setup for Hastings
  const setupInitialAdmin = async (password: string, fullName: string = 'Hastings Zidana') => {
    const email = PRIMARY_ADMIN_EMAIL;
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        // Account exists, try logging in
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } else {
        throw err;
      }
    }

    const uid = userCredential.user.uid;
    const now = new Date().toISOString();
    const adminDoc: StaffUser = {
      id: uid,
      uid,
      email,
      fullName: fullName || 'Hastings Zidana',
      role: 'Administrator',
      status: 'Active',
      departmentOrTitle: 'Trust Executive Administrator',
      createdAt: now,
      updatedAt: now,
      createdBy: 'First-Time Admin Setup',
      lastLoginAt: now,
    };

    await persistStaffUserToFirestore(adminDoc);
    setStaffProfile(adminDoc);
    setCurrentUser(userCredential.user);
  };

  // Password reset email
  const sendResetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  };

  // Sign out
  const logout = async () => {
    await signOut(auth);
    setStaffProfile(null);
    setCurrentUser(null);
  };

  // Admin invites / provisions a new staff account
  const createStaffAccount = async (data: {
    email: string;
    fullName: string;
    role: StaffRole;
    departmentOrTitle?: string;
    phone?: string;
    initialPassword?: string;
  }): Promise<StaffUser> => {
    if (!isAdmin) {
      throw new Error('Unauthorized: Only Administrators can create staff accounts.');
    }

    const cleanEmail = data.email.trim().toLowerCase();
    if (cleanEmail === PRIMARY_ADMIN_EMAIL && data.role !== 'Administrator') {
      throw new Error('Cannot change primary administrator account.');
    }

    // Default password if not provided
    const password = data.initialPassword || `Shine${Math.floor(100000 + Math.random() * 900000)}!`;

    // Use an isolated secondary Firebase app instance to avoid signing out the current admin
    const tempAppName = `StaffProvision_${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, tempAppName);
    let newUid: string;

    try {
      const secondaryAuth = getSecondaryAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
      newUid = userCredential.user.uid;
    } catch (authErr: any) {
      if (authErr.code === 'auth/email-already-in-use') {
        // If email already exists in Auth, generate a deterministic or look up UID from staff list
        const existingStaff = allStaff.find((s) => s.email.toLowerCase() === cleanEmail);
        newUid = existingStaff ? existingStaff.uid : `ext_${Date.now()}`;
      } else if (authErr.code === 'auth/operation-not-allowed') {
        // Firebase project only has Google auth enabled; create provisioned profile for Google sign-in
        newUid = `staff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      } else {
        throw authErr;
      }
    } finally {
      await deleteApp(secondaryApp);
    }

    const now = new Date().toISOString();
    const newStaffUser: StaffUser = {
      id: newUid,
      uid: newUid,
      email: cleanEmail,
      fullName: data.fullName.trim(),
      role: data.role,
      status: 'Active',
      departmentOrTitle: data.departmentOrTitle || '',
      phone: data.phone || '',
      createdAt: now,
      updatedAt: now,
      createdBy: auditActor,
      lastLoginAt: '',
    };

    await persistStaffUserToFirestore(newStaffUser);

    // Optionally trigger a password reset link to staff so they can set their personal password
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch (emailErr) {
      console.warn('Password reset invitation email dispatch note:', emailErr);
    }

    return newStaffUser;
  };

  // Update staff member
  const updateStaffAccount = async (staffId: string, updates: Partial<StaffUser>) => {
    if (!isAdmin) {
      throw new Error('Unauthorized: Only Administrators can modify staff roles and statuses.');
    }

    const existing = allStaff.find((s) => s.id === staffId || s.uid === staffId);
    if (!existing) {
      throw new Error('Staff member not found.');
    }

    // Protect Hastings account from being demoted or suspended
    if (existing.email.toLowerCase() === PRIMARY_ADMIN_EMAIL) {
      if (updates.role && updates.role !== 'Administrator') {
        throw new Error('The primary administrator account role cannot be changed.');
      }
      if (updates.status && updates.status !== 'Active') {
        throw new Error('The primary administrator account cannot be deactivated.');
      }
    }

    const updated: StaffUser = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await persistStaffUserToFirestore(updated);
  };

  // Delete staff member
  const deleteStaffAccount = async (staffId: string, email: string) => {
    if (!isAdmin) {
      throw new Error('Unauthorized: Only Administrators can delete staff members.');
    }

    if (email.toLowerCase() === PRIMARY_ADMIN_EMAIL) {
      throw new Error('The primary administrator account cannot be deleted.');
    }

    await deleteStaffUserFromFirestore(staffId);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        staffProfile,
        allStaff,
        role,
        isAdmin,
        canViewHealthRecords,
        canEditHealthRecords,
        canViewCaseReviews,
        canEditCaseReviews,
        canViewSafeguarding,
        canCreateSafeguarding,
        canEditSafeguarding,
        canCloseSafeguarding,
        canEdit,
        isViewOnly,
        isSuspended,
        isRegisteredStaff,
        loading,
        auditActor,
        login,
        loginWithGoogle,
        setupInitialAdmin,
        sendResetPassword,
        logout,
        createStaffAccount,
        updateStaffAccount,
        deleteStaffAccount,
        refreshStaffProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
