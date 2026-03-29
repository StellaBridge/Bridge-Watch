import React, { forwardRef } from "react";
import { BaseFieldProps, SelectOption } from "./types";
import { FormGroup } from "./FormGroup";

export interface SelectProps
    extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, keyof BaseFieldProps>,
    BaseFieldProps {
    /** Array of options to display in the dropdown */
    options: SelectOption[];
    /** Optional placeholder text shown as the first, disabled option */
    placeholder?: string;
}

/**
 * Accessible select dropdown component.
 * Forwards its ref to the underlying native select element.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
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
            options,
            placeholder,
            ...props
        },
        ref
    ) => {
        const helpTextId = `${id}-help`;
        const errorId = `${id}-error`;
        const hasError = !!error;

        const selectElement = (
            <div className="relative">
                <select
                    ref={ref}
                    id={id}
                    name={name}
                    required={required}
                    disabled={disabled || loading}
                    aria-invalid={hasError ? "true" : "false"}
                    aria-describedby={`${helpTextId} ${errorId}`}
                    className={`w-full bg-stellar-dark border rounded-md px-3 py-2 text-sm text-white appearance-none transition-all focus:outline-none focus:ring-2
            ${hasError ? "border-red-500 focus:ring-red-500/50" : "border-stellar-border focus:ring-stellar-blue/50"}
            ${disabled || loading ? "opacity-60 cursor-not-allowed bg-opacity-50" : "hover:border-stellar-text-secondary"}
            ${className}`}
                    {...props}
                >
                    {placeholder && (
                        <option value="" disabled>
                            {placeholder}
                        </option>
                    )}
                    {options.map((option) => (
                        <option key={option.value} value={option.value} disabled={option.disabled}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {loading ? (
                        <div className="w-4 h-4 border-2 border-stellar-blue border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <svg
                            className="w-4 h-4 text-stellar-text-secondary"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    )}
                </div>
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
                {selectElement}
            </FormGroup>
        );
    }
);

Select.displayName = "Select";
