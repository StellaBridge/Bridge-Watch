import React from "react";

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
    /** The text to display in the label */
    children: React.ReactNode;
    /** Whether the field is required, which will render a required indicator */
    required?: boolean;
    /** Whether the field is disabled, affecting label styling */
    disabled?: boolean;
}

/**
 * Accessible label component for form fields.
 * Links to the associated input via the `htmlFor` prop, which must match the input's `id`.
 */
export function FormLabel({
    children,
    required,
    disabled,
    className = "",
    ...props
}: FormLabelProps) {
    return (
        <label
            className={`block text-sm font-medium mb-1.5 transition-colors
        ${disabled ? "text-stellar-text-secondary opacity-60 cursor-not-allowed" : "text-stellar-text-primary"}
        ${className}`}
            {...props}
        >
            {children}
            {required && (
                <span className="text-red-500 ml-1" aria-hidden="true">
                    *
                </span>
            )}
        </label>
    );
}
