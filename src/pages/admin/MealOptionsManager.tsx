import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow, LoadingState, StatusBadge } from "@/components/common";
import { useMealMenu, type MealCourse } from "@/hooks/useMealMenu";
import { supabase } from "@/services/supabase/client";

const slugify = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "course";

/**
 * The guest's menu, as the property wants it offered.
 *
 * Courses (breakfast, lunch, dessert…), the dishes in each, and how many a guest
 * may pick from a course. Changes save as they are made and reach the booking
 * form straight away. A dish switched off stays here but is no longer offered;
 * what guests already chose is kept as the name they saw, so editing the menu
 * never rewrites anybody's booking.
 */
export function MealOptionsManager() {
  const { courses, loading, reload } = useMealMenu({ liveOnly: false });
  const [newCourse, setNewCourse] = useState("");
  const [confirm, setConfirm] = useState<
    { kind: "course"; course: MealCourse } | { kind: "dish"; id: string; name: string } | null
  >(null);

  const run = async (op: PromiseLike<{ error: { message: string } | null }>, done?: string) => {
    const { error } = await op;
    if (error) return toast.error("Could not save", { description: error.message });
    if (done) toast.success(done);
    await reload();
  };

  const addCourse = async () => {
    const label = newCourse.trim();
    if (!label) return;
    let slug = slugify(label);
    if (courses.some((c) => c.slug === slug)) slug = `${slug}_${courses.length + 1}`;
    await run(
      supabase.from("meal_categories").insert({
        slug,
        label,
        sort_order: (courses.at(-1)?.sortOrder ?? 0) + 10,
      }),
      `${label} added — now add its dishes`,
    );
    setNewCourse("");
  };

  /** Swap two neighbours' places. */
  const move = async (list: { id: string; sortOrder: number }[], i: number, dir: -1 | 1, table: string) => {
    const a = list[i];
    const b = list[i + dir];
    if (!b) return;
    // Equal orders (fresh rows) would swap into themselves, so renumber first.
    const [ao, bo] = a.sortOrder === b.sortOrder ? [i * 10 + 10, (i + dir) * 10 + 10] : [a.sortOrder, b.sortOrder];
    await run(
      Promise.all([
        supabase.from(table).update({ sort_order: bo }).eq("id", a.id),
        supabase.from(table).update({ sort_order: ao }).eq("id", b.id),
      ]).then(([x, y]) => ({ error: x.error ?? y.error })),
    );
  };

  if (loading) return <LoadingState label="Loading the menu" />;

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
        <Eyebrow className="text-gold-700">Menu choices</Eyebrow>
        <h2 className="mt-2 text-xl text-ink">What guests can pick when they book</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-stone-600">
          Each course becomes a dropdown on the booking form; guests tick as many dishes as the
          limit allows. Changes are live immediately. Switching a dish off hides it from new
          bookings — it never changes what someone has already chosen.
        </p>
        <form
          className="mt-4 flex max-w-md items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addCourse();
          }}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="new-course">Add a course</Label>
            <Input id="new-course" value={newCourse} onChange={(e) => setNewCourse(e.target.value)} placeholder="High tea" />
          </div>
          <Button type="submit" variant="outline" disabled={!newCourse.trim()}>
            <Plus aria-hidden />
            Add
          </Button>
        </form>
      </section>

      {courses.map((course, ci) => (
        <CourseCard
          key={course.id}
          course={course}
          first={ci === 0}
          last={ci === courses.length - 1}
          onMove={(dir) => move(courses, ci, dir, "meal_categories")}
          onSave={(patch, done) => run(supabase.from("meal_categories").update(patch).eq("id", course.id), done)}
          onDelete={() => setConfirm({ kind: "course", course })}
          onAddDish={(name) =>
            run(
              supabase.from("meal_options").insert({
                category_id: course.id,
                name,
                sort_order: (course.options.at(-1)?.sortOrder ?? 0) + 10,
              }),
            )
          }
          onMoveDish={(i, dir) => move(course.options, i, dir, "meal_options")}
          onSaveDish={(id, patch) => run(supabase.from("meal_options").update(patch).eq("id", id))}
          onDeleteDish={(id, name) => setConfirm({ kind: "dish", id, name })}
        />
      ))}

      {courses.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-sm text-stone-600 shadow-soft ring-1 ring-ink/[0.06]">
          No courses yet. Add one above — guests then see a dropdown for it.
        </p>
      )}

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Remove {confirm?.kind === "course" ? `the ${confirm.course.label} course` : `“${confirm?.name}”`}?
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === "course"
                ? `All ${confirm.course.options.length} of its dishes go with it. Bookings that already picked from it keep what they picked. To hide it without deleting, switch it off instead.`
                : "It is no longer offered. Bookings that already picked it keep it. To hide it without deleting, switch it off instead."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirm) return;
                await run(
                  confirm.kind === "course"
                    ? supabase.from("meal_categories").delete().eq("id", confirm.course.id)
                    : supabase.from("meal_options").delete().eq("id", confirm.id),
                  "Removed",
                );
                setConfirm(null);
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

