import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["nodemailer"],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
