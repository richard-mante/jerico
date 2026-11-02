import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

const baseClassName = "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#d9f36a] px-5 py-3 text-sm font-semibold text-[#15190b] no-underline transition hover:bg-[#e4fa8a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9f36a] disabled:pointer-events-none disabled:opacity-50";

type ButtonElementProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };
type LinkElementProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode };

export function Button(props: ButtonElementProps | LinkElementProps) {
  if ("href" in props) {
    const { className = "", ...rest } = props;
    return <a className={`${baseClassName} ${className}`} {...rest} />;
  }

  const { className = "", ...rest } = props;
  return <button className={`${baseClassName} ${className}`} {...rest} />;
}
