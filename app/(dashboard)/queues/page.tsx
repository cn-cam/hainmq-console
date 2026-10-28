import { Suspense } from "react"
import { QueueTable } from "@/components/queues/queue-table"
import { PageHeader } from "@/components/shared/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export const dynamic = "force-dynamic"

export default function QueuesPage() {
  return (
    <div className="space-y-4">
      <PageHeader titleKey="page.queues.title" descriptionKey="page.queues.description" />
      {/* Suspense boundary required: QueueTable reads useSearchParams */}
      <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-lg" />}>
        <QueueTable />
      </Suspense>
    </div>
  )
}
