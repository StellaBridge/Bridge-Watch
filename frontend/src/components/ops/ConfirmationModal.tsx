import React from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmationPhrase?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  open,
  title,
  description,
  confirmationPhrase,
  onCancel,
  onConfirm,
}) => {
  const [input, setInput] = React.useState("");

  const contentRef = useFocusTrap({
    isActive: open,
    onEscape: onCancel,
    returnFocusOnDeactivate: true,
  });

  React.useEffect(() => {
    if (!open) setInput("");
  }, [open]);

  if (!open) return null;

  const phraseRequired = Boolean(confirmationPhrase);
  const canConfirm = phraseRequired ? input === confirmationPhrase : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="presentation">
      <div
        ref={contentRef as React.RefObject<HTMLDivElement>}
        className="w-full max-w-2xl p-6 bg-white dark:bg-slate-800 rounded shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
      >
        <h3 id="confirmation-title" className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
        {description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>}

        {phraseRequired && (
          <div className="mt-4">
            <p className="text-xs text-slate-500">Type <strong className="font-mono">{confirmationPhrase}</strong> to confirm</p>
            <input
              className="mt-2 w-full p-2 border rounded bg-slate-50 dark:bg-slate-700"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={confirmationPhrase}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded text-white ${canConfirm ? "bg-red-600 hover:bg-red-700" : "bg-red-300 cursor-not-allowed"}`}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
