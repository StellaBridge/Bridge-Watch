import React, { forwardRef } from "react";
import { BaseFieldProps } from "./types";
import { FormGroup } from "./FormGroup";

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, keyof BaseFieldProps>,
    BaseFieldProps {
    /** The type of input element (text, password, email, etc.) */
    type?: "text" | "number" | "email" | "password" | "tel" | "url" | "search";
}

/**
 * Reusable input component with support for labels, help text, errors, and loading states.
 * Forwards its ref to the underlying native input element.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
    (
        {
            id,
            name,
            label,
            error,
            helperText,
            required,
            disabled,
            loading,
            className = "",
            type = "text",
            ...props
        },
        ref
    ) => {
        const helpTextId = `${id}-help`;
        const errorId = `${id}-error`;
        const hasError = !!error;

        const inputElement = (
            <div className="relative">
                <input
                    ref={ref}
                    id={id}
                    name={name}
                    type={type}
                    required={required}
                    disabled={disabled || loading}
                    aria-invalid={hasError ? "true" : "false"}
                    aria-describedby={`${helpTextId} ${errorId}`}
                    className={`w-full bg-stellar-dark border rounded-md px-3 py-2 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-stellar-blue
            ${hasError ? "border-red-500 focus:ring-red-500/50" : "border-stellar-border focus:ring-stellar-blue/50"}
            ${disabled || loading ? "opacity-60 cursor-not-allowed bg-opacity-50" : "hover:border-stellar-text-secondary"}
            ${className}`}
                    {...props}
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-stellar-blue border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>
        );

        return (
            <FormGroup
                id={id}
                name={name}
                label={label}
                error={error}
                helperText={helperText}
                required={required}
                disabled={disabled}
            >
                {inputElement}
            </FormGroup>
        );
    }
);

Input.displayName = "Input";
