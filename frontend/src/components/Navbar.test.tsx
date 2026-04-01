import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationProvider } from "../context/NotificationContext";
import { WebSocketProvider } from "../contexts/WebSocketContext";
import ThemeProvider from "../theme/ThemeProvider";
import Navbar from "./Navbar";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe("Navbar", () => {
  it("opens and closes the mobile navigation drawer", () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <WebSocketProvider>
              <NotificationProvider>
                <Navbar />
              </NotificationProvider>
            </WebSocketProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    const openButton = screen.getByRole("button", {
      name: /open navigation menu/i,
    });

    fireEvent.click(openButton);
    expect(
      screen.getByRole("dialog", { name: /mobile navigation/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/control surface/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close mobile menu/i }));
    expect(
      screen.getByRole("button", { name: /open navigation menu/i })
    ).toBeInTheDocument();
  });
});
