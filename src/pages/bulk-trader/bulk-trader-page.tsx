import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import BulkTraderAnalysis from '@/components/bulk-trader/bulk-trader';
import './bulk-trader-page.scss';

const BulkTraderPage = observer(() => {
    const { dashboard } = useStore();
    const { active_tab } = dashboard;

    return (
        <div
            className={classNames('bulk-trader-page', {
                'bulk-trader-page--active': active_tab === 3,
                'bulk-trader-page--inactive': active_tab !== 3,
            })}
        >
            <BulkTraderAnalysis />
        </div>
    );
});

export default BulkTraderPage;
