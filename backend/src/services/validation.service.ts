import { z } from "zod";
import { createChildLogger } from "../utils/logger.js";
import { config } from "../config/index.js";

// ---------------------------------------------------------------------------
// Types and Interfaces
// ---------------------------------------------------------------------------

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  normalizedData?: any;
  metadata: ValidationMetadata;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: any;
  expected?: any;
  severity: "error" | "warning" | "critical";
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  value?: any;
  recommendation?: string;
}

export interface ValidationMetadata {
  dataType: string;
  validationTime: number;
  rulesApplied: string[];
  bypassUsed: boolean;
  normalizedFields: string[];
  duplicateCheck: boolean;
  consistencyChecks: string[];
}

export interface ValidationRule {
  name: string;
  description: string;
  validator: (data: any, _context: ValidationContext) => ValidationError[];
  severity: "error" | "warning";
  enabled: boolean;
}

export interface ValidationContext {
  dataType: string;
  operation: "create" | "update" | "batch";
  isAdmin: boolean;
  existingData?: any;
  batchIndex?: number;
  correlationId?: string;
}

export interface BatchValidationResult {
  totalItems: number;
  validItems: number;
  invalidItems: number;
  warnings: number;
  results: ValidationResult[];
  summary: BatchValidationSummary;
}

export interface BatchValidationSummary {
  processingTime: number;
  averageValidationTime: number;
  mostCommonErrors: Array<{ code: string; count: number }>;
  dataQualityScore: number;
  recommendations: string[];
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  duplicateFields: string[];
  duplicateIds: string[];
  similarity: number;
}

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

// Asset validation schema
const AssetSchema = z.object({
  symbol: z.string()
    .min(1, "Symbol is required")
    .max(20, "Symbol must be 20 characters or less")
    .regex(/^[A-Z0-9]+$/, "Symbol must contain only uppercase letters and numbers"),
  name: z.string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  issuer: z.string()
    .nullable()
    .refine((val) => !val || /^G[A-Z0-9]{55}$/.test(val), {
      message: "Issuer must be a valid Stellar public key (starts with G, 56 characters)"
    }),
  asset_type: z.enum(["native", "credit_alphanum4", "credit_alphanum12"], {
    errorMap: (_issue, _ctx) => ({
      message: "Asset type must be one of: native, credit_alphanum4, credit_alphanum12"
    })
  }),
  bridge_provider: z.string()
    .max(50, "Bridge provider must be 50 characters or less")
    .nullable(),
  source_chain: z.string()
    .max(50, "Source chain must be 50 characters or less")
    .nullable(),
  is_active: z.boolean().default(true)
});

// Bridge validation schema
const BridgeSchema = z.object({
  name: z.string()
    .min(1, "Bridge name is required")
    .max(100, "Bridge name must be 100 characters or less"),
  source_chain: z.string()
    .min(1, "Source chain is required")
    .max(50, "Source chain must be 50 characters or less"),
  status: z.enum(["healthy", "degraded", "down", "unknown"], {
    errorMap: (_issue, _ctx) => ({
      message: "Status must be one of: healthy, degraded, down, unknown"
    })
  }),
  total_value_locked: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
      message: "Total value locked must be a non-negative number"
    }),
  supply_on_stellar: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
      message: "Supply on Stellar must be a non-negative number"
    }),
  supply_on_source: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
      message: "Supply on source must be a non-negative number"
    }),
  is_active: z.boolean().default(true)
});

// Price record validation schema
const PriceRecordSchema = z.object({
  time: z.date(),
  symbol: z.string()
    .min(1, "Symbol is required")
    .max(20, "Symbol must be 20 characters or less"),
  source: z.string()
    .min(1, "Source is required")
    .max(50, "Source must be 50 characters or less"),
  price: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
      message: "Price must be a positive number"
    }),
  volume_24h: z.string()
    .nullable()
    .refine((val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
      message: "Volume 24h must be a non-negative number"
    })
});

