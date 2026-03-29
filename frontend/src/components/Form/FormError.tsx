interface FormErrorProps {
    /** The error message string to display */
    children?: string;
    /** Unique identifier for the error message, used for aria-describedby association */
    id?: string;
    /** Optional additional CSS classes */
    className?: string;
}

/**
 * Error message component that renders only when children are present.
 * Uses role="alert" and aria-live="polite" to ensure screen readers announce errors.
 */
export function FormError({ children, id, className = "" }: FormErrorProps) {
    if (!children) return null;

    return (
        <p
            id={id}
            role="alert"
            aria-live="polite"
            className={`mt-1.5 text-xs text-red-500 font-medium ${className}`}
        >
            {children}
        </p>
    );
}
