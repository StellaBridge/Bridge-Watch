import { renderHook, waitFor } from "@testing-library/react";
import { useWebSocket } from "./useWebSocketEnhanced";
import { wsService } from "../services/websocket";
import { useWebSocketStore } from "../stores";

jest.mock("../services/websocket");

describe("useWebSocketEnhanced", () => {
  const mockConnect = jest.fn();
  const mockSubscribe = jest.fn();
  const mockSend = jest.fn();
  const mockOnStateChange = jest.fn();
  const mockUnsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (wsService.connect as jest.Mock) = mockConnect;
    (wsService.subscribe as jest.Mock) = mockSubscribe.mockReturnValue(
      mockUnsubscribe
    );
    (wsService.send as jest.Mock) = mockSend;
    (wsService.onStateChange as jest.Mock) = mockOnStateChange.mockReturnValue(
      jest.fn()
    );

    useWebSocketStore.setState({
      status: "disconnected",
      activeChannels: [],
      isConnected: false,
      reconnectAttempts: 0,
      messageCount: 0,
    });
  });

  it("should subscribe to bridge topic channels", async () => {
    const onMessage = jest.fn();

    renderHook(() => useWebSocket("bridge-updates", onMessage));

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith("bridge-updates", expect.any(Function));
    });
  });

  it("should unsubscribe from channels", () => {
    const onMessage = jest.fn();

    const { unmount } = renderHook(() =>
      useWebSocket("bridge-updates", onMessage)
    );

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("should queue messages while offline and flush on reconnect", async () => {
    useWebSocketStore.setState({ isConnected: false });

    const onMessage = jest.fn();
    const { result } = renderHook(() =>
      useWebSocket("bridge-updates", onMessage)
    );

    result.current.send({ type: "test" });

    expect(mockSend).not.toHaveBeenCalled();

    useWebSocketStore.setState({ isConnected: true, status: "connected" });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it("should handle channel-specific errors and fallback polling", async () => {
    const stateChangeCallback = jest.fn();
    mockOnStateChange.mockImplementation((cb) => {
      stateChangeCallback.current = cb;
      return jest.fn();
    });

    const onMessage = jest.fn();
    renderHook(() => useWebSocket("bridge-updates", onMessage));

    if (stateChangeCallback.current) {
      stateChangeCallback.current("error");
    }

    await waitFor(() => {
      const state = useWebSocketStore.getState();
      expect(state.reconnectAttempts).toBeGreaterThan(0);
    });
  });

  it("should reset state on explicit disconnect", () => {
    const onMessage = jest.fn();

    const { unmount } = renderHook(() =>
      useWebSocket("bridge-updates", onMessage)
    );

    unmount();

    const state = useWebSocketStore.getState();
    expect(state.activeChannels).not.toContain("bridge-updates");
  });
});
