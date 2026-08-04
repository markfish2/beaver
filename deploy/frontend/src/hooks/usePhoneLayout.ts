import { useEffect, useState } from 'react';
import { isPhoneLayout } from '../utils/deviceLayout';

export function usePhoneLayout(): boolean {
  const [phoneLayout, setPhoneLayout] = useState(isPhoneLayout);

  useEffect(() => {
    const update = () => setPhoneLayout(isPhoneLayout());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return phoneLayout;
}
