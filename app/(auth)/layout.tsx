import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-sm font-semibold tracking-tight text-text-muted hover:text-text">
        Synthetix Engine
      </Link>
      {children}
    </div>
  );
}
