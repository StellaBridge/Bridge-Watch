# Database Connection Pool Dashboard — Operator Guide

## Quick Start

### Access the Dashboard

1. Log in to Bridge Watch
2. Navigate to **Dashboards** → **Database Pool**
3. You'll see the pool health at a glance

### Understanding the Display

#### Health Card

Shows current status:

- **Utilization**: Percentage of connections in use (target < 80%)
- **Active**: Connections currently handling queries
- **Idle**: Connections ready to use
- **Status**: Green (healthy) or red (needs attention)

#### Metrics Chart

24-hour trend showing:

- **Blue line**: Active connections over time
- **Green line**: Idle connections over time
- **Yellow line**: Waiting requests (should be near 0)

#### Events Log

Recent significant changes from most recent at top:

- **⏰ Time**: When the event occurred
- **🏷️ Event**: What happened
- **🔴 Severity**: info, warning, or critical
- **💬 Message**: Details

## Common Scenarios

### ✅ Everything is Green

**Interpretation**: Pool is healthy.

**Action**: Monitor regularly.

---

### ⚠️ Utilization is Yellow (70-80%)

**Interpretation**: Pool is becoming busy but not critical.

**When to act**: When you see waiting requests in events.

**Steps**:

1. Check recent events for errors
2. Monitor for 5-10 minutes
3. If requests continue waiting:
   - Click **Pool Controls**
   - Select **Set Max Connections**
   - Increase by 50% (e.g., 20 → 30)
   - Confirm and apply

---

### 🔴 Utilization is Red (>90%)

**Interpretation**: Pool is under high load.

**Action ASAP**:

1. Look for **POOL_NEAR_EXHAUSTION** events
2. Check for application errors in logs
3. **If waiting requests exist**:
   - Click **Pool Controls**
   - Select **Set Max Connections**
   - Increase to 150% of current (e.g., 20 → 30)
   - Apply and monitor

4. **If still exhausted**:
   - Escalate to database team
   - Consider application scaling
   - May need database optimization

---

### ❌ Error Spike in Events

**Interpretation**: Connection or query failures detected.

**Steps**:

1. Note the timestamp and error count
2. Check application logs for errors around that time
3. **Common causes**:
   - Database overload → Increase pool size
   - Network issue → Check connectivity
   - Query timeout → Check slow query log
   - Authentication error → Verify credentials

4. **If errors persist**:
   - Consider evicting idle connections:
     - Click **Pool Controls**
     - Select **Evict Idle Connections**
     - Confirm
   - If still failing, escalate

---

### 📊 Waiting Requests Detected

**Interpretation**: Requests queuing for connections.

**Why this happens**:

- All connections are busy
- Long-running queries are holding connections
- Application is sending too many queries

**Steps**:

1. Check **WAITING_REQUESTS** event count
2. If count is high:
   - Increase max_connections (see above)
   - Check application query rate
   - Review slow query log

3. After action:
   - Wait 2-3 minutes
   - Monitor for recovery
   - Check if waiting requests drop to 0

---

## Control Actions

### Set Max Connections

**What it does**: Increases the maximum pool size.

**When to use**: Utilization > 80% or waiting requests.

**How**:

1. Click **Pool Controls**
2. Select **Set Max Connections**
3. Enter new maximum (1-1000)
4. Click **Execute**

**Examples**:

- Current: 20, Load: Light → Set to 30
- Current: 30, Load: Moderate → Set to 50
- Current: 50, Load: Heavy → Set to 75-100

**💡 Tips**:

- Don't increase by more than 50% at once
- Adjust in steps if needed
- Monitor impact before making further changes

---

### Set Min Connections

**What it does**: Ensures minimum idle connections.

**When to use**: Pool frequently drops to 0 idle.

**How**:

1. Click **Pool Controls**
2. Select **Set Min Connections**
3. Enter new minimum (0-100)
4. Click **Execute**

**Example**: If you always need some warm connections, set min to 5-10.

---

### Evict Idle Connections

**What it does**: Closes currently unused connections.

**When to use**: Error spikes with idle connections present.

**How**:

1. Click **Pool Controls**
2. Select **Evict Idle Connections**
3. Click **Execute**

**⚠️ Important**: May cause brief latency spike as connections reconnect.

---

### Drain Pool

**What it does**: Closes ALL connections immediately.

**When to use**: ONLY in emergencies when pool is broken.

**How**:

1. Click **Pool Controls**
2. Select **Drain Pool**
3. Click **Execute**

