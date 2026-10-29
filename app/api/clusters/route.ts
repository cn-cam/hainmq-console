import { NextResponse } from "next/server"
import { getDefaultCluster, listClusters, toClusterSummary } from "@/lib/rabbitmq/clusters"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({
    clusters: listClusters().map(toClusterSummary),
    defaultId: getDefaultCluster().id,
  })
}
