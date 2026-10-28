"use client"

import { useBranding } from "@/lib/branding/client"
import { cn } from "@/lib/utils"

export function BrandingFooter({ className }: { className?: string }) {
  const branding = useBranding()

  return (
    <p className={cn("text-[10px] leading-5 text-muted-foreground/60", className)}>
      <span>{branding.copyright}</span>
      <span className="mx-1.5">·</span>
      <a
        href={branding.licenseUrl}
        target="_blank"
        rel="noreferrer"
        className="transition-colors hover:text-foreground"
      >
        {branding.license}
      </a>
      {branding.attribution ? (
        <>
          <span className="mx-1.5">·</span>
          <a
            href={branding.attributionUrl}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            {branding.attribution}
          </a>
        </>
      ) : null}
    </p>
  )
}
