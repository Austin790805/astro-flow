import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import Speedbot from '@/components/speedbot/speedbot';
import './speedbot-page.scss';

const SpeedbotPage = observer(() => {
    const { dashboard } = useStore();
    const { active_tab } = dashboard;

    return (
        <div
            className={classNames('speedbot-page', {
                'speedbot-page--active': active_tab === 4,
                'speedbot-page--inactive': active_tab !== 4,
            })}
        >
            <Speedbot />
        </div>
    );
});

export default SpeedbotPage;
