import { ExchangeTable } from "@/components/exchanges/exchange-table"
import { PageHeader } from "@/components/shared/page-header"

export const dynamic = "force-dynamic"

export default function ExchangesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        titleKey="page.exchanges.title"
        descriptionKey="page.exchanges.description"
      />
      <ExchangeTable />
    </div>
  )
}
