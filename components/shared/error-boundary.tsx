"use client"

import { Component, type ReactNode } from "react"
import { useT } from "@/lib/i18n/client"
import { ErrorCard } from "./error-card"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />
    }
    return this.props.children
  }
}

function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error | null
  onRetry: () => void
}) {
  const t = useT()
  return (
    <ErrorCard
      title={t("error.unexpectedTitle")}
      message={error?.message || t("error.somethingWentWrong")}
      type="UNKNOWN"
      onRetry={onRetry}
    />
  )
}
