import { renderHook, act } from "@testing-library/react";
import { useField } from "../hooks/useField";
import { describe, it, expect } from "vitest";

describe("useField hook", () => {
    it("manages basic state changes", () => {
        const { result } = renderHook(() => useField({ initialValue: "" }));

        expect(result.current.value).toBe("");
        expect(result.current.touched).toBe(false);

        act(() => {
            result.current.onChange("test");
        });
        expect(result.current.value).toBe("test");

        act(() => {
            result.current.onBlur();
        });
        expect(result.current.touched).toBe(true);
    });

    it("handles validation on change when touched", () => {
        const validate = (val: string) => (val.length < 3 ? "Too short" : null);
        const { result } = renderHook(() => useField({ initialValue: "", validate }));

        act(() => {
            result.current.onChange("a");
        });
        expect(result.current.error).toBeUndefined(); // Not touched yet

        act(() => {
            result.current.onBlur();
        });
        expect(result.current.error).toBe("Too short");

        act(() => {
            result.current.onChange("abc");
        });
        expect(result.current.error).toBeUndefined();
    });

    it("resets state correctly", () => {
        const { result } = renderHook(() => useField({ initialValue: "init" }));

        act(() => {
            result.current.onChange("changed");
            result.current.onBlur();
        });
        expect(result.current.value).toBe("changed");
        expect(result.current.touched).toBe(true);

        act(() => {
            result.current.reset();
        });
        expect(result.current.value).toBe("init");
        expect(result.current.touched).toBe(false);
    });
});
