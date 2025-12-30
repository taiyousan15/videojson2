import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`border rounded-lg p-4 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
