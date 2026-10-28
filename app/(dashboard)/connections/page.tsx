import { ConnectionTable } from "@/components/connections/connection-table"
import { PageHeader } from "@/components/shared/page-header"

export const dynamic = "force-dynamic"

export default function ConnectionsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        titleKey="page.connections.title"
        descriptionKey="page.connections.description"
      />
      <ConnectionTable />
    </div>
  )
}
