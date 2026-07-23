import React, { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function SignOutDialog({ isOpen, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setBusy(false); // Reset busy state when opening
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(onConfirm()).catch(() => {
      setBusy(false);
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
      />

      {/* Dialog Container */}
      <div className="relative z-10 w-full max-w-[320px] bg-card border border-border rounded-2xl p-6 text-center shadow-2xl space-y-4 animate-scale-in max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground hover:bg-secondary/50 p-1.5 rounded-full transition-colors cursor-pointer"
          aria-label="Close"
          disabled={busy}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Character Image */}
        <div className="flex justify-center pt-2 select-none pointer-events-none">
          <img 
            src="/signout.png" 
            alt="Sad character" 
            className="w-28 h-auto object-contain select-none max-h-32"
          />
        </div>

        {/* Message */}
        <div className="space-y-1 select-none">
          <h3 className="text-lg font-bold text-foreground">Leaving already?!</h3>
          <p className="text-xs text-muted-foreground">We'll be here when you come back ❤️</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5 pt-2">
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 h-10 text-xs font-semibold rounded-xl bg-transparent border border-border text-foreground hover:bg-secondary/40 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
            Logout
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 h-10 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
          >
            Stay
          </button>
        </div>
      </div>
    </div>
  );
}