// Health score validation schema
const HealthScoreSchema = z.object({
  time: z.date(),
  symbol: z.string()
    .min(1, "Symbol is required")
    .max(20, "Symbol must be 20 characters or less"),
  overall_score: z.number()
    .min(0, "Overall score must be between 0 and 100")
    .max(100, "Overall score must be between 0 and 100"),
  liquidity_depth_score: z.number()
    .min(0, "Liquidity depth score must be between 0 and 100")
    .max(100, "Liquidity depth score must be between 0 and 100"),
  price_stability_score: z.number()
    .min(0, "Price stability score must be between 0 and 100")
    .max(100, "Price stability score must be between 0 and 100"),
  bridge_uptime_score: z.number()
    .min(0, "Bridge uptime score must be between 0 and 100")
    .max(100, "Bridge uptime score must be between 0 and 100"),
  reserve_backing_score: z.number()
    .min(0, "Reserve backing score must be between 0 and 100")
    .max(100, "Reserve backing score must be between 0 and 100"),
  volume_trend_score: z.number()
    .min(0, "Volume trend score must be between 0 and 100")
    .max(100, "Volume trend score must be between 0 and 100")
});

// Liquidity snapshot validation schema
const LiquiditySnapshotSchema = z.object({
  time: z.date(),
  symbol: z.string()
    .min(1, "Symbol is required")
    .max(20, "Symbol must be 20 characters or less"),
  dex: z.enum(["stellarx", "phoenix", "lumenswap", "sdex", "soroswap"], {
    errorMap: (_issue, _ctx) => ({
      message: "DEX must be one of: stellarx, phoenix, lumenswap, sdex, soroswap"
    })
  }),
  base_asset: z.string()
    .min(1, "Base asset is required")
    .max(20, "Base asset must be 20 characters or less"),
  quote_asset: z.string()
    .min(1, "Quote asset is required")
    .max(20, "Quote asset must be 20 characters or less"),
  tvl_usd: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
      message: "TVL USD must be a non-negative number"
    }),
  volume_24h_usd: z.string()
    .nullable()
    .refine((val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
      message: "Volume 24h USD must be a non-negative number"
    }),
  bid_depth: z.string()
    .nullable()
    .refine((val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
      message: "Bid depth must be a non-negative number"
    }),
  ask_depth: z.string()
    .nullable()
    .refine((val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
      message: "Ask depth must be a non-negative number"
    }),
  spread_pct: z.string()
    .nullable()
    .refine((val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
      message: "Spread percentage must be a non-negative number"
    })
});

// Alert rule validation schema
const AlertRuleSchema = z.object({
  owner_address: z.string()
    .min(1, "Owner address is required")
    .refine((val) => /^G[A-Z0-9]{55}$/.test(val), {
      message: "Owner address must be a valid Stellar public key"
    }),
  name: z.string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  asset_code: z.string()
    .min(1, "Asset code is required")
    .max(20, "Asset code must be 20 characters or less"),
  conditions: z.any(), // JSON validation would be more complex
  condition_op: z.enum(["AND", "OR"], {
    errorMap: (_issue, _ctx) => ({
      message: "Condition operator must be AND or OR"
    })
  }),
  priority: z.enum(["low", "medium", "high", "critical"], {
    errorMap: (_issue, _ctx) => ({
      message: "Priority must be one of: low, medium, high, critical"
    })
  }),
  cooldown_seconds: z.number()
    .min(0, "Cooldown seconds must be non-negative")
    .max(86400, "Cooldown seconds must not exceed 24 hours"),
  is_active: z.boolean().default(true),
  webhook_url: z.string()
    .nullable()
    .refine((val) => !val || /^https?:\/\/.+/.test(val), {
      message: "Webhook URL must be a valid HTTP/HTTPS URL"
    })
});

// ---------------------------------------------------------------------------
// Custom Validation Rules
// ---------------------------------------------------------------------------

