import { lazy, Suspense } from 'react';
import React from 'react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, Navigate } from 'react-router-dom';
import { cleanupUrl, handleOAuthCallback } from '@/external/deriv-core';
import ChunkLoader from '@/components/loader/chunk-loader';
import LocalStorageSyncWrapper from '@/components/localStorage-sync-wrapper';
import RoutePromptDialog from '@/components/route-prompt-dialog';
import { useAccountSwitching } from '@/hooks/useAccountSwitching';
import { useLanguageFromURL } from '@/hooks/useLanguageFromURL';
import { StoreProvider } from '@/hooks/useStore';
import { isPreviewMode, PREVIEW_BASE_PATH } from '@/utils/is-preview-mode';
import { localize, TranslationProvider } from '@deriv-com/translations';
import CoreStoreProvider from './CoreStoreProvider';
import i18nInstance from './i18n';
import './app-root.scss';

const Layout = lazy(() => import('../components/layout'));
const AppRoot = lazy(() => import('./app-root'));
const HomePage = lazy(() => import('../pages/homepage'));

/**
 * Component wrapper to handle language URL parameter
 * Uses the useLanguageFromURL hook to process language switching
 */
const LanguageHandler = ({ children }: { children: React.ReactNode }) => {
    useLanguageFromURL();
    return <>{children}</>;
};

// The static preview build is served under /bot/preview (see rsbuild.config.ts
// assetPrefix), so React Router must resolve routes under that prefix. Standalone
// partner deploys are served at the root, so no basename there.
const routerBasename = isPreviewMode() ? PREVIEW_BASE_PATH : undefined;

const router = createBrowserRouter(
    createRoutesFromElements(
        <>
            {/*
             * Homepage / Landing Page — served at root "/".
             * This is a standalone page with its own hero, features, and
             * interactive Login / Sign-up buttons (no app shell / header).
             *
             * When Deriv's OAuth callback returns (with ?code= param),
             * the callback is handled by the HomePage component via its
             * own useEffect (since it's a route element inside RouterProvider).
             */}
            <Route path='/' element={<HomePage />} />

            {/*
             * Main Trading App — served at "/bot" and below.
             * All existing app routes live under the Layout wrapper.
             */}
            <Route
                path='/bot/*'
                element={
                    <Suspense
                        fallback={<ChunkLoader message={localize('Please wait while we connect to the server...')} />}
                    >
                        <TranslationProvider defaultLang='EN' i18nInstance={i18nInstance}>
                            <LanguageHandler>
                                <StoreProvider>
                                    <LocalStorageSyncWrapper>
                                        <RoutePromptDialog />
                                        <CoreStoreProvider>
                                            <Layout />
                                        </CoreStoreProvider>
                                    </LocalStorageSyncWrapper>
                                </StoreProvider>
                            </LanguageHandler>
                        </TranslationProvider>
                    </Suspense>
                }
            >
                {/* All child routes will be passed as children to Layout */}
                <Route index element={<AppRoot />} />
                {/* App Builder embeds the template at /preview — render the same app shell */}
                <Route path='preview' element={<AppRoot />} />
            </Route>

            {/*
             * Catch-all: any unmatched route redirects to the homepage.
             * This prevents "we couldn't find that page" errors.
             */}
            <Route path='*' element={<Navigate to='/' replace />} />
        </>
    ),
    { basename: routerBasename }
);

/**
 * Main App component
 *
 * Responsibilities:
 * 1. OAuth callback handling (via vendored deriv-core handleOAuthCallback)
 * 2. Account switching from URL (via useAccountSwitching hook)
 * 3. Router provider setup
 */
function App() {
    // Handle account switching via URL parameter
    useAccountSwitching();

    return <RouterProvider router={router} />;
}

export default App;
