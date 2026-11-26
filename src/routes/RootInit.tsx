import { useEffect, useRef } from 'react';
import { PipeViewPage } from './PipeViewPage';
import { usePipefyApp } from '../sdk/PipefyAppContext';

export function RootInit() {
  const { ready, isInsidePipefy, pipefyApp } = usePipefyApp();
  const calledRef = useRef(false);

  useEffect(() => {
    if (!ready || !isInsidePipefy || !pipefyApp || calledRef.current) return;
    calledRef.current = true;

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
