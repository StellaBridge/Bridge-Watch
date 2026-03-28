import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";

describe("Navbar", () => {
  it("opens and closes the mobile navigation drawer", () => {
    render(
      <MemoryRouter>
        <Navbar />
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
