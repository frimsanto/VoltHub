// Tiny UI store for the mobile bottom tab bar's transient visibility.
//
// The GIS map auto-hides the tab bar while the user pans/zooms (map-first feel,
// like Google Maps / ArcGIS Field Maps) and brings it back when interaction
// stops. The bar is `fixed` and slides via transform, so toggling this flag never
// reflows the map — no layout jump. Defaults to visible; any page that hides it
// must restore it on unmount.
import { create } from "zustand";

interface MobileNavState {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

export const useMobileNavStore = create<MobileNavState>((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));
