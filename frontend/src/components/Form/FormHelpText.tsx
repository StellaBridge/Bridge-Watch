interface FormHelpTextProps {
    /** The help text string to display */
    children?: string;
    /** Unique identifier for the help text, used for aria-describedby association */
    id?: string;
    /** Optional additional CSS classes */
    className?: string;
}

/**
 * Help text component for providing additional context to form fields.
 * Renders only when children are present.
 */
export function FormHelpText({ children, id, className = "" }: FormHelpTextProps) {
    if (!children) return null;

    return (
        <p
            id={id}
            className={`mt-1.5 text-xs text-stellar-text-secondary ${className}`}
        >
            {children}
        </p>
    );
}