class CustomValidationRules {
  // Asset consistency rules
  static assetConsistencyRules: ValidationRule[] = [
    {
      name: "native_asset_no_issuer",
      description: "Native assets should not have an issuer",
      validator: (data: any, _context: ValidationContext) => {
        const errors: ValidationError[] = [];
        if (data.asset_type === "native" && data.issuer) {
          errors.push({
            field: "issuer",
            code: "NATIVE_ASSET_WITH_ISSUER",
            message: "Native assets should not have an issuer",
            value: data.issuer,
            severity: "error"
          });
        }
        return errors;
      },
      severity: "error",
      enabled: true
    },
    {
      name: "non_native_asset_requires_issuer",
      description: "Non-native assets must have an issuer",
      validator: (data: any, _context: ValidationContext) => {
        const errors: ValidationError[] = [];
        if (data.asset_type !== "native" && !data.issuer) {
          errors.push({
            field: "issuer",
            code: "NON_NATIVE_WITHOUT_ISSUER",
            message: "Non-native assets must have an issuer",
            severity: "error"
          });
        }
        return errors;
      },
      severity: "error",
      enabled: true
    },
    {
      name: "bridge_provider_consistency",
      description: "Bridge provider requires source chain",
      validator: (data: any, _context: ValidationContext) => {
        const errors: ValidationError[] = [];
        if (data.bridge_provider && !data.source_chain) {
          errors.push({
            field: "source_chain",
            code: "BRIDGE_PROVIDER_WITHOUT_SOURCE_CHAIN",
            message: "Bridge provider requires source chain specification",
            severity: "error"
          });
        }
        return errors;
      },
      severity: "error",
      enabled: true
    }
  ];

  // Bridge consistency rules
  static bridgeConsistencyRules: ValidationRule[] = [
    {
      name: "bridge_supply_consistency",
      description: "Supply values should be consistent with bridge status",
      validator: (data: any, _context: ValidationContext) => {
        const errors: ValidationError[] = [];
        const stellarSupply = parseFloat(data.supply_on_stellar);
        const sourceSupply = parseFloat(data.supply_on_source);
        
        if (data.status === "healthy" && (stellarSupply <= 0 || sourceSupply <= 0)) {
          errors.push({
            field: "supply_on_stellar",
            code: "HEALTHY_BRIDGE_ZERO_SUPPLY",
            message: "Healthy bridge should have positive supply values",
            severity: "warning"
          });
        }
        
        return errors;
      },
      severity: "warning",
      enabled: true
    },
    {
      name: "tvl_reasonableness",
      description: "TVL should be reasonable for bridge status",
      validator: (data: any, _context: ValidationContext) => {
        const errors: ValidationError[] = [];
        const tvl = parseFloat(data.total_value_locked);
        
        if (tvl > 1000000000) { // $1B threshold
          errors.push({
            field: "total_value_locked",
            code: "TVL_EXCESSIVE",
            message: "TVL seems unusually high, please verify",
            value: tvl,
            severity: "warning"
          });
        }
        
        return errors;
      },
      severity: "warning",
      enabled: true
    }
  ];

  // Price data rules
  static priceDataRules: ValidationRule[] = [
    {
      name: "price_volatility_check",
      description: "Check for extreme price volatility",
      validator: (data: any, _context: ValidationContext) => {
        const errors: ValidationError[] = [];
        const price = parseFloat(data.price);
        
        // Check for extremely high prices (potential data error)
        if (price > 1000000) {
          errors.push({
            field: "price",
            code: "EXTREME_PRICE",
            message: "Price seems extremely high, please verify data accuracy",
            value: price,
            severity: "warning"
          });
        }
        
        // Check for extremely low prices
        if (price < 0.000001) {
          errors.push({
            field: "price",
            code: "EXTREMELY_LOW_PRICE",
            message: "Price seems extremely low, please verify data accuracy",
            value: price,
            severity: "warning"
          });
        }
        
        return errors;
      },
      severity: "warning",
      enabled: true
    },
    {
      name: "timestamp_freshness",
      description: "Check if price data is not too old",
      validator: (data: any, _context: ValidationContext) => {
        const errors: ValidationError[] = [];
        const now = new Date();
        const priceTime = new Date(data.time);
        const ageInHours = (now.getTime() - priceTime.getTime()) / (1000 * 60 * 60);
        
        if (ageInHours > 24) {
          errors.push({
            field: "time",
            code: "STALE_PRICE_DATA",
            message: `Price data is ${Math.round(ageInHours)} hours old`,
            value: data.time,
            severity: "warning"
          });
        }
        
        return errors;
      },
      severity: "warning",
      enabled: true
    }
  ];

