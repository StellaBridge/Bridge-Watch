/**
 * @file index.ts
 * @module @bridge-watch/contract-sdk
 * @description Main entry point for the BridgeWatch Soroban Contract SDK.
 * Provides client abstractions, typed contract interaction helpers, error definitions,
 * compatibility utilities, and testing tools.
 */

/**
 * Re-exported configuration and data types for the SDK.
 */
export * from "./types";

/**
 * Re-exported SDK error classes.
 */
export * from "./errors";

/**
 * Re-exported core client, retry configuration, and event subscription helpers.
 */
export * from "./client";

/**
 * Re-exported typed contract client and Soroban data models.
 */
export * from "./contract";

/**
 * Re-exported test helpers and fixtures.
 */
export * from "./testing";

/**
 * Re-exported compatibility interfaces and version negotiation helpers.
 */
export * from "./compatibility";
export * from "./tracecontext";
export * from "./pagination";
export * from "./resilience";

