import { ChannelTable } from "@/components/channels/channel-table"
import { PageHeader } from "@/components/shared/page-header"

export const dynamic = "force-dynamic"

export default function ChannelsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        titleKey="page.channels.title"
        descriptionKey="page.channels.description"
      />
      <ChannelTable />
    </div>
  )
}
