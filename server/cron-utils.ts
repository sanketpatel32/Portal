function parseCronField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }
  if (field.includes(',')) {
    return Array.from(new Set(field.split(',').flatMap(f => parseCronField(f, min, max))));
  }
  if (field.includes('/')) {
    const [range, stepStr] = field.split('/');
    const step = parseInt(stepStr, 10);
    const values = parseCronRange(range, min, max);
    return values.filter((_, idx) => idx % step === 0);
  }
  return parseCronRange(field, min, max);
}

function parseCronRange(range: string, min: number, max: number): number[] {
  if (range === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }
  if (range.includes('-')) {
    const [start, end] = range.split('-').map(Number);
    if (Number.isNaN(start) || Number.isNaN(end) || start < min || end > max || start > end) {
      return [];
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  const val = parseInt(range, 10);
  if (Number.isNaN(val) || val < min || val > max) return [];
  return [val];
}

export function cronMatches(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minExpr, hourExpr, domExpr, monthExpr, dowExpr] = parts;
  if (!minExpr || !hourExpr || !domExpr || !monthExpr || !dowExpr) return false;
  
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1; // 1-12
  const dow = date.getDay(); // 0-6 (Sunday is 0)

  try {
    const minutes = parseCronField(minExpr, 0, 59);
    const hours = parseCronField(hourExpr, 0, 23);
    const doms = parseCronField(domExpr, 1, 31);
    const months = parseCronField(monthExpr, 1, 12);
    const dows = parseCronField(dowExpr, 0, 6);

    return minutes.includes(minute) &&
           hours.includes(hour) &&
           doms.includes(dom) &&
           months.includes(month) &&
           dows.includes(dow);
  } catch {
    return false;
  }
}

export function getNextCronDate(expression: string, fromDate = new Date()): Date {
  const date = new Date(fromDate.getTime());
  date.setSeconds(0, 0); // truncate seconds/ms
  
  // Search minute-by-minute (up to 1 year ahead to avoid infinite loops on invalid cron)
  for (let i = 1; i <= 365 * 24 * 60; i++) {
    date.setMinutes(date.getMinutes() + 1);
    if (cronMatches(expression, date)) {
      return date;
    }
  }
  // Fallback to 5 minutes from now if no match found (safeguard)
  return new Date(fromDate.getTime() + 5 * 60 * 1000);
}
