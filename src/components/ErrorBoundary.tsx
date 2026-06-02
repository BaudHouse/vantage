import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}
interface State {
  error: Error | null
}

/** Stops one bad render (e.g. a malformed feed payload) from white-screening
 *  the whole product; shows a contained, recoverable fallback instead. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[vantage] render error in ${this.props.label ?? 'app'}:`, error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="errbound">
          <div className="errbound-card">
            <b>⚠ {this.props.label ?? 'This panel'} hit an error</b>
            <p>{this.state.error.message}</p>
            <button onClick={() => this.setState({ error: null })}>retry</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
