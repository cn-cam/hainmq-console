import type { Metadata } from "next"
import localFont from "next/font/local"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { getBranding } from "@/lib/branding"
import { BrandingProvider } from "@/lib/branding/client"
import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { translate } from "@/lib/i18n/translate"
import "./globals.css"

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
})

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
})

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const branding = getBranding()
  return {
    title: `${branding.name} · ${branding.productName}`,
    description: translate(locale, "app.description"),
    applicationName: branding.name,
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const branding = getBranding()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans grain`}
      >
        <ThemeProvider>
          <BrandingProvider branding={branding}>
            <I18nProvider initialLocale={locale}>
              {children}
              <Toaster />
            </I18nProvider>
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
