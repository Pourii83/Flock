import { requireOptionalNativeModule, type EventSubscription } from 'expo';

type FlockPipNative = {
  isSupported(): boolean;
  isInPip(): boolean;
  setAutoEnter(enabled: boolean, width: number, height: number): void;
  enter(): boolean;
  addListener(event: 'onPipChange', listener: (payload: { inPip: boolean }) => void): EventSubscription;
};

/** The Android module, or null (web, iOS, or an app built before it existed). */
export default requireOptionalNativeModule<FlockPipNative>('FlockPip');
