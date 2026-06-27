import React from "react";
import { LogOut } from "lucide-react";
import { Drawer } from "vaul";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function SignOutDialog({ isOpen, onClose, onConfirm }: Props) {
  return (
    <>
      {/* Desktop View: Centered dialog */}
      {isOpen && (
        <div className="hidden sm:flex fixed inset-0 z-50 items-center justify-center animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <div className="relative bg-card border border-border w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4 animate-scale-in text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <LogOut className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Sign out?</h3>
              <p className="text-sm text-muted-foreground mt-1">You really wanna sign out of Jackpot Jungle?</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 h-10 text-sm font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 h-10 text-sm font-semibold rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors shadow-lg shadow-destructive/20"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile View: Bottom Action Sheet (Vaul Drawer) */}
      <Drawer.Root open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
        <Drawer.Portal>
          <Drawer.Overlay className="sm:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs" />
          <Drawer.Content className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-card border-t border-border rounded-t-[20px] max-h-[96%] outline-none">
            <div className="mx-auto w-12 h-1.5 rounded-full bg-muted-foreground/20 my-3 shrink-0" />
            <div className="px-6 pb-6 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                <LogOut className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Sign out?</h2>
                <p className="text-sm text-muted-foreground mt-1">You really wanna sign out of Jackpot Jungle?</p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={onConfirm}
                  className="w-full h-11 text-sm font-semibold rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors shadow-lg shadow-destructive/20 flex items-center justify-center gap-1.5"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
                <button
                  onClick={onClose}
                  className="w-full h-11 text-sm font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
