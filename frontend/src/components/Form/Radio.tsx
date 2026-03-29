import React, { forwardRef } from "react";

export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
    /** Visible label text for the radio button */
    label: string;
}

/**
 * Individual radio button component.
 * Designed to be used within a RadioGroup.
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(
    ({ id, label, disabled, className = "", ...props }, ref) => {
        return (
            <label
                htmlFor={id}
                className={`group flex items-center gap-3 cursor-pointer select-none min-h-[32px]
          ${disabled ? "opacity-60 cursor-not-allowed" : ""} ${className}`}
            >
                <div className="relative flex items-center">
                    <input
                        ref={ref}
                        id={id}
                        type="radio"
                        disabled={disabled}
                        className="peer sr-only"
                        {...props}
                    />
                    <div
                        className="w-5 h-5 rounded-full border border-stellar-border bg-stellar-dark transition-all
              group-hover:border-stellar-text-secondary
              peer-focus-visible:ring-2 peer-focus-visible:ring-stellar-blue/50
              peer-checked:border-stellar-blue peer-checked:border-[6px]"
                    />
                </div>
                <span
                    className={`text-sm font-medium
            ${disabled ? "text-stellar-text-secondary" : "text-stellar-text-primary"}`}
                >
                    {label}
                </span>
            </label>
        );
    }
);

Radio.displayName = "Radio";
