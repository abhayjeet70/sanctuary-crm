import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, PageHeader, StatCard } from "@/components/common";
import { useExpenses, useMockData, useVillas } from "@/hooks/useData";
import { formatDate, money } from "@/lib/format";
import { titleCase } from "@/lib/status";
import type { Expense, ExpenseCategory } from "@/types";
import { toISODate } from "@/services/domain";

const CATEGORIES: ExpenseCategory[] = [
  "salaries",
  "utilities",
  "supplies",
  "maintenance",
  "food_and_beverage",
  "marketing",
  "commission",
  "taxes_and_fees",
  "other",
];

const METHODS = ["UPI", "Bank transfer", "Cash", "Card"];

/** The whole property, for a cost that belongs to no single villa. */
const SHARED = "shared";
const ALL = "all";

const BLANK = {
  spentOn: toISODate(new Date()),
  category: "supplies" as ExpenseCategory,
  amount: "",
  payee: "",
  method: METHODS[0],
  reference: "",
  note: "",
  villaId: SHARED,
};

/**
 * Money out.
 *
 * Owner-only, and enforced in the database rather than here — a manager who
 * types the URL gets an empty list because RLS returns nothing, not because
 * this page decided to hide it.
 */
export default function ExpensesPage() {
  const expenses = useExpenses();
  const villas = useVillas();
  const { saveExpense, deleteExpense } = useMockData();

  const [draft, setDraft] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(ALL);
  const [removing, setRemoving] = useState<Expense | null>(null);

  const month = toISODate(new Date()).slice(0, 7);
  const thisMonth = expenses.filter((e) => e.spentOn.slice(0, 7) === month);

  const byCategory = useMemo(() => {
    const totals = new Map<ExpenseCategory, number>();
    for (const expense of thisMonth) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [thisMonth]);

  const rows = expenses.filter((e) => (category === ALL ? true : e.category === category));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!draft.spentOn) return setError("Give the date it was spent.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Give an amount above zero.");
    if (!draft.payee.trim()) return setError("Say who was paid.");

    setError(null);
    saveExpense({
      spentOn: draft.spentOn,
      category: draft.category,
      amount: Math.round(amount),
      payee: draft.payee.trim(),
      method: draft.method,
      reference: draft.reference.trim(),
      note: draft.note.trim(),
      villaId: draft.villaId === SHARED ? undefined : draft.villaId,
    });
    setDraft({ ...BLANK, spentOn: draft.spentOn, category: draft.category });
    toast.success("Expense recorded");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description="What the property spends, so the reports show both sides of the ledger."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="This month"
          value={money(thisMonth.reduce((sum, e) => sum + e.amount, 0))}
          icon={<Banknote className="size-4" />}
          hint={`${thisMonth.length} entries`}
        />
        <StatCard
          label="Biggest line"
          value={byCategory[0] ? titleCase(byCategory[0][0]) : "—"}
          hint={byCategory[0] ? money(byCategory[0][1]) : "Nothing recorded yet"}
        />
        <StatCard
          label="All time"
          value={money(expenses.reduce((sum, e) => sum + e.amount, 0))}
        />
        <StatCard label="Entries" value={expenses.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        {/* ------------------------------------------------------- record */}
        <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
          <h2 className="text-xl text-ink">Record a spend</h2>
          <form className="mt-4 space-y-4" onSubmit={submit} noValidate>
            <div>
              <Label htmlFor="spent-on">Date</Label>
              <Input
                id="spent-on"
                type="date"
                className="mt-1.5"
                value={draft.spentOn}
                onChange={(e) => setDraft({ ...draft, spentOn: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="expense-amount">Amount (₹)</Label>
              <Input
                id="expense-amount"
                inputMode="numeric"
                className="mt-1.5"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                placeholder="4500"
                required
              />
            </div>

            <div>
              <Label htmlFor="expense-payee">Paid to</Label>
              <Input
                id="expense-payee"
                className="mt-1.5"
                value={draft.payee}
                onChange={(e) => setDraft({ ...draft, payee: e.target.value })}
                placeholder="Nandi Electricals"
                required
              />
            </div>

            <div>
              <Label htmlFor="expense-category">Category</Label>
              <Select
                value={draft.category}
                onValueChange={(value) =>
                  setDraft({ ...draft, category: value as ExpenseCategory })
                }
              >
                <SelectTrigger id="expense-category" className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {titleCase(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="expense-villa">Villa</Label>
              <Select
                value={draft.villaId}
                onValueChange={(value) => setDraft({ ...draft, villaId: value })}
              >
                <SelectTrigger id="expense-villa" className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SHARED}>Whole property</SelectItem>
                  {villas.map((villa) => (
                    <SelectItem key={villa.id} value={villa.id}>
                      {villa.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="expense-method">Paid by</Label>
              <Select
                value={draft.method}
                onValueChange={(value) => setDraft({ ...draft, method: value })}
              >
                <SelectTrigger id="expense-method" className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="expense-reference">Reference</Label>
              <Input
                id="expense-reference"
                className="mt-1.5"
                value={draft.reference}
                onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
                placeholder="Bill or UTR number"
              />
            </div>

            <div>
              <Label htmlFor="expense-note">Note</Label>
              <Textarea
                id="expense-note"
                className="mt-1.5"
                rows={2}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="Quarterly generator service"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-status-cancelled">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full">
              <Plus aria-hidden />
              Record expense
            </Button>
          </form>
        </section>

        {/* --------------------------------------------------------- list */}
        <div className="space-y-4">
          {byCategory.length > 0 && (
            <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
              <h2 className="text-xl text-ink">This month by category</h2>
              <ul className="mt-4 space-y-2">
                {byCategory.map(([key, total]) => {
                  const top = byCategory[0][1] || 1;
                  return (
                    <li key={key} className="flex items-center gap-3 text-sm">
                      <span className="w-36 shrink-0 text-stone-600">{titleCase(key)}</span>
                      <span className="h-4 flex-1 rounded-md bg-sand-200">
                        <span
                          className="block h-4 rounded-md bg-clay/35"
                          style={{ width: `${Math.max(4, Math.round((total / top) * 100))}%` }}
                          aria-hidden
                        />
                      </span>
                      <span className="w-24 text-right tabular-nums text-ink">{money(total)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-xl text-ink">All expenses</h2>
            <div className="w-52">
              <Label htmlFor="filter-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="filter-category" className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {titleCase(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<Banknote className="size-5" />}
              title="Nothing recorded"
              description="Add what the property has paid out and it will show here and in the reports."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-ink/[0.06]">
              <table className="w-full text-sm">
                <caption className="sr-only">Expenses recorded by the property</caption>
                <thead>
                  <tr className="border-b border-ink/8 text-left">
                    <th scope="col" className="px-5 py-3 label-caps">Date</th>
                    <th scope="col" className="px-5 py-3 label-caps">Paid to</th>
                    <th scope="col" className="px-5 py-3 label-caps">Category</th>
                    <th scope="col" className="px-5 py-3 label-caps">Villa</th>
                    <th scope="col" className="px-5 py-3 label-caps text-right">Amount</th>
                    <th scope="col" className="px-5 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/8">
                  {rows.map((expense) => (
                    <tr key={expense.id}>
                      <td className="px-5 py-3 whitespace-nowrap text-stone-600">
                        {formatDate(expense.spentOn)}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-ink">{expense.payee}</span>
                        {expense.note && (
                          <span className="block text-xs text-stone-600">{expense.note}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-stone-600">{titleCase(expense.category)}</td>
                      <td className="px-5 py-3 text-stone-600">
                        {villas.find((v) => v.id === expense.villaId)?.name ?? "Whole property"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink">
                        {money(expense.amount)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove the ${expense.payee} expense`}
                          onClick={() => setRemoving(expense)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={Boolean(removing)} onOpenChange={(open: boolean) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this expense?</DialogTitle>
            <DialogDescription>
              {removing &&
                `${money(removing.amount)} to ${removing.payee} on ${formatDate(removing.spentOn)} will be deleted. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removing) deleteExpense(removing.id);
                setRemoving(null);
                toast.success("Expense removed");
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
