'use client';

import Link from 'next/link';
import { Component, type ReactNode } from 'react';
import { useGame } from '@/lib/game/store';
import { ErrorCard } from './ErrorCard';
import styles from './shell.module.css';

interface State {
  failed: boolean;
}

/**
 * Catches a crash anywhere on the play screen, so the player sees two buttons
 * instead of a blank page. Try again clears what was open on the screen and
 * asks the server for the farm again: the farm itself lives on the server and
 * is not touched. No stack is shown; it goes to the console.
 */
export class PlayBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(error);
  }

  retry = (): void => {
    // Whatever was open when it broke may be what breaks it: start from the farm tab.
    useGame.setState({
      jobs: {},
      acts: {},
      move: null,
      plan: null,
      sow: null,
      build: null,
      summary: null,
      paddockId: null,
      mobId: null,
      tab: 'farm',
      notice: null,
    });
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="main" className={styles.boundary} tabIndex={-1}>
        <ErrorCard
          alert
          title="The farm screen hit a problem"
          actions={
            <>
              <button type="button" className="btn coral" onClick={this.retry}>
                Try again
              </button>
              <Link href="/" className="btn ghost">
                Home page
              </Link>
            </>
          }
        >
          <p>Your farm is kept on the server, so nothing is lost.</p>
          <p className="muted">Try again, or go back to the home page.</p>
        </ErrorCard>
      </main>
    );
  }
}
