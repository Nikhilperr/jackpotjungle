import React, { useEffect } from "react";
import { LogOut } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function SignOutDialog({ isOpen, onClose, onConfirm }: Props) {
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
      />

      {/* Sheet / Dialog Container */}
      <div className="relative z-10 w-full bg-card border-t sm:border border-border rounded-t-2xl sm:rounded-2xl p-6 text-center shadow-2xl space-y-5 animate-slide-up sm:animate-scale-in sm:max-w-sm max-h-[90vh] overflow-y-auto mb-0">
        {/* Drag handle for mobile visual hint */}
        <div className="mx-auto w-12 h-1.5 rounded-full bg-muted-foreground/20 sm:hidden -mt-2 mb-2" />

        <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
          <LogOut className="h-7 w-7" />
        </div>

        <div className="space-y-1">
          <h3 className="text-xl font-bold text-foreground">Sign out?</h3>
          <p className="text-sm text-muted-foreground">You really wanna sign out of Jackpot Jungle?</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            onClick={onConfirm}
            className="w-full sm:flex-1 h-12 sm:h-10 text-sm font-semibold rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors shadow-lg shadow-destructive/20 order-1 sm:order-2 flex items-center justify-center gap-1.5"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
          <button
            onClick={onClose}
            className="w-full sm:flex-1 h-12 sm:h-10 text-sm font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-colors order-2 sm:order-1"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
