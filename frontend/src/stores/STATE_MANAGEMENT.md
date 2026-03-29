# State Management Architecture

This document describes the centralized state management solution for Stellar Bridge Watch using Zustand.

## Overview

The application uses **Zustand** for state management with the following key features:
- **Type-safe** state access with TypeScript
- **Persistent state** with localStorage for user preferences and theme
- **DevTools integration** for debugging
- **Optimized re-renders** with selective subscriptions
- **Middleware support** for logging and metrics

## Store Structure

```
src/stores/
├── index.ts                    # Centralized exports & utility hooks
├── userPreferencesStore.ts     # User preferences (persistent)
├── uiStore.ts                  # UI state (modals, toasts, sidebar)
├── notificationStore.ts        # Alert notifications
├── webSocketStore.ts           # WebSocket connection state
├── themeStore.ts               # Theme settings (persistent)
├── cacheStore.ts               # API response caching
└── middleware.ts               # Custom middleware (logging, metrics)
```

## Stores

### 1. User Preferences Store (`userPreferencesStore.ts`)

**Purpose:** Store and manage user-specific settings and preferences.

**Features:**
- Persistent storage via localStorage
- Favorite assets management
- Alert threshold configuration
- Dashboard layout preferences
- Refresh interval settings

**Key State:**
```typescript
interface UserPreferences {
  defaultAsset: string;
  defaultTimeRange: "1h" | "24h" | "7d" | "30d";
  refreshInterval: number;
  notificationsEnabled: boolean;
  sidebarCollapsed: boolean;
  dashboardLayout: "grid" | "list";
  favoriteAssets: string[];
  alertThresholds: {
    priceDeviation: number;
    supplyMismatch: number;
    healthScoreDrop: number;
  };
}
```

**Usage:**
```typescript
import { useUserPreferencesStore, selectFavoriteAssets } from "../stores";

// Basic usage
const sidebarCollapsed = useUserPreferencesStore((state) => state.sidebarCollapsed);

// With selector (optimized)
const favorites = useUserPreferencesStore(selectFavoriteAssets);

// Actions
const { addFavoriteAsset, setPreference } = useUserPreferencesStore();
addFavoriteAsset("USDC");
setPreference("defaultTimeRange", "7d");
```

---

### 2. UI Store (`uiStore.ts`)

**Purpose:** Manage UI state including modals, toasts, sidebar, and loading states.

**Features:**
- Modal management with data passing
- Toast notifications with auto-dismiss
- Sidebar state and view management
- Global loading indicators
- Mobile/touch detection

**Key State:**
```typescript
interface UIState {
  activeModal: ModalType;        // "assetDetails" | "alertSettings" | null
  modalData: Record<string, unknown> | null;
  sidebarOpen: boolean;
  sidebarView: SidebarView;      // "default" | "favorites" | "alerts"
  toasts: Toast[];
  globalLoading: boolean;
  selectedAsset: string | null;
  isMobileView: boolean;
}
```

**Usage:**
```typescript
import { useUIStore, useToast } from "../stores";

// Modal management
const { openModal, closeModal } = useUIStore();
openModal("assetDetails", { symbol: "USDC" });

// Toast notifications
const toast = useToast();
toast("Asset updated successfully", "success", 3000);

// Sidebar
const { toggleSidebar, setSidebarView } = useUIStore();
```

---

### 3. Notification Store (`notificationStore.ts`)

**Purpose:** Manage alert notifications with priority levels and read status.

**Features:**
- Priority-based notifications (critical, high, medium, low)
- Notification types (price_alert, supply_mismatch, etc.)
- Read/unread tracking with counters
- Notification history (last 100)
- Asset-specific and bridge-specific notifications

**Key State:**
```typescript
interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  assetCode?: string;
  bridgeId?: string;
  timestamp: number;
  read: boolean;
  dismissed: boolean;
}
```