  // Health score rules
  static healthScoreRules: ValidationRule[] = [
    {
      name: "score_consistency",
      description: "Health scores should be internally consistent",
      validator: (data: any, _context: ValidationContext) => {
        const errors: ValidationError[] = [];
        const scores = [
          data.liquidity_depth_score,
          data.price_stability_score,
          data.bridge_uptime_score,
          data.reserve_backing_score,
          data.volume_trend_score
        ];
        
        // Check if overall score is reasonable average of components
        const avgComponent = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        const difference = Math.abs(data.overall_score - avgComponent);
        
        if (difference > 20) {
          errors.push({
            field: "overall_score",
            code: "SCORE_INCONSISTENCY",
            message: "Overall score seems inconsistent with component scores",
            severity: "warning"
          });
        }
        
        return errors;
      },
      severity: "warning",
      enabled: true
    }
  ];
}

// ---------------------------------------------------------------------------
// Data Normalization
// ---------------------------------------------------------------------------

class DataNormalizer {
  static normalizeAsset(data: any): any {
    return {
      ...data,
      symbol: data.symbol?.toUpperCase().trim(),
      name: data.name?.trim(),
      issuer: data.issuer?.trim() || null,
      bridge_provider: data.bridge_provider?.trim() || null,
      source_chain: data.source_chain?.trim() || null,
    };
  }

  static normalizeBridge(data: any): any {
    return {
      ...data,
      name: data.name?.trim(),
      source_chain: data.source_chain?.trim(),
      status: data.status?.toLowerCase(),
      total_value_locked: data.total_value_locked?.toString(),
      supply_on_stellar: data.supply_on_stellar?.toString(),
      supply_on_source: data.supply_on_source?.toString(),
    };
  }

  static normalizePriceRecord(data: any): any {
    return {
      ...data,
      symbol: data.symbol?.toUpperCase().trim(),
      source: data.source?.toLowerCase().trim(),
      price: data.price?.toString(),
      volume_24h: data.volume_24h?.toString() || null,
    };
  }

  static normalizeHealthScore(data: any): any {
    return {
      ...data,
      symbol: data.symbol?.toUpperCase().trim(),
      overall_score: Math.round(data.overall_score),
      liquidity_depth_score: Math.round(data.liquidity_depth_score),
      price_stability_score: Math.round(data.price_stability_score),
      bridge_uptime_score: Math.round(data.bridge_uptime_score),
      reserve_backing_score: Math.round(data.reserve_backing_score),
      volume_trend_score: Math.round(data.volume_trend_score),
    };
  }

  static normalizeLiquiditySnapshot(data: any): any {
    return {
      ...data,
      symbol: data.symbol?.toUpperCase().trim(),
      dex: data.dex?.toLowerCase().trim(),
      base_asset: data.base_asset?.toUpperCase().trim(),
      quote_asset: data.quote_asset?.toUpperCase().trim(),
      tvl_usd: data.tvl_usd?.toString(),
      volume_24h_usd: data.volume_24h_usd?.toString() || null,
      bid_depth: data.bid_depth?.toString() || null,
      ask_depth: data.ask_depth?.toString() || null,
      spread_pct: data.spread_pct?.toString() || null,
    };
  }
}

// ---------------------------------------------------------------------------
// Duplicate Detection
// ---------------------------------------------------------------------------

class DuplicateDetector {
  static async detectAssetDuplicate(data: any, context: ValidationContext): Promise<DuplicateDetectionResult> {
    // This would typically query the database
    // For now, return a basic implementation
    const duplicateFields: string[] = [];
    const duplicateIds: string[] = [];
    
    if (context.existingData) {
      if (context.existingData.symbol === data.symbol) {
        duplicateFields.push("symbol");
        duplicateIds.push(context.existingData.id);
      }
    }
    
    return {
      isDuplicate: duplicateFields.length > 0,
      duplicateFields,
      duplicateIds,
      similarity: duplicateFields.length > 0 ? 1.0 : 0.0
    };
  }

  static async detectBridgeDuplicate(data: any, context: ValidationContext): Promise<DuplicateDetectionResult> {
    const duplicateFields: string[] = [];
    const duplicateIds: string[] = [];
    
    if (context.existingData) {
      if (context.existingData.name === data.name) {
        duplicateFields.push("name");
        duplicateIds.push(context.existingData.id);
      }
    }
    
    return {
      isDuplicate: duplicateFields.length > 0,
      duplicateFields,
      duplicateIds,
      similarity: duplicateFields.length > 0 ? 1.0 : 0.0
    };
  }

