import { ReactNode } from "react";

export interface BaseFieldProps {
    /** Unique identifier for the field, used to link label and input */
    id: string;
    /** Name attribute for the form field */
    name: string;
    /** Visible label text */
    label: string;
    /** Optional validation error message */
    error?: string;
    /** Optional help text displayed below the input */
    helperText?: string;
    /** Whether the field is required */
    required?: boolean;
    /** Whether the field is disabled */
    disabled?: boolean;
    /** Whether the field is in a loading state */
    loading?: boolean;
    /** Optional additional CSS classes */
    className?: string;
}

export interface SelectOption {
    value: string | number;
    label: string;
    disabled?: boolean;
}

export interface RadioOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface FormGroupProps extends BaseFieldProps {
    children: ReactNode;
}
