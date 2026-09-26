import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/services/supabase/client";
import type { MealCategory, MealOption } from "@/types";

export interface MealCourse extends MealCategory {
  options: MealOption[];
}

const toCategory = (x: Record<string, never>): MealCategory => ({
  id: x.id,
  slug: x.slug,
  label: x.label,
  maxChoices: x.max_choices ?? null,
  sortOrder: x.sort_order ?? 0,
  active: x.active,
});
const toOption = (x: Record<string, never>): MealOption => ({
  id: x.id,
  categoryId: x.category_id,
  name: x.name,
  description: x.description ?? "",
  sortOrder: x.sort_order ?? 0,
  active: x.active,
});

/**
 * The property's menu, course by course.
 *
 * Reads straight from the database rather than through the data provider,
 * because the booking popup asks for it before anybody has signed in — the
 * tables are readable by anon (live rows only). A signed-in manager gets every
 * row, retired ones included, which is what the editor wants; a guest form
 * passes `liveOnly` so the two never disagree about what is on offer.
 */
export function useMealMenu({ liveOnly = true }: { liveOnly?: boolean } = {}) {
  const [courses, setCourses] = useState<MealCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [c, o] = await Promise.all([
      supabase.from("meal_categories").select("*").order("sort_order").order("label"),
      supabase.from("meal_options").select("*").order("sort_order").order("name"),
    ]);
    const options = (o.data ?? []).map((x) => toOption(x as Record<string, never>));
    const built = (c.data ?? []).map((x) => {
      const cat = toCategory(x as Record<string, never>);
      return { ...cat, options: options.filter((opt) => opt.categoryId === cat.id) };
    });
    setCourses(
      liveOnly
        ? built
            .filter((course) => course.active)
            .map((course) => ({ ...course, options: course.options.filter((opt) => opt.active) }))
            .filter((course) => course.options.length > 0)
        : built,
    );
    setLoading(false);
  }, [liveOnly]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { courses, loading, reload };
}
