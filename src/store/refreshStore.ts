import { create } from 'zustand';

interface RefreshState {
  ticketRefreshKey: number;
  notifyTicketChange: () => void;
}

export const useRefreshStore = create<RefreshState>((set) => ({
  ticketRefreshKey: 0,
  notifyTicketChange: () => set((state) => ({ ticketRefreshKey: state.ticketRefreshKey + 1 })),
}));
