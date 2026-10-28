"use client"

import * as React from "react"
import type { Branding } from "@/lib/branding"

const BrandingContext = React.createContext<Branding | null>(null)

export function BrandingProvider({
  branding,
  children,
}: {
  branding: Branding
  children: React.ReactNode
}) {
  return (
    <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
  )
}

export function useBranding(): Branding {
  const context = React.useContext(BrandingContext)
  if (!context) {
    throw new Error("useBranding must be used within BrandingProvider")
  }
  return context
}
