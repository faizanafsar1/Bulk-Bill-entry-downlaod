"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="*:border mt-2 justify-center select-none text-xs tracking-tight justify-items-center max-md:gap-2 gap-5 flex *:p-2 *:rounded-lg *:bg-gray-100">
      <Link href="/" className={pathname === "/" ? "font-bold" : ""}>
        Bulk Entry
      </Link>
      <Link href="/gas" className={pathname === "/gas" ? "font-bold" : ""}>
        Gas Bill Scanner
      </Link>
      <Link href="/iesco" className={pathname === "/iesco" ? "font-bold" : ""}>
        IESCO Bill Scanner
      </Link>
      <Link href="/get-gas-bill" className={pathname === "/get-gas-bill" ? "font-bold" : ""}>
        Get Gas Bill
      </Link>
      <Link href="/calculate-amount" className={pathname === "/calculate-amount" ? "font-bold" : ""}>
        Calculate Amount
      </Link>
    </nav>
  );
}
