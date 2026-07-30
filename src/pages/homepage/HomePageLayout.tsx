import { Outlet } from 'react-router-dom';
import HomePage from './HomePage';

/**
 * Homepage layout — renders the landing page without the standard
 * app header/footer. The Outlet is kept for routing compatibility
 * but the homepage is a standalone full-screen page.
 */
const HomePageLayout = () => {
    return <HomePage />;
};

export default HomePageLayout;
