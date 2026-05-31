import type { AnchorHTMLAttributes } from "react";

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: "inline" | "subtle";
};

export function AppLink({ className, variant = "inline", ...props }: AppLinkProps) {
  return <a className={["app-link", `app-link-${variant}`, className].filter(Boolean).join(" ")} {...props} />;
}
