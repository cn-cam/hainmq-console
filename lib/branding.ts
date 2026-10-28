export interface Branding {
  name: string
  productName: string
  copyright: string
  license: string
  licenseUrl: string
  attribution: string
  attributionUrl: string
  logoUrl: string
}

export function getBranding(): Branding {
  const year = new Date().getFullYear()

  return {
    name: process.env.APP_NAME?.trim() || "海心云",
    productName: process.env.APP_PRODUCT_NAME?.trim() || "MQ 管理台",
    copyright: process.env.APP_COPYRIGHT?.trim() || `© ${year} 海心云`,
    license: process.env.APP_LICENSE?.trim() || "MIT",
    licenseUrl:
      process.env.APP_LICENSE_URL?.trim() ||
      "https://github.com/cn-cam/hainmq-console/blob/main/LICENSE",
    attribution:
      process.env.APP_ATTRIBUTION?.trim() || "Based on RabbitScout (MIT)",
    attributionUrl:
      process.env.APP_ATTRIBUTION_URL?.trim() ||
      "https://github.com/Ralve-org/RabbitScout",
    logoUrl:
      process.env.APP_LOGO_URL === undefined
        ? ""
        : process.env.APP_LOGO_URL.trim(),
  }
}
