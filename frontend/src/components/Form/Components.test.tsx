import { render, screen, fireEvent } from "@testing-library/react";
import { Input, Select, Checkbox, RadioGroup } from "./index";
import { describe, it, expect, vi } from "vitest";
import React from "react";

describe("Form Components", () => {
    describe("Input", () => {
        it("renders with correct type and value", () => {
            render(<Input id="in" name="in" label="L" type="password" defaultValue="secret" />);
            const input = screen.getByLabelText("L");
            expect(input).toHaveAttribute("type", "password");
            expect(input).toHaveValue("secret");
        });

        it("forwards ref correctly", () => {
            const ref = React.createRef<HTMLInputElement>();
            render(<Input id="in" name="in" label="L" ref={ref} />);
            expect(ref.current).toBeInstanceOf(HTMLInputElement);
        });

        it("calls onChange when value changes", () => {
            const onChange = vi.fn();
            render(<Input id="in" name="in" label="L" onChange={onChange} />);
            fireEvent.change(screen.getByLabelText("L"), { target: { value: "new" } });
            expect(onChange).toHaveBeenCalled();
        });

        it("shows loading state", () => {
            render(<Input id="in" name="in" label="L" loading />);
            expect(screen.getByLabelText("L")).toBeDisabled();
            // Spinner is div with animate-spin
            expect(document.querySelector(".animate-spin")).toBeInTheDocument();
        });
    });

    describe("Select", () => {
        const options = [
            { value: "1", label: "One" },
            { value: "2", label: "Two", disabled: true },
        ];

        it("renders options correctly", () => {
            render(<Select id="sel" name="sel" label="S" options={options} placeholder="Pick" />);
            expect(screen.getByText("Pick")).toBeInTheDocument();
            expect(screen.getByText("One")).toBeInTheDocument();
            expect(screen.getByText("Two")).toBeDisabled();
        });

        it("calls onChange when selection changes", () => {
            const onChange = vi.fn();
            render(<Select id="sel" name="sel" label="S" options={options} onChange={onChange} />);
            fireEvent.change(screen.getByLabelText("S"), { target: { value: "1" } });
            expect(onChange).toHaveBeenCalled();
        });
    });

    describe("Checkbox", () => {
        it("renders checked state correctly", () => {
            render(<Checkbox id="cb" name="cb" label="C" defaultChecked />);
            expect(screen.getByLabelText("C")).toBeChecked();
        });

        it("calls onChange when clicked", () => {
            const onChange = vi.fn();
            render(<Checkbox id="cb" name="cb" label="C" onChange={onChange} />);
            fireEvent.click(screen.getByLabelText("C"));
            expect(onChange).toHaveBeenCalled();
        });
    });

    describe("RadioGroup", () => {
        const options = [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
        ];

        it("renders all options and handles selection", () => {
            const onChange = vi.fn();
            render(<RadioGroup id="rg" name="rg" label="R" options={options} value="a" onChange={onChange} />);

            expect(screen.getByLabelText("A")).toBeChecked();
            expect(screen.getByLabelText("B")).not.toBeChecked();

            fireEvent.click(screen.getByLabelText("B"));
            expect(onChange).toHaveBeenCalledWith("b");
        });
    });
});
