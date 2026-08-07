export interface MonthInfo {
  year: number;
  month: number;
  weeks: string[];
}

/**
 * Returns all week-start Mondays (YYYY-MM-DD) for a given calendar month.
 *
 * First-Monday rule:
 *   - If the 1st falls Mon–Fri: include the Monday of that week (may be in the prev month).
 *   - If the 1st falls Sat–Sun: start from the first Monday inside the month.
 *
 * Last Monday = the Monday on or before the last day of the month.
 */
export function getWeeksInMonth(year: number, month: number): string[] {
  const weeks: string[] = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);

  // --- first Monday ---
  const firstDow = firstDay.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const firstMonday = new Date(firstDay);
  if (firstDow >= 1 && firstDow <= 5) {
    // Mon–Fri: step back to that week's Monday
    firstMonday.setDate(firstDay.getDate() - (firstDow - 1));
  } else {
    // Sat(6) or Sun(0): first Monday in the month
    firstMonday.setDate(firstDay.getDate() + (firstDow === 0 ? 1 : 2));
  }

  // --- last Monday (Monday on or before last day) ---
  const lastDow = lastDay.getDay();
  const lastMonday = new Date(lastDay);
  lastMonday.setDate(lastDay.getDate() - (lastDow === 0 ? 6 : lastDow - 1));

  // --- collect ---
  const current = new Date(firstMonday);
  while (current <= lastMonday) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    weeks.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

export function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Consecutive {year, month} pairs starting at the given month. */
export function buildMonthList(startYear: number, startMonth: number, count: number) {
  const months: Array<{ year: number; month: number }> = [];
  let cur = { year: startYear, month: startMonth };
  for (let i = 0; i < count; i++) {
    months.push(cur);
    cur = nextMonth(cur.year, cur.month);
  }
  return months;
}
