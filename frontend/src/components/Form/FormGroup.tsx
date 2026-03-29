import { FormGroupProps } from "./types";
import { FormLabel } from "./FormLabel";
import { FormError } from "./FormError";
import { FormHelpText } from "./FormHelpText";

/**
 * Layout wrapper that composes FormLabel, the input component, FormHelpText, and FormError.
 * Ensures consistent spacing and accessibility association (aria-describedby).
 */
export function FormGroup({
    children,
    id,
    label,
    error,
    helperText,
    required,
    disabled,
    className = "",
}: FormGroupProps) {
    const helpTextId = `${id}-help`;
    const errorId = `${id}-error`;

    return (
        <div className={`flex flex-col mb-4 ${className}`}>
            <FormLabel htmlFor={id} required={required} disabled={disabled}>
                {label}
            </FormLabel>

            <div className="relative">
                {children}
            </div>

            <FormHelpText id={helpTextId}>{helperText}</FormHelpText>
            <FormError id={errorId}>{error}</FormError>
        </div>
    );
}
