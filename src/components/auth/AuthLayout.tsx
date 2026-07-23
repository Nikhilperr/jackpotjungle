import { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AuthLayoutProps {
  children: ReactNode;
  mode?: "welcome" | "login" | "signup";
  setMode?: (mode: "welcome" | "login" | "signup") => void;
  hideHeader?: boolean;
}

/**
 * Touch-first auth shell: full-bleed on mobile (no floating website card),
 * desktop keeps the branded split panel.
 *
 * Centered by default. When the Android keyboard opens (html.jj-keyboard-open),
 * content top-aligns so the form stays visible without a black gap.
 */
export function AuthLayout({ children, mode = "login", setMode, hideHeader = false }: AuthLayoutProps) {
  return (
    <div
      className="auth-layout relative flex flex-col w-full h-full min-h-0 bg-background overflow-y-auto overflow-x-hidden safe-pt safe-pb safe-pl safe-pr overscroll-contain"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {/* Absolute children ignore parent padding — offset below status bar / battery icons */}
      <div
        className="absolute right-3 z-20"
        style={{
          top: "max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.35rem), calc(var(--jj-sat, 0px) + 0.35rem))",
        }}
      >
        <ThemeToggle className="shadow-sm border border-border/30 touch-target" />
      </div>

      <div className="auth-layout-inner w-full flex-1 flex flex-col items-center justify-center px-4 py-6 sm:px-6 min-h-0">
        <div
          className={`relative w-full z-10 flex flex-col lg:flex-row lg:bg-card lg:border lg:border-border/60 lg:rounded-[32px] lg:shadow-2xl ${
            hideHeader ? "max-w-md" : "max-w-lg lg:max-w-4xl"
          }`}
        >
          {!hideHeader && (
            <div className="w-1/2 bg-gradient-to-br from-primary via-primary/95 to-accent text-primary-foreground p-12 hidden lg:flex flex-col items-center justify-center text-center relative overflow-hidden rounded-r-[60px] shadow-[8px_0_24px_rgba(0,0,0,0.15)] select-none">
              <div className="relative inline-flex items-center justify-center mb-6">
                <img
                  src="/icons/icon-256.webp"
                  alt="Logo"
                  className="relative h-24 w-24 rounded-3xl shadow-2xl object-cover border border-white/20 bg-background"
                />
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-1.5">
                Jackpot Jungle
                <Sparkles className="h-5.5 w-5.5 text-white" />
              </h1>
              <p className="text-xs text-white/80 font-medium tracking-wide uppercase mt-1">
                Messenger
              </p>

              <div className="mt-12 space-y-4 max-w-[280px] min-h-[140px] flex flex-col items-center justify-center">
                {mode === "login" ? (
                  <>
                    <h2 className="text-2xl font-bold text-white">Hello Friend!</h2>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Register your account details and start your journey with the Jackpot Jungle community.
                    </p>
                    {setMode && (
                      <button
                        type="button"
                        onClick={() => setMode("signup")}
                        className="mt-4 border-2 border-white hover:bg-white hover:text-primary text-white font-bold px-8 py-2.5 rounded-full text-xs uppercase tracking-wider active:scale-95"
                      >
                        Sign Up
                      </button>
                    )}
                  </>
                ) : mode === "signup" ? (
                  <>
                    <h2 className="text-2xl font-bold text-white">Welcome Back!</h2>
                    <p className="text-xs text-white/70 leading-relaxed">
                      To keep connected with your friends and support hosts, please sign in with your account.
                    </p>
                    {setMode && (
                      <button
                        type="button"
                        onClick={() => setMode("login")}
                        className="mt-4 border-2 border-white hover:bg-white hover:text-primary text-white font-bold px-8 py-2.5 rounded-full text-xs uppercase tracking-wider active:scale-95"
                      >
                        Sign In
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-white">Welcome!</h2>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Connect instantly with friends, admins, and support teams. Explore our fast, modern messenger.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          <div
            className={`w-full flex flex-col items-center justify-center py-2 sm:p-6 md:p-12 relative bg-background lg:bg-transparent ${
              hideHeader ? "lg:w-full" : "lg:w-1/2"
            }`}
          >
            {!hideHeader && (
              <div className="text-center select-none flex flex-col items-center mb-6 lg:hidden shrink-0">
                <img
                  src="/icons/icon-256.webp"
                  alt="Logo"
                  className="h-16 w-16 rounded-[20px] shadow-md object-cover border border-border/20 bg-card"
                />
                <h1 className="text-[1.5rem] font-extrabold tracking-tight text-foreground flex items-center justify-center gap-1 mt-2">
                  Jackpot Jungle
                  <Sparkles className="h-4.5 w-4.5 text-primary" />
                </h1>
                <p className="text-xs text-muted-foreground font-medium tracking-wide mt-0.5">
                  Messenger
                </p>
              </div>
            )}

            <div className="w-full flex flex-col items-center max-w-sm mx-auto">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