**Usage:**
```typescript
import { useNotificationStore, useNotifications } from "../stores";

// Hook approach
const { notify, markAsRead, dismiss } = useNotifications();
notify(
  "Price Deviation Alert",
  "USDC price deviated by 3% from reference",
  "high",
  { type: "price_alert", assetCode: "USDC" }
);

// Direct store access
const unreadCount = useNotificationStore((state) => state.unreadCount);
const criticalCount = useNotificationStore(selectCriticalCount);
```

---

### 4. WebSocket Store (`webSocketStore.ts`)

**Purpose:** Track WebSocket connection state, subscriptions, and messages.

**Features:**
- Connection status tracking (connecting, connected, disconnected, reconnecting)
- Reconnection attempt tracking
- Channel subscription management
- Message history (last 100)
- Error tracking

**Key State:**
```typescript
interface WebSocketState {
  status: WebSocketStatus;
  url: string | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  activeChannels: Set<string>;
  pendingSubscriptions: Set<string>;
  messageHistory: WebSocketMessage[];
  lastMessage: WebSocketMessage | null;
  errors: WebSocketError[];
}
```

**Usage:**
```typescript
import { useWebSocketStore, selectIsConnected } from "../stores";

const isConnected = useWebSocketStore(selectIsConnected);
const activeChannels = useWebSocketStore(selectActiveChannels);

const { setStatus, subscribe, addMessage } = useWebSocketStore();
subscribe("prices");
```

---

### 5. Theme Store (`themeStore.ts`)

**Purpose:** Manage application theme including colors, fonts, and density.

**Features:**
- Light/dark/system mode with auto-detection
- Custom color scheme support
- Font family, size, and line height settings
- UI density (compact, comfortable, spacious)
- Animation preferences
- Custom CSS variables
- Automatic theme application to document

**Key State:**
```typescript
interface ThemeState {
  mode: ThemeMode;               // "light" | "dark" | "system"
  resolvedMode: "light" | "dark";
  colors: ThemeColors;
  font: FontSettings;
  density: "compact" | "comfortable" | "spacious";
  animationsEnabled: boolean;
  reducedMotion: boolean;
}
```

**Usage:**
```typescript
import { useThemeStore, useTheme, selectIsDarkMode } from "../stores";

// Hook approach
const { isDark, toggle } = useTheme();

// Direct store access
const isDarkMode = useThemeStore(selectIsDarkMode);
const { setMode, setPrimaryColor } = useThemeStore();
setMode("dark");
```

---

### 6. Cache Store (`cacheStore.ts`)

**Purpose:** Client-side caching for API responses with TTL support.

**Features:**
- TTL-based cache expiration
- Cache tags for bulk invalidation
- Hit/miss statistics
- Pattern-based invalidation
- Prefetching support
- Background refresh (stale-while-revalidate)

**Key State:**
```typescript
interface CacheState {
  cache: Map<string, CacheEntry<unknown>>;
  hits: number;
  misses: number;
  evictions: number;
  defaultTTL: number;
  maxSize: number;
}
```

**Usage:**
```typescript
import { useCacheStore, createCachedQuery } from "../stores";

// Direct cache operations
const { set, get, invalidateByTag } = useCacheStore();
set("assets", data, 60000, ["assets"]);

// Cached query helper
const fetchAssets = createCachedQuery("assets", api.getAssets, {
  ttl: 30000,
  tags: ["assets"],
  staleWhileRevalidate: true,
});
const data = await fetchAssets();
```

---

## Middleware

### Logger Middleware

Logs state changes to console in development mode:
```typescript
import { logger } from "zustand/middleware";

const useStore = create(
  logger((set, get) => ({ ... }))
);
```

### DevTools Middleware

Redux DevTools integration for debugging:
```typescript
import { devtools } from "zustand/middleware";

const useStore = create(
  devtools((set, get) => ({ ... }), { name: "StoreName" })
);
```

### Custom Middleware

Located in `middleware.ts`:

- **`logger`**: Enhanced logging with action names
- **`stateMetricsMiddleware`**: Track state change performance
- **`errorBoundaryMiddleware`**: Catch and handle errors in actions

---

## Selectors

Selectors are functions that extract specific state slices, enabling optimized re-renders:

```typescript
// Bad: Component re-renders on any state change
const state = useStore();

// Good: Component only re-renders when sidebarOpen changes
const sidebarOpen = useStore((state) => state.sidebarOpen);

// Better: Use pre-defined selectors for consistency
const sidebarOpen = useStore(selectSidebarOpen);
```

### Available Selectors

- `selectUserPreferences` - All user preferences
- `selectAlertThresholds` - Alert threshold settings
- `selectFavoriteAssets` - Favorite assets array
- `selectActiveModal` - Current active modal
- `selectSidebarOpen` - Sidebar open state
- `selectToasts` - Active toast notifications
- `selectNotifications` - Non-dismissed notifications
- `selectUnreadCount` - Unread notification count
- `selectCriticalCount` - Critical notification count
- `selectIsConnected` - WebSocket connection status
- `selectActiveChannels` - Subscribed WebSocket channels
- `selectIsDarkMode` - Dark mode status
- `selectThemeColors` - Current theme colors
- `selectCacheStats` - Cache statistics

---

## Utility Hooks

### useToast()

Display toast notifications:
```typescript
const toast = useToast();
toast("Message", "success", 3000);
```

### useNotifications()

Manage notifications:
```typescript
const { notify, markAsRead, dismiss, clearAll } = useNotifications();
notify("Title", "Message", "high", { assetCode: "USDC" });
```

### useTheme()

Simplified theme management:
```typescript
const { isDark, toggle, setMode } = useTheme();
```

---

## Persistence

Stores marked as persistent automatically sync with localStorage:

- **User Preferences Store** - `bridge-watch-user-preferences`
- **Theme Store** - `bridge-watch-theme`

Non-persistent stores:
- UI Store (transient UI state)
- Notification Store (cleared on refresh)
- WebSocket Store (reconnected on refresh)
- Cache Store (rebuilt on refresh)

---

## Best Practices

### 1. Use Selectors for Performance

```typescript
// Component only re-renders when count changes
const count = useStore((state) => state.count);
```

### 2. Separate State and Actions

```typescript
const count = useStore((state) => state.count);
const increment = useStore((state) => state.increment);
```

### 3. Use Utility Hooks for Common Patterns

```typescript
const toast = useToast();
const { notify } = useNotifications();
```

### 4. Keep Stores Focused

Each store should manage a specific domain:
- User preferences → `userPreferencesStore`
- UI state → `uiStore`
- Notifications → `notificationStore`

### 5. Type Safety

Always use typed selectors and actions:
```typescript
const favorites = useUserPreferencesStore(selectFavoriteAssets);
```

---

## Migration from Existing State

To migrate from existing React state or props:

1. **Identify state that should be global** - used by multiple components
2. **Choose appropriate store** - match the domain
3. **Replace useState with store** - use `useStore(selector)`
4. **Replace prop drilling** - components access store directly

Example migration:
```typescript
// Before
const [sidebarOpen, setSidebarOpen] = useState(true);

// After
const sidebarOpen = useUIStore((state) => state.sidebarOpen);
const toggleSidebar = useUIStore((state) => state.toggleSidebar);
```

---

## Testing

Stores can be tested by mocking Zustand or using the store directly:

```typescript
import { useUIStore } from "../stores";

// Reset store before tests
beforeEach(() => {
  useUIStore.getState().resetUI();
});

// Test actions
it("should open modal", () => {
  useUIStore.getState().openModal("settings");
  expect(useUIStore.getState().activeModal).toBe("settings");
});
```

---

## Troubleshooting

### "Cannot find module 'zustand'"
Run: `npm install zustand` in the frontend directory.

### State not persisting
Check that the store uses `persist` middleware and has a `name` configured.

### Component re-rendering too often
Use specific selectors instead of accessing entire state:
```typescript
// Bad
const state = useStore();

// Good
const specificValue = useStore((state) => state.specificValue);
```

---

## Future Enhancements

- **Time-travel debugging** with Redux DevTools
- **State hydration** from server-side rendering
- **Cross-tab synchronization** for persistent stores
- **State migration** for version updates
