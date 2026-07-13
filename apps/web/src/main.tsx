import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { App } from './App.js';
import { SubscriptionRequiredError } from './lib/api/client.js';
import { useAuthStore } from './store/auth.store.js';

function handleGlobalError(error: unknown): void {
  if (error instanceof SubscriptionRequiredError) {
    // §7A.4a — org subscription lapsed. Clear auth state and let the router
    // redirect to /subscription-required (the ProtectedRoute guard triggers on logout).
    useAuthStore.getState().logout();
    window.location.replace('/subscription-required');
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error instanceof Error && 'status' in error) {
          const status = (error as { status: number }).status;
          // Never retry on 4xx — they require user/code action, not repetition (§9.0)
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      onError: handleGlobalError,
    },
  },
});

// §7A.4a — also catch 402 surfaced through query (not mutation) failures.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated' && event.query.state.status === 'error') {
    handleGlobalError(event.query.state.error);
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
);
