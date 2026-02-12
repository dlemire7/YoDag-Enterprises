import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error('[ErrorBoundary] Caught error:', error.message)
    console.error('[ErrorBoundary] Component stack:', errorInfo?.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false })
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false })
    window.location.hash = '#/catalog'
  }

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }))
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <span className="error-boundary__icon">!</span>
          <h3 className="error-boundary__title">Something went wrong</h3>
          <p className="error-boundary__message">
            {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
          </p>
          <div className="error-boundary__actions">
            <button className="error-boundary__retry" onClick={this.handleRetry}>
              Try Again
            </button>
            <button className="error-boundary__home" onClick={this.handleGoHome}>
              Go Home
            </button>
          </div>
          {this.state.errorInfo && (
            <>
              <button className="error-boundary__details-toggle" onClick={this.toggleDetails}>
                {this.state.showDetails ? 'Hide Details' : 'Show Details'}
              </button>
              {this.state.showDetails && (
                <pre className="error-boundary__stack">
                  {this.state.error?.stack}
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
