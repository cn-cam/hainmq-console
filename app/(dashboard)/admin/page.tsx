import packageJson from "@/package.json"
import { AdminPage } from "@/components/admin/admin-page"

export const dynamic = "force-dynamic"

export default function AdminRoute() {
  return <AdminPage version={packageJson.version} />
}
