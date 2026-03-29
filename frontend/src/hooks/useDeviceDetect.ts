import { useEffect } from "react";
import { useUserPreferencesStore, useUIStore } from "../stores";

/**
 * Hook to detect and handle mobile view changes
 */
export function useMobileDetect() {
  const setIsMobileView = useUIStore((state) => state.setIsMobileView);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

  useEffect(() => {
    const checkMobile = () => {
      const isMobile = window.innerWidth < 768;
      setIsMobileView(isMobile);

      // Auto-close sidebar on mobile
      if (isMobile) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [setIsMobileView, setSidebarOpen]);
}

/**
 * Hook to detect touch device capability
 */
export function useTouchDetect() {
  const setIsTouchDevice = useUIStore((state) => state.setIsTouchDevice);

  useEffect(() => {
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(isTouch);
  }, [setIsTouchDevice]);
}

/**
 * Combined hook for device capability detection
 */
export function useDeviceDetect() {
  useMobileDetect();
  useTouchDetect();
}
