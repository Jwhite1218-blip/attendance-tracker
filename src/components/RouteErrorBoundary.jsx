import { Component } from 'react'

// Keeps one broken page from taking the whole app down.
//
// Without this, a single render error anywhere in a route empties the entire
// document — nav included — and a kitchen sees a white screen with no way
// back. The nav stays outside this boundary, so a failing page leaves every
// other page reachable.
//
// The message shows what actually went wrong rather than a shrug: whoever hits
// it is far more likely to be a manager on the phone to Jon than a developer,
// and "Dashboard — Cannot read properties of undefined" is the difference
// between a five-minute fix and an afternoon.
export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Netlify collects nothing client-side, so the console is where this lands.
    console.error('Route render failed', { message: error?.message, stack: info?.componentStack })
  }

  componentDidUpdate(previousProps) {
    // Navigating away clears the failure, so one bad page is not sticky.
    if (previousProps.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl border border-red-300 bg-red-50 p-6">
          <h1 className="text-lg font-bold text-red-900">This page could not be displayed</h1>
          <p className="mt-2 text-sm text-red-800">
            Nothing you entered has been lost, and the rest of the site still works — use the
            menu above to carry on. Please tell Jon what you were doing when this appeared.
          </p>
          <p className="mt-4 rounded-lg border border-red-200 bg-white px-3 py-2 font-mono text-xs text-red-700">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
          >
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}
