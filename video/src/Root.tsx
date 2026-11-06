import React from 'react';
import { Composition } from 'remotion';
import { FPS, Promo, totalFrames } from './Promo';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ChambappPromo"
      component={Promo}
      durationInFrames={totalFrames}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