function CourseCard({
  course, first, last, onMove, onSave, onDelete, onAddDish, onMoveDish, onSaveDish, onDeleteDish,
}: {
  course: MealCourse;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (patch: Record<string, unknown>, done?: string) => void;
  onDelete: () => void;
  onAddDish: (name: string) => void;
  onMoveDish: (i: number, dir: -1 | 1) => void;
  onSaveDish: (id: string, patch: Record<string, unknown>) => void;
  onDeleteDish: (id: string, name: string) => void;
}) {
  const [label, setLabel] = useState(course.label);
  const [limit, setLimit] = useState(course.maxChoices ? String(course.maxChoices) : "");
  const [dish, setDish] = useState("");

  return (
    <section className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-ink/[0.06]">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor={`label-${course.id}`}>Course name</Label>
          <Input
            id={`label-${course.id}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label.trim() && label.trim() !== course.label && onSave({ label: label.trim() }, "Renamed")}
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor={`limit-${course.id}`}>Most a guest may pick</Label>
          <Input
            id={`limit-${course.id}`}
            type="number"
            min={1}
            max={20}
            placeholder="No limit"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={() => {
              const n = limit === "" ? null : Math.min(20, Math.max(1, Math.round(Number(limit) || 1)));
              setLimit(n ? String(n) : "");
              if (n !== course.maxChoices) onSave({ max_choices: n }, n ? `Limit is ${n}` : "No limit");
            }}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={course.active}
            onChange={(e) => onSave({ active: e.target.checked }, e.target.checked ? "Offered to guests" : "Hidden from guests")}
            className="size-4 accent-[var(--color-clay)]"
          />
          Offered
        </label>
        <div className="flex gap-1 pb-1">
          <Button variant="ghost" size="icon" aria-label={`Move ${course.label} up`} disabled={first} onClick={() => onMove(-1)}>
            <ArrowUp aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Move ${course.label} down`} disabled={last} onClick={() => onMove(1)}>
            <ArrowDown aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${course.label}`}
            className="text-danger hover:bg-danger-bg hover:text-danger-700"
            onClick={onDelete}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>

      {!course.active && (
        <p className="mt-3">
          <StatusBadge label="Hidden from guests" tone="completed" />
        </p>
      )}

      <hr className="rule-gold my-5" />

      <ul className="space-y-2">
        {course.options.map((o, i) => (
          <DishRow
            key={`${o.id}-${o.name}`}
            name={o.name}
            active={o.active}
            first={i === 0}
            last={i === course.options.length - 1}
            onRename={(name) => onSaveDish(o.id, { name })}
            onActive={(active) => onSaveDish(o.id, { active })}
            onMove={(dir) => onMoveDish(i, dir)}
            onDelete={() => onDeleteDish(o.id, o.name)}
          />
        ))}
        {course.options.length === 0 && <li className="text-sm text-stone-600">No dishes yet — guests will not see this course until it has one.</li>}
      </ul>

      <form
        className="mt-4 flex max-w-lg items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dish.trim()) return;
          onAddDish(dish.trim());
          setDish("");
        }}
      >
        <div className="min-w-0 flex-1">
          <Label htmlFor={`dish-${course.id}`} className="sr-only">
            Add a dish to {course.label}
          </Label>
          <Input id={`dish-${course.id}`} value={dish} onChange={(e) => setDish(e.target.value)} placeholder="Add a dish…" />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={!dish.trim()}>
          <Plus aria-hidden />
          Add
        </Button>
      </form>
    </section>
  );
}

function DishRow({
  name, active, first, last, onRename, onActive, onMove, onDelete,
}: {
  name: string;
  active: boolean;
  first: boolean;
  last: boolean;
  onRename: (name: string) => void;
  onActive: (active: boolean) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(name);
  return (
    <li className="flex items-center gap-2">
      <Input
        aria-label={`Dish name: ${name}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim();
          if (!t) return setText(name);
          if (t !== name) onRename(t);
        }}
        className={active ? "" : "text-stone-600 line-through"}
      />
      <label className="flex shrink-0 items-center gap-1.5 text-xs text-stone-600">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => onActive(e.target.checked)}
          className="size-4 accent-[var(--color-clay)]"
        />
        Offered
      </label>
      <Button variant="ghost" size="icon" aria-label={`Move ${name} up`} disabled={first} onClick={() => onMove(-1)}>
        <ArrowUp aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Move ${name} down`} disabled={last} onClick={() => onMove(1)}>
        <ArrowDown aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${name}`}
        className="text-danger hover:bg-danger-bg hover:text-danger-700"
        onClick={onDelete}
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}
