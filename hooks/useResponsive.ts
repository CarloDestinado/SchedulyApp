import { useWindowDimensions } from 'react-native';

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const isSmallDevice = width < 375;
  const isLargeDevice = width >= 428;
  const scale = Math.min(width / BASE_WIDTH, 1.25);

  const vs = (size: number) => Math.round(size * Math.min(height / BASE_HEIGHT, 1.2));

  const s = (size: number) => Math.round(size * scale);

  const hp = (percent: number) => Math.round(width * (percent / 100));

  const vp = (percent: number) => Math.round(height * (percent / 100));

  const pad = (small: number, large: number) => isSmallDevice ? small : large;

  return {
    width,
    height,
    isSmallDevice,
    isLargeDevice,
    scale,
    s,
    vs,
    hp,
    vp,
    pad,
  };
}
