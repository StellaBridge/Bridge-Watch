import React, { forwardRef } from "react";
import { BaseFieldProps } from "./types";
import { FormError } from "./FormError";
import { FormHelpText } from "./FormHelpText";

export interface CheckboxProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, keyof BaseFieldProps>,
    BaseFieldProps { }

/**
 * Custom checkbox component with a native hidden input for accessibility.
 * Ensures a minimum touch target size of 44x44px.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
    (
        {
            id,
            name,
            label,
            error,
            helperText,
            required,
            disabled,
            className = "",
            ...props
        },
        ref
    ) => {
        const helpTextId = `${id}-help`;
        const errorId = `${id}-error`;
        const hasError = !!error;

        return (
            <div className={`mb-4 ${className}`}>
                <label
                    htmlFor={id}
                    className={`group flex items-start gap-3 cursor-pointer select-none min-h-[44px] py-2
            ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                    <div className="relative flex items-center mt-0.5">
                        <input
                            ref={ref}
                            id={id}
                            name={name}
                            type="checkbox"
                            required={required}
                            disabled={disabled}
                            className="peer sr-only"
                            aria-invalid={hasError ? "true" : "false"}
                            aria-describedby={`${helpTextId} ${errorId}`}
                            {...props}
                        />
                        <div
                            className={`w-5 h-5 rounded border bg-stellar-dark transition-all
                group-hover:border-stellar-text-secondary
                peer-focus-visible:ring-2 peer-focus-visible:ring-stellar-blue/50
                peer-checked:bg-stellar-blue peer-checked:border-stellar-blue
                ${hasError ? "border-red-500" : "border-stellar-border"}`}
                        >
                            <svg
                                className="w-full h-full text-white opacity-0 peer-checked:opacity-100 transition-opacity p-0.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="3"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span
                            className={`text-sm font-medium leading-tight
                ${disabled ? "text-stellar-text-secondary" : "text-stellar-text-primary"}`}
                        >
                            {label}
                            {required && (
                                <span className="text-red-500 ml-1" aria-hidden="true">
                                    *
                                </span>
                            )}
                        </span>
                        <FormHelpText id={helpTextId}>{helperText}</FormHelpText>
                        <FormError id={errorId}>{error}</FormError>
                    </div>
                </label>
            </div>
        );
    }
);

Checkbox.displayName = "Checkbox";
