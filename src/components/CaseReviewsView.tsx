import React from 'react';
import { AppDatabase } from '../types';
import { addCaseReview } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { ClipboardCheck, Plus } from 'lucide-react';

interface CaseReviewsViewProps {
  db: AppDatabase;
  onRefresh: () => void;
}

export const CaseReviewsView: React.FC<CaseReviewsViewProps> = ({ db, onRefresh }) => {
  const { auditActor, canViewCaseReviews, canEditCaseReviews } = useAuth();
  const reviews = db.caseReviews || [];
  const girlName = (girlId: string) => db.girls.find((girl) => girl.id === girlId)?.fullName || girlId;

  if (!canViewCaseReviews) {
    return <div className="p-6 border border-amber-200 bg-amber-50 rounded-lg text-xs text-amber-950">Case review access has not been granted to your account.</div>;
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditCaseReviews) return;
    const data = new FormData(event.currentTarget);
    const girlId = String(data.get('girlId') || '');
    const reviewDate = String(data.get('reviewDate') || '');
    if (!girlId || !reviewDate) return;
    addCaseReview({
      girlId,
      reviewDate,
      currentSituation: String(data.get('currentSituation') || '').trim() || undefined,
      education: String(data.get('education') || '').trim() || undefined,
      health: String(data.get('health') || '').trim() || undefined,
      family: String(data.get('family') || '').trim() || undefined,
      household: String(data.get('household') || '').trim() || undefined,
      progress: String(data.get('progress') || '').trim() || undefined,
      challenges: String(data.get('challenges') || '').trim() || undefined,
      supportRequired: String(data.get('supportRequired') || '').trim() || undefined,
      actionPlan: String(data.get('actionPlan') || '').trim() || undefined,
      nextReviewDate: String(data.get('nextReviewDate') || '') || undefined,
    }, auditActor);
    event.currentTarget.reset();
    onRefresh();
  };

  return (
    <section className="space-y-4" aria-label="Case reviews">
      <div>
        <h2 className="text-lg font-black text-stone-900 flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-teal-800" />Case Reviews</h2>
        <p className="text-xs text-stone-500">Summarize current circumstances and the agreed next review without duplicating underlying records.</p>
      </div>
      {canEditCaseReviews && <form onSubmit={submit} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 bg-white border border-stone-200 p-3 rounded-md">
        <select name="girlId" required className="border rounded-md p-2 text-xs"><option value="">Girl *</option>{db.girls.map((girl) => <option key={girl.id} value={girl.id}>{girl.fullName}</option>)}</select>
        <input type="date" name="reviewDate" required aria-label="Review date" className="border rounded-md p-2 text-xs" />
        <input type="date" name="nextReviewDate" aria-label="Next review date" className="border rounded-md p-2 text-xs" />
        {[
          ['currentSituation', 'Current situation'], ['education', 'Education'], ['health', 'Health'],
          ['family', 'Family'], ['household', 'Household'],
          ['progress', 'Progress'], ['challenges', 'Challenges'], ['supportRequired', 'Support required'], ['actionPlan', 'Action plan'],
        ].map(([name, label]) => <textarea key={name} name={name} aria-label={label} placeholder={label} rows={2} className="border rounded-md p-2 text-xs" />)}
        <button className="inline-flex items-center justify-center gap-1.5 bg-teal-900 text-white rounded-md px-3 py-2 text-xs font-bold"><Plus className="w-3.5 h-3.5" />Save case review</button>
      </form>}
      <div className="divide-y divide-stone-200 border-y border-stone-200">
        {reviews.slice().sort((a, b) => b.reviewDate.localeCompare(a.reviewDate)).map((review) => (
          <article key={review.id} className="py-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-bold">{girlName(review.girlId)} · {review.reviewDate}</h3><span className="text-[11px] text-stone-500">{review.nextReviewDate ? `Next review ${review.nextReviewDate}` : 'Next review not set'} · {review.createdBy}</span></div>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              {[
                ['Current situation', review.currentSituation], ['Education', review.education], ['Health', review.health],
                ['Family', review.family], ['Household', review.household],
                ['Progress', review.progress], ['Challenges', review.challenges], ['Support required', review.supportRequired], ['Action plan', review.actionPlan],
              ].filter(([, value]) => value).map(([label, value]) => <div key={label} className="bg-stone-50 rounded-md p-2"><strong>{label}</strong><p className="mt-0.5 whitespace-pre-line">{value}</p></div>)}
            </div>
          </article>
        ))}
        {reviews.length === 0 && <p className="py-6 text-center text-xs text-stone-500">No case reviews recorded.</p>}
      </div>
    </section>
  );
};