**⚠️ CRITICAL**: This will cause ALL active queries to fail. Use only as last resort.

**Recovery**: Pool automatically reconnects after ~30 seconds.

---

### Reset Statistics

**What it does**: Clears error and timing counters.

**When to use**: After recovering from an issue.

**How**:

1. Click **Pool Controls**
2. Select **Reset Statistics**
3. Click **Execute**

**Use case**: Clean baseline after fixing a problem.

---

## Interpreting Events

### Event Types

| Event | Meaning | Action |
|-------|---------|--------|
| **WAITING_REQUESTS** | Requests queued for connections | Consider increasing max |
| **POOL_NEAR_EXHAUSTION** | Utilization > 90% | Monitoring only, escalate if worsens |
| **POOL_EXHAUSTED** | 100% utilization + waiting requests | **ACT**: Increase max immediately |
| **ERROR_SPIKE** | Multiple connection errors | Check logs, may need drain + reset |
| **POOL_RECOVERED** | Recovery from stressed state | ✅ Normal, no action needed |
| **TIMEOUT** | Connection acquisition timeout | Increase max or check database |
| **AUTHENTICATION_ERROR** | Login failure | Check credentials and database |

---

## Escalation Checklist

### When to Escalate to Database Team

- [ ] Pool exhausted despite increasing max_connections
- [ ] Repeated authentication errors
- [ ] Persistent error spikes even after drain+reset
- [ ] Queries hanging/timing out frequently
- [ ] Need to increase max > 100 connections
- [ ] Pool doesn't recover after drain
- [ ] Dashboard stops showing metrics

### When to Escalate to Application Team

- [ ] Utilization always high despite pool increases
- [ ] Application is opening many simultaneous connections
- [ ] Queries are unnecessarily slow
- [ ] Connection leaks suspected (connections never released)

### When to Escalate to DevOps

- [ ] Need to scale application processes
- [ ] Database instance needs vertical scaling
- [ ] Network connectivity issues suspected
- [ ] Database maintenance affecting pool

---

## Daily Checks

### Morning

- [ ] Check dashboard health status
- [ ] Review overnight events
- [ ] Note any error patterns

### Hourly (During Peak)

- [ ] Scan utilization chart
- [ ] Watch for waiting requests
- [ ] Monitor event log

### When Deploying

- [ ] Note pre-deployment pool status
- [ ] Monitor closely for 30 minutes post-deploy
- [ ] Check for any unusual events or errors
- [ ] Revert pool settings if deployment causes load increase

---

## Frequently Asked Questions

**Q: Why is idle gradually decreasing?**

A: Pool is optimizing size. If it drops too low during load, increase min_connections.

**Q: Should max_connections match database max_connections?**

A: No, app pool should be 30-50% of database. Database needs room for other connections.

**Q: What's a "normal" utilization?**

A: 40-60% is healthy. Spikes to 70-80% are fine if they come down.

**Q: How long does it take to increase max to take effect?**

A: Immediately for new connections. Existing connections remain until they're recycled.

**Q: Can I have waiting requests with low utilization?**

A: Briefly yes, if all connections are slow. Usually indicates query performance issue.

**Q: Will draining pool break user requests?**

A: Yes, any active queries will fail and need to be retried by the application.

**Q: Where are control actions logged?**

A: In **Controls History** tab (requires audit:read permission).

**Q: How do I undo a control action?**

A: Manually set pool settings back or escalate to team lead.

---

## Warnings and Safety

### ⚠️ Do NOT

- Set max_connections > 200 without escalating
- Drain pool during active user sessions
- Change settings every minute without monitoring effects
- Ignore repeated error spikes

### ✅ Do

- Make incremental changes (50% at a time)
- Wait 2-3 minutes after change to evaluate
- Document why you made a change
- Communicate with team about actions
- Check logs for root causes, not just symptoms

---

## Support

**Dashboard not loading?**

- Check browser console for errors
- Verify you have pool_metrics permission
- Try refreshing the page
- Check backend logs

**Can't execute control actions?**

- Verify your role includes `admin:pool_control`
- Check that you're clicking Confirm checkbox
- Ensure pool_id is correct

**Metrics seem wrong?**

- Wait 5 minutes for fresh data
- Check that collection is running
- Verify database migration completed
- Review backend logs for collection errors

**Questions?**

- Check the main `db-pool-dashboard.md` documentation
- Post in #database-operations channel
- Contact @database-oncall
