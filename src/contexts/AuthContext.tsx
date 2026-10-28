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
import { auth } from '../firebase';
import { setActiveWorkspaceUid } from '../services/accountWorkspace';
import { StaffUser, StaffRole, StaffStatus } from '../types';
import {
  getStaffUserDoc,
  getStaffUserByEmail,
  persistStaffUserToFirestore,
  deleteStaffUserFromFirestore,
  subscribeStaffUsers,
  subscribeStaffUserDoc,
} from '../services/firestoreSync';
import { createStaffInvitation } from '../services/r2StorageClient';

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
  }) => Promise<void>;
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

    // Profile reads can overlap when accounts change quickly on a shared phone.
    // An older request must not publish its role/profile after a newer user signs in.
    const isStillCurrentUser = () => auth.currentUser?.uid === user.uid;
    if (!isStillCurrentUser()) return;

    const email = user.email?.toLowerCase().trim() || '';
    const isHastings = email === PRIMARY_ADMIN_EMAIL;

    try {
      let profile = await getStaffUserDoc(user.uid);
      if (!isStillCurrentUser()) return;

      // If not found by UID, check if invited/pre-registered by email
      if (!profile && email) {
        profile = await getStaffUserByEmail(email);
        if (!isStillCurrentUser()) return;
        if (profile) {
          // Link UID and update in Firestore only while this auth identity is current.
          if (!isStillCurrentUser()) return;
          profile.uid = user.uid;
          profile.id = user.uid;
          await persistStaffUserToFirestore(profile);
          if (!isStillCurrentUser()) return;
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
        if (!isStillCurrentUser()) return;
        await persistStaffUserToFirestore(initialHastingsDoc);
        if (!isStillCurrentUser()) return;
        profile = initialHastingsDoc;
      }

      if (!isStillCurrentUser()) return;
      if (profile) {
        // Update lastLoginAt at most once per calendar day. Every write to
        // staffUsers can fan out to the roster onSnapshot listener for every
        // active session, so writing on every login creates avoidable reads.
        if (profile.status === 'Active') {
          const now = new Date().toISOString();
          if (profile.lastLoginAt?.slice(0, 10) !== now.slice(0, 10) && isStillCurrentUser()) {
            profile.lastLoginAt = now;
            persistStaffUserToFirestore(profile).catch((e) =>
              console.warn('Non-fatal: could not update lastLoginAt', e)
            );
          }
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
      setActiveWorkspaceUid(user?.uid ?? null);
      setCurrentUser(user);
      await loadStaffProfile(user);
      setLoading(false);
    });

    return () => {
      unsubAuth();
    };
  }, []);

  // Load the full staff roster only after the signed-in user is confirmed active.
  // Suspended registered users keep a listener on their own profile so an
  // administrator can reactivate them without requiring a fresh login. Unknown
  // accounts do not start a collection-wide listener that rules will reject.
  useEffect(() => {
    if (!currentUser) {
      setAllStaff([]);
      return;
    }

    const isPrimaryAdmin = currentUser.email?.toLowerCase().trim() === PRIMARY_ADMIN_EMAIL;
    const profileBelongsToUser = staffProfile?.uid === currentUser.uid || staffProfile?.id === currentUser.uid;
    const profileResolved = profileBelongsToUser && staffProfile !== null;
    const isRegisteredProfile = profileResolved && staffProfile.createdBy !== 'Unregistered User';
    const canReadRoster = isPrimaryAdmin || (isRegisteredProfile && staffProfile.status === 'Active');

    if (canReadRoster) {
      const unsubStaff = subscribeStaffUsers((list) => {
        setAllStaff(list);
        // Keep role/status changes live while the user has roster access.
        const matching = list.find((staff) =>
          staff.uid === currentUser.uid || staff.id === currentUser.uid
        );
        if (matching) {
          setStaffProfile(matching);
        } else if (!isPrimaryAdmin) {
          setStaffProfile((previous) => previous && (
            previous.uid === currentUser.uid || previous.id === currentUser.uid
          ) ? { ...previous, status: 'Suspended', createdBy: 'Unregistered User' } : previous);
        }
      });
      return () => {
        unsubStaff();
      };
    }

    setAllStaff([]);
    // Only listen to a single profile document when a known staff member is
    // suspended. This keeps status/reactivation changes live without exposing
    // or repeatedly attempting to read the full roster.
    if (profileResolved && isRegisteredProfile) {
      const unsubOwnProfile = subscribeStaffUserDoc(currentUser.uid, (profile) => {
        if (profile) {
          setStaffProfile(profile);
        } else {
          setStaffProfile((previous) => previous && (
            previous.uid === currentUser.uid || previous.id === currentUser.uid
          ) ? { ...previous, status: 'Suspended', createdBy: 'Unregistered User' } : previous);
        }
      });
      return () => {
        unsubOwnProfile();
      };
    }
  }, [currentUser, staffProfile?.uid, staffProfile?.id, staffProfile?.status, staffProfile?.createdBy]);

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

  // Invite a staff member through the trusted Worker. Firebase Auth creates the
  // identity only after the recipient follows the email link and claims the invitation.
  const createStaffAccount = async (data: {
    email: string;
    fullName: string;
    role: StaffRole;
    departmentOrTitle?: string;
    phone?: string;
  }): Promise<void> => {
    if (!isAdmin) {
      throw new Error('Unauthorized: Only Administrators can invite staff accounts.');
    }
    if (data.role === 'Administrator') {
      throw new Error('Administrator accounts cannot be created through staff invitations.');
    }
    await createStaffInvitation({
      email: data.email.trim().toLowerCase(),
      fullName: data.fullName.trim(),
      role: data.role,
      departmentOrTitle: data.departmentOrTitle || '',
      phone: data.phone || '',
    });
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
