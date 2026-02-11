import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
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
          <button className="error-boundary__retry" onClick={this.handleRetry}>
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
