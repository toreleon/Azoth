export interface MarketSessionCheck {
  open: boolean;
  reason?: string;
  ictTime: string;
  session?: "morning" | "afternoon" | "atc";
}

const ICT_OFFSET_MS = 7 * 3600 * 1000;

// Static non-weekend holidays that should be extended as exchange calendars are published.
const DEFAULT_HOLIDAYS = new Set<string>([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-02-19",
  "2026-02-20",
  "2026-04-30",
  "2026-05-01",
  "2026-09-02",
]);

export function ictDateTimeParts(date = new Date()): {
  isoDate: string;
  isoMinute: string;
  weekday: number;
  minuteOfDay: number;
} {
  const ict = new Date(date.getTime() + ICT_OFFSET_MS);
  const isoMinute = ict.toISOString().replace("T", " ").slice(0, 16);
  return {
    isoDate: ict.toISOString().slice(0, 10),
    isoMinute,
    weekday: ict.getUTCDay(),
    minuteOfDay: ict.getUTCHours() * 60 + ict.getUTCMinutes(),
  };
}

export function checkVnMarketSession(
  date = new Date(),
  holidays: ReadonlySet<string> = DEFAULT_HOLIDAYS,
): MarketSessionCheck {
  const { isoDate, isoMinute, weekday, minuteOfDay } = ictDateTimeParts(date);
  if (weekday === 0 || weekday === 6) {
    return { open: false, reason: "weekend", ictTime: isoMinute };
  }
  if (holidays.has(isoDate)) {
    return { open: false, reason: `exchange holiday ${isoDate}`, ictTime: isoMinute };
  }

  if (minuteOfDay >= 9 * 60 && minuteOfDay < 11 * 60 + 30) {
    return { open: true, ictTime: isoMinute, session: "morning" };
  }
  if (minuteOfDay >= 13 * 60 && minuteOfDay < 14 * 60 + 30) {
    return { open: true, ictTime: isoMinute, session: "afternoon" };
  }
  if (minuteOfDay >= 14 * 60 + 30 && minuteOfDay <= 14 * 60 + 45) {
    return { open: true, ictTime: isoMinute, session: "atc" };
  }

  return { open: false, reason: "outside continuous/ATC trading sessions", ictTime: isoMinute };
}

