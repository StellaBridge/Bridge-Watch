import { render, screen } from "@testing-library/react";
import { FormLabel, FormError, FormHelpText, FormGroup } from "./index";
import { describe, it, expect } from "vitest";

describe("Form Primitives", () => {
    describe("FormLabel", () => {
        it("renders label text correctly", () => {
            render(<FormLabel htmlFor="test">Test Label</FormLabel>);
            expect(screen.getByText("Test Label")).toBeInTheDocument();
        });

        it("renders required indicator when required is true", () => {
            render(<FormLabel htmlFor="test" required>Required Label</FormLabel>);
            expect(screen.getByText("*")).toBeInTheDocument();
        });

        it("does not render required indicator when required is false", () => {
            render(<FormLabel htmlFor="test">Normal Label</FormLabel>);
            expect(screen.queryByText("*")).not.toBeInTheDocument();
        });

        it("applies correct htmlFor attribute", () => {
            render(<FormLabel htmlFor="test-input">Label</FormLabel>);
            expect(screen.getByText("Label")).toHaveAttribute("for", "test-input");
        });
    });

    describe("FormError", () => {
        it("renders error text when provided", () => {
            render(<FormError>Error message</FormError>);
            expect(screen.getByText("Error message")).toBeInTheDocument();
        });

        it("returns null when no error text provided", () => {
            const { container } = render(<FormError>{undefined}</FormError>);
            expect(container.firstChild).toBeNull();
        });

        it("has correct accessibility attributes", () => {
            render(<FormError id="err">Error</FormError>);
            const error = screen.getByText("Error");
            expect(error).toHaveAttribute("id", "err");
            expect(error).toHaveAttribute("role", "alert");
            expect(error).toHaveAttribute("aria-live", "polite");
        });
    });

    describe("FormHelpText", () => {
        it("renders help text when provided", () => {
            render(<FormHelpText>Help message</FormHelpText>);
            expect(screen.getByText("Help message")).toBeInTheDocument();
        });

        it("returns null when no help text provided", () => {
            const { container } = render(<FormHelpText>{undefined}</FormHelpText>);
            expect(container.firstChild).toBeNull();
        });
    });

    describe("FormGroup", () => {
        it("renders label and children in correct order", () => {
            render(
                <FormGroup id="test" label="My Label">
                    <input id="test" />
                </FormGroup>
            );
            expect(screen.getByText("My Label")).toBeInTheDocument();
            expect(screen.getByRole("textbox")).toBeInTheDocument();
        });

        it("renders help text and error when provided", () => {
            render(
                <FormGroup
                    id="test"
                    label="Label"
                    helperText="Helper"
                    error="Error"
                >
                    <input id="test" />
                </FormGroup>
            );
            expect(screen.getByText("Helper")).toBeInTheDocument();
            expect(screen.getByText("Error")).toBeInTheDocument();
        });
    });
});
