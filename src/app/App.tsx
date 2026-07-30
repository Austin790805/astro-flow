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

/**
 * OAuthCallbackRoute renders the homepage and processes the OAuth callback
 * (Deriv redirects to window.location.origin which is "/").
 * After successful authentication it navigates the user to /bot.
 *
 * This component is a route element, so it has access to useNavigate via
 * react-router-dom's RouterProvider context.
 */
function OAuthCallbackRoute() {
    const [isProcessing, setIsProcessing] = React.useState(true);

    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.has('code')) {
            setIsProcessing(false);
            return;
        }

        const handleCallback = async () => {
            try {
                const authInfo = await handleOAuthCallback(window.location.href, {
                    clientId: process.env.NEXT_PUBLIC_DERIV_APP_ID || '',
                    redirectUri: window.location.origin,
                    scopes: 'trade',
                });

                const { DerivWSAccountsService } = await import('@/services/derivws-accounts.service');
                const accounts = await DerivWSAccountsService.fetchAccountsList(authInfo.access_token);

                if (accounts && accounts.length > 0) {
                    DerivWSAccountsService.storeAccounts(accounts);
                    const firstAccount = accounts[0];
                    localStorage.setItem('active_loginid', firstAccount.account_id);
                    const isDemo =
                        firstAccount.account_id.startsWith('VRT') || firstAccount.account_id.startsWith('VRTC');
                    localStorage.setItem('account_type', isDemo ? 'demo' : 'real');

                    const { api_base } = await import('@/external/bot-skeleton');
                    await api_base.init(true);

                    // Navigate to the trading app after successful authentication
                    window.location.replace('/bot');
                } else {
                    console.error('No accounts returned after authentication');
                }
            } catch (error) {
                console.error('OAuth callback error:', error);
            } finally {
                cleanupUrl(window.location.origin);
                setIsProcessing(false);
            }
        };

        handleCallback();
    }, []);

    if (isProcessing) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0e17' }}>
                <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '18px', marginBottom: '16px' }}>Completing sign in…</div>
                    <div className="homepage__loading-spinner" />
                </div>
            </div>
        );
    }

    return <HomePage />;
}

const router = createBrowserRouter(
    createRoutesFromElements(
        <>
            {/*
             * Homepage / Landing Page — served at root "/".
             * The root route also handles the OAuth callback (code= param).
             * This is a standalone page with its own hero, features, and
             * interactive Login / Sign-up buttons (no app shell / header).
             */}
            <Route path='/' element={<OAuthCallbackRoute />} />

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
             * This prevents "we couldn't find that page" errors from the
             * OAuth callback or any other unexpected URL.
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
