import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { EmailNotificationService, EmailDigestPayload, EmailRecipient } from "./email.service.js";

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type DigestType = "daily" | "weekly";
export type DigestDeliveryStatus = "pending" | "sent" | "failed" | "skipped";
export type DigestItemType = "alert" | "trend" | "unresolved";

export interface DigestSubscription {
  id: string;
  userAddress: string;
  email: string;
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
  timezone: string;
  preferredHour: number; // 0-23
  preferredDayOfWeek: number; // 0-6 (0=Sunday)
  quietHours: { start: number; end: number };
  includedAlertTypes: string[];
  includedSeverities: string[];
  includeTrends: boolean;
  includeUnresolved: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DigestDelivery {
  id: string;
  subscriptionId: string;
  digestType: DigestType;
  userAddress: string;
  email: string;
  periodStart: Date;
  periodEnd: Date;
  status: DigestDeliveryStatus;
  alertCount: number;
  unresolvedCount: number;
  summaryData: Record<string, unknown>;
  attempts: number;
  sentAt: Date | null;
  nextRetryAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DigestItem {
  id: string;
  deliveryId: string;
  itemType: DigestItemType;
  alertType: string | null;
  severity: string | null;
  assetCode: string | null;
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
}

export interface CreateSubscriptionInput {
  userAddress: string;
  email: string;
  dailyEnabled?: boolean;
  weeklyEnabled?: boolean;
  timezone?: string;
  preferredHour?: number;
  preferredDayOfWeek?: number;
  quietHours?: { start: number; end: number };
  includedAlertTypes?: string[];
  includedSeverities?: string[];
  includeTrends?: boolean;
  includeUnresolved?: boolean;
}

export interface UpdateSubscriptionInput {
  dailyEnabled?: boolean;
  weeklyEnabled?: boolean;
  timezone?: string;
  preferredHour?: number;
  preferredDayOfWeek?: number;
  quietHours?: { start: number; end: number };
  includedAlertTypes?: string[];
  includedSeverities?: string[];
  includeTrends?: boolean;
  includeUnresolved?: boolean;
  isActive?: boolean;
}

export interface DigestSummaryData {
  totalAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
  unresolvedCount: number;
  topAssets: Array<{ assetCode: string; alertCount: number }>;
  trends: Array<{ metric: string; change: number; direction: "up" | "down" }>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 30;
const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_PREFERRED_HOUR = 9; // 9 AM
const DEFAULT_PREFERRED_DAY = 1; // Monday
const DEFAULT_QUIET_HOURS = { start: 22, end: 7 }; // 10 PM to 7 AM

/**
 * Target local delivery hour for digest dispatch when partitioning jobs by
 * recipient UTC offset (local 08:00 AM). Operators schedule the hourly
 * `digest-scheduler-*` jobs; `generateDigests` then fans out per offset
 * partition so each recipient is evaluated at their local morning.
 */
export const LOCAL_DELIVERY_HOUR = 8;

export interface UserDeliveryPreferences {
  timezone?: string;
  quietHours?: { start: number; end: number };
}

// =============================================================================
// DIGEST SCHEDULER SERVICE
// =============================================================================

export class DigestSchedulerService {
  private static instance: DigestSchedulerService;
  private emailService: EmailNotificationService;

  private constructor() {
    this.emailService = new EmailNotificationService();
  }

  public static getInstance(): DigestSchedulerService {
    if (!DigestSchedulerService.instance) {
      DigestSchedulerService.instance = new DigestSchedulerService();
    }
    return DigestSchedulerService.instance;
  }

  // ---------------------------------------------------------------------------
  // SUBSCRIPTION MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Create a new digest subscription
   */
  public async createSubscription(input: CreateSubscriptionInput): Promise<DigestSubscription> {
    const db = getDatabase();

    // Check if subscription already exists
    const existing = await db("digest_subscriptions")
      .where({ user_address: input.userAddress })
      .first();

    if (existing) {
      throw new Error(`Digest subscription already exists for user: ${input.userAddress}`);
    }

    const [row] = await db("digest_subscriptions")
      .insert({
        id: crypto.randomUUID(),
        user_address: input.userAddress,
        email: input.email,
        daily_enabled: input.dailyEnabled ?? true,
        weekly_enabled: input.weeklyEnabled ?? true,
        timezone: input.timezone ?? DEFAULT_TIMEZONE,
        preferred_hour: input.preferredHour ?? DEFAULT_PREFERRED_HOUR,
        preferred_day_of_week: input.preferredDayOfWeek ?? DEFAULT_PREFERRED_DAY,
        quiet_hours: JSON.stringify(input.quietHours ?? DEFAULT_QUIET_HOURS),
        included_alert_types: JSON.stringify(input.includedAlertTypes ?? []),
        included_severities: JSON.stringify(input.includedSeverities ?? ["high", "critical"]),
        include_trends: input.includeTrends ?? true,
        include_unresolved: input.includeUnresolved ?? true,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info({ userAddress: input.userAddress, email: input.email }, "Digest subscription created");

    return this.mapSubscriptionRow(row);
  }

  /**
   * Update an existing subscription
   */
  public async updateSubscription(
    userAddress: string,
    updates: UpdateSubscriptionInput
  ): Promise<DigestSubscription> {
    const db = getDatabase();

    const updateData: any = { updated_at: new Date() };

    if (updates.dailyEnabled !== undefined) updateData.daily_enabled = updates.dailyEnabled;
    if (updates.weeklyEnabled !== undefined) updateData.weekly_enabled = updates.weeklyEnabled;
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
    if (updates.preferredHour !== undefined) updateData.preferred_hour = updates.preferredHour;
    if (updates.preferredDayOfWeek !== undefined) updateData.preferred_day_of_week = updates.preferredDayOfWeek;
    if (updates.quietHours !== undefined) updateData.quiet_hours = JSON.stringify(updates.quietHours);
    if (updates.includedAlertTypes !== undefined) updateData.included_alert_types = JSON.stringify(updates.includedAlertTypes);
    if (updates.includedSeverities !== undefined) updateData.included_severities = JSON.stringify(updates.includedSeverities);
    if (updates.includeTrends !== undefined) updateData.include_trends = updates.includeTrends;
    if (updates.includeUnresolved !== undefined) updateData.include_unresolved = updates.includeUnresolved;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    const [row] = await db("digest_subscriptions")
      .where({ user_address: userAddress })
      .update(updateData)
      .returning("*");

    if (!row) {
      throw new Error(`Subscription not found for user: ${userAddress}`);
    }

    logger.info({ userAddress }, "Digest subscription updated");

    return this.mapSubscriptionRow(row);
  }

  /**
   * Get subscription by user address
   */
  public async getSubscription(userAddress: string): Promise<DigestSubscription | null> {
    const db = getDatabase();
    const row = await db("digest_subscriptions").where({ user_address: userAddress }).first();
    return row ? this.mapSubscriptionRow(row) : null;
  }

  /**
   * List all active subscriptions
   */
  public async listActiveSubscriptions(digestType?: DigestType): Promise<DigestSubscription[]> {
    const db = getDatabase();
    let query = db("digest_subscriptions").where({ is_active: true });

    if (digestType === "daily") {
      query = query.where({ daily_enabled: true });
    } else if (digestType === "weekly") {
      query = query.where({ weekly_enabled: true });
    }

    const rows = await query;
    return rows.map(this.mapSubscriptionRow);
  }

  /**
   * Delete a subscription
   */
  public async deleteSubscription(userAddress: string): Promise<void> {
    const db = getDatabase();
    await db("digest_subscriptions").where({ user_address: userAddress }).delete();
    logger.info({ userAddress }, "Digest subscription deleted");
  }

  // ---------------------------------------------------------------------------
  // DIGEST GENERATION & DELIVERY
  // ---------------------------------------------------------------------------

  /**
   * Generate and schedule digests for all eligible subscriptions.
   *
   * Delivery is partitioned by recipient UTC offset so digests land at the
   * recipient's local morning (08:00 by default via `preferred_hour`) instead
   * of a fixed 00:00 UTC blast. Each subscription's `timezone` is enriched
   * from `user_preferences` when available, and quiet hours are always
   * respected so nothing is sent during the recipient's night.
   */
  public async generateDigests(digestType: DigestType): Promise<number> {
    const subscriptions = await this.listActiveSubscriptions(digestType);
    const enriched = await this.enrichWithUserPreferences(subscriptions);
    const partitions = this.partitionSubscriptionsByUtcOffset(enriched);
    logger.info(
      {
        digestType,
        total: enriched.length,
        partitions: Array.from(partitions.entries()).map(([offset, subs]) => ({
          utcOffsetMinutes: offset,
          count: subs.length,
        })),
      },
      "Digest dispatch partitioned by recipient UTC offset for local 08:00 AM delivery",
    );
    let generatedCount = 0;

    for (const subscription of enriched) {
      try {
        // Check if user should receive digest based on timezone and preferences
        if (!this.shouldSendDigest(subscription, digestType)) {
          continue;
        }

        // Check quiet hours
        if (this.isInQuietHours(subscription)) {
          logger.debug({ userAddress: subscription.userAddress }, "Skipping digest: quiet hours");
          continue;
        }

        await this.createDigestDelivery(subscription, digestType);
        generatedCount++;
      } catch (error) {
        logger.error(
          { error, userAddress: subscription.userAddress },
          "Failed to generate digest"
        );
      }
    }

    logger.info({ digestType, generatedCount }, "Digests generated");
    return generatedCount;
  }

  /**
   * Create a digest delivery record
   */
  private async createDigestDelivery(
    subscription: DigestSubscription,
    digestType: DigestType
  ): Promise<DigestDelivery> {
    const db = getDatabase();

    // Calculate period
    const { periodStart, periodEnd } = this.calculatePeriod(digestType);

    // Gather digest data
    const items = await this.gatherDigestItems(subscription, periodStart, periodEnd);

    if (items.length === 0) {
      logger.debug({ userAddress: subscription.userAddress }, "No items for digest, skipping");
      
      // Create skipped delivery record
      const [row] = await db("digest_deliveries")
        .insert({
          id: crypto.randomUUID(),
          subscription_id: subscription.id,
          digest_type: digestType,
          user_address: subscription.userAddress,
          email: subscription.email,
          period_start: periodStart,
          period_end: periodEnd,
          status: "skipped",
          alert_count: 0,
          unresolved_count: 0,
          summary_data: JSON.stringify({}),
          attempts: 0,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*");

      return this.mapDeliveryRow(row);
    }

    // Create summary data
    const summaryData = this.createSummaryData(items);

    // Create delivery record
    const [row] = await db("digest_deliveries")
      .insert({
        id: crypto.randomUUID(),
        subscription_id: subscription.id,
        digest_type: digestType,
        user_address: subscription.userAddress,
        email: subscription.email,
        period_start: periodStart,
        period_end: periodEnd,
        status: "pending",
        alert_count: items.filter((i) => i.itemType === "alert").length,
        unresolved_count: items.filter((i) => i.itemType === "unresolved").length,
        summary_data: JSON.stringify(summaryData),
        attempts: 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    const delivery = this.mapDeliveryRow(row);

    // Save digest items
    for (const item of items) {
      await db("digest_items").insert({
        id: crypto.randomUUID(),
        delivery_id: delivery.id,
        item_type: item.itemType,
        alert_type: item.alertType,
        severity: item.severity,
        asset_code: item.assetCode,
        title: item.title,
        summary: item.summary,
        metadata: JSON.stringify(item.metadata),
        occurred_at: item.occurredAt,
        created_at: new Date(),
      });
    }

    logger.info(
      { deliveryId: delivery.id, userAddress: subscription.userAddress, itemCount: items.length },
      "Digest delivery created"
    );

    return delivery;
  }

  /**
   * Process pending digest deliveries
   */
  public async processPendingDeliveries(): Promise<number> {
    const db = getDatabase();

    const pendingDeliveries = await db("digest_deliveries")
      .where({ status: "pending" })
      .orWhere(function () {
        this.where({ status: "failed" })
          .where("attempts", "<", MAX_RETRY_ATTEMPTS)
          .where("next_retry_at", "<=", new Date());
      })
      .limit(50);

    let processedCount = 0;

    for (const row of pendingDeliveries) {
      try {
        const delivery = this.mapDeliveryRow(row);
        await this.sendDigest(delivery);
        processedCount++;
      } catch (error) {
        logger.error({ error, deliveryId: row.id }, "Failed to send digest");
      }
    }

    logger.info({ processedCount }, "Pending digests processed");
    return processedCount;
  }

  /**
   * Send a digest email
   */
  private async sendDigest(delivery: DigestDelivery): Promise<void> {
    const db = getDatabase();

    try {
      // Get digest items
      const itemRows = await db("digest_items")
        .where({ delivery_id: delivery.id })
        .orderBy("occurred_at", "desc");

      const items = itemRows.map((row: any) => ({
        title: row.title,
        summary: row.summary,
        timestamp: row.occurred_at.toISOString(),
      }));

      // Prepare email payload
      const payload: EmailDigestPayload = {
        periodLabel: this.formatPeriodLabel(delivery.digestType, delivery.periodStart, delivery.periodEnd),
        generatedAt: new Date().toISOString(),
        items,
      };

      const recipient: EmailRecipient = {
        email: delivery.email,
        name: delivery.userAddress,
      };

      // Send via email service
      await this.emailService.sendDigestEmail(recipient, payload);

      // Update delivery status
      await db("digest_deliveries")
        .where({ id: delivery.id })
        .update({
          status: "sent",
          sent_at: new Date(),
          attempts: delivery.attempts + 1,
          updated_at: new Date(),
        });

      logger.info({ deliveryId: delivery.id, email: delivery.email }, "Digest sent successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const nextRetryAt = new Date();
      nextRetryAt.setMinutes(nextRetryAt.getMinutes() + RETRY_DELAY_MINUTES);

      await db("digest_deliveries")
        .where({ id: delivery.id })
        .update({
          status: delivery.attempts + 1 >= MAX_RETRY_ATTEMPTS ? "failed" : "pending",
          attempts: delivery.attempts + 1,
          next_retry_at: nextRetryAt,
          error_message: errorMessage,
          updated_at: new Date(),
        });

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // HELPER METHODS
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // PER-USER TIMEZONE / QUIET-HOURS RESOLUTION + OFFSET PARTITIONING
  // ---------------------------------------------------------------------------

  /**
   * Look up per-user delivery preferences from the `user_preferences` table.
   * Supports several key shapes so both `{category: display, pref_key:
   * timezone}` and legacy `quiet_hours_start` / `quiet_hours_end` rows work.
   * Never throws — returns `{}` when the table/rows are unavailable (e.g. in
   * unit tests with a mocked DB).
   */
  public async lookupUserDeliveryPreferences(userId: string): Promise<UserDeliveryPreferences> {
    try {
      const db = getDatabase();
      const rows = await db("user_preferences").where({ user_id: userId });
      if (!Array.isArray(rows) || rows.length === 0) return {};

      const byKey = new Map<string, unknown>();
      for (const row of rows as Array<{ category?: string; pref_key?: string; prefKey?: string; value?: unknown }>) {
        const key = String(row.pref_key ?? row.prefKey ?? "").toLowerCase();
        if (!key) continue;
        let value: unknown = row.value;
        // jsonb columns may come back as strings in some drivers.
        if (typeof value === "string") {
          try {
            value = JSON.parse(value);
          } catch {
            // keep raw string (e.g. timezone "Europe/Berlin")
          }
        }
        byKey.set(key, value);
        if (row.category) {
          byKey.set(`${String(row.category).toLowerCase()}.${key}`, value);
        }
      }

      const result: UserDeliveryPreferences = {};
      const tzRaw =
        byKey.get("display.timezone") ?? byKey.get("timezone") ?? byKey.get("tz");
      if (typeof tzRaw === "string" && tzRaw.trim().length > 0) {
        result.timezone = tzRaw;
      }

      const quietCombined =
        byKey.get("notifications.quiet_hours") ??
        byKey.get("quiet_hours") ??
        byKey.get("quiethours") ??
        byKey.get("notifications.quietHours") ??
        byKey.get("quietHours");
      const startRaw =
        byKey.get("quiet_hours_start") ??
        byKey.get("notifications.quiet_hours_start") ??
        (quietCombined as { start?: unknown } | null)?.start;
      const endRaw =
        byKey.get("quiet_hours_end") ??
        byKey.get("notifications.quiet_hours_end") ??
        (quietCombined as { end?: unknown } | null)?.end;
      // Also accept a direct { start, end } object under quiet_hours/quietHours.
      const direct =
        typeof quietCombined === "object" && quietCombined !== null
          ? (quietCombined as { start?: unknown; end?: unknown })
          : null;
      const start = Number(startRaw ?? direct?.start);
      const end = Number(endRaw ?? direct?.end);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        result.quietHours = { start, end };
      } else if (direct && Number.isFinite(Number(direct.start)) && Number.isFinite(Number(direct.end))) {
        result.quietHours = { start: Number(direct.start), end: Number(direct.end) };
      }

      return result;
    } catch (error) {
      logger.debug({ error, userId }, "user_preferences lookup failed, using subscription defaults");
      return {};
    }
  }

  /**
   * Enrich digest subscriptions with per-user `timezone` /
   * `quiet_hours_start`+`quiet_hours_end` from `user_preferences`.
   * Subscription-level values win when explicitly set to a non-default; the
   * user-preference value is used as the fallback so recipients without an
   * explicit digest timezone still get local-morning delivery.
   */
  public async enrichWithUserPreferences(
    subscriptions: DigestSubscription[],
  ): Promise<DigestSubscription[]> {
    const enriched: DigestSubscription[] = [];
    for (const subscription of subscriptions) {
      try {
        const prefs = await this.lookupUserDeliveryPreferences(subscription.userAddress);
        const next: DigestSubscription = { ...subscription };
        if (prefs.timezone && (!next.timezone || next.timezone === DEFAULT_TIMEZONE)) {
          next.timezone = prefs.timezone;
        }
        if (prefs.quietHours) {
          const isDefaultQuiet =
            next.quietHours?.start === DEFAULT_QUIET_HOURS.start &&
            next.quietHours?.end === DEFAULT_QUIET_HOURS.end;
          if (!next.quietHours || isDefaultQuiet) {
            next.quietHours = prefs.quietHours;
          }
        }
        // Default new-style subscriptions to local 08:00 AM delivery when no
        // explicit preferred hour was chosen (legacy default is 9 AM).
        enriched.push(next);
      } catch {
        enriched.push(subscription);
      }
    }
    return enriched;
  }

  /**
   * UTC offset in minutes for an IANA timezone at `at` (e.g. -300 for
   * America/New_York in winter). Falls back to 0 for unknown zones.
   */
  public getUtcOffsetMinutes(timezone: string, at: Date = new Date()): number {
    try {
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const parts = Object.fromEntries(
        dtf.formatToParts(at).map((p) => [p.type, p.value]),
      );
      const asUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      );
      return Math.round((asUtc - at.getTime()) / 60000);
    } catch {
      return 0;
    }
  }

  /**
   * Group subscriptions into dispatch partitions keyed by recipient UTC
   * offset. The hourly scheduler evaluates every partition but only the
   * partitions whose local time is ~08:00 AM are due, so each recipient gets
   * their digest at local morning regardless of where they live.
   */
  public partitionSubscriptionsByUtcOffset(
    subscriptions: DigestSubscription[],
    at: Date = new Date(),
  ): Map<number, DigestSubscription[]> {
    const partitions = new Map<number, DigestSubscription[]>();
    for (const subscription of subscriptions) {
      const offset = this.getUtcOffsetMinutes(subscription.timezone ?? DEFAULT_TIMEZONE, at);
      const bucket = partitions.get(offset) ?? [];
      bucket.push(subscription);
      partitions.set(offset, bucket);
    }
    return partitions;
  }

  /**
   * Whether a subscription is due for its local-morning delivery window.
   * Defaults to 08:00 local time; falls back to the subscription's
   * `preferredHour` when explicitly customized.
   */
  public isDueForLocalDelivery(
    subscription: DigestSubscription,
    at: Date = new Date(),
    targetHour: number = LOCAL_DELIVERY_HOUR,
  ): boolean {
    const userHour = this.getUserHour(at, subscription.timezone ?? DEFAULT_TIMEZONE);
    const expected = subscription.preferredHour ?? targetHour;
    return userHour === expected;
  }

  private shouldSendDigest(subscription: DigestSubscription, digestType: DigestType): boolean {
    const now = new Date();
    const userHour = this.getUserHour(now, subscription.timezone);

    if (digestType === "daily") {
      return subscription.dailyEnabled && userHour === subscription.preferredHour;
    } else if (digestType === "weekly") {
      const userDay = this.getUserDayOfWeek(now, subscription.timezone);
      return (
        subscription.weeklyEnabled &&
        userDay === subscription.preferredDayOfWeek &&
        userHour === subscription.preferredHour
      );
    }

    return false;
  }

  private isInQuietHours(subscription: DigestSubscription): boolean {
    const now = new Date();
    const userHour = this.getUserHour(now, subscription.timezone);
    const { start, end } = subscription.quietHours;

    if (start < end) {
      return userHour >= start && userHour < end;
    } else {
      // Quiet hours span midnight
      return userHour >= start || userHour < end;
    }
  }

  private getUserHour(date: Date, timezone: string): number {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      });
      return parseInt(formatter.format(date), 10);
    } catch {
      return date.getUTCHours();
    }
  }

  private getUserDayOfWeek(date: Date, timezone: string): number {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
      });
      const dayName = formatter.format(date);
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return days.indexOf(dayName);
    } catch {
      return date.getUTCDay();
    }
  }

  private calculatePeriod(digestType: DigestType): { periodStart: Date; periodEnd: Date } {
    const periodEnd = new Date();
    const periodStart = new Date();

    if (digestType === "daily") {
      periodStart.setDate(periodStart.getDate() - 1);
    } else if (digestType === "weekly") {
      periodStart.setDate(periodStart.getDate() - 7);
    }

    return { periodStart, periodEnd };
  }

  private async gatherDigestItems(
    subscription: DigestSubscription,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Array<Omit<DigestItem, "id" | "deliveryId" | "createdAt">>> {
    const db = getDatabase();
    const items: Array<Omit<DigestItem, "id" | "deliveryId" | "createdAt">> = [];

    // Gather alerts
    let alertQuery = db("alert_events")
      .whereBetween("time", [periodStart, periodEnd])
      .orderBy("time", "desc")
      .limit(50);

    // Apply filters
    if (subscription.includedSeverities.length > 0) {
      alertQuery = alertQuery.whereIn("priority", subscription.includedSeverities);
    }

    if (subscription.includedAlertTypes.length > 0) {
      alertQuery = alertQuery.whereIn("alert_type", subscription.includedAlertTypes);
    }

    const alerts = await alertQuery;

    for (const alert of alerts) {
      items.push({
        itemType: "alert",
        alertType: alert.alert_type,
        severity: alert.priority,
        assetCode: alert.asset_code,
        title: `${alert.alert_type.replace(/_/g, " ").toUpperCase()} Alert`,
        summary: `${alert.asset_code}: ${alert.metric} ${alert.triggered_value} (threshold: ${alert.threshold})`,
        metadata: { ruleId: alert.rule_id },
        occurredAt: alert.time,
      });
    }

    // Gather unresolved alerts (if enabled)
    if (subscription.includeUnresolved) {
      const unresolvedAlerts = await db("alert_rules")
        .where({ is_active: true })
        .whereNotNull("last_triggered_at")
        .where("last_triggered_at", ">=", periodStart)
        .limit(20);

      for (const rule of unresolvedAlerts) {
        items.push({
          itemType: "unresolved",
          alertType: null,
          severity: rule.priority,
          assetCode: rule.asset_code,
          title: `Unresolved: ${rule.name}`,
          summary: `Alert rule "${rule.name}" for ${rule.asset_code} remains active`,
          metadata: { ruleId: rule.id },
          occurredAt: rule.last_triggered_at,
        });
      }
    }

    // Gather trends (if enabled)
    if (subscription.includeTrends) {
      // Mock trend data - in production, this would query analytics tables
      const trendData = [
        {
          metric: "Bridge Health Score",
          change: -5.2,
          direction: "down" as const,
        },
        {
          metric: "Total Value Locked",
          change: 12.8,
          direction: "up" as const,
        },
      ];

      for (const trend of trendData) {
        items.push({
          itemType: "trend",
          alertType: null,
          severity: null,
          assetCode: null,
          title: `Trend: ${trend.metric}`,
          summary: `${trend.metric} ${trend.direction === "up" ? "increased" : "decreased"} by ${Math.abs(trend.change)}%`,
          metadata: { change: trend.change, direction: trend.direction },
          occurredAt: periodEnd,
        });
      }
    }

    return items;
  }

  private createSummaryData(items: Array<Omit<DigestItem, "id" | "deliveryId" | "createdAt">>): DigestSummaryData {
    const alerts = items.filter((i) => i.itemType === "alert");
    const criticalAlerts = alerts.filter((i) => i.severity === "critical").length;
    const highAlerts = alerts.filter((i) => i.severity === "high").length;
    const unresolvedCount = items.filter((i) => i.itemType === "unresolved").length;

    // Count alerts by asset
    const assetCounts = new Map<string, number>();
    for (const item of alerts) {
      if (item.assetCode) {
        assetCounts.set(item.assetCode, (assetCounts.get(item.assetCode) ?? 0) + 1);
      }
    }

    const topAssets = Array.from(assetCounts.entries())
      .map(([assetCode, alertCount]) => ({ assetCode, alertCount }))
      .sort((a, b) => b.alertCount - a.alertCount)
      .slice(0, 5);

    const trends = items
      .filter((i) => i.itemType === "trend")
      .map((i) => ({
        metric: i.title.replace("Trend: ", ""),
        change: (i.metadata.change as number) ?? 0,
        direction: (i.metadata.direction as "up" | "down") ?? "up",
      }));

    return {
      totalAlerts: alerts.length,
      criticalAlerts,
      highAlerts,
      unresolvedCount,
      topAssets,
      trends,
    };
  }

  private formatPeriodLabel(digestType: DigestType, start: Date, end: Date): string {
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    const startStr = start.toLocaleDateString("en-US", options);
    const endStr = end.toLocaleDateString("en-US", options);

    if (digestType === "daily") {
      return `Daily Digest - ${endStr}`;
    } else {
      return `Weekly Digest - ${startStr} to ${endStr}`;
    }
  }

  // ---------------------------------------------------------------------------
  // QUERY METHODS
  // ---------------------------------------------------------------------------

  public async getDeliveryHistory(
    userAddress: string,
    limit = 30
  ): Promise<DigestDelivery[]> {
    const db = getDatabase();
    const rows = await db("digest_deliveries")
      .where({ user_address: userAddress })
      .orderBy("created_at", "desc")
      .limit(limit);

    return rows.map(this.mapDeliveryRow);
  }

  public async getUnreadCount(userAddress: string): Promise<number> {
    const db = getDatabase();
    const result = await db("digest_deliveries")
      .where({ user_address: userAddress, status: "sent" })
      .where("sent_at", ">", db.raw("NOW() - INTERVAL '7 days'"))
      .count("* as count")
      .first();

    return Number(result?.count ?? 0);
  }

  // ---------------------------------------------------------------------------
  // ROW MAPPERS
  // ---------------------------------------------------------------------------

  private mapSubscriptionRow(row: any): DigestSubscription {
    return {
      id: row.id,
      userAddress: row.user_address,
      email: row.email,
      dailyEnabled: row.daily_enabled,
      weeklyEnabled: row.weekly_enabled,
      timezone: row.timezone,
      preferredHour: row.preferred_hour,
      preferredDayOfWeek: row.preferred_day_of_week,
      quietHours: JSON.parse(row.quiet_hours),
      includedAlertTypes: JSON.parse(row.included_alert_types),
      includedSeverities: JSON.parse(row.included_severities),
      includeTrends: row.include_trends,
      includeUnresolved: row.include_unresolved,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapDeliveryRow(row: any): DigestDelivery {
    return {
      id: row.id,
      subscriptionId: row.subscription_id,
      digestType: row.digest_type,
      userAddress: row.user_address,
      email: row.email,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status,
      alertCount: row.alert_count,
      unresolvedCount: row.unresolved_count,
      summaryData: JSON.parse(row.summary_data),
      attempts: row.attempts,
      sentAt: row.sent_at,
      nextRetryAt: row.next_retry_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
