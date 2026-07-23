import { ReactNode } from "react";

interface AuthCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function AuthCard({ children, className = "" }: AuthCardProps) {
  return (
    <div className={`w-full ${className}`}>
      {children}
    </div>
  );
}
