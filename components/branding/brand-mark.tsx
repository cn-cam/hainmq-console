"use client"

import Image from "next/image"
import { useBranding } from "@/lib/branding/client"
import { cn } from "@/lib/utils"

export function BrandMark({
  size = 32,
  className,
  priority = false,
}: {
  size?: number
  className?: string
  priority?: boolean
}) {
  const branding = useBranding()

  if (branding.logoUrl) {
    return (
      <Image
        src={branding.logoUrl}
        alt={branding.name}
        width={size}
        height={size}
        priority={priority}
        className={cn("rounded-lg object-contain", className)}
      />
    )
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60 font-semibold text-primary-foreground",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.4) }}
      aria-hidden="true"
    >
      {branding.name.slice(0, 1)}
    </div>
  )
}
