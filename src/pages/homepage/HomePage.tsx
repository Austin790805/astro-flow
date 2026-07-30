import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/shared_ui/button';
import { generateOAuthURL } from '@/components/shared';
import './homepage.scss';

/**
 * Interactive Homepage / Landing Page for Astro Flow (Deriv Bot).
 *
 * Provides an engaging entry point with:
 * - Hero section with animated starfield background
 * - Feature highlights
 * - Login and Sign-up buttons that trigger the Deriv OAuth flow
 */
const HomePage: React.FC = () => {
    const navigate = useNavigate();
    const [isAuthorizing, setIsAuthorizing] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 60);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
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
            {/* Starfield background */}
            <div className='homepage__starfield' aria-hidden='true'>
                <div className='starfield__layer starfield__layer--1' />
                <div className='starfield__layer starfield__layer--2' />
                <div className='starfield__layer starfield__layer--3' />
            </div>

            {/* Floating navbar */}
            <nav className={`homepage__navbar ${isScrolled ? 'homepage__navbar--scrolled' : ''}`}>
                <div className='homepage__navbar-inner'>
                    <div className='homepage__navbar-brand'>
                        <svg className='homepage__navbar-logo' viewBox='0 0 40 40' width='32' height='32'>
                            <defs>
                                <linearGradient id='logoGrad' x1='0' y1='0' x2='1' y2='1'>
                                    <stop offset='0%' stopColor='#6c5ce7' />
                                    <stop offset='100%' stopColor='#a29bfe' />
                                </linearGradient>
                            </defs>
                            <circle cx='20' cy='20' r='18' fill='url(#logoGrad)' />
                            <path
                                d='M14 26 L20 12 L26 26 M16 22 L24 22'
                                stroke='white'
                                strokeWidth='2.5'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                fill='none'
                            />
                        </svg>
                        <span className='homepage__navbar-title'>Astro Flow</span>
                    </div>
                    <div className='homepage__navbar-actions'>
                        <Button
                            tertiary
                            is_loading={isAuthorizing}
                            onClick={handleLogin}
                            className='homepage__nav-btn homepage__nav-btn--login'
                        >
                            Log in
                        </Button>
                        <Button
                            primary
                            is_loading={isAuthorizing}
                            onClick={handleSignup}
                            className='homepage__nav-btn homepage__nav-btn--signup'
                        >
                            Sign up
                        </Button>
                    </div>
                </div>
            </nav>

            {/* Hero section */}
            <section className='homepage__hero'>
                <div className='homepage__hero-content'>
                    <div className='homepage__hero-badge'>
                        <span className='homepage__hero-badge-dot' />
                        <span>Automated Trading Platform</span>
                    </div>
                    <h1 className='homepage__hero-title'>
                        Build. Automate.{' '}
                        <span className='homepage__hero-title-gradient'>Profit.</span>
                    </h1>
                    <p className='homepage__hero-subtitle'>
                        Create powerful trading bots with our drag-and-drop builder.
                        No coding required — just connect blocks, set your strategy,
                        and let Astro Flow trade for you around the clock.
                    </p>
                    <div className='homepage__hero-actions'>
                        <Button
                            primary
                            large
                            onClick={handleSignup}
                            className='homepage__cta-btn homepage__cta-btn--primary'
                            is_loading={isAuthorizing}
                        >
                            Get Started Free
                        </Button>
                        <Button
                            tertiary
                            large
                            onClick={handleLogin}
                            className='homepage__cta-btn homepage__cta-btn--secondary'
                            is_loading={isAuthorizing}
                        >
                            Log In
                        </Button>
                    </div>
                    <div className='homepage__hero-stats'>
                        <div className='homepage__stat'>
                            <span className='homepage__stat-number'>24/7</span>
                            <span className='homepage__stat-label'>Automated Trading</span>
                        </div>
                        <div className='homepage__stat-divider' />
                        <div className='homepage__stat'>
                            <span className='homepage__stat-number'>100+</span>
                            <span className='homepage__stat-label'>Assets to Trade</span>
                        </div>
                        <div className='homepage__stat-divider' />
                        <div className='homepage__stat'>
                            <span className='homepage__stat-number'>Zero</span>
                            <span className='homepage__stat-label'>Coding Required</span>
                        </div>
                    </div>
                </div>
                <div className='homepage__hero-visual'>
                    <div className='homepage__visual-orb homepage__visual-orb--1' />
                    <div className='homepage__visual-orb homepage__visual-orb--2' />
                    <div className='homepage__visual-card'>
                        <div className='visual-card__header'>
                            <div className='visual-card__dots'>
                                <span className='visual-card__dot visual-card__dot--red' />
                                <span className='visual-card__dot visual-card__dot--yellow' />
                                <span className='visual-card__dot visual-card__dot--green' />
                            </div>
                            <span className='visual-card__title'>Bot Builder</span>
                        </div>
                        <div className='visual-card__body'>
                            <div className='visual-block visual-block--purple'>
                                <span className='visual-block__icon'>▸</span>
                                <span>Purchase RISE</span>
                            </div>
                            <div className='visual-block-connector' />
                            <div className='visual-block visual-block--blue'>
                                <span className='visual-block__icon'>◈</span>
                                <span>If profit &gt; 0</span>
                            </div>
                            <div className='visual-block-connector' />
                            <div className='visual-block visual-block--green'>
                                <span className='visual-block__icon'>✓</span>
                                <span>Repeat trade</span>
                            </div>
                        </div>
                        <div className='visual-card__footer'>
                            <span className='visual-card__status visual-card__status--running'>● Running</span>
                            <span className='visual-card__profit'>+$12.50</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features section */}
            <section className='homepage__features'>
                <h2 className='homepage__section-title'>Why Traders Choose Astro Flow</h2>
                <div className='homepage__features-grid'>
                    <div className='homepage__feature-card'>
                        <div className='homepage__feature-icon homepage__feature-icon--purple'>
                            <svg viewBox='0 0 24 24' fill='none' width='28' height='28'>
                                <rect x='3' y='3' width='18' height='18' rx='3' stroke='currentColor' strokeWidth='2' />
                                <path d='M8 12h8M12 8v8' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
                            </svg>
                        </div>
                        <h3 className='homepage__feature-title'>Drag & Drop Builder</h3>
                        <p className='homepage__feature-desc'>
                            Build complex trading strategies by connecting intuitive visual blocks.
                            No programming knowledge needed.
                        </p>
                    </div>
                    <div className='homepage__feature-card'>
                        <div className='homepage__feature-icon homepage__feature-icon--blue'>
                            <svg viewBox='0 0 24 24' fill='none' width='28' height='28'>
                                <path
                                    d='M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5'
                                    stroke='currentColor'
                                    strokeWidth='2'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                />
                            </svg>
                        </div>
                        <h3 className='homepage__feature-title'>Real-Time Execution</h3>
                        <p className='homepage__feature-desc'>
                            Your bots trade live on Deriv markets 24/7 with millisecond execution
                            and automatic position management.
                        </p>
                    </div>
                    <div className='homepage__feature-card'>
                        <div className='homepage__feature-icon homepage__feature-icon--green'>
                            <svg viewBox='0 0 24 24' fill='none' width='28' height='28'>
                                <path
                                    d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'
                                    stroke='currentColor'
                                    strokeWidth='2'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                />
                            </svg>
                        </div>
                        <h3 className='homepage__feature-title'>Risk Management</h3>
                        <p className='homepage__feature-desc'>
                            Set stop-loss limits, take-profit targets, and martingale strategies
                            to protect your capital automatically.
                        </p>
                    </div>
                    <div className='homepage__feature-card'>
                        <div className='homepage__feature-icon homepage__feature-icon--orange'>
                            <svg viewBox='0 0 24 24' fill='none' width='28' height='28'>
                                <path
                                    d='M3 3v18h18M7 16l4-4 4 4 5-5'
                                    stroke='currentColor'
                                    strokeWidth='2'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                />
                            </svg>
                        </div>
                        <h3 className='homepage__feature-title'>Live Charts</h3>
                        <p className='homepage__feature-desc'>
                            Monitor your bot's performance with integrated real-time charts
                            and detailed transaction history.
                        </p>
                    </div>
                </div>
            </section>

            {/* How it works section */}
            <section className='homepage__how-it-works'>
                <h2 className='homepage__section-title'>Start Trading in 3 Steps</h2>
                <div className='homepage__steps'>
                    <div className='homepage__step'>
                        <div className='homepage__step-number'>1</div>
                        <h3 className='homepage__step-title'>Create Your Account</h3>
                        <p className='homepage__step-desc'>
                            Sign up in seconds with your email. Get instant access to both demo
                            and real trading accounts.
                        </p>
                    </div>
                    <div className='homepage__step-connector'>
                        <span className='homepage__step-connector-arrow'>→</span>
                    </div>
                    <div className='homepage__step'>
                        <div className='homepage__step-number'>2</div>
                        <h3 className='homepage__step-title'>Build Your Bot</h3>
                        <p className='homepage__step-desc'>
                            Use our visual block builder to design your trading strategy.
                            Choose from presets or create custom logic.
                        </p>
                    </div>
                    <div className='homepage__step-connector'>
                        <span className='homepage__step-connector-arrow'>→</span>
                    </div>
                    <div className='homepage__step'>
                        <div className='homepage__step-number'>3</div>
                        <h3 className='homepage__step-title'>Run & Profit</h3>
                        <p className='homepage__step-desc'>
                            Start your bot and watch it execute trades automatically.
                            Monitor results in real-time from your dashboard.
                        </p>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className='homepage__cta'>
                <div className='homepage__cta-content'>
                    <h2 className='homepage__cta-title'>Ready to Start Trading?</h2>
                    <p className='homepage__cta-desc'>
                        Join thousands of traders automating their strategies with Astro Flow.
                        Start with a free demo account — no deposit required.
                    </p>
                    <div className='homepage__cta-actions'>
                        <Button
                            primary
                            large
                            onClick={handleSignup}
                            className='homepage__cta-btn homepage__cta-btn--primary'
                            is_loading={isAuthorizing}
                        >
                            Create Free Account
                        </Button>
                        <Button
                            tertiary
                            large
                            onClick={handleEnterApp}
                            className='homepage__cta-btn homepage__cta-btn--ghost'
                        >
                            Explore Demo →
                        </Button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className='homepage__footer'>
                <div className='homepage__footer-inner'>
                    <div className='homepage__footer-brand'>
                        <svg viewBox='0 0 40 40' width='24' height='24'>
                            <circle cx='20' cy='20' r='18' fill='#6c5ce7' />
                            <path
                                d='M14 26 L20 12 L26 26 M16 22 L24 22'
                                stroke='white'
                                strokeWidth='2.5'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                fill='none'
                            />
                        </svg>
                        <span>Astro Flow</span>
                    </div>
                    <p className='homepage__footer-text'>
                        Automated trading bot platform powered by Deriv.
                        Trade responsibly. Past performance does not guarantee future results.
                    </p>
                </div>
            </footer>
        </div>
    );
};

export default HomePage;
