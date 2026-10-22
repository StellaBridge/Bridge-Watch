// @ts-nocheck
import * as jwt from "jsonwebtoken";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { RedisClientFactory } from "../config/redis.js";

export interface TokenPayload {
  sub: string;
  client_id: string;
  scope: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  tokenType?: "access" | "refresh";
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  tokenType: string;
}

interface OAuth2Config {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  tokenTtlSeconds: number;
  refreshTtlSeconds: number;
  refreshRotation: boolean;
}

function getOAuth2Config(): OAuth2Config {
  return {
    jwtSecret: config.JWT_SECRET || randomBytes(32).toString("hex"),
    jwtIssuer: config.JWT_ISSUER || "bridge-watch-api",
    jwtAudience: config.JWT_AUDIENCE || "bridge-watch-api",
    tokenTtlSeconds: Number(config.JWT_TTL_SECONDS) || 3600,
    refreshTtlSeconds: Number(config.JWT_REFRESH_TTL_SECONDS) || 604800,
    refreshRotation: config.JWT_REFRESH_ROTATION ?? true,
  };
}

const REFRESH_TOKEN_PREFIX = "oauth2:refresh:";
const REVOKED_TOKEN_PREFIX = "oauth2:revoked:";
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export class OAuth2Service {
  private config: OAuth2Config;
  private redis = RedisClientFactory.getInstance().getClient();

  constructor() {
    this.config = getOAuth2Config();

    if (!config.JWT_SECRET) {
      logger.warn(
        "JWT_SECRET not configured. Using randomly generated secret (tokens will not survive restarts)"
      );
    }
  }

  generateClientCredentials(): { clientId: string; clientSecret: string } {
    const clientId = `bw_${randomBytes(16).toString("hex")}`;
    const clientSecret = `bws_${randomBytes(32).toString("hex")}`;
    return { clientId, clientSecret };
  }

  hashClientSecret(clientSecret: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(clientSecret, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  verifyClientSecret(clientSecret: string, storedHash: string): boolean {
    try {
      const [salt, hash] = storedHash.split(":");
      if (!salt || !hash) {
        return false;
      }

      const attemptedHash = scryptSync(clientSecret, salt, 64).toString("hex");
      const hashBuffer = Buffer.from(hash, "hex");
      const attemptedBuffer = Buffer.from(attemptedHash, "hex");

      if (hashBuffer.length !== attemptedBuffer.length) {
        return false;
      }

      return timingSafeEqual(hashBuffer, attemptedBuffer);
    } catch (error) {
      logger.error({ error }, "Error verifying client secret");
      return false;
    }
  }

  /**
   * Issue an access token and refresh token pair.
   * Returns both tokens with their expiration times.
   */
  async issueTokenPair(
    clientId: string,
    apiKeyId: string,
    scopes: string[]
  ): Promise<TokenPair> {
    const now = Math.floor(Date.now() / 1000);
    const accessExp = now + this.config.tokenTtlSeconds;
    const refreshExp = now + this.config.refreshTtlSeconds;

    const accessPayload: TokenPayload = {
      sub: apiKeyId,
      client_id: clientId,
      scope: scopes.join(" "),
      iat: now,
      exp: accessExp,
      iss: this.config.jwtIssuer,
      aud: this.config.jwtAudience,
      tokenType: "access",
    };

    const refreshPayload: TokenPayload = {
      sub: apiKeyId,
      client_id: clientId,
      scope: scopes.join(" "),
      iat: now,
      exp: refreshExp,
      iss: this.config.jwtIssuer,
      aud: this.config.jwtAudience,
      tokenType: "refresh",
    };

    const accessToken = jwt.sign(accessPayload, this.config.jwtSecret, {
      algorithm: "HS256",
    });

    const refreshToken = jwt.sign(refreshPayload, this.config.jwtSecret, {
      algorithm: "HS256",
    });

    // Store refresh token in Redis with TTL
    const refreshKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
    await this.redis.setEx(refreshKey, this.config.refreshTtlSeconds, JSON.stringify({
      clientId,
      apiKeyId,
      scopes: scopes.join(" "),
      createdAt: now,
    }));

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.tokenTtlSeconds,
      refreshExpiresIn: this.config.refreshTtlSeconds,
      tokenType: "Bearer",
    };
  }

  /**
   * Issue only an access token (for backward compatibility or when refresh not needed).
   */
  issueToken(
    clientId: string,
    apiKeyId: string,
    scopes: string[]
  ): { accessToken: string; expiresIn: number; tokenType: string } {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.config.tokenTtlSeconds;

    const payload: TokenPayload = {
      sub: apiKeyId,
      client_id: clientId,
      scope: scopes.join(" "),
      iat: now,
      exp,
      iss: this.config.jwtIssuer,
      aud: this.config.jwtAudience,
      tokenType: "access",
    };

    const accessToken = jwt.sign(payload, this.config.jwtSecret, {
      algorithm: "HS256",
    });

    return {
      accessToken,
      expiresIn: this.config.tokenTtlSeconds,
      tokenType: "Bearer",
    };
  }

  /**
   * Refresh an access token using a refresh token.
   * Implements refresh token rotation if enabled.
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenPair | null> {
    try {
      // Verify the refresh token signature
      const payload = jwt.verify(refreshToken, this.config.jwtSecret, {
        algorithms: ["HS256"],
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
      }) as TokenPayload;

      if (payload.tokenType !== "refresh") {
        logger.warn({ tokenType: payload.tokenType }, "Invalid token type for refresh");
        return null;
      }

      // Check if refresh token exists in Redis (not revoked)
      const refreshKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
      const stored = await this.redis.get(refreshKey);

      if (!stored) {
        logger.warn({ sub: payload.sub }, "Refresh token not found or revoked");
        return null;
      }

      const storedData = JSON.parse(stored);

      // Check if token is revoked
      const revokedKey = `${REVOKED_TOKEN_PREFIX}${refreshToken}`;
      const isRevoked = await this.redis.exists(revokedKey);
      if (isRevoked) {
        logger.warn({ sub: payload.sub }, "Refresh token has been revoked");
        return null;
      }

      // If rotation is enabled, invalidate the old refresh token
      if (this.config.refreshRotation) {
        await this.redis.del(refreshKey);
        await this.redis.setEx(revokedKey, this.config.refreshTtlSeconds, "revoked");
      }

      // Issue new token pair
      return this.issueTokenPair(
        storedData.clientId,
        storedData.apiKeyId,
        storedData.scopes.split(" ")
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid refresh token";
      logger.warn({ error: message }, "Refresh token validation failed");
      return null;
    }
  }

  /**
   * Revoke a refresh token (add to blacklist).
   */
  async revokeRefreshToken(refreshToken: string): Promise<boolean> {
    try {
      const payload = jwt.verify(refreshToken, this.config.jwtSecret, {
        algorithms: ["HS256"],
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
      }) as TokenPayload;

      if (payload.tokenType !== "refresh") {
        return false;
      }

      const refreshKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
      const revokedKey = `${REVOKED_TOKEN_PREFIX}${refreshToken}`;

      // Remove from active refresh tokens
      await this.redis.del(refreshKey);

      // Add to revoked list with TTL
      await this.redis.setEx(revokedKey, this.config.refreshTtlSeconds, "revoked");

      logger.info({ sub: payload.sub }, "Refresh token revoked");
      return true;
    } catch (error) {
      logger.error({ error }, "Failed to revoke refresh token");
      return false;
    }
  }

  /**
   * Revoke all refresh tokens for a client/user.
   */
  async revokeAllRefreshTokens(apiKeyId: string): Promise<number> {
    const pattern = `${REFRESH_TOKEN_PREFIX}*`;
    let count = 0;

    for await (const key of this.redis.scanIterator({ match: pattern, count: 100 })) {
      const data = await this.redis.get(key);
      if (data) {
        const stored = JSON.parse(data);
        if (stored.apiKeyId === apiKeyId) {
          const token = key.replace(REFRESH_TOKEN_PREFIX, "");
          const revokedKey = `${REVOKED_TOKEN_PREFIX}${token}`;
          await this.redis.del(key);
          await this.redis.setEx(revokedKey, this.config.refreshTtlSeconds, "revoked");
          count++;
        }
      }
    }

    logger.info({ apiKeyId, count }, "Revoked all refresh tokens for client");
    return count;
  }

  /**
   * Verify an access token.
   */
  verifyToken(token: string): TokenValidationResult {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ["HS256"],
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
      }) as TokenPayload;

      // Check if it's an access token (not refresh)
      if (payload.tokenType === "refresh") {
        return { valid: false, error: "Refresh token cannot be used as access token" };
      }

      // Check if the associated refresh token was revoked (optional strict mode)
      // This would require storing a reference to the refresh token in the access token

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid token";
      return {
        valid: false,
        error: message,
      };
    }
  }

  extractScopesFromToken(payload: TokenPayload): string[] {
    return payload.scope ? payload.scope.split(" ").filter(Boolean) : [];
  }

  // Backward compatibility methods
  hashClientSecret(clientSecret: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(clientSecret, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  verifyClientSecret(clientSecret: string, storedHash: string): boolean {
    try {
      const [salt, hash] = storedHash.split(":");
      if (!salt || !hash) {
        return false;
      }

      const attemptedHash = scryptSync(clientSecret, salt, 64).toString("hex");
      const hashBuffer = Buffer.from(hash, "hex");
      const attemptedBuffer = Buffer.from(attemptedHash, "hex");

      if (hashBuffer.length !== attemptedBuffer.length) {
        return false;
      }

      return timingSafeEqual(hashBuffer, attemptedBuffer);
    } catch (error) {
      logger.error({ error }, "Error verifying client secret");
      return false;
    }
  }

  generateClientCredentials(): { clientId: string; clientSecret: string } {
    const clientId = `bw_${randomBytes(16).toString("hex")}`;
    const clientSecret = `bws_${randomBytes(32).toString("hex")}`;
    return { clientId, clientSecret };
  }
}

export const oauth2Service = new OAuth2Service();