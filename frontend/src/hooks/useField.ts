import { useState, useCallback } from "react";

export interface UseFieldProps<T> {
    /** Initial value of the field */
    initialValue: T;
    /** Optional validation function that returns an error message or null */
    validate?: (value: T) => string | null;
}

/**
 * Minimal hook for managing form field state and validation.
 * Used when no external form library (like React Hook Form or Formik) is present.
 */
export function useField<T>({ initialValue, validate }: UseFieldProps<T>) {
    const [value, setValue] = useState<T>(initialValue);
    const [error, setError] = useState<string | undefined>(undefined);
    const [touched, setTouched] = useState(false);

    const onChange = useCallback(
        (newValue: T) => {
            setValue(newValue);
            if (touched && validate) {
                const validationError = validate(newValue);
                setError(validationError || undefined);
            }
        },
        [touched, validate]
    );

    const onBlur = useCallback(() => {
        setTouched(true);
        if (validate) {
            const validationError = validate(value);
            setError(validationError || undefined);
        }
    }, [validate, value]);

    const reset = useCallback(() => {
        setValue(initialValue);
        setError(undefined);
        setTouched(false);
    }, [initialValue]);

    return {
        value,
        error,
        touched,
        onChange,
        onBlur,
        reset,
        setValue,
        setError,
    };
}