  static async detectPriceRecordDuplicate(data: any, context: ValidationContext): Promise<DuplicateDetectionResult> {
    const duplicateFields: string[] = [];
    const duplicateIds: string[] = [];
    
    if (context.existingData) {
      if (context.existingData.symbol === data.symbol && 
          context.existingData.source === data.source &&
          context.existingData.time.getTime() === data.time.getTime()) {
        duplicateFields.push("symbol", "source", "time");
        duplicateIds.push(context.existingData.id);
      }
    }
    
    return {
      isDuplicate: duplicateFields.length > 0,
      duplicateFields,
      duplicateIds,
      similarity: duplicateFields.length > 0 ? 1.0 : 0.0
    };
  }
}

// ---------------------------------------------------------------------------
// Main Validation Service
// ---------------------------------------------------------------------------

export class ValidationService {
  private validationLogger = createChildLogger('validation');
  private typeNames = ["asset", "bridge", "priceRecord", "healthScore", "liquiditySnapshot", "alertRule"] as const;
  private validationMetrics = {
    totalValidations: 0,
    validationErrors: 0,
    validationWarnings: 0,
    averageValidationTime: 0,
    dataQualityScore: 0,
  };

  // Schema mapping
  private schemas = {
    asset: AssetSchema,
    bridge: BridgeSchema,
    priceRecord: PriceRecordSchema,
    healthScore: HealthScoreSchema,
    liquiditySnapshot: LiquiditySnapshotSchema,
    alertRule: AlertRuleSchema,
  };

  private customRules: Record<(typeof this.typeNames)[number], ValidationRule[]> = {
    asset: CustomValidationRules.assetConsistencyRules,
    bridge: CustomValidationRules.bridgeConsistencyRules,
    priceRecord: CustomValidationRules.priceDataRules,
    healthScore: CustomValidationRules.healthScoreRules,
    liquiditySnapshot: [],
    alertRule: [],
  };

  private normalizers: Record<(typeof this.typeNames)[number], (data: any) => any> = {
    asset: DataNormalizer.normalizeAsset,
    bridge: DataNormalizer.normalizeBridge,
    priceRecord: DataNormalizer.normalizePriceRecord,
    healthScore: DataNormalizer.normalizeHealthScore,
    liquiditySnapshot: DataNormalizer.normalizeLiquiditySnapshot,
    alertRule: (data: any) => data,
  };

  private duplicateDetectors: Record<
    (typeof this.typeNames)[number],
    (data: any, context: ValidationContext) => Promise<DuplicateDetectionResult>
  > = {
    asset: DuplicateDetector.detectAssetDuplicate,
    bridge: DuplicateDetector.detectBridgeDuplicate,
    priceRecord: DuplicateDetector.detectPriceRecordDuplicate,
    healthScore: async (_data, _context) => ({ isDuplicate: false, duplicateFields: [], duplicateIds: [], similarity: 0 }),
    liquiditySnapshot: async (_data, _context) => ({ isDuplicate: false, duplicateFields: [], duplicateIds: [], similarity: 0 }),
    alertRule: async (_data, _context) => ({ isDuplicate: false, duplicateFields: [], duplicateIds: [], similarity: 0 }),
  };

