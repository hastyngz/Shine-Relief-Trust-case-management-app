import React, { useState } from 'react';
import { Household, HouseholdRentPayment, RentPaymentStatus } from '../../types';
import { formatMWK } from '../../utils/export';
import { Banknote, Save, X } from 'lucide-react';
import { FormPhotoSection, PendingPhoto } from '../Attachments/FormPhotoSection';

interface RentPaymentFormProps {
  household: Household;
  onSave: (
    data: Omit<HouseholdRentPayment, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => void | Promise<void>;
  onCancel: () => void;
}

export const RentPaymentForm: React.FC<RentPaymentFormProps> = ({
  household,
  onSave,
  onCancel,
}) => {
  const currentMonthName = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const [datePaid, setDatePaid] = useState(new Date().toISOString().slice(0, 10));
  const [monthCovered, setMonthCovered] = useState(currentMonthName);
  const [amountPaid, setAmountPaid] = useState(String(household.monthlyRentCost));
  const [paymentStatus, setPaymentStatus] = useState<RentPaymentStatus>('Paid');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState('');

  const numAmount = parseFloat(amountPaid) || 0;
  const expectedRent = household.monthlyRentCost;
  const difference = numAmount - expectedRent;

  const handleAmountChange = (val: string) => {
    setAmountPaid(val);
    const entered = parseFloat(val) || 0;
    if (entered >= expectedRent && expectedRent > 0) {
      setPaymentStatus('Paid');
    } else if (entered > 0 && entered < expectedRent) {
      setPaymentStatus('Partially paid');
    } else if (entered === 0) {
      setPaymentStatus('Not paid');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!monthCovered.trim()) {
      setError('Please specify the month covered (e.g. September 2026).');
      return;
    }

    onSave(
      {
        householdId: household.id,
        datePaid,
        monthCovered: monthCovered.trim(),
        amountPaid: numAmount,
        paymentStatus,
        receiptNumber: receiptNumber.trim() || undefined,
        notes: notes.trim(),
      },
      pendingPhotos
    );
  };

  return (
    <div id="rent-payment-form" className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
      <div className="bg-emerald-900 text-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-emerald-300" />
          <div>
            <h2 className="font-semibold text-base sm:text-lg">Record Rent Payment</h2>
            <p className="text-xs text-emerald-200">
              For: <span className="font-bold">{household.name}</span> ({household.location})
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-stone-300 hover:text-white p-1 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div className="p-3.5 bg-emerald-50 rounded-lg border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-medium text-emerald-800">Expected Monthly Rent:</span>
            <div className="text-base font-bold text-emerald-950">{formatMWK(household.monthlyRentCost)}</div>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-stone-600">Payment Status:</span>
            <div className="text-sm font-semibold">
              {difference === 0 ? (
                <span className="text-emerald-700">Full Monthly Rent</span>
              ) : difference < 0 ? (
                <span className="text-amber-700">Underpaid by {formatMWK(Math.abs(difference))}</span>
              ) : (
                <span className="text-blue-700">Advance/Overpaid by {formatMWK(difference)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Date Paid <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={datePaid}
              onChange={(e) => setDatePaid(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Month Covered <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={monthCovered}
              onChange={(e) => setMonthCovered(e.target.value)}
              placeholder="e.g. September 2026"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Actual Amount Paid (MWK) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm font-medium text-stone-500">MWK</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={amountPaid}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="w-full pl-14 pr-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:outline-none font-semibold"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Payment Status <span className="text-red-500">*</span>
            </label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as RentPaymentStatus)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:outline-none bg-white font-medium"
            >
              <option value="Paid">Paid in Full</option>
              <option value="Partially paid">Partially Paid</option>
              <option value="Not paid">Not Paid / Arrears</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Receipt / Bank Reference Number
          </label>
          <input
            type="text"
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            placeholder="e.g. REC-2026-09-001, Bank Ref #992811"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Payment Notes / Landlord Agreement
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Paid via Airtel Money to Landlord Mr. Phiri; remaining balance agreed to be paid on 20th..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-700 focus:outline-none"
          />
        </div>

        {/* Optional Photo Attachment Section */}
        <FormPhotoSection
          pendingPhotos={pendingPhotos}
          onChange={setPendingPhotos}
          defaultCategory="Receipt"
          title="Rent Receipt / Landlord Acknowledgment (Optional)"
          description="Take camera photo or choose image: signed rent receipt book, bank deposit slip, or mobile money transaction confirmation."
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Rent Record
          </button>
        </div>
      </form>
    </div>
  );
};
