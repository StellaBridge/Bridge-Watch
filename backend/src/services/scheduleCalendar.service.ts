import { JobQueue } from "../workers/queue.js";
import { DigestSchedulerService } from "./digestScheduler.service.js";
import { ReportSchedulingService } from "./reportScheduling.service.js";

export interface ScheduledCalendarEntry {
  kind: "repeatable-job" | "digest" | "report";
  name: string;
  cadence: string;
  timezone: string | null;
  nextRunAt: Date | null;
}

export interface ScheduledCalendar {
  repeatableJobs: ScheduledCalendarEntry[];
  digestSchedules: ScheduledCalendarEntry[];
  reportSchedules: ScheduledCalendarEntry[];
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STEP_MS = 15 * 60_000;
const MAX_STEPS = 8 * 24 * 4 + 1;

/**
 * Next wall-clock occurrence of a preferred hour (0-23), optionally pinned
 * to a weekday (0-6, 0=Sunday), in the given IANA timezone. Steps the real
 * timeline in 15-minute increments so DST transitions resolve correctly.
 * Returns null when the timezone is invalid or no occurrence is found.
 */
function nextPreferredTimeFire(
  preferredHour: number,
  timezone: string,
  preferredDayOfWeek: number | null
): Date | null {
  try {
    const now = Date.now();
    for (let step = 1; step <= MAX_STEPS; step++) {
      const candidate = new Date(now + step * STEP_MS);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
      }).formatToParts(candidate);
      const get = (type: string): string | undefined => parts.find((p) => p.type === type)?.value;
      if (get("minute") !== "00") continue;
      if (Number(get("hour")) !== preferredHour) continue;
      if (preferredDayOfWeek !== null && WEEKDAY_SHORT.indexOf(get("weekday") ?? "") !== preferredDayOfWeek) {
        continue;
      }
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

export class ScheduleCalendarService {
  private static instance: ScheduleCalendarService;

  public static getInstance(): ScheduleCalendarService {
    if (!ScheduleCalendarService.instance) {
      ScheduleCalendarService.instance = new ScheduleCalendarService();
    }
    return ScheduleCalendarService.instance;
  }

  public async getCalendar(): Promise<ScheduledCalendar> {
    const jobQueue = JobQueue.getInstance();
    const repeatableJobs = (await jobQueue.getRepeatableJobs()).map((j) => ({
      kind: "repeatable-job" as const,
      name: `${j.queue}/${j.name}`,
      cadence: j.pattern ?? (j.every !== null ? `every ${j.every}ms` : "unknown"),
      timezone: null,
      nextRunAt: j.nextRunAt,
    }));

    const digestScheduler = DigestSchedulerService.getInstance();
    const subscriptions = await digestScheduler.listActiveSubscriptions();
    const digestSchedules: ScheduledCalendarEntry[] = [];
    for (const sub of subscriptions) {
      if (sub.dailyEnabled) {
        digestSchedules.push({
          kind: "digest",
          name: `digest/daily/${sub.userAddress}`,
          cadence: `daily at ${sub.preferredHour}:00`,
          timezone: sub.timezone,
          nextRunAt: nextPreferredTimeFire(sub.preferredHour, sub.timezone, null),
        });
      }
      if (sub.weeklyEnabled) {
        digestSchedules.push({
          kind: "digest",
          name: `digest/weekly/${sub.userAddress}`,
          cadence: `weekly on day ${sub.preferredDayOfWeek} at ${sub.preferredHour}:00`,
          timezone: sub.timezone,
          nextRunAt: nextPreferredTimeFire(sub.preferredHour, sub.timezone, sub.preferredDayOfWeek),
        });
      }
    }

    const reportScheduling = ReportSchedulingService.getInstance();
    const schedules = await reportScheduling.listActiveSchedules();
    const reportSchedules: ScheduledCalendarEntry[] = schedules.map((s) => ({
      kind: "report" as const,
      name: `report/${s.frequency}/${s.id}`,
      cadence:
        s.frequency === "weekly"
          ? `weekly on day ${s.preferredDayOfWeek ?? 1} at ${s.preferredHour}:00`
          : `daily at ${s.preferredHour}:00`,
      timezone: s.timezone,
      nextRunAt: nextPreferredTimeFire(
        s.preferredHour,
        s.timezone,
        s.frequency === "weekly" ? (s.preferredDayOfWeek ?? 1) : null
      ),
    }));

    return { repeatableJobs, digestSchedules, reportSchedules };
  }
}

export const scheduleCalendarService = ScheduleCalendarService.getInstance();