  /**
   * Validate a single data item
   */
  async validate(
    data: any,
    dataType: keyof typeof this.schemas,
    _context: ValidationContext
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let normalizedData = data;
    const rulesApplied: string[] = [];
    const normalizedFields: string[] = [];
    const consistencyChecks: string[] = [];

    try {
      // Check for admin bypass
      if (_context.isAdmin && config.VALIDATION_ADMIN_BYPASS) {
        this.validationLogger.warn("Admin bypass used for validation", {
          dataType,
          correlationId: _context.correlationId,
        });
        
        return {
          isValid: true,
          errors: [],
          warnings: [{
            field: "system",
            code: "ADMIN_BYPASS",
            message: "Validation bypassed by admin",
            recommendation: "Ensure data integrity is maintained"
          }],
          normalizedData: data,
          metadata: {
            dataType,
            validationTime: Date.now() - startTime,
            rulesApplied: ["admin_bypass"],
            bypassUsed: true,
            normalizedFields: [],
            duplicateCheck: false,
            consistencyChecks: []
          }
        };
      }

      // Data normalization (runs first so normalized data is schema-validated)
      const normalizer = this.normalizers[dataType];
      if (normalizer) {
        const beforeNormalization = { ...normalizedData };
        normalizedData = normalizer(normalizedData);
        
        // Track all fields that the normalizer processed (existed in original input)
        Object.keys(normalizedData).forEach(key => {
          if (key in beforeNormalization) {
            normalizedFields.push(key);
          }
        });
        
        rulesApplied.push("normalization");
      }

      // Schema validation (runs on normalized data)
      const schema = this.schemas[dataType];
      if (schema) {
        const result = schema.safeParse(normalizedData);
        if (!result.success) {
          result.error.errors.forEach((error) => {
            errors.push({
              field: error.path.join('.'),
              code: "SCHEMA_VALIDATION",
              message: error.message,
              value: (error as any).received,
              expected: (error as any).expected,
              severity: "error"
            });
          });
        } else {
          normalizedData = result.data;
          rulesApplied.push("schema_validation");
        }
      }

      // Custom validation rules
      const customRules = this.customRules[dataType] || [];
      for (const rule of customRules) {
        if (rule.enabled) {
          const ruleErrors = rule.validator(normalizedData, _context);
          if (rule.severity === "error") {
            errors.push(...ruleErrors);
          } else {
            warnings.push(...ruleErrors.map(e => ({
              field: e.field,
              code: e.code,
              message: e.message,
              value: e.value,
              recommendation: `Review ${e.field} for ${e.code.toLowerCase()}`
            })));
          }
          rulesApplied.push(rule.name);
        }
      }

      // Duplicate detection
      let duplicateCheck = false;
      const duplicateDetector = this.duplicateDetectors[dataType];
      if (duplicateDetector) {
        const duplicateResult = await duplicateDetector(normalizedData, _context);
        duplicateCheck = true;
        
        if (duplicateResult.isDuplicate) {
          warnings.push({
            field: "duplicate",
            code: "DUPLICATE_DETECTED",
            message: `Duplicate data detected for fields: ${duplicateResult.duplicateFields.join(', ')}`,
            value: duplicateResult.duplicateIds,
            recommendation: "Review if this is intentional or update existing record"
          });
        }
        
        rulesApplied.push("duplicate_detection");
      }

      // Consistency checks
      if (dataType === "asset") {
        consistencyChecks.push("asset_consistency");
      } else if (dataType === "bridge") {
        consistencyChecks.push("bridge_consistency");
      }

      const validationTime = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics(errors.length, warnings.length, validationTime);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        normalizedData,
        metadata: {
          dataType,
          validationTime,
          rulesApplied,
          bypassUsed: false,
          normalizedFields,
          duplicateCheck,
          consistencyChecks
        }
      };

    } catch (error) {
      this.validationLogger.error("Validation failed with error", error as Error, {
        dataType,
        correlationId: _context.correlationId,
      });

      return {
        isValid: false,
        errors: [{
          field: "system",
          code: "VALIDATION_ERROR",
          message: "Validation system error occurred",
          severity: "critical"
        }],
        warnings: [],
        metadata: {
          dataType,
          validationTime: Date.now() - startTime,
          rulesApplied: [],
          bypassUsed: false,
          normalizedFields: [],
          duplicateCheck: false,
          consistencyChecks: []
        }
      };
    }
  }

  /**
   * Validate multiple items in batch
   */
  async validateBatch(
    items: any[],
    dataType: keyof typeof this.schemas,
    _context: ValidationContext & { batchSize?: number }
  ): Promise<BatchValidationResult> {
    const startTime = Date.now();
    const results: ValidationResult[] = [];
    const batchSize = _context.batchSize || 100;
    
    let validItems = 0;
    let invalidItems = 0;
    let totalWarnings = 0;
    const errorCounts: Record<string, number> = {};

    // Process items in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (item, index) => {
        const itemContext = {
          ..._context,
          batchIndex: i + index,
        };
        
        return this.validate(item, dataType, itemContext);
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Update counters
      batchResults.forEach(result => {
        if (result.isValid) {
          validItems++;
        } else {
          invalidItems++;
        }
        
        totalWarnings += result.warnings.length;
        
        // Track error frequencies
        result.errors.forEach(error => {
          errorCounts[error.code] = (errorCounts[error.code] || 0) + 1;
        });
      });
    }

    const processingTime = Date.now() - startTime;
    const averageValidationTime = processingTime / items.length;

    // Calculate most common errors
    const mostCommonErrors = Object.entries(errorCounts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate data quality score
    const dataQualityScore = this.calculateDataQualityScore(validItems, items.length, totalWarnings);

    // Generate recommendations
    const recommendations = this.generateRecommendations(mostCommonErrors, dataQualityScore);

    const summary: BatchValidationSummary = {
      processingTime,
      averageValidationTime,
      mostCommonErrors,
      dataQualityScore,
      recommendations
    };

    this.validationLogger.info("Batch validation completed", {
      dataType,
      totalItems: items.length,
      validItems,
      invalidItems,
      totalWarnings,
      dataQualityScore,
      processingTime,
    });

    return {
      totalItems: items.length,
      validItems,
      invalidItems,
      warnings: totalWarnings,
      results,
      summary
    };
  }

  /**
   * Get validation metrics
   */
  getMetrics() {
    return {
      ...this.validationMetrics,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset validation metrics
   */
  resetMetrics() {
    this.validationMetrics = {
      totalValidations: 0,
      validationErrors: 0,
      validationWarnings: 0,
      averageValidationTime: 0,
      dataQualityScore: 0,
    };
  }

  /**
   * Add custom validation rule
   */
  addCustomRule(
    dataType: keyof typeof this.customRules,
    rule: ValidationRule
  ) {
    if (!this.customRules[dataType]) {
      this.customRules[dataType] = [];
    }
    this.customRules[dataType].push(rule);
    
    this.validationLogger.info("Custom validation rule added", {
      dataType,
      ruleName: rule.name,
    });
  }

  /**
   * Remove custom validation rule
   */
  removeCustomRule(
    dataType: keyof typeof this.customRules,
    ruleName: string
  ) {
    if (this.customRules[dataType]) {
      this.customRules[dataType] = this.customRules[dataType].filter(
        rule => rule.name !== ruleName
      );
      
      this.validationLogger.info("Custom validation rule removed", {
        dataType,
        ruleName,
      });
    }
  }

  /**
   * Enable/disable validation rule
   */
  toggleRule(
    dataType: keyof typeof this.customRules,
    ruleName: string,
    enabled: boolean
  ) {
    if (this.customRules[dataType]) {
      const rule = this.customRules[dataType].find(r => r.name === ruleName);
      if (rule) {
        rule.enabled = enabled;
        
        this.validationLogger.info("Validation rule toggled", {
          dataType,
          ruleName,
          enabled,
        });
      }
    }
  }

  // Private helper methods
  private updateMetrics(errorCount: number, warningCount: number, validationTime: number) {
    this.validationMetrics.totalValidations++;
    this.validationMetrics.validationErrors += errorCount;
    this.validationMetrics.validationWarnings += warningCount;
    
    // Update average validation time
    const totalTime = this.validationMetrics.averageValidationTime * (this.validationMetrics.totalValidations - 1) + validationTime;
    this.validationMetrics.averageValidationTime = totalTime / this.validationMetrics.totalValidations;
  }

  private calculateDataQualityScore(validItems: number, totalItems: number, totalWarnings: number): number {
    if (totalItems === 0) return 100;
    
    const validityScore = (validItems / totalItems) * 100;
    const warningPenalty = Math.min((totalWarnings / totalItems) * 10, 20); // Max 20 point penalty
    
    return Math.max(0, Math.round(validityScore - warningPenalty));
  }

  private generateRecommendations(
    mostCommonErrors: Array<{ code: string; count: number }>,
    dataQualityScore: number
  ): string[] {
    const recommendations: string[] = [];
    
    if (dataQualityScore < 70) {
      recommendations.push("Data quality score is below 70%. Review validation rules and data sources.");
    }
    
    if (mostCommonErrors.length > 0) {
      const topError = mostCommonErrors[0];
      recommendations.push(`Most common error: ${topError.code} (${topError.count} occurrences). Consider improving data preprocessing.`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push("Data quality is good. Continue monitoring for any issues.");
    }
    
    return recommendations;
  }
}

// Export singleton instance
export const validationService = new ValidationService();
