import { doc, runTransaction } from 'firebase/firestore';
import { firestore } from '../firebase';
import type { ScheduleItem, StaffRole } from '../types';

export async function decideTripApproval(params: { trip: ScheduleItem; decision: 'Approved' | 'Rejected'; uid: string; name: string; role?: StaffRole; note?: string }): Promise<void> {
  if ((params.role !== 'Manager' && params.role !== 'Administrator') || !params.uid || params.trip.type !== 'transport_trip') throw new Error('Only Managers and Administrators can decide transport trip requests.');
  const note = params.note?.trim() || '';
  if (note.length > 500) throw new Error('The approval note must be 500 characters or fewer.');
  const ref = doc(firestore, 'schedules', params.trip.id);
  await runTransaction(firestore, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Trip not found. Refresh the register.');
    const current = snapshot.data() as ScheduleItem;
    if (current.type !== 'transport_trip' || current.tripApprovalStatus !== 'Pending') throw new Error('This trip is no longer awaiting approval. Refresh the register.');
    const now = new Date().toISOString();
    transaction.update(ref, { tripApprovalStatus: params.decision, tripApprovedByUid: params.uid, tripApprovedByName: params.name, tripApprovedAt: now, tripApprovalNote: note, status: params.decision === 'Approved' ? 'Scheduled' : 'Cancelled', updatedAt: now, updatedBy: params.name });
  });
}
