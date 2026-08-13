import React, { useState, useEffect, useCallback } from 'react';
import { useApiBase } from '@/hooks/useApiBase';
import SplashScreen from '@/components/splash-screen';

/**
 * SplashWrapper - Shows the Astro Flow splash/loading screen during:
 * 1. Initial page load / refresh
 * 2. OAuth authentication flow (after login/signup redirect)
 * 3. Reconnection / re-authentication
 *
 * The splash screen persists until the app is fully authenticated
 * and the user's account data is loaded.
 */
const SplashWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthorizing, isAuthorized, activeLoginid, connectionStatus } = useApiBase();

    // Track if we've completed initial load
    const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
    const [showSplash, setShowSplash] = useState(true);

    // When auth completes and we have a loginid, hide the splash
    useEffect(() => {
        if (isAuthorized && activeLoginid && !hasCompletedInitialLoad) {
            // Add a small delay for a smooth transition
            const timer = setTimeout(() => {
                setHasCompletedInitialLoad(true);
                setShowSplash(false);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [isAuthorized, activeLoginid, hasCompletedInitialLoad]);

    // Also hide splash if not logged in (user is on public pages)
    // but show it briefly on initial page load
    useEffect(() => {
        if (!isAuthorizing && !hasCompletedInitialLoad) {
            // Not authorizing and no initial load yet - brief splash for page load feel
            const timer = setTimeout(() => {
                setHasCompletedInitialLoad(true);
                setShowSplash(false);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [isAuthorizing, hasCompletedInitialLoad]);

    // Show splash when re-authenticating
    const handleReauth = useCallback(() => {
        if (isAuthorizing && hasCompletedInitialLoad) {
            setShowSplash(true);
            setHasCompletedInitialLoad(false);
        }
    }, [isAuthorizing, hasCompletedInitialLoad]);

    useEffect(() => {
        handleReauth();
    }, [isAuthorizing, handleReauth]);

    if (!showSplash) {
        return <>{children}</>;
    }

    return (
        <>
            <SplashScreen />
            <div style={{ display: 'none' }}>{children}</div>
        </>
    );
};

export default SplashWrapper;
