import React, { useState } from 'react';
import { Household, HouseholdExpense, ExpenseCategory } from '../../types';
import { ShoppingBag, Save, X } from 'lucide-react';
import { FormPhotoSection, PendingPhoto } from '../Attachments/FormPhotoSection';
import { PROGRAMMES } from '../../data/programmes';

interface HouseholdExpenseFormProps {
  household: Household;
  onSave: (
    data: Omit<HouseholdExpense, 'id' | 'createdAt'>,
    pendingPhotos?: PendingPhoto[]
  ) => void | Promise<void>;
  onCancel: () => void;
}

const COMMON_ITEMS = [
  'Maize flour (50kg bag)',
  'Cooking oil (5L)',
  'Soya pieces',
  'Sugar (10kg)',
  'Table salt',
  'Farm fresh eggs (crate)',
  'Sunlight laundry soap',
  'ESCOM electricity units',
  'Water bill',
  'Plumbing / house repairs',
];

export const HouseholdExpenseForm: React.FC<HouseholdExpenseFormProps> = ({
  household,
  onSave,
  onCancel,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ExpenseCategory>('Groceries');
  const [itemDescription, setItemDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplierContactPerson, setSupplierContactPerson] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [unit, setUnit] = useState('');
  const [invoiceReference, setInvoiceReference] = useState('');
  const [programme, setProgramme] = useState('');
  const [budgetCategory, setBudgetCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Payment Outstanding'>('Paid');
  const [amountDue, setAmountDue] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [datePaid, setDatePaid] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState('');

  const handleUnitCostChange = (val: string) => {
    setUnitCost(val);
    const u = parseFloat(val) || 0;
    const q = parseFloat(quantity) || 1;
    if (u > 0) {
      setTotalCost(String(Math.round(u * q)));
    }
  };

  const handleQuantityChange = (val: string) => {
    setQuantity(val);
    const q = parseFloat(val) || 1;
    const u = parseFloat(unitCost) || 0;
    if (u > 0) {
      setTotalCost(String(Math.round(u * q)));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemDescription.trim()) {
      setError('Please provide an item description.');
      return;
    }
    const total = parseFloat(totalCost) || 0;
    if (total <= 0) {
      setError('Please enter a valid expense amount.');
      return;
    }
    if (paymentStatus === 'Payment Outstanding' && amountDue.trim() && (!Number.isFinite(Number(amountDue)) || Number(amountDue) <= 0)) {
      setError('Enter a positive amount due, or leave it blank to use the total cost.');
      return;
    }

    onSave(
      {
        householdId: household.id,
        date,
        category,
        itemDescription: itemDescription.trim(),
        quantity: quantity.trim() || '1',
        unit: unit.trim() || undefined,
        unitCost: parseFloat(unitCost) || total,
        totalCost: total,
        supplier: supplier.trim() || undefined,
        supplierContactPerson: supplierContactPerson.trim() || undefined,
        supplierPhone: supplierPhone.trim() || undefined,
        supplierEmail: supplierEmail.trim() || undefined,
        supplierAddress: supplierAddress.trim() || undefined,
        invoiceReference: invoiceReference.trim() || undefined,
        programme: programme || undefined,
        budgetCategory: budgetCategory.trim() || undefined,
        subcategory: subcategory.trim() || undefined,
        paymentStatus,
        amountDue: paymentStatus === 'Payment Outstanding' ? (parseFloat(amountDue) || total) : undefined,
        dueDate: paymentStatus === 'Payment Outstanding' ? dueDate || undefined : undefined,
        datePaid: paymentStatus === 'Paid' ? datePaid || undefined : undefined,
        paymentMethod: paymentMethod.trim() || undefined,
        paymentReference: paymentReference.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      pendingPhotos
    );
  };

  return (
    <div id="household-expense-form" className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
      <div className="bg-teal-900 text-white px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-semibold text-base sm:text-lg">Record Household Expense</h2>
            <p className="text-xs text-stone-300">
              For: <span className="font-bold text-amber-200">{household.name}</span>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Date of Purchase <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none bg-white"
            >
              <option value="Groceries">Groceries</option>
              <option value="Food">Food</option>
              <option value="Household supplies">Household supplies</option>
              <option value="Utilities">Utilities</option>
              <option value="Rent">Rent</option>
              <option value="Repairs">Repairs</option>
              <option value="Clothing/social support">Clothing/social support</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Item / Description <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
            placeholder="e.g. Maize flour (Cream of Maize 50kg), Cooking oil 5L, Soya pieces..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            required
          />
          {/* Quick item suggestion chips */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-xs text-stone-500 self-center">Quick items:</span>
            {COMMON_ITEMS.slice(0, 5).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setItemDescription(item)}
                className="text-xs px-2 py-1 bg-stone-100 hover:bg-teal-50 hover:text-teal-800 text-stone-700 rounded-md border border-stone-200 transition-colors"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Quantity / Units
            </label>
            <input
              type="text"
              value={quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              placeholder="e.g. 2 bags, 10 packets, 5L"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Unit Cost (MWK)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={unitCost}
              onChange={(e) => handleUnitCostChange(e.target.value)}
              placeholder="e.g. 42000"
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Total Cost (MWK) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
              placeholder="e.g. 84000"
              className="w-full px-3 py-2 text-sm border border-teal-600 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none font-bold text-teal-900"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Supplier / Vendor (Optional)
          </label>
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="e.g. Chipiku Stores Zomba, Agora, Local Market, ESCOM"
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Supplier contact person (Optional)</label>
            <input value={supplierContactPerson} onChange={(e) => setSupplierContactPerson(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Supplier phone (Optional)</label>
            <input type="tel" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Supplier email (Optional)</label>
            <input type="email" value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Supplier address / location (Optional)</label>
            <input value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Invoice / supplier reference (Optional)</label>
            <input value={invoiceReference} onChange={(e) => setInvoiceReference(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Unit (Optional)</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. bag, litre, item" className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Programme (Optional)</label>
            <select value={programme} onChange={(e) => setProgramme(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white">
              <option value="">Not linked to a programme</option>
              {PROGRAMMES.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Budget category (Optional)</label>
            <input value={budgetCategory} onChange={(e) => setBudgetCategory(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Budget subcategory (Optional)</label>
            <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
          </div>
        </div>

        <fieldset className="rounded-lg border border-stone-200 p-3">
          <legend className="px-1 text-xs font-bold text-stone-800">Payment</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-stone-700">Payment status
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as 'Paid' | 'Payment Outstanding')} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
                <option value="Paid">Paid</option>
                <option value="Payment Outstanding">Payment Outstanding</option>
              </select>
              {paymentStatus === 'Payment Outstanding' && <span className="mt-1 block font-normal text-stone-600">The expense has been recorded, but the supplier has not yet been paid.</span>}
            </label>
            {paymentStatus === 'Payment Outstanding' ? (
              <>
                <label className="text-xs font-semibold text-stone-700">Amount due (MWK)
                  <input type="number" min="0" step="1" value={amountDue} onChange={(e) => setAmountDue(e.target.value)} placeholder={totalCost || 'Defaults to total cost'} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-stone-700">Due date (Optional)
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                </label>
              </>
            ) : (
              <>
                <label className="text-xs font-semibold text-stone-700">Date paid (Optional)
                  <input type="date" value={datePaid} onChange={(e) => setDatePaid(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-stone-700">Payment method (Optional)
                  <input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-stone-700">Payment reference (Optional)
                  <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                </label>
              </>
            )}
          </div>
        </fieldset>

        <div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Notes / Receipt Details
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Receipt number, special discount, delivery notes..."
            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:ring-2 focus:ring-teal-700 focus:outline-none"
          />
        </div>

        {/* Optional Photo Attachment Section */}
        <FormPhotoSection
          pendingPhotos={pendingPhotos}
          onChange={setPendingPhotos}
          defaultCategory="Receipt"
          title="Receipt or Invoice Photo (Optional)"
          description="Take camera photo or choose image: grocery store paper receipts, water/electricity tokens, repair bills."
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
            className="px-5 py-2 text-sm font-semibold text-white bg-teal-800 hover:bg-teal-900 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Expense
          </button>
        </div>
      </form>
    </div>
  );
};
