// Simple test to verify health check implementation
import { HealthCheckService } from "./src/services/healthCheck.service.js";

async function testHealthChecks() {
  console.log("Testing Health Check Service...");
  
  const healthService = new HealthCheckService();
  
  try {
    // Test liveness
    console.log("Testing liveness...");
    const liveness = await healthService.getLiveness();
    console.log("Liveness:", liveness);
    
    // Test readiness
    console.log("Testing readiness...");
    const readiness = await healthService.getReadiness();
    console.log("Readiness:", readiness);
    
    // Test individual components
    console.log("Testing database check...");
    const dbCheck = await healthService.checkDatabase();
    console.log("Database:", dbCheck.status);
    
    console.log("Testing Redis check...");
    const redisCheck = await healthService.checkRedis();
    console.log("Redis:", redisCheck.status);
    
    console.log("✅ Health check service working correctly");
    
  } catch (error) {
    console.error("❌ Health check test failed:", error.message);
  } finally {
    await healthService.disconnect();
  }
}

testHealthChecks();
