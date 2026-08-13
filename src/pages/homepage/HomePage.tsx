import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/shared_ui/button';
import { generateOAuthURL } from '@/components/shared';
import { cleanupUrl, handleOAuthCallback } from '@/external/deriv-core';
import './homepage.scss';

// Trading quotes that rotate
const TRADING_QUOTES = [
    '"Cut your losses short. Let your profits run."',
    '"The stock market is a device for transferring money from the impatient to the patient."',
    '"Know what you own and why you own it."',
    '"The best time to plant a tree was 20 years ago. The second best time is now."',
    '"Risk comes from not knowing what you are doing."',
    '"Price is what you pay. Value is what you get."',
    '"Don\'t watch the market closely."',
    '"Be fearful when others are greedy, and greedy when others are fearful."',
];

const HomePage: React.FC = () => {
    const navigate = useNavigate();
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [currentQuote, setCurrentQuote] = useState(0);
    const [quoteFading, setQuoteFading] = useState(false);

    // Handle OAuth callback when Deriv redirects back with ?code= param
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.has('code')) return;

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
                    navigate('/bot', { replace: true });
                } else {
                    console.error('No accounts returned after authentication');
                }
            } catch (error) {
                console.error('OAuth callback error:', error);
            } finally {
                cleanupUrl(window.location.origin);
            }
        };

        handleCallback();
    }, [navigate]);

    // Rotate trading quotes every 4 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setQuoteFading(true);
            setTimeout(() => {
                setCurrentQuote((prev) => (prev + 1) % TRADING_QUOTES.length);
                setQuoteFading(false);
            }, 300);
        }, 4000);

        return () => clearInterval(interval);
    }, []);

    const handleLogin = useCallback(async () => {
        try {
            setIsAuthorizing(true);
            const oauthUrl = await generateOAuthURL();
            if (oauthUrl) {
                window.location.replace(oauthUrl);
            } else {
                console.error('Failed to generate OAuth URL for login');
                setIsAuthorizing(false);
            }
        } catch (error) {
            console.error('Login redirection failed:', error);
            setIsAuthorizing(false);
        }
    }, []);

    const handleSignup = useCallback(async () => {
        try {
            setIsAuthorizing(true);
            const oauthUrl = await generateOAuthURL('registration');
            if (oauthUrl) {
                window.location.replace(oauthUrl);
            } else {
                console.error('Failed to generate OAuth URL for signup');
                setIsAuthorizing(false);
            }
        } catch (error) {
            console.error('Signup redirection failed:', error);
            setIsAuthorizing(false);
        }
    }, []);

    const handleEnterApp = useCallback(() => {
        navigate('/bot');
    }, [navigate]);

    return (
        <div className='homepage'>
            {/* Dark background */}
            <div className='homepage__bg' aria-hidden='true' />

            {/* Hero Section */}
            <section className='homepage__hero'>
                <div className='homepage__hero-inner'>
                    {/* Brand Logo */}
                    <div className='homepage__brand'>
                        <span className='homepage__brand-text'>
                            <span className='homepage__brand-astro'>ASTRO</span>{' '}
                            <span className='homepage__brand-flow'>FLOW</span>
                        </span>
                    </div>

                    {/* Main Content */}
                    <div className='homepage__hero-content'>
                        <h1 className='homepage__hero-title'>
                            LET'S PRINT SOME DOLLARS 💵💰
                        </h1>

                        {/* Rotating Quote */}
                        <div className='homepage__quote-container'>
                            <p className={`homepage__quote ${quoteFading ? 'homepage__quote--fading' : ''}`}>
                                {TRADING_QUOTES[currentQuote]}
                            </p>
                        </div>

                        {/* CTA Buttons */}
                        <div className='homepage__hero-actions'>
                            <button className='homepage__btn homepage__btn--login' onClick={handleLogin} disabled={isAuthorizing}>
                                {isAuthorizing ? 'Connecting...' : 'Log In'}
                            </button>
                            <button className='homepage__btn homepage__btn--signup' onClick={handleSignup} disabled={isAuthorizing}>
                                {isAuthorizing ? 'Connecting...' : 'Sign Up'}
                            </button>
                        </div>

                        {/* Quick Actions */}
                        <div className='homepage__quick-actions'>
                            <div className='homepage__quick-action'>
                                <div className='homepage__quick-action-icon'>📁</div>
                                <span className='homepage__quick-action-label'>Upload Bot</span>
                            </div>
                            <div className='homepage__quick-action'>
                                <div className='homepage__quick-action-icon'>🤖</div>
                                <span className='homepage__quick-action-label'>Free Bots</span>
                            </div>
                            <div className='homepage__quick-action'>
                                <div className='homepage__quick-action-icon'>🧩</div>
                                <span className='homepage__quick-action-label'>Bot Editor</span>
                            </div>
                            <div className='homepage__quick-action'>
                                <div className='homepage__quick-action-icon'>⚡</div>
                                <span className='homepage__quick-action-label'>Quick Strategy</span>
                            </div>
                        </div>

                        {/* Bottom link */}
                        <div className='homepage__enter-app'>
                            <button className='homepage__enter-link' onClick={handleEnterApp}>
                                Enter Trading App →
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default HomePage;
