import { useEffect } from 'react';
import { PipeViewPage } from './PipeViewPage';
import { usePipefyApp } from '../sdk/PipefyAppContext';

export function RootInit() {
  const { ready, isInsidePipefy, pipefyApp } = usePipefyApp();

  useEffect(() => {
    if (!ready || !isInsidePipefy || !pipefyApp) return;

    pipefyApp.initCall({
      'pipe-view': function () {
        return {
          icon: './icon.svg',
          text: 'PipeLens Dashboard',
          url: 'pipe-view',
        };
      },
      'pipe-buttons': function () {
        return [
          {
            icon: './icon.svg',
            text: 'PipeLens Cache',
            callback: function (p: any) {
              p.sidebar({
                title: 'PipeLens · Cache & Sync',
                url: 'sidebar',
              });
            },
          },
        ];
      },
    });
  }, [ready, isInsidePipefy, pipefyApp]);

  if (!ready) {
    return <div />;
  }

  // Inside Pipefy, init_url runs in a hidden 1x1px iframe and renders no UI.
  if (isInsidePipefy) {
    return <div />;
  }

  // Outside Pipefy (direct URL access), present the interactive Standalone Preview mode.
  return <PipeViewPage />;
}
