import { ScheduleEvent } from '@/context/AuthContext';

export interface TimeWindow {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
}

export function toMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fromMins(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(y, mo - 1, d);
  return `${DAYS[date.getDay()]}, ${MONTHS[mo - 1]} ${d}`;
}

const WORK_START = toMins('08:00');
const WORK_END   = toMins('20:00');

export function findFreeWindows(
  allEvents: ScheduleEvent[],
  durationMins: number,
  daysAhead = 7,
): TimeWindow[] {
  const results: TimeWindow[] = [];
  const today = new Date();

  for (let i = 0; i < daysAhead && results.length < 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    // Collect and sort busy intervals for this day
    const busy = allEvents
      .filter(e => e.date === dateStr)
      .map(e => ({ start: toMins(e.startTime), end: toMins(e.endTime) }))
      .sort((a, b) => a.start - b.start);

    // Merge overlapping intervals
    const merged: { start: number; end: number }[] = [];
    for (const slot of busy) {
      if (!merged.length || slot.start > merged[merged.length - 1].end) {
        merged.push({ ...slot });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, slot.end);
      }
    }

    // Scan gaps within working hours
    let cursor = WORK_START;
    const blocks = [...merged, { start: WORK_END, end: WORK_END }];

    for (const block of blocks) {
      const freeEnd = Math.min(block.start, WORK_END);
      if (freeEnd - cursor >= durationMins) {
        results.push({
          date: dateStr,
          startTime: fromMins(cursor),
          endTime: fromMins(cursor + durationMins),
          label: dayLabel(dateStr),
        });
        if (results.length >= 3) break;
      }
      cursor = Math.max(cursor, block.end);
    }
  }

  return results;
}
