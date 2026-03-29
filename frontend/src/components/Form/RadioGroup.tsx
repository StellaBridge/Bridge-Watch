import React from "react";
import { BaseFieldProps, RadioOption } from "./types";
import { FormLabel } from "./FormLabel";
import { FormError } from "./FormError";
import { FormHelpText } from "./FormHelpText";
import { Radio } from "./Radio";

export interface RadioGroupProps extends BaseFieldProps {
    /** Array of options to display as radio buttons */
    options: RadioOption[];
    /** Current value of the radio group */
    value?: string;
    /** Callback triggered when the selected value changes */
    onChange?: (value: string) => void;
    /** Layout direction of the radio buttons */
    direction?: "horizontal" | "vertical";
}

/**
 * Accessible radio group component.
 * Uses role="radiogroup" and manages grouping of children.
 */
export function RadioGroup({
    id,
    name,
    label,
    error,
    helperText,
    required,
    disabled,
    className = "",
    options,
    value,
    onChange,
    direction = "vertical",
}: RadioGroupProps) {
    const helpTextId = `${id}-help`;
    const errorId = `${id}-error`;
    const labelId = `${id}-label`;

    return (
        <div
            role="radiogroup"
            aria-labelledby={labelId}
            className={`mb-4 ${className}`}
        >
            <FormLabel id={labelId} required={required} disabled={disabled}>
                {label}
            </FormLabel>

            <div
                className={`flex ${direction === "horizontal" ? "flex-row flex-wrap gap-6" : "flex-col gap-3"}`}
            >
                {options.map((option) => (
                    <Radio
                        key={option.value}
                        id={`${id}-${option.value}`}
                        name={name}
                        value={option.value}
                        checked={value === option.value}
                        disabled={disabled || option.disabled}
                        onChange={(e) => onChange?.(e.target.value)}
                        label={option.label}
                    />
                ))}
            </div>

            <FormHelpText id={helpTextId}>{helperText}</FormHelpText>
            <FormError id={errorId}>{error}</FormError>
        </div>
    );
}
