import { useCallback, ReactNode } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl";
  closeOnBackdropClick?: boolean;
  closeOnEscapeKey?: boolean;
}

const sizeClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
};

export function Modal({
  isOpen,
  onClose,
  children,
  title,
  ariaLabelledBy,
  ariaDescribedBy,
  size = "md",
  closeOnBackdropClick = true,
  closeOnEscapeKey = true,
}: ModalProps) {
  const contentRef = useFocusTrap({
    isActive: isOpen,
    onEscape: closeOnEscapeKey ? onClose : undefined,
    returnFocusOnDeactivate: true,
  });

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!closeOnBackdropClick) return;
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose, closeOnBackdropClick]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-6 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={contentRef as React.RefObject<HTMLDivElement>}
        className={`relative w-full ${sizeClasses[size]} bg-stellar-card border border-stellar-border rounded-lg shadow-xl`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : (title ?? "Dialog")}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
      >
        {title && !ariaLabelledBy ? (
          <h2 className="sr-only">{title}</h2>
        ) : null}
        {children}
      </div>
    </div>
  );
}
