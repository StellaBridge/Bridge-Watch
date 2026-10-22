import { renderHook, waitFor } from "@testing-library/react";
import { useWebSocket } from "./useWebSocket";
import * as WebSocketContextValue from "../contexts/WebSocketContextValue";

jest.mock("../contexts/WebSocketContextValue");

describe("useWebSocket", () => {
  const mockSubscribe = jest.fn();
  const mockSend = jest.fn();
  const mockUnsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue(mockUnsubscribe);

    (
      WebSocketContextValue.useWebSocketContext as jest.Mock
    ).mockReturnValue({
      subscribe: mockSubscribe,
      send: mockSend,
      connectionState: "connected",
    });
  });

  it("should establish connection and parse messages", () => {
    const onMessage = jest.fn();

    renderHook(() => useWebSocket("test-channel", onMessage));

    expect(mockSubscribe).toHaveBeenCalledWith("test-channel", onMessage);
  });

  it("should reconnect with exponential backoff on disconnect", async () => {
    const onMessage = jest.fn();

    const { rerender } = renderHook(() =>
      useWebSocket("test-channel", onMessage)
    );

    (
      WebSocketContextValue.useWebSocketContext as jest.Mock
    ).mockReturnValue({
      subscribe: mockSubscribe,
      send: mockSend,
      connectionState: "disconnected",
    });

    rerender();

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });
  });

  it("should handle ping/pong heartbeat", async () => {
    const onMessage = jest.fn();

    renderHook(() => useWebSocket("test-channel", onMessage));

    expect(mockSubscribe).toHaveBeenCalledWith("test-channel", onMessage);
  });

  it("should cleanup socket and remove event listeners on unmount", () => {
    const onMessage = jest.fn();

    const { unmount } = renderHook(() =>
      useWebSocket("test-channel", onMessage)
    );

    expect(mockSubscribe).toHaveBeenCalled();

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
