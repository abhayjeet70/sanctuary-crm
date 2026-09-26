import { MultiSelect } from "@/components/common/MultiSelect";
import { useMealMenu } from "@/hooks/useMealMenu";

/**
 * One dropdown per course — breakfast, lunch, dinner, dessert… — each of which
 * the guest can tick several dishes in, up to whatever limit the property has
 * set for that course. Courses, dishes and limits all come from Settings; this
 * component knows none of them.
 *
 * Choices are held as `{ [course slug]: [dish names] }`, the shape the database
 * stores, so what is picked here reaches the kitchen and the voucher unchanged.
 */
export function MealChoices({
  value,
  onChange,
}: {
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
}) {
  const { courses, loading } = useMealMenu();

  if (loading) return <p className="text-sm text-stone-600">Loading the menu…</p>;
  if (courses.length === 0) return null;

  return (
    <fieldset className="space-y-4">
      <legend className="label-caps mb-1">Choose your dishes</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {courses.map((course) => (
          <MultiSelect
            key={course.slug}
            label={course.label}
            hint={course.maxChoices ? `choose up to ${course.maxChoices}` : "choose any"}
            options={course.options.map((o) => ({ value: o.name, label: o.name }))}
            value={value[course.slug] ?? []}
            max={course.maxChoices}
            placeholder={`Pick ${course.label.toLowerCase()}`}
            onChange={(next) => {
              const rest = { ...value };
              if (next.length === 0) delete rest[course.slug];
              else rest[course.slug] = next;
              onChange(rest);
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}